# Security model

FINITE_FEED is a portfolio application, not a formally audited security product. The code nevertheless avoids several common demo-grade failures.

## Implemented controls

- no provider, Reddit, or Firebase Admin secrets in the frontend bundle
- Firebase ID-token verification on the server when Firebase is configured
- HMAC-signed HttpOnly guest session cookie when Firebase is absent
- strict input validation with Zod
- subreddit-name allowlisting by syntax
- per-IP global rate limiting and a stricter synthesis limiter
- Helmet security headers
- configurable CORS allowlist
- bounded request bodies
- upstream request timeouts with `AbortController`
- no arbitrary URL fetching from user input
- no raw model HTML rendering
- source IDs validated against the retrieval ledger
- user storage keys hashed before use as Firestore document identifiers
- structured error responses without exposing stack traces in production

## Production requirements

Before public deployment:

1. rotate `SESSION_SECRET` to a cryptographically random 32+ byte value;
2. configure HTTPS at the hosting layer;
3. use Firestore or another durable storage adapter;
4. use official Reddit OAuth credentials;
5. keep model-provider endpoints private or authenticated;
6. restrict `ALLOWED_ORIGINS` to the actual application domain;
7. configure provider-side usage budgets and rate limits;
8. enable platform logs/alerts and review them periodically.

## Threats not solved by this repo

- malicious content contained inside Reddit posts (prompt injection is mitigated by treating sources as data, but not mathematically eliminated)
- provider-side data retention policies
- denial-of-service beyond the configured application limits
- formal tenant-isolation certification
- content moderation requirements for arbitrary public source text

## Known upstream dependency advisory

As of 2026-09-15, `firebase-admin@14.4.0` (the latest Firebase Admin Node.js release) depends on `@google-cloud/storage@8.1.0`, whose current dependency graph still includes `gaxios@6.7.1 -> uuid@9.0.1`. npm reports GHSA-w5hq-g745-h8pq as a moderate transitive finding. FINITE_FEED does not directly invoke UUID v3/v5/v6 buffer APIs. Do not force an unsupported `gaxios` major override solely to silence the audit; track the upstream Firebase/Google Cloud release and upgrade when a supported dependency chain is published.
