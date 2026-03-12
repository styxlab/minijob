import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { env } from "./env";
import { getMonthNameDe } from "./pdf";
import { logger } from "./logger";

/** Renders the email body template with {{MONTH_NAME}} and {{YEAR}}. */
export function renderEmailBody(
  template: string,
  monthName: string,
  year: number
): string {
  return template
    .replace(/\{\{MONTH_NAME\}\}/g, monthName)
    .replace(/\{\{YEAR\}\}/g, String(year));
}

export async function sendLohnabrechnungEmail(
  pdfBuffer: Buffer,
  pdfFilename: string,
  year: number,
  month: number
): Promise<void> {
  const monthName = getMonthNameDe(month);
  const subject = "Lohnabrechnung " + monthName + " " + year;
  const bodyText = renderEmailBody(env.EMAIL_BODY_TEMPLATE, monthName, year);

  logger.step("email_prepare", "Building email", {
    to: env.EMAIL_RECIPIENT,
    ...(env.EMAIL_RECIPIENT_BCC && { bcc: env.EMAIL_RECIPIENT_BCC }),
    subject,
  });

  const ses = new SESClient({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const boundary = "----=_Part_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const base64Pdf = Buffer.from(pdfBuffer).toString("base64");
  const base64PdfWrapped = base64Pdf.match(/.{1,76}/g)?.join("\r\n") ?? base64Pdf;
  const rawMessage = [
    "From: " + env.SES_FROM_EMAIL,
    "To: " + env.EMAIL_RECIPIENT,
    ...(env.EMAIL_RECIPIENT_BCC ? ["Bcc: " + env.EMAIL_RECIPIENT_BCC] : []),
    "Subject: " + subject,
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=\"" + boundary + "\"",
    "",
    "--" + boundary,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    bodyText,
    "",
    "--" + boundary,
    "Content-Type: application/pdf; name=\"" + pdfFilename + "\"",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=\"" + pdfFilename + "\"",
    "",
    base64PdfWrapped,
    "",
    "--" + boundary + "--",
  ].join("\r\n");

  const command = new SendRawEmailCommand({
    RawMessage: { Data: Buffer.from(rawMessage, "utf-8") },
  });

  await ses.send(command);
  logger.step("email_sent", "Email sent via AWS SES", {
    to: env.EMAIL_RECIPIENT,
    ...(env.EMAIL_RECIPIENT_BCC && { bcc: env.EMAIL_RECIPIENT_BCC }),
    subject,
  });
}
