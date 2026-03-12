import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { env } from "@/lib/env";
import { renderEmailBody } from "@/lib/email";
import { logger } from "@/lib/logger";
import { getMonthNameDe, loadAndSubstituteTemplate, renderHtmlToPdf } from "@/lib/pdf";

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

/** PDF output directory relative to cwd (same as in .gitignore). */
const PDF_DIR = "pdf";

export async function POST(request: Request) {
  const runId = Date.now();
  logger.step("generate_start", "Lohnabrechnung generate invoked", { runId });

  const secret = getCronSecret(request);
  if (secret !== env.CRON_SECRET) {
    logger.warn("Invalid or missing CRON_SECRET", { step: "generate_auth_failed" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { year?: number; month?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body; expected { year, month }" },
      { status: 400 }
    );
  }

  const year = body.year;
  const month = body.month;
  if (
    typeof year !== "number" ||
    typeof month !== "number" ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "Body must include year (number) and month (1–12)" },
      { status: 400 }
    );
  }

  try {
    const html = await loadAndSubstituteTemplate(year, month);
    const { buffer: pdfBuffer, filename: pdfFilename } = await renderHtmlToPdf(
      html,
      year,
      month
    );

    const pdfDir = path.isAbsolute(PDF_DIR) ? PDF_DIR : path.join(process.cwd(), PDF_DIR);
    await fs.mkdir(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, pdfFilename);
    await fs.writeFile(pdfPath, pdfBuffer);
    logger.step("pdf_saved", "PDF written to disk", { pdfPath, pdfFilename });

    const monthName = getMonthNameDe(month);
    const subject = "Lohnabrechnung " + monthName + " " + year;
    const bodyText = renderEmailBody(env.EMAIL_BODY_TEMPLATE, monthName, year);

    const ses = new SESClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const boundary =
      "----=_Part_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const base64Pdf = pdfBuffer.toString("base64");
    const base64PdfWrapped = base64Pdf.match(/.{1,76}/g)?.join("\r\n") ?? base64Pdf;
    const rawMessage = [
      "From: " + env.SES_FROM_EMAIL,
      "To: " + env.EMAIL_RECIPIENT,
      ...(env.EMAIL_RECIPIENT_BCC ? ["Bcc: " + env.EMAIL_RECIPIENT_BCC] : []),
      "Subject: " + subject,
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      "",
      "--" + boundary,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      bodyText,
      "",
      "--" + boundary,
      'Content-Type: application/pdf; name="' + pdfFilename + '"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="' + pdfFilename + '"',
      "",
      base64PdfWrapped,
      "",
      "--" + boundary + "--",
    ].join("\r\n");

    await ses.send(
      new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rawMessage, "utf-8") },
      })
    );
    logger.step("email_sent", "Email sent via AWS SES", {
      to: env.EMAIL_RECIPIENT,
      ...(env.EMAIL_RECIPIENT_BCC && { bcc: env.EMAIL_RECIPIENT_BCC }),
      subject,
    });

    logger.step("generate_success", "Lohnabrechnung generate completed", {
      runId,
      year,
      month,
      pdfFilename,
      pdfPath,
    });

    return NextResponse.json({
      ok: true,
      year,
      month,
      pdfFilename,
      pdfPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Lohnabrechnung generate failed", {
      step: "generate_error",
      runId,
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "Job failed", message },
      { status: 500 }
    );
  }
}
