import { asRecord, asString, escapeHtml } from "@/core/email/templates/helpers";
import { renderEmailLayout } from "@/core/email/templates/layout";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderWelcomeTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const recipientName = asString(metadata?.recipientName) ?? "there";
  const dashboardUrl = asString(metadata?.dashboardUrl);

  const subject = input.subject ?? "Welcome to Dinkinesh - EEMS";

  const html = renderEmailLayout({
    preheader: "Your account is now active.",
    eyebrow: "Welcome",
    title: "Your account is ready",
    intro: `Welcome ${recipientName}. You can now discover events, purchase tickets, and manage your profile securely.`,
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
<p style="margin:16px 0 0;color:#334155;font-size:14px;line-height:1.7;">Your account email is <strong>${escapeHtml(input.recipient.email)}</strong>. Keep this inbox active for check-in and purchase alerts.</p>`,
    ctaLabel: dashboardUrl ? "Open Dashboard" : undefined,
    ctaUrl: dashboardUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nAccount: ${input.recipient.email}`;

  return {
    subject,
    html,
    text,
  };
}
