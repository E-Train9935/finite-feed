# FINITE_FEED

**FINITE_FEED** is a production-oriented anti-doomscroll intelligence terminal. It ingests live Reddit discussions, ranks evidence with engagement-aware retrieval, synthesizes a finite briefing through a server-side model provider, and exposes every generated insight back to the exact source chunks used to support it.

This repository is intentionally built as a real full-stack portfolio system rather than a browser-only demo.

## Architecture

```text
Browser (React + Vite + Firebase Auth)
        |
        | HTTPS / Bearer Firebase ID token or signed guest session
        v
Node API (Express + Zod + Helmet + rate limits)
        |
        +--> Reddit OAuth / development-only public fallback / demo corpus
        |
        +--> Hybrid TF-IDF/BM25 retrieval + engagement/freshness ranking
        |
        +--> Inference provider abstraction
        |      +--> Ollama (local or remote)
        |      +--> OpenAI-compatible hosted endpoint
        |      +--> deterministic grounded fallback
        |
        +--> Firestore (production) / atomic JSON store (local fallback)
```

The browser never receives Reddit credentials, Firebase Admin credentials, or AI-provider secrets. Ollama is called by the API, not by the visitor's browser.

## Features

- True source-level RAG traceability with validated chunk IDs
- Hybrid TF-IDF + BM25 lexical scoring
- Engagement and freshness priors using Reddit score/comment metadata
- Diversity-aware evidence selection across posts and subreddits
- Single-model and comparative multi-model synthesis
- Citation coverage and inference-latency telemetry
- Deep-dive chat constrained to the archived evidence ledger
- Global `Cmd/Ctrl + K` command palette
- `Cmd/Ctrl + Enter` synthesis/chat submission
- Markdown export, clipboard copy, native share support
- Firebase ID-token verification with production-safe signed guest fallback
- Firestore storage adapter plus atomic local JSON adapter
- Request validation, CORS allowlist, Helmet, rate limiting, request IDs, timeouts
- Health/readiness endpoints and capability reporting
- Dockerized single-service production build
- Optional local Ollama service through Docker Compose
- Render blueprint plus generic Docker deployment path

## Run locally

### Fastest path

**Windows PowerShell:**

```powershell
.\START_LOCAL.ps1
```

**macOS / Linux:**

```bash
./START_LOCAL.sh
```

Or run the commands manually:

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

With no credentials configured, FINITE_FEED still runs in portfolio/demo mode:

1. it creates a signed guest API session;
2. in development only, it attempts Reddit's public JSON endpoint;
3. if Reddit is inaccessible, it uses a bundled demo source stream;
4. if no AI service is reachable, it produces an explicitly labeled deterministic RAG fallback rather than inventing a model result;
5. history is stored atomically in `apps/api/data/briefings.json`.

### Use local Ollama

Install Ollama and then:

```bash
ollama pull llama3.2:3b
ollama pull mistral:7b
ollama serve
```

Keep the default `.env` values and run `npm run dev`.

### Run the entire stack with Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull mistral:7b
```

Open `http://localhost:8080`.

## Production configuration

For a public portfolio deployment, use:

```env
NODE_ENV=production
STORAGE_DRIVER=firestore
SESSION_SECRET=<32+ random bytes>
FIREBASE_PROJECT_ID=<project>
FIREBASE_SERVICE_ACCOUNT_JSON=<single-line service-account JSON>
REDDIT_CLIENT_ID=<reddit app id>
REDDIT_CLIENT_SECRET=<reddit secret>
REDDIT_USER_AGENT=web:finite_feed:v2.0 (by /u/your-reddit-username)
```

Then choose one inference path.

### Option A: remote/self-hosted Ollama

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=https://your-private-ollama-host
OLLAMA_MODELS=llama3.2:3b,mistral:7b
# OLLAMA_API_KEY=<only if your remote Ollama endpoint requires bearer auth>
```

### Option B: hosted OpenAI-compatible inference

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=<secret>
AI_MODELS=<model-a>,<model-b>
```

This is usually the easiest public-portfolio deployment because the web/API container stays lightweight while inference can live on a GPU-capable service.

## Firebase setup

1. Create a Firebase project.
2. Enable **Authentication > Anonymous**.
3. Create a web app and copy its public config into the `VITE_FIREBASE_*` variables.
4. Create a service account for the API and set `FIREBASE_SERVICE_ACCOUNT_JSON` or use Application Default Credentials.
5. Set `STORAGE_DRIVER=firestore`.

The API verifies Firebase ID tokens server-side. Firebase web-app config can be supplied at runtime through the same `VITE_FIREBASE_*` environment variables; the API exposes only those public values to the SPA. When Firebase is not configured, FINITE_FEED uses an HMAC-signed guest session cookie instead of trusting a client-provided user ID.

## Reddit setup

For a live production deployment, request/obtain Reddit Data API access and use registered OAuth credentials. The production code intentionally does not use the unauthenticated JSON fallback. It uses application-only OAuth and caches the access token until shortly before expiry. If approved live access is not configured, keep `ALLOW_DEMO_SOURCES=true` so the public portfolio remains functional with visibly labeled demo evidence rather than scraping around Reddit's access controls.

## Build

```bash
npm run typecheck
npm run build
npm start
```

The Express production server serves both `/api/v1/*` and the built React SPA from the same origin.

## Deploy

### Docker-capable host

```bash
docker build -t finite-feed .
docker run --env-file .env -p 8080:8080 finite-feed
```

### Render

A `render.yaml` blueprint is included. For durable history, configure Firestore. For hosted inference, point the provider variables at an OpenAI-compatible service or a remotely hosted Ollama instance.

## Portfolio talking points

Do **not** describe this as "a Reddit summarizer." The defensible engineering story is:

- source ingestion is isolated behind a server-side adapter;
- retrieval combines lexical similarity, engagement, freshness, and diversity;
- generation is schema-constrained and citations are validated against the retrieved source ledger;
- unsupported citations are dropped rather than hallucinated;
- inference providers can be swapped without changing application logic;
- authentication and persistence are abstracted from the UI;
- the same codebase supports zero-config local demo mode and a hardened production configuration.

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/DEPLOYMENT.md` for deeper implementation notes.
