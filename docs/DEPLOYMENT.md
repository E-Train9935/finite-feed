# Deployment guide

## Recommended portfolio architecture

For a public demo, deploy the FINITE_FEED container to a standard web host, use Firestore for persistence, Reddit OAuth for source ingestion, and a hosted OpenAI-compatible endpoint for inference. This is simpler and more reliable than trying to run a GPU model inside the same low-cost web container.

A self-hosted Ollama deployment is also supported. Put Ollama on a GPU-capable machine or service and expose it only to the API over a private network, VPN, or authenticated reverse proxy.

## Single-container build

The root `Dockerfile`:

1. installs workspace dependencies;
2. builds the React application;
3. compiles the TypeScript API;
4. creates a small production image;
5. serves the SPA and API from Express on port `8080`.

## Health probes

- `GET /api/v1/health` - process liveness plus provider/storage capabilities
- `GET /api/v1/ready` - readiness check; returns non-2xx when a required production dependency is unavailable

## Environment separation

Do not bake `.env` into the image. Configure production variables through the host's secret manager.

## Render

The included `render.yaml` is a starting blueprint. Add the secret values in Render, then set the generated service domain as `PUBLIC_APP_URL` and `ALLOWED_ORIGINS`.

## Firebase web configuration at runtime

The API exposes only Firebase's public web-app configuration through `/api/v1/public-config`. The React client first checks build-time `VITE_FIREBASE_*` values and then falls back to that runtime endpoint. This means one immutable Docker image can be promoted across environments without rebuilding just to change Firebase public config. Secrets such as the Firebase service-account JSON never pass through this endpoint.
