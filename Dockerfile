# Build stage: dummy env so "next build" can load API routes (real env in Coolify at runtime)
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ARG BUILD_CRON_SECRET=build-placeholder
ARG BUILD_REDIS_URL=redis://localhost:6379
ARG BUILD_AWS_KEY=build-placeholder
ARG BUILD_AWS_REGION=eu-central-1
ARG BUILD_EMAIL=build@example.com
ENV CRON_SECRET=$BUILD_CRON_SECRET
ENV TEMPLATE_PATH=template/lohnabrechnung.html
ENV AWS_ACCESS_KEY_ID=$BUILD_AWS_KEY
ENV AWS_SECRET_ACCESS_KEY=$BUILD_AWS_KEY
ENV AWS_REGION=$BUILD_AWS_REGION
ENV SES_FROM_EMAIL=$BUILD_EMAIL
ENV EMAIL_RECIPIENT=$BUILD_EMAIL
ENV REDIS_URL=$BUILD_REDIS_URL
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY . .
RUN npm run build

# Production stage: minimal image with Chromium for PDF generation
FROM node:22-bookworm-slim AS runner
# Chromium + runtime deps for headless PDF (avoid "missing shared library" in slim)
# redis-server optional: for running Redis in same container (e.g. REDIS_URL=redis://localhost:6379)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    curl \
    redis-server \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
# Next.js standalone: listen on all interfaces so curl/localhost and external access work
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/template ./template
RUN mkdir -p pdf

# Optional: start Redis in same container then run app (use CMD override to skip)
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
