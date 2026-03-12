/**
 * Interactive script: asks for a month (and optional year), calls the
 * generate API to create the Lohnabrechnung PDF for that period, save it
 * to the pdf folder, and send it by email.
 *
 * Usage: pnpm run generate:lohnabrechnung
 * Requires: .env with CRON_SECRET and LOHNABRECHNUNG_API_URL (default http://localhost:3000)
 */

import { createInterface } from "readline";
import "dotenv/config";

const DEFAULT_API_URL = "http://localhost:3000";
const API_PATH = "/api/lohnabrechnung/generate";

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function parseMonth(input: string): number | null {
  const n = parseInt(input, 10);
  if (Number.isNaN(n) || n < 1 || n > 12) return null;
  return n;
}

function parseYear(input: string): number | null {
  const n = parseInt(input, 10);
  if (Number.isNaN(n) || n < 2000 || n > 2100) return null;
  return n;
}

async function main(): Promise<void> {
  const apiUrl = (process.env.LOHNABRECHNUNG_API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("Missing CRON_SECRET in environment (.env).");
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let month: number | null = null;
  let year: number = currentYear;

  while (month === null) {
    const monthInput = await ask(
      rl,
      `Month (1–12) for Lohnabrechnung [${currentMonth}]: `
    );
    if (monthInput === "") {
      month = currentMonth;
      break;
    }
    month = parseMonth(monthInput);
    if (month === null) {
      console.log("Invalid month. Enter a number between 1 and 12.");
    }
  }

  const yearInput = await ask(rl, `Year [${currentYear}]: `);
  if (yearInput !== "") {
    const y = parseYear(yearInput);
    if (y !== null) year = y;
  }

  rl.close();

  const url = `${apiUrl}${API_PATH}`;
  console.log(`Calling ${url} for ${year}-${String(month).padStart(2, "0")} ...`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ year, month }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Request failed:", res.status, data.error ?? data.message ?? res.statusText);
    process.exit(1);
  }

  console.log("OK:", data.pdfFilename, "saved to", data.pdfPath ?? "pdf/");
  console.log("Email sent to configured recipient(s).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
