import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  escapeHtml,
  formatCurrency,
  titleCaseWords,
} from "@/core/email/templates/helpers";
import { renderEmailLayout, renderStatRows } from "@/core/email/templates/layout";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderRefundCompletedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const refundId = asString(metadata?.refundId) ?? "-";
  const orderId = asString(metadata?.orderId) ?? "-";
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const amount = asNumber(metadata?.amount);
  const currency = asString(metadata?.currency);
  const policyWindow = titleCaseWords(asString(metadata?.policyWindow));
  const reason = asString(metadata?.reason) ?? "No reason provided.";
  const totalRefunded = asNumber(metadata?.totalRefunded);
  const fullyRefunded = asBoolean(metadata?.fullyRefunded) ?? false;

  const subject = input.subject ?? `Refund processed for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: `Refund ${refundId} has been completed.`,
    eyebrow: "Refund",
    title: "Refund completed",
    intro: "Your refund has been processed and confirmed in our finance ledger.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Refund", value: refundId },
  { label: "Order", value: orderId },
  { label: "Event", value: eventTitle },
  { label: "Amount", value: formatCurrency(amount, currency) },
  { label: "Total refunded", value: formatCurrency(totalRefunded, currency) },
  { label: "Policy window", value: policyWindow },
  { label: "Fully refunded", value: fullyRefunded ? "Yes" : "No" },
])}
<p style="margin:14px 0 0;color:#475569;font-size:13px;line-height:1.7;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`,
  });

  const text = `${subject}\n\n${input.content}\n\nRefund: ${refundId}\nOrder: ${orderId}\nEvent: ${eventTitle}\nAmount: ${formatCurrency(amount, currency)}\nTotal refunded: ${formatCurrency(totalRefunded, currency)}\nPolicy window: ${policyWindow}\nFully refunded: ${fullyRefunded ? "Yes" : "No"}\nReason: ${reason}`;

  return {
    subject,
    html,
    text,
  };
}
