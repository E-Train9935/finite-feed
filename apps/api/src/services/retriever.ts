import type { RetrievedSource, SourcePost } from '../types.js';

const STOP_WORDS = new Set([
  'about','after','again','against','also','among','because','been','before','being','between','both','could','does','doing','down','during','each','from','further','have','having','here','into','itself','just','more','most','other','over','same','should','some','such','than','that','their','them','then','there','these','they','this','those','through','under','until','very','what','when','where','which','while','with','would','your',
]);

const WEIGHTS = { tfidf: 0.46, bm25: 0.28, engagement: 0.18, freshness: 0.08 } as const;

type InternalDoc = RetrievedSource & {
  tokens: string[];
  counts: Map<string, number>;
  length: number;
};

function clamp(value: number, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }

export class HybridRetriever {
  private docs: InternalDoc[] = [];
  private idf = new Map<string, number>();
  private avgLength = 1;

  tokenize(text = '') {
    return String(text).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  }

  private chunk(text: string, maxWords = 130, overlapWords = 28) {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const step = Math.max(1, maxWords - overlapWords);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += step) {
      chunks.push(words.slice(i, i + maxWords).join(' '));
      if (i + maxWords >= words.length) break;
    }
    return chunks;
  }

  ingest(posts: SourcePost[]) {
    this.docs = [];
    this.idf.clear();
    const documentFrequency = new Map<string, number>();

    posts.forEach((post) => {
      const full = `Title: ${post.title}\nContent: ${post.body || 'Link/media post.'}`;
      this.chunk(full).forEach((text, index) => {
        const tokens = this.tokenize(text);
        if (!tokens.length) return;
        const counts = new Map<string, number>();
        tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
        new Set(tokens).forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1));
        this.docs.push({
          id: `${post.subreddit}:${post.id}:${index}`,
          postId: post.id,
          subreddit: post.subreddit,
          title: post.title,
          text,
          url: post.url,
          author: post.author,
          upvotes: post.upvotes,
          comments: post.comments,
          createdUtc: post.createdUtc,
          lexicalScore: 0,
          bm25Score: 0,
          engagementScore: 0,
          freshnessScore: 0,
          rankScore: 0,
          tokens,
          counts,
          length: tokens.length,
        });
      });
    });

    const n = Math.max(1, this.docs.length);
    documentFrequency.forEach((df, term) => this.idf.set(term, Math.log((1 + n) / (1 + df)) + 1));
    this.avgLength = this.docs.reduce((sum, doc) => sum + doc.length, 0) / n;
    return this;
  }

  private vectorNorm(counts: Map<string, number>) {
    let squares = 0;
    counts.forEach((count, term) => {
      const tf = 1 + Math.log(Math.max(1, count));
      const weight = tf * (this.idf.get(term) || 0);
      squares += weight * weight;
    });
    return Math.sqrt(squares) || 1;
  }

  private score(query: string) {
    const queryTokens = this.tokenize(query);
    const qCounts = new Map<string, number>();
    queryTokens.forEach((token) => qCounts.set(token, (qCounts.get(token) || 0) + 1));
    const qNorm = this.vectorNorm(qCounts);
    const rawEngagement = this.docs.map((doc) => Math.log1p(Math.max(0, doc.upvotes)) + 0.8 * Math.log1p(Math.max(0, doc.comments)));
    const maxEngagement = Math.max(1, ...rawEngagement);
    const nowSeconds = Date.now() / 1000;
    const k1 = 1.5;
    const b = 0.75;

    const rows = this.docs.map((doc, idx) => {
      let dot = 0;
      let bm25 = 0;
      qCounts.forEach((qCount, term) => {
        const dCount = doc.counts.get(term) || 0;
        if (!dCount) return;
        const idf = this.idf.get(term) || 0;
        dot += ((1 + Math.log(qCount)) * idf) * ((1 + Math.log(dCount)) * idf);
        const denom = dCount + k1 * (1 - b + b * (doc.length / this.avgLength));
        bm25 += idf * ((dCount * (k1 + 1)) / Math.max(denom, 0.0001));
      });
      const tfidf = qCounts.size ? dot / (qNorm * this.vectorNorm(doc.counts)) : 0;
      return { doc, tfidf: clamp(tfidf), bm25, engagement: rawEngagement[idx]! / maxEngagement };
    });

    const maxBm25 = Math.max(1, ...rows.map((row) => row.bm25));
    return rows.map(({ doc, tfidf, bm25, engagement }) => {
      const ageHours = doc.createdUtc ? Math.max(0, (nowSeconds - doc.createdUtc) / 3600) : 72;
      const freshness = Math.exp(-ageHours / 48);
      const normalizedBm25 = clamp(bm25 / maxBm25);
      const rankScore = WEIGHTS.tfidf * tfidf + WEIGHTS.bm25 * normalizedBm25 + WEIGHTS.engagement * engagement + WEIGHTS.freshness * freshness;
      return { ...doc, lexicalScore: tfidf, bm25Score: normalizedBm25, engagementScore: engagement, freshnessScore: freshness, rankScore };
    });
  }

  retrieveDiverse(queries: string[], topK = 12) {
    const pool = new Map<string, RetrievedSource>();
    queries.forEach((query) => {
      this.score(query).sort((a, b) => b.rankScore - a.rankScore).slice(0, Math.max(topK * 2, 20)).forEach((row) => {
        const existing = pool.get(row.id);
        if (!existing || row.rankScore > existing.rankScore) pool.set(row.id, row);
      });
    });

    const candidates = [...pool.values()].sort((a, b) => b.rankScore - a.rankScore);
    const selected: RetrievedSource[] = [];
    const postCounts = new Map<string, number>();
    const subCounts = new Map<string, number>();

    while (selected.length < topK && candidates.length) {
      let bestIndex = 0;
      let bestUtility = -Infinity;
      candidates.forEach((candidate, index) => {
        const samePostPenalty = (postCounts.get(candidate.postId) || 0) * 0.16;
        const sameSubPenalty = (subCounts.get(candidate.subreddit) || 0) * 0.035;
        const utility = candidate.rankScore - samePostPenalty - sameSubPenalty;
        if (utility > bestUtility) { bestUtility = utility; bestIndex = index; }
      });
      const [winner] = candidates.splice(bestIndex, 1);
      if (!winner) break;
      selected.push(winner);
      postCounts.set(winner.postId, (postCounts.get(winner.postId) || 0) + 1);
      subCounts.set(winner.subreddit, (subCounts.get(winner.subreddit) || 0) + 1);
    }
    return selected;
  }

  get chunkCount() { return this.docs.length; }
  get weights() { return { ...WEIGHTS }; }
}
