import assert from 'node:assert/strict';
import test from 'node:test';
import { HybridRetriever } from './retriever.js';
import type { SourcePost } from '../types.js';

const now = Math.floor(Date.now() / 1000);
const posts: SourcePost[] = [
  { id: 'high', subreddit: 'r/test', title: 'Transformer benchmark release', body: 'A new transformer benchmark release compares inference latency and retrieval quality.', url: '', author: 'a', upvotes: 5000, comments: 700, createdUtc: now - 3600 },
  { id: 'low', subreddit: 'r/test', title: 'Transformer benchmark question', body: 'Question about the same transformer benchmark and retrieval quality.', url: '', author: 'b', upvotes: 3, comments: 1, createdUtc: now - 3600 },
  { id: 'other', subreddit: 'r/other', title: 'Database migration discussion', body: 'Teams discuss PostgreSQL migration reliability.', url: '', author: 'c', upvotes: 200, comments: 40, createdUtc: now - 7200 },
];

test('retrieval favors lexical relevance and engagement without losing source metadata', () => {
  const retriever = new HybridRetriever().ingest(posts);
  const results = retriever.retrieveDiverse(['transformer benchmark retrieval quality'], 3);
  assert.ok(results.length >= 2);
  assert.equal(results[0]?.postId, 'high');
  assert.ok((results[0]?.engagementScore || 0) > (results[1]?.engagementScore || 0));
  assert.ok(results[0]?.id.includes('r/test:high'));
});

test('diverse selection can cover multiple source communities', () => {
  const retriever = new HybridRetriever().ingest(posts);
  const results = retriever.retrieveDiverse(['benchmark retrieval', 'database migration reliability'], 3);
  const subs = new Set(results.map((row) => row.subreddit));
  assert.ok(subs.has('r/test'));
  assert.ok(subs.has('r/other'));
});
