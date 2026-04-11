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

export function renderWaitlistPromotedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const ticketClassName = asString(metadata?.ticketClassName) ?? "Ticket";
  const claimExpiresAt = asString(metadata?.claimExpiresAt);
  const claimUrl = asString(metadata?.claimUrl);

  const subject = input.subject ?? `Waitlist spot opened for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: "A seat is now available from the waitlist.",
    eyebrow: "Waitlist",
    title: "Your waitlist spot is available",
    intro: "A ticket is now available for claim. Complete checkout before the claim window expires.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Event", value: eventTitle },
  { label: "Ticket class", value: ticketClassName },
  { label: "Claim expires", value: formatDateTime(claimExpiresAt) },
])}`,
    ctaLabel: claimUrl ? "Claim Ticket" : undefined,
    ctaUrl: claimUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nEvent: ${eventTitle}\nTicket class: ${ticketClassName}\nClaim expires: ${formatDateTime(claimExpiresAt)}`;

  return {
    subject,
    html,
    text,
  };
}
