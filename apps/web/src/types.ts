export type RetrievedSource = {
  id: string; postId: string; subreddit: string; title: string; text: string; url: string; author: string;
  upvotes: number; comments: number; createdUtc: number; lexicalScore: number; bm25Score: number;
  engagementScore: number; freshnessScore: number; rankScore: number;
};

export type ModelOutput = {
  model: string; title: string; executiveSummary: string;
  insights: Array<{ text: string; sourceIds: string[] }>;
  parseMode: 'structured' | 'deterministic-fallback'; fallbackReason?: string;
  metrics: { latencyMs: number; fallback: boolean; citationCoverage: number; citedInsightCount: number; insightCount: number };
};

export type Briefing = {
  id: string; createdAt: string; timestamp: number; subreddits: string; targets: string[]; focusQuery: string;
  mode: 'single' | 'compare'; models: string[]; sourceMode: 'oauth' | 'public-json' | 'demo' | 'mixed';
  sources: RetrievedSource[]; modelOutputs: Record<string, ModelOutput>;
  retrieval: { chunkCount: number; selectedCount: number; queries: string[]; weights: Record<string, number> };
  timings: { sourceFetchMs: number; retrievalMs: number; inferenceMs: number; persistenceMs: number; totalMs: number };
};

export type SessionInfo = {
  identity: { mode: 'firebase' | 'guest' };
  storage: string;
  inference: { provider: string; available: boolean; models: string[]; defaults: { primary: string; comparison: string } };
};

export type BriefingSummary = Pick<Briefing, 'id' | 'createdAt' | 'timestamp' | 'subreddits' | 'targets' | 'focusQuery' | 'mode' | 'models' | 'sourceMode' | 'timings'> & { retrieval: Pick<Briefing['retrieval'], 'chunkCount' | 'selectedCount'> };
