/**
 * Integration test: mocks date + Redis only. Real PDF (template + Chromium) and real SES from .env.
 * Load .env first so env uses real config. Skips if .env is not configured.
 * Run with: npm run test:integration
 * Requires: .env with CRON_SECRET, AWS SES credentials, EMAIL_RECIPIENT, template at TEMPLATE_PATH,
 *           and Chromium (PUPPETEER_EXECUTABLE_PATH or system chromium). May take up to 60s.
 */
import "dotenv/config";
// Set RUN_DAY to today before @/lib/pdf (and thus env) is loaded, so the cron run-day check passes.
process.env.RUN_DAY = String(new Date().getDate());

import fs from "fs/promises";
import path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const projectRoot = path.resolve(import.meta.dirname ?? __dirname, "../../../../");

vi.mock("@/lib/redis", () => ({
  wasAlreadyProcessed: vi.fn(),
  markProcessed: vi.fn(),
}));

const hasEmailConfig = () =>
  !!(
    process.env.CRON_SECRET &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.SES_FROM_EMAIL &&
    process.env.EMAIL_RECIPIENT
  );

describe("POST /api/cron/lohnabrechnung (email integration)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { wasAlreadyProcessed } = await import("@/lib/redis");
    vi.mocked(wasAlreadyProcessed).mockResolvedValue(false);
  });

  it.runIf(hasEmailConfig())(
    "mocks date to run day, generates real PDF from template, sends real email via SES from .env",
    async () => {
      process.chdir(projectRoot);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const expectedFilename = `lohnabrechnung-${year}-${String(month).padStart(2, "0")}.pdf`;

      const { POST } = await import("./route");
      const secret = process.env.CRON_SECRET!;
      const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
      const req = new Request(`${siteUrl}/api/cron/lohnabrechnung`, {
        method: "POST",
        headers: { Authorization: "Bearer " + secret },
      });

      const res = await POST(req);

      const body = await res.json();
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
      }
      if (body.skipped) {
        throw new Error(`Expected job to run but it was skipped: reason=${body.reason} (currentDay=${body.currentDay}, runDay=${body.runDay}, year=${body.year}, month=${body.month})`);
      }
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.skipped).toBeUndefined();
      expect(body.year).toBe(year);
      expect(body.month).toBe(month);
      expect(body.pdfFilename).toBe(expectedFilename);
    },
    30_000
  );

  it.runIf(hasEmailConfig())(
    "generates real PDF and saves it to ./pdf for inspection",
    async () => {
      process.chdir(projectRoot);
      const { loadAndSubstituteTemplate, renderHtmlToPdf } = await import("@/lib/pdf");

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const filename = `lohnabrechnung-${year}-${String(month).padStart(2, "0")}.pdf`;

      const html = await loadAndSubstituteTemplate(year, month);
      const { buffer, filename: outFilename } = await renderHtmlToPdf(html, year, month);

      expect(buffer.length).toBeGreaterThan(0);
      expect(outFilename).toBe(filename);

      const pdfDir = path.join(projectRoot, "pdf");
      await fs.mkdir(pdfDir, { recursive: true });
      const outPath = path.join(pdfDir, filename);
      await fs.writeFile(outPath, buffer);

      expect((await fs.stat(outPath)).size).toBe(buffer.length);
    },
    30_000
  );
});
