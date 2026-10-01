# FitPlan

FitPlan is a Next.js, TypeScript, PostgreSQL, and Prisma application for personalized nutrition and training. The existing product UI now uses authenticated API routes and server-side domain services for profiles, deterministic nutrition targets, diet and workout plans, substitutions, tracking, progress, plan history, chat, and reference images.

## Run locally

Requirements: Node.js 20+, pnpm, and PostgreSQL 14+.

```sh
pnpm install
cp .env.example .env
# Set DATABASE_URL to your local PostgreSQL database.
pnpm exec prisma migrate dev
pnpm db:seed
pnpm dev
```

Set `AI_API_KEY` to enable the AI Coach. AI is optional; nutrition, food facts, compatibility, costs, and exercise selection are computed by application services using database records. Reference images are stored privately on local disk by default; configure a private upload directory with `FITPLAN_UPLOAD_DIR` for deployment, and use a private object store when deploying multiple instances.

## Install FitPlan like an app

FitPlan includes a web app manifest and app icons. With the app running, open it in Safari on macOS and choose **File → Add to Dock**. On iPhone or iPad, open it in Safari, tap **Share → Add to Home Screen**. The installed app uses this same server and PostgreSQL database, so keep the server running while using a local development install. For access when your computer is off, deploy FitPlan to a hosted HTTPS address first, then install that address.

## Production deployment (Docker)

The provided Compose stack runs the Next.js app, PostgreSQL, Prisma production migrations and idempotent catalog seed, private persistent image storage, and Caddy for automatic HTTPS. Use a Linux server with Docker Engine and the Compose plugin. Point a DNS A/AAAA record for your domain at the server and allow inbound TCP 80/443 plus UDP 443.

```sh
cp .env.production.example .env.production
# Edit .env.production: set FITPLAN_DOMAIN and a long unique POSTGRES_PASSWORD.
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production ps
```

Open `https://<FITPLAN_DOMAIN>`. Caddy obtains and renews the TLS certificate. Do not commit `.env.production`; it contains the database password and possibly the AI provider key. The database is not published on a host port. The app only accepts traffic through the HTTPS proxy. The migration service runs before the app and must complete successfully. To review logs, use `docker compose --env-file .env.production logs -f app migrate proxy`.

Persistent Docker volumes hold PostgreSQL and private reference images. Back them up together and test restores before upgrades. The seeded catalog is intentionally applied on deploy so new catalog rows are available. The default rate limiter and image storage assume a single app instance. Before scaling horizontally, replace process-local rate limiting with a shared store and move private uploads to shared object storage. Use managed PostgreSQL and object storage for a production service that needs independent backups, high availability, and multiple app replicas.

To roll out a new version, deploy the updated source with `docker compose --env-file .env.production up --build -d`; Prisma uses forward-only production migrations. Review and back up the database before applying schema changes.

## Development checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Architecture

- `app/api/` contains authenticated, validated route handlers. User identity always comes from the server session.
- `lib/` contains the Prisma singleton, session security, rate limiting, validation, and safe API error handling.
- `services/` contains the domain and persistence boundary: profile, food/nutrition, diet, budget, workout, alternatives, tracking, progress, and AI capabilities.
- `prisma/schema.prisma`, `prisma/migrations/`, and `prisma/seed.ts` define and populate PostgreSQL.
- `components/fitplan-app.tsx` connects the established UI to the API and renders loading, empty, and error feedback.

Nutrition targets use the Mifflin–St Jeor equation with activity multipliers and goal adjustments; all results are estimates. Plan targets and meal nutrition snapshots are stored with plan records. Plans are versioned, and past versions remain available. AI provider credentials are read only on the server; when no credential is configured, the API reports that AI is unavailable rather than fabricating an answer.

The seeded food prices are approximate database estimates, not live prices. Workout and diet algorithms are deterministic initial recommendations and do not guarantee outcomes. Image upload is for a physique reference only; the application does not estimate body fat or perform medical analysis.
