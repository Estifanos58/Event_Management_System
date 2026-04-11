import {
  asRecord,
  asString,
  escapeHtml,
} from "@/core/email/templates/helpers";
import { renderEmailLayout, renderStatRows } from "@/core/email/templates/layout";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderPaymentFailedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const orderId = asString(metadata?.orderId) ?? "-";
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const failureCode = asString(metadata?.failureCode) ?? "UNKNOWN";
  const retryUrl = asString(metadata?.retryUrl);

  const subject = input.subject ?? `Payment failed for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: "Your payment could not be completed.",
    eyebrow: "Payment",
    title: "Payment not completed",
    intro: "Your reservation was not finalized. You can retry payment if the reservation is still active.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Order", value: orderId },
  { label: "Event", value: eventTitle },
  { label: "Failure code", value: failureCode },
])}`,
    ctaLabel: retryUrl ? "Retry Payment" : undefined,
    ctaUrl: retryUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nOrder: ${orderId}\nEvent: ${eventTitle}\nFailure code: ${failureCode}`;

  return {
    subject,
    html,
    text,
  };
}
