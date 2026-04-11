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

export function renderStaffAssignedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const eventTitle = asString(metadata?.eventTitle) ?? "Event";
  const assignmentRole = asString(metadata?.assignmentRole) ?? "Staff";
  const gateName = asString(metadata?.gateName) ?? "All gates";
  const assignedByName = asString(metadata?.assignedByName) ?? "Organizer";
  const dashboardUrl = asString(metadata?.dashboardUrl);

  const subject = input.subject ?? `You were added as staff for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader: "You have received new event staff permissions.",
    eyebrow: "Staff Assignment",
    title: "Staff assignment confirmed",
    intro: "Your account can now access assigned event operations and gate tools.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Event", value: eventTitle },
  { label: "Role", value: assignmentRole },
  { label: "Gate", value: gateName },
  { label: "Assigned by", value: assignedByName },
])}`,
    ctaLabel: dashboardUrl ? "Open Staff Dashboard" : undefined,
    ctaUrl: dashboardUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nEvent: ${eventTitle}\nRole: ${assignmentRole}\nGate: ${gateName}\nAssigned by: ${assignedByName}`;

  return {
    subject,
    html,
    text,
  };
}
