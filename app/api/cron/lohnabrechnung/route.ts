import { NextResponse } from "next/server";
import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { env } from "@/lib/env";
import { renderEmailBody } from "@/lib/email";
import { logger } from "@/lib/logger";
import { markProcessed, wasAlreadyProcessed } from "@/lib/redis";
import { getMonthNameDe, loadAndSubstituteTemplate, renderHtmlToPdf } from "@/lib/pdf";

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

export async function POST(request: Request) {
  const runId = Date.now();
  logger.step("cron_start", "Lohnabrechnung cron invoked", { runId });

  const secret = getCronSecret(request);
  if (secret !== env.CRON_SECRET) {
    logger.warn("Invalid or missing CRON_SECRET", { step: "cron_auth_failed" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Always use actual server date so PDF and email reflect the current period.
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (day !== env.RUN_DAY) {
    logger.step("cron_skip", "Not run day, exiting", {
      currentDay: day,
      runDay: env.RUN_DAY,
      year,
      month,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not_run_day",
      currentDay: day,
      runDay: env.RUN_DAY,
    });
  }

  if (await wasAlreadyProcessed(year, month)) {
    logger.step("cron_skip", "Already processed this period, exiting", {
      year,
      month,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "already_processed",
      year,
      month,
    });
  }

  try {
    const html = await loadAndSubstituteTemplate(year, month);
    const { buffer: pdfBuffer, filename: pdfFilename } = await renderHtmlToPdf(
      html,
      year,
      month
    );

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
    const base64Pdf = Buffer.from(pdfBuffer).toString("base64");
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

    await markProcessed(year, month);
    logger.step("cron_success", "Lohnabrechnung run completed", {
      runId,
      year,
      month,
      pdfFilename,
    });

    return NextResponse.json({
      ok: true,
      year,
      month,
      pdfFilename,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Lohnabrechnung run failed", {
      step: "cron_error",
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
