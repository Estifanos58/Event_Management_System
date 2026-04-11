import {
  asRecord,
  asString,
  escapeHtml,
  formatDateTime,
  titleCaseWords,
} from "@/core/email/templates/helpers";
import { renderEmailLayout, renderStatRows } from "@/core/email/templates/layout";
import { generateInlineQrDataUrl } from "@/core/email/templates/qr";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderTransferRequestedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const transferId = asString(metadata?.transferId) ?? "-";
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const ticketLabel = asString(metadata?.ticketLabel) ?? "Ticket";
  const fromUserName = asString(metadata?.fromUserName) ?? "Another attendee";
  const expiresAt = asString(metadata?.expiresAt);
  const actionUrl = asString(metadata?.actionUrl);

  const subject = input.subject ?? `Ticket transfer request for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: `${fromUserName} requested to transfer a ticket to you.`,
    eyebrow: "Ticket Transfer",
    title: "Transfer request awaiting your response",
    intro: `Review this transfer before it expires and decide whether to accept ownership.`,
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Transfer", value: transferId },
  { label: "From", value: fromUserName },
  { label: "Event", value: eventTitle },
  { label: "Ticket", value: ticketLabel },
  { label: "Expires", value: formatDateTime(expiresAt) },
])}`,
    ctaLabel: actionUrl ? "Respond to Transfer" : undefined,
    ctaUrl: actionUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nTransfer: ${transferId}\nFrom: ${fromUserName}\nEvent: ${eventTitle}\nTicket: ${ticketLabel}\nExpires: ${formatDateTime(expiresAt)}`;

  return {
    subject,
    html,
    text,
  };
}

export function renderTransferUpdatedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const transferId = asString(metadata?.transferId) ?? "-";
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const ticketLabel = asString(metadata?.ticketLabel) ?? "Ticket";
  const status = titleCaseWords(asString(metadata?.transferStatus) ?? "updated");
  const toUserName = asString(metadata?.toUserName) ?? "recipient";
  const reason = asString(metadata?.reason) ?? "No additional reason provided.";
  const manageUrl = asString(metadata?.manageUrl);

  const subject = input.subject ?? `Transfer ${status.toLowerCase()}: ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: `Your transfer has been ${status.toLowerCase()}.`,
    eyebrow: "Ticket Transfer",
    title: `Transfer ${status}`,
    intro: `The recipient ${toUserName} has completed a transfer response.`,
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Transfer", value: transferId },
  { label: "Event", value: eventTitle },
  { label: "Ticket", value: ticketLabel },
  { label: "Recipient", value: toUserName },
  { label: "Status", value: status },
])}
<p style="margin:14px 0 0;color:#475569;font-size:13px;line-height:1.7;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`,
    ctaLabel: manageUrl ? "View Ticket Activity" : undefined,
    ctaUrl: manageUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nTransfer: ${transferId}\nEvent: ${eventTitle}\nTicket: ${ticketLabel}\nRecipient: ${toUserName}\nStatus: ${status}\nReason: ${reason}`;

  return {
    subject,
    html,
    text,
  };
}

export async function renderTransferReceivedTemplate(
  input: NotificationEmailTemplateInput,
): Promise<NotificationEmailTemplateOutput> {
  const metadata = asRecord(input.metadata);
  const transferId = asString(metadata?.transferId) ?? "-";
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const ticketLabel = asString(metadata?.ticketLabel) ?? "Ticket";
  const fromUserName = asString(metadata?.fromUserName) ?? "Sender";
  const qrToken = asString(metadata?.qrToken);
  const manageUrl = asString(metadata?.manageUrl);

  let qrHtml = "";

  if (qrToken) {
    try {
      const qrDataUrl = await generateInlineQrDataUrl(qrToken);
      qrHtml = `<div style="margin-top:16px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;display:inline-block;">
  <img src="${qrDataUrl}" alt="Ticket QR code" width="170" height="170" style="display:block;border-radius:10px;border:1px solid #cbd5e1;" />
</div>`;
    } catch {
      qrHtml = `<p style="margin:14px 0 0;color:#475569;font-size:12px;">QR rendering failed in email. Open your dashboard to view the active QR.</p>`;
    }
  }

  const subject = input.subject ?? `You received a ticket for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: "Ticket ownership has been transferred to your account.",
    eyebrow: "Ticket Transfer",
    title: "Ticket transferred to you",
    intro: `You now own this ticket and can use it for event check-in.`,
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Transfer", value: transferId },
  { label: "From", value: fromUserName },
  { label: "Event", value: eventTitle },
  { label: "Ticket", value: ticketLabel },
])}
${qrHtml}`,
    ctaLabel: manageUrl ? "Open My Tickets" : undefined,
    ctaUrl: manageUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nTransfer: ${transferId}\nFrom: ${fromUserName}\nEvent: ${eventTitle}\nTicket: ${ticketLabel}`;

  return {
    subject,
    html,
    text,
  };
}
