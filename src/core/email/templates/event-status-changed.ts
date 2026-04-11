import {
  asRecord,
  asString,
  escapeHtml,
  formatDateTime,
  titleCaseWords,
} from "@/core/email/templates/helpers";
import { renderEmailLayout, renderStatRows } from "@/core/email/templates/layout";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderEventStatusChangedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const previousStatus = titleCaseWords(asString(metadata?.previousStatus) ?? "Unknown");
  const nextStatus = titleCaseWords(asString(metadata?.nextStatus) ?? "Updated");
  const reason = asString(metadata?.reason) ?? "No reason was provided.";
  const startAt = asString(metadata?.startAt);
  const timezone = asString(metadata?.timezone) ?? "UTC";
  const eventUrl = asString(metadata?.eventUrl);

  const subject = input.subject ?? `Event update: ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: `${eventTitle} status changed to ${nextStatus}.`,
    eyebrow: "Event Update",
    title: `Status changed to ${nextStatus}`,
    intro: "Please review this lifecycle update and adjust your attendance plans if needed.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Event", value: eventTitle },
  { label: "Previous status", value: previousStatus },
  { label: "New status", value: nextStatus },
  { label: "Start time", value: formatDateTime(startAt, timezone) },
])}
<p style="margin:14px 0 0;color:#475569;font-size:13px;line-height:1.7;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`,
    ctaLabel: eventUrl ? "View Event Details" : undefined,
    ctaUrl: eventUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nEvent: ${eventTitle}\nPrevious status: ${previousStatus}\nNew status: ${nextStatus}\nStart time: ${formatDateTime(startAt, timezone)}\nReason: ${reason}`;

  return {
    subject,
    html,
    text,
  };
}
