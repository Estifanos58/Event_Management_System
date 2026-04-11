import { escapeHtml } from "@/core/email/templates/helpers";

const BRAND_NAME = "Dinkinesh - EEMS";

type EmailLayoutInput = {
  preheader: string;
  title: string;
  eyebrow?: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
};

export function renderEmailLayout(input: EmailLayoutInput) {
  const ctaHtml =
    input.ctaLabel && input.ctaUrl
      ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">${escapeHtml(input.ctaLabel)}</a></p>`
      : "";

  const footerNote = input.footerNote
    ? `<p style="margin:12px 0 0;color:#64748b;font-size:12px;line-height:1.5;">${escapeHtml(input.footerNote)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:radial-gradient(circle at top left,#ccfbf1 0,#f1f5f9 45%,#e2e8f0 100%);padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 20px 40px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:24px 28px;background:#0f172a;color:#e2e8f0;">
                <p style="margin:0;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#99f6e4;">${escapeHtml(input.eyebrow ?? "Transactional Update")}</p>
                <h1 style="margin:10px 0 0;font-size:23px;line-height:1.3;color:#ffffff;">${escapeHtml(input.title)}</h1>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#cbd5e1;">${escapeHtml(input.intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                ${input.bodyHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                <p style="margin:0;color:#0f172a;font-size:13px;font-weight:700;">${BRAND_NAME}</p>
                <p style="margin:8px 0 0;color:#475569;font-size:12px;line-height:1.5;">This message was sent by the ${BRAND_NAME} notification service.</p>
                ${footerNote}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderStatRows(rows: Array<{ label: string; value: string }>) {
  if (!rows.length) {
    return "";
  }

  const itemHtml = rows
    .map(
      (entry) => `<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px;">${escapeHtml(entry.label)}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(entry.value)}</td>
</tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;margin:18px 0 0;">
${itemHtml}
</table>`;
}
