import {
  asRecord,
  asString,
  escapeHtml,
  titleCaseWords,
} from "@/core/email/templates/helpers";
import { renderEmailLayout, renderStatRows } from "@/core/email/templates/layout";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderRestrictionTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const action = titleCaseWords(asString(metadata?.action) ?? "restriction");
  const reason = asString(metadata?.reason) ?? "No reason provided.";
  const referenceId = asString(metadata?.referenceId) ?? "-";
  const supportUrl = asString(metadata?.supportUrl);

  const subject = input.subject ?? `Account notice: ${action}`;

  const html = renderEmailLayout({
    preheader: "A restriction has been applied to your event account.",
    eyebrow: "Compliance Notice",
    title: "Restriction applied",
    intro: "This action impacts event operations. Review the details and resolve any compliance requirements.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Action", value: action },
  { label: "Event", value: eventTitle },
  { label: "Reference", value: referenceId },
])}
<p style="margin:14px 0 0;color:#475569;font-size:13px;line-height:1.7;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`,
    ctaLabel: supportUrl ? "Contact Support" : undefined,
    ctaUrl: supportUrl,
    footerNote: "If you believe this is an error, contact support with the reference ID.",
  });

  const text = `${subject}\n\n${input.content}\n\nAction: ${action}\nEvent: ${eventTitle}\nReference: ${referenceId}\nReason: ${reason}`;

  return {
    subject,
    html,
    text,
  };
}
