# Architecture

## Request path

A synthesis request passes through seven explicit stages:

1. **Identity** - Firebase ID tokens are verified by Firebase Admin when available. Otherwise a server-signed guest session is used.
2. **Validation** - Zod validates subreddit names, model choices, query length, and comparison limits.
3. **Source ingestion** - `RedditService` uses OAuth when credentials exist, with bounded public/demo fallbacks for development.
4. **Retrieval** - `HybridRetriever` chunks posts and combines TF-IDF cosine similarity, BM25, Reddit engagement, freshness, and post/subreddit diversity.
5. **Inference** - `InferenceRouter` selects Ollama or an OpenAI-compatible provider. Both use the same synthesis contract.
6. **Citation validation** - model-returned source IDs are intersected with the server-side source ledger. Invalid IDs are discarded.
7. **Persistence** - the complete briefing, source ledger, model telemetry, and retrieval telemetry are archived through the storage adapter.

## Why the model never creates citations freely

The source ledger is generated before inference. Each retrieved chunk receives a deterministic source ID. The model can only reference those IDs. After generation, the API validates every citation against the ledger. An invalid ID is removed; the server never maps a vague model citation to the "closest" source because that would create false provenance.

## Retrieval formula

For each chunk, FINITE_FEED calculates:

- TF-IDF cosine similarity
- BM25 relevance
- log-scaled Reddit score/comment engagement
- exponential freshness prior

The default blended score is:

```text
0.46 * tfidf + 0.28 * bm25 + 0.18 * engagement + 0.08 * freshness
```

A greedy diversity pass then penalizes repeatedly selecting chunks from the same post and slightly favors source coverage across requested subreddits.

The weights are configuration in code rather than claims of universal optimality. A real evaluation harness should tune them against a labeled retrieval set.

## Provider abstraction

`InferenceProvider` exposes three operations:

- `generateStructured`
- `chat`
- `listModels`

The app ships with Ollama and OpenAI-compatible implementations. This preserves local-first development while avoiding a browser-to-localhost architecture in production.

## Persistence

`StorageAdapter` has two implementations:

- `FileStorage`: zero-config local mode, atomic temp-file replacement, per-process write queue
- `FirestoreStorage`: durable production storage, user-scoped documents

The frontend only talks to the API and does not write briefings directly to Firestore.
