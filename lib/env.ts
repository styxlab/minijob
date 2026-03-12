/**
 * Server-side environment variables for the Lohnabrechnung job.
 * Validate and export so missing vars fail fast at runtime.
 */

function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid env ${name}: must be a number`);
  }
  return n;
}

// placeholder for write test
export const env = {
  /** Day of month to run the job (1–31). Default 28. */
  RUN_DAY: getEnvNumber("RUN_DAY", 28),

  /** Cron endpoint secret; must be sent in header or query to authorize the run. */
  CRON_SECRET: getEnv("CRON_SECRET"),

  /** Path to HTML template (relative to cwd or absolute). */
  TEMPLATE_PATH: getEnv("TEMPLATE_PATH", "template/lohnabrechnung.html"),

  /** AWS SES */
  AWS_ACCESS_KEY_ID: getEnv("AWS_ACCESS_KEY_ID"),
  AWS_SECRET_ACCESS_KEY: getEnv("AWS_SECRET_ACCESS_KEY"),
  AWS_REGION: getEnv("AWS_REGION", "eu-central-1"),
  /** Sender email (must be verified in SES). */
  SES_FROM_EMAIL: getEnv("SES_FROM_EMAIL"),

  /** Optional Reply-To address for the Lohnabrechnung email. */
  SES_REPLY_TO: process.env.SES_REPLY_TO ?? "",

  /** Recipient for the Lohnabrechnung email. */
  EMAIL_RECIPIENT: getEnv("EMAIL_RECIPIENT"),

  /** Optional BCC address for the Lohnabrechnung email. */
  EMAIL_RECIPIENT_BCC: process.env.EMAIL_RECIPIENT_BCC ?? "",

  /** Email body template (plain text). Placeholders: {{MONTH_NAME}}, {{YEAR}}. Use \n for newlines. In Coolify, \n may be stored as \\n; the app normalizes this. */
  EMAIL_BODY_TEMPLATE: getEnv(
    "EMAIL_BODY_TEMPLATE",
    "Hier kommt die Lohnabrechnung für {{MONTH_NAME}} {{YEAR}}. Vielen Dank für Ihre Dienste!"
  ),

  /** Redis URL for idempotency (e.g. redis://localhost:6379 or redis://:password@host:6379). */
  REDIS_URL: getEnv("REDIS_URL"),

  /** Optional: path to Chromium for PDF generation (e.g. /usr/bin/chromium). */
  PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
} as const;
