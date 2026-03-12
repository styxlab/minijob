import fs from "fs/promises";
import path from "path";
import { env } from "./env";
import { logger } from "./logger";

const MONTH_NAMES_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function getMonthNameDe(month: number): string {
  return MONTH_NAMES_DE[month - 1] ?? String(month);
}

export async function loadAndSubstituteTemplate(year: number, month: number): Promise<string> {
  const templatePath = path.isAbsolute(env.TEMPLATE_PATH)
    ? env.TEMPLATE_PATH
    : path.join(process.cwd(), env.TEMPLATE_PATH);
  logger.step("template_load", "Reading template file", { path: templatePath });
  const raw = await fs.readFile(templatePath, "utf-8");
  const monthName = getMonthNameDe(month);
  const html = raw
    .replace(/\{\{MONTH_NAME\}\}/g, monthName)
    .replace(/\{\{YEAR\}\}/g, String(year));
  logger.step("template_substitute", "Substituted placeholders", { monthName, year, placeholdersReplaced: true });
  return html;
}

export async function renderHtmlToPdf(html: string, year: number, month: number): Promise<{ buffer: Buffer; filename: string }> {
  const filename = `lohnabrechnung-${year}-${String(month).padStart(2, "0")}.pdf`;
  logger.step("pdf_render", "Launching browser for PDF generation", { filename });
  const puppeteer = await import("puppeteer-core");
  const executablePath = env.PUPPETEER_EXECUTABLE_PATH
    ?? (process.platform === "linux" ? "/usr/bin/chromium" : undefined)
    ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
  if (!executablePath) {
    throw new Error("PUPPETEER_EXECUTABLE_PATH must be set, or use default Chromium path on Linux/macOS");
  }
  const browser = await puppeteer.default.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 10000 });
    const raw = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    const buffer = Buffer.from(raw);
    logger.step("pdf_render", "PDF generated successfully", { filename, sizeBytes: buffer.length });
    return { buffer, filename };
  } finally {
    await browser.close();
  }
}
