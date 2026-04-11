import {
  asRecord,
  asString,
  escapeHtml,
  formatDateTime,
} from "@/core/email/templates/helpers";
import { renderEmailLayout, renderStatRows } from "@/core/email/templates/layout";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderCheckInAcceptedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const gateName = asString(metadata?.gateName) ?? "Gate";
  const scannedAt = asString(metadata?.scannedAt);
  const ticketClassName = asString(metadata?.ticketClassName) ?? "Ticket";
  const recordId = asString(metadata?.checkInEventId) ?? "-";

  const subject = input.subject ?? `Check-in confirmed for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: "Your ticket has been checked in successfully.",
    eyebrow: "Check-in",
    title: "Check-in successful",
    intro: "You are now marked as checked in for this event.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Event", value: eventTitle },
  { label: "Gate", value: gateName },
  { label: "Ticket", value: ticketClassName },
  { label: "Scanned at", value: formatDateTime(scannedAt) },
  { label: "Record", value: recordId },
])}`,
  });

  const text = `${subject}\n\n${input.content}\n\nEvent: ${eventTitle}\nGate: ${gateName}\nTicket: ${ticketClassName}\nScanned at: ${formatDateTime(scannedAt)}\nRecord: ${recordId}`;

  return {
    subject,
    html,
    text,
  };
}
