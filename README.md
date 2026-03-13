# Minijob — Lohnabrechnung (Payslip) Automation

A **Next.js** app that generates monthly **Lohnabrechnung** (payslip) PDFs from an HTML template and emails them via **AWS SES**. It is designed to be triggered by an external cron (e.g. Coolify) on a fixed day each month, with **Redis** used for idempotency so each period is processed at most once.

## Intent

- **Automate monthly payslip delivery**: On a configurable day of the month (e.g. 28th), a cron job calls the app. The app renders the current month’s payslip from an HTML template to PDF (Puppeteer/Chromium), then sends it as an attachment via AWS SES.
- **Avoid duplicate sends**: Redis stores which year/month have already been processed; repeated cron runs on the same day are no-ops for that period.
- **Optional manual run**: You can trigger generation for a specific month via the generate API or the interactive script (e.g. for backfills or testing).

## Key Points

- **Cron endpoint**: `POST /api/cron/lohnabrechnung` with `Authorization: Bearer <CRON_SECRET>`. Runs only when the server’s current date equals `RUN_DAY` and the period is not yet marked in Redis.
- **PDF generation**: HTML template (with `{{MONTH_NAME}}` and `{{YEAR}}`) is loaded, placeholders substituted, then rendered to PDF with Puppeteer (Chromium). Requires a Chromium binary (e.g. in Docker or `PUPPETEER_EXECUTABLE_PATH`).
- **Email**: AWS SES sends a multipart message: plain-text body (from `EMAIL_BODY_TEMPLATE`) plus PDF attachment. Recipient, optional BCC, and optional Reply-To are configurable.
- **Health**: `GET /api/health` checks Redis connectivity (useful for container/orchestrator probes).
- **Manual generate**: `POST /api/lohnabrechnung/generate` with JSON `{ year, month }` and Bearer secret generates the PDF for that period, saves it under `pdf/`, and sends the same email. No Redis idempotency on this path.
- **Scripts**: `generate:lohnabrechnung` prompts for month/year and calls the generate API; `cleanup:redis` deletes all `lohnabrechnung:*` keys in Redis.

## Configuration (Environment)

All of these are read at runtime from the environment (e.g. `.env` or Coolify env vars). Missing required vars throw at startup.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CRON_SECRET` | Yes | — | Secret for authorizing cron and generate endpoints (Bearer token). |
| `RUN_DAY` | No | `28` | Day of month (1–31) on which the cron logic will run (others days return “not run day”). |
| `TEMPLATE_PATH` | No | `template/lohnabrechnung.html` | Path to HTML template (relative to cwd or absolute). Placeholders: `{{MONTH_NAME}}`, `{{YEAR}}`. |
| `REDIS_URL` | Yes | — | Redis URL (e.g. `redis://localhost:6379` or `redis://:password@host:6379`) for idempotency. |
| `AWS_ACCESS_KEY_ID` | Yes | — | AWS credentials for SES. |
| `AWS_SECRET_ACCESS_KEY` | Yes | — | AWS credentials for SES. |
| `AWS_REGION` | No | `eu-central-1` | SES region. |
| `SES_FROM_EMAIL` | Yes | — | Sender address (must be verified in SES). |
| `SES_REPLY_TO` | No | — | Optional Reply-To header. |
| `EMAIL_RECIPIENT` | Yes | — | To address for the payslip email. |
| `EMAIL_RECIPIENT_BCC` | No | — | Optional BCC address. |
| `EMAIL_BODY_TEMPLATE` | No | (see below) | Plain-text body. Placeholders: `{{MONTH_NAME}}`, `{{YEAR}}`. Use `\n` for newlines (e.g. in Coolify, `\\n` is normalized to newline). |
| `PUPPETEER_EXECUTABLE_PATH` | No | Linux: `/usr/bin/chromium`, macOS: Chrome path | Path to Chromium/Chrome for PDF generation. |

Default `EMAIL_BODY_TEMPLATE`:  
`Hier kommt die Lohnabrechnung für {{MONTH_NAME}} {{YEAR}}. Vielen Dank für Ihre Dienste!`

## Running

- **Development**: `npm run dev` (or `pnpm dev`). Ensure Redis is reachable and env vars are set (e.g. from `.env`).
- **Production**: `npm run build` then `npm run start`.
- **Docker**: Build the image; the Dockerfile includes Chromium and optional in-container Redis. Set `USE_REDIS_IN_CONTAINER=1` if Redis should start inside the same container. Provide all required env vars at runtime (e.g. in Coolify).

**Cron (e.g. Coolify)**  
Call once per day, e.g.:  
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/lohnabrechnung`  
Only on `RUN_DAY` and for a not-yet-processed month will it generate and send.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run generate:lohnabrechnung` | Asks for month/year, then POSTs to `/api/lohnabrechnung/generate`. Needs `CRON_SECRET` and optionally `LOHNABRECHNUNG_API_URL` (default `http://localhost:3000`). |
| `npm run cleanup:redis` | Deletes all Redis keys matching `lohnabrechnung:*`. Uses `REDIS_URL` from env (default `redis://localhost:6379`). |

## Tests

- `npm run test` — unit tests (excludes email integration).
- `npm run test:integration` — email integration test (real SES + template; requires full `.env`).
- `npm run test:redis` — Redis integration test (requires `REDIS_URL`).

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Puppeteer** (puppeteer-core) + Chromium for HTML→PDF
- **AWS SES** (@aws-sdk/client-ses) for email
- **Redis** (ioredis) for idempotency
- **Tailwind CSS**
