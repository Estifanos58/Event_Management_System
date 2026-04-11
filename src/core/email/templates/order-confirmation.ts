import {
  asArray,
  asNumber,
  asRecord,
  asString,
  escapeHtml,
  formatCurrency,
  formatDateTime,
} from "@/core/email/templates/helpers";
import { renderEmailLayout, renderStatRows } from "@/core/email/templates/layout";
import { generateInlineQrDataUrl } from "@/core/email/templates/qr";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

type TicketEmailItem = {
  id: string;
  ticketClassName: string;
  attendeeName: string;
  qrToken?: string;
};

function parseTicket(value: unknown): TicketEmailItem | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = asString(record.id);
  if (!id) {
    return undefined;
  }

  return {
    id,
    ticketClassName: asString(record.ticketClassName) ?? "General Admission",
    attendeeName: asString(record.attendeeName) ?? "Attendee",
    qrToken: asString(record.qrToken),
  };
}

export async function renderOrderConfirmationTemplate(
  input: NotificationEmailTemplateInput,
): Promise<NotificationEmailTemplateOutput> {
  const metadata = asRecord(input.metadata);

  const orderId = asString(metadata?.orderId) ?? "-";
  const eventTitle = asString(metadata?.eventTitle) ?? "Upcoming Event";
  const eventTimezone = asString(metadata?.eventTimezone) ?? "UTC";
  const eventStartAt = asString(metadata?.eventStartAt);
  const totalAmount = asNumber(metadata?.totalAmount);
  const currency = asString(metadata?.currency);
  const manageTicketsUrl = asString(metadata?.manageTicketsUrl);

  const tickets = asArray(metadata?.tickets, parseTicket);

  const qrCards: string[] = [];

  for (const ticket of tickets) {
    if (!ticket.qrToken) {
      continue;
    }

    try {
      const qrDataUrl = await generateInlineQrDataUrl(ticket.qrToken);
      qrCards.push(`<div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-top:14px;">
  <p style="margin:0;color:#0f172a;font-size:13px;font-weight:700;">${escapeHtml(ticket.ticketClassName)} · ${escapeHtml(ticket.attendeeName)}</p>
  <p style="margin:6px 0 0;color:#475569;font-size:12px;">Ticket #${escapeHtml(ticket.id)}</p>
  <img src="${qrDataUrl}" alt="QR code for ticket ${escapeHtml(ticket.id)}" width="170" height="170" style="margin-top:12px;border-radius:10px;border:1px solid #cbd5e1;display:block;" />
</div>`);
    } catch {
      qrCards.push(`<div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-top:14px;">
  <p style="margin:0;color:#0f172a;font-size:13px;font-weight:700;">${escapeHtml(ticket.ticketClassName)} · ${escapeHtml(ticket.attendeeName)}</p>
  <p style="margin:6px 0 0;color:#475569;font-size:12px;">Ticket #${escapeHtml(ticket.id)}</p>
  <p style="margin:10px 0 0;color:#475569;font-size:12px;">QR code unavailable in email. Open your dashboard to retrieve the latest code.</p>
</div>`);
    }
  }

  const subject = input.subject ?? `Order confirmed for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: `Order ${orderId} has been confirmed with ${tickets.length} ticket(s).`,
    eyebrow: "Order Confirmation",
    title: "Your tickets are confirmed",
    intro: `Payment has been captured for ${eventTitle}. Keep these QR codes available for gate check-in.`,
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Order", value: orderId },
  { label: "Event", value: eventTitle },
  { label: "Start", value: formatDateTime(eventStartAt, eventTimezone) },
  { label: "Total", value: formatCurrency(totalAmount, currency) },
  { label: "Tickets", value: String(tickets.length) },
])}
${qrCards.join("")}`,
    ctaLabel: manageTicketsUrl ? "Manage Tickets" : undefined,
    ctaUrl: manageTicketsUrl,
    footerNote: "QR codes are unique per ticket. Do not forward this email to unknown recipients.",
  });

  const textTicketLines = tickets
    .map((ticket) => `- ${ticket.ticketClassName} (${ticket.attendeeName}) #${ticket.id}`)
    .join("\n");

  const text = `${subject}\n\n${input.content}\n\nOrder: ${orderId}\nEvent: ${eventTitle}\nStarts: ${formatDateTime(eventStartAt, eventTimezone)}\nTotal: ${formatCurrency(totalAmount, currency)}\nTickets:\n${textTicketLines}`;

  return {
    subject,
    html,
    text,
  };
}
