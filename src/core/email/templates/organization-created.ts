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

export function renderOrganizationCreatedTemplate(
  input: NotificationEmailTemplateInput,
): NotificationEmailTemplateOutput {
  const metadata = asRecord(input.metadata);
  const displayName = asString(metadata?.displayName) ?? "your organization";
  const legalName = asString(metadata?.legalName) ?? "-";
  const defaultCurrency = asString(metadata?.defaultCurrency) ?? "-";
  const region = asString(metadata?.region) ?? "-";
  const dashboardUrl = asString(metadata?.dashboardUrl);

  const subject = input.subject ?? `Organization created: ${displayName}`;

  const html = renderEmailLayout({
    preheader: `${displayName} has been provisioned successfully.`,
    eyebrow: "Organization",
    title: "Organization created successfully",
    intro: "Your organizer workspace is now active and ready for event authoring.",
    bodyHtml: `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(input.content)}</p>
${renderStatRows([
  { label: "Display name", value: displayName },
  { label: "Legal name", value: legalName },
  { label: "Default currency", value: defaultCurrency },
  { label: "Region", value: region },
])}`,
    ctaLabel: dashboardUrl ? "Open Organizer Dashboard" : undefined,
    ctaUrl: dashboardUrl,
  });

  const text = `${subject}\n\n${input.content}\n\nDisplay name: ${displayName}\nLegal name: ${legalName}\nCurrency: ${defaultCurrency}\nRegion: ${region}`;

  return {
    subject,
    html,
    text,
  };
}
