import { escapeHtml } from "@/core/email/templates/helpers";
import { renderEmailLayout } from "@/core/email/templates/layout";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";

export function renderGenericNotificationTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const subject = input.subject ?? "Update from Dinkinesh - EEMS";

  const html = renderEmailLayout({
    preheader: input.content,
    title: subject,
    intro: "A transactional update is available on your account.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>`,
  });

  const text = `${subject}\n\n${input.content}\n\nDinkinesh - EEMS`;

  return {
    subject,
    html,
    text,
  };
}
