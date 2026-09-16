import { config } from '../config.js';
import type { SourcePost } from '../types.js';
import { safeErrorMessage, withTimeout } from '../utils/http.js';

type RedditFetchResult = {
  posts: SourcePost[];
  mode: 'oauth' | 'public-json' | 'demo';
  warnings: string[];
};

type OAuthToken = { token: string; expiresAt: number };
let cachedOAuthToken: OAuthToken | null = null;
let tokenInFlight: Promise<string | null> | null = null;

const demoPosts: SourcePost[] = [
  {
    id: 'demo-ai-agent-security', subreddit: 'r/MachineLearning',
    title: 'Teams are shifting from agent demos to evaluation and guardrails',
    body: 'Discussion focuses on traceable tool calls, constrained permissions, regression suites, and explicit failure handling before autonomous agents are allowed into business workflows.',
    url: 'https://www.reddit.com/r/MachineLearning/', author: 'finite_feed_demo', upvotes: 1842, comments: 267,
    createdUtc: Math.floor(Date.now() / 1000) - 60 * 60 * 4,
  },
  {
    id: 'demo-local-models', subreddit: 'r/LocalLLaMA',
    title: 'Local inference stacks are becoming easier to operationalize',
    body: 'Users compare smaller quantized models, hosted inference, Ollama, observability, structured outputs, and model routing. The most practical setups separate the application API from the inference runtime.',
    url: 'https://www.reddit.com/r/LocalLLaMA/', author: 'finite_feed_demo', upvotes: 1290, comments: 194,
    createdUtc: Math.floor(Date.now() / 1000) - 60 * 60 * 7,
  },
  {
    id: 'demo-react-architecture', subreddit: 'r/reactjs',
    title: 'Frontend-only AI demos are hitting deployment limits',
    body: 'Developers warn against putting provider credentials in Vite bundles or calling localhost model servers from deployed browsers. Common advice is to introduce a server-side orchestration layer and same-origin API proxy.',
    url: 'https://www.reddit.com/r/reactjs/', author: 'finite_feed_demo', upvotes: 734, comments: 121,
    createdUtc: Math.floor(Date.now() / 1000) - 60 * 60 * 12,
  },
  {
    id: 'demo-rag-citations', subreddit: 'r/LanguageTechnology',
    title: 'Citation validation matters more than cosmetic source badges',
    body: 'A recurring recommendation is to assign evidence IDs before generation, force structured outputs, and validate every returned citation against the retrieval ledger instead of mapping model claims to sources after the fact.',
    url: 'https://www.reddit.com/r/LanguageTechnology/', author: 'finite_feed_demo', upvotes: 921, comments: 88,
    createdUtc: Math.floor(Date.now() / 1000) - 60 * 60 * 16,
  },
  {
    id: 'demo-doomscroll', subreddit: 'r/productivity',
    title: 'People want bounded news products instead of infinite feeds',
    body: 'Users describe fatigue with algorithmic feeds and favor products that deliberately end, summarize why an item matters, and preserve optional deep dives without encouraging endless consumption.',
    url: 'https://www.reddit.com/r/productivity/', author: 'finite_feed_demo', upvotes: 2350, comments: 402,
    createdUtc: Math.floor(Date.now() / 1000) - 60 * 60 * 21,
  },
];

function sanitizeSubreddit(value: string) {
  return value.trim().replace(/^r\//i, '');
}

function normalizeListing(json: any, subreddit: string): SourcePost[] {
  const children = Array.isArray(json?.data?.children) ? json.data.children : [];
  return children.map((child: any) => child?.data).filter(Boolean).map((post: any) => ({
    id: String(post.id || `${subreddit}-${Math.random()}`),
    subreddit: `r/${post.subreddit || subreddit}`,
    title: String(post.title || 'Untitled Reddit post'),
    body: String(post.selftext || post.url_overridden_by_dest || 'Link/media post.'),
    url: post.permalink ? `https://www.reddit.com${post.permalink}` : String(post.url || ''),
    author: String(post.author || 'unknown'),
    upvotes: Number(post.score || 0),
    comments: Number(post.num_comments || 0),
    createdUtc: Number(post.created_utc || 0),
  }));
}

async function getOAuthToken() {
  if (!config.REDDIT_CLIENT_ID || !config.REDDIT_CLIENT_SECRET) return null;
  const now = Date.now();
  if (cachedOAuthToken && cachedOAuthToken.expiresAt > now + 60_000) return cachedOAuthToken.token;
  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = (async () => {
    const timeout = withTimeout(12_000);
    try {
      const credentials = Buffer.from(`${config.REDDIT_CLIENT_ID}:${config.REDDIT_CLIENT_SECRET}`).toString('base64');
      const response = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': config.REDDIT_USER_AGENT,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
        signal: timeout.signal,
      });
      if (!response.ok) throw new Error(`Reddit OAuth token request failed with ${response.status}`);
      const payload: any = await response.json();
      if (!payload.access_token) throw new Error('Reddit OAuth response omitted access_token.');
      cachedOAuthToken = {
        token: payload.access_token,
        expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
      };
      return cachedOAuthToken.token;
    } finally {
      timeout.cancel();
      tokenInFlight = null;
    }
  })();
  return tokenInFlight;
}

async function fetchViaOAuth(subreddit: string) {
  const token = await getOAuthToken();
  if (!token) return null;
  const timeout = withTimeout(15_000);
  try {
    const url = new URL(`https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/top`);
    url.searchParams.set('t', 'day');
    url.searchParams.set('limit', String(config.REDDIT_POST_LIMIT));
    url.searchParams.set('raw_json', '1');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': config.REDDIT_USER_AGENT },
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`Reddit OAuth listing failed with ${response.status}`);
    return normalizeListing(await response.json(), subreddit);
  } finally {
    timeout.cancel();
  }
}

async function fetchViaPublicJson(subreddit: string) {
  const timeout = withTimeout(8_000);
  try {
    const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json`);
    url.searchParams.set('t', 'day');
    url.searchParams.set('limit', String(config.REDDIT_POST_LIMIT));
    url.searchParams.set('raw_json', '1');
    const response = await fetch(url, {
      headers: { 'User-Agent': config.REDDIT_USER_AGENT, Accept: 'application/json' },
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`Reddit public JSON failed with ${response.status}`);
    return normalizeListing(await response.json(), subreddit);
  } finally {
    timeout.cancel();
  }
}

export class RedditService {
  async fetchMany(subreddits: string[]): Promise<{ posts: SourcePost[]; mode: RedditFetchResult['mode'] | 'mixed'; warnings: string[] }> {
    const processSubreddit = async (rawSub: string): Promise<RedditFetchResult> => {
      const sub = sanitizeSubreddit(rawSub);
      const warnings: string[] = [];

      if (config.REDDIT_CLIENT_ID && config.REDDIT_CLIENT_SECRET) {
        try {
          const oauthPosts = await fetchViaOAuth(sub);
          if (oauthPosts?.length) return { posts: oauthPosts, mode: 'oauth', warnings };
        } catch (error) {
          warnings.push(`r/${sub}: OAuth ingestion failed (${safeErrorMessage(error)}).`);
        }
      }

      if (config.NODE_ENV !== 'production' && config.ALLOW_PUBLIC_REDDIT_FALLBACK) {
        try {
          const publicPosts = await fetchViaPublicJson(sub);
          if (publicPosts.length) return { posts: publicPosts, mode: 'public-json', warnings };
        } catch (error) {
          warnings.push(`r/${sub}: public JSON ingestion failed (${safeErrorMessage(error)}).`);
        }
      }

      if (config.ALLOW_DEMO_SOURCES) {
        const matching = demoPosts.filter((post) => post.subreddit.toLowerCase().includes(sub.toLowerCase()));
        warnings.push(`r/${sub}: using bundled demo evidence because no approved/live Reddit source was available.`);
        return { posts: matching.length ? matching : demoPosts.slice(0, 2), mode: 'demo', warnings };
      }

      return { posts: [], mode: 'demo', warnings: [...warnings, `r/${sub}: no source adapter returned data.`] };
    };

    // Targets are independent source reads. Parallelizing them keeps the dev/demo
    // fallback bounded by one upstream timeout instead of N sequential timeouts.
    const results = await Promise.all(subreddits.map(processSubreddit));
    const warnings = results.flatMap((result) => result.warnings);
    const modes = new Set(results.map((result) => result.mode));
    const posts = Array.from(new Map(results.flatMap((result) => result.posts).map((post) => [post.id, post])).values());
    const mode: RedditFetchResult['mode'] | 'mixed' = modes.size > 1 ? 'mixed' : ([...modes][0] || 'demo');
    return { posts, mode, warnings };
  }
}

export const redditService = new RedditService();
