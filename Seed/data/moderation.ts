import {
  AbuseReportStatus,
  AbuseTargetType,
  RiskSeverity,
  RiskStatus,
  ScopeType,
  type Prisma,
} from "@prisma/client";
import { addDays, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrganizationProfile, SeedUserProfile } from "./types";

type ModerationSeedResult = {
  abuseReports: Prisma.AbuseReportCreateManyInput[];
  riskCases: Prisma.RiskCaseCreateManyInput[];
};

export function buildModeration(input: {
  now: Date;
  users: SeedUserProfile[];
  events: SeedEventProfile[];
  organizations: SeedOrganizationProfile[];
}): ModerationSeedResult {
  const abuseReports: Prisma.AbuseReportCreateManyInput[] = [];
  const riskCases: Prisma.RiskCaseCreateManyInput[] = [];

  const reporters = input.users.filter((user) => user.group === "ATTENDEE" || user.group === "STAFF");

  for (let index = 1; index <= 12; index += 1) {
    const reportOnEvent = index % 2 === 1;
    const reporter = pickCyclic(reporters, index);
    const event = pickCyclic(input.events, index - 1);
    const organization = pickCyclic(input.organizations, index - 1);

    abuseReports.push({
      id: ids.abuse(index),
      reporterId: reporter.id,
      targetType: reportOnEvent ? AbuseTargetType.EVENT : AbuseTargetType.ORGANIZER,
      targetId: reportOnEvent ? event.id : organization.id,
      category: reportOnEvent ? "MISLEADING_INFORMATION" : "HARASSMENT",
      description:
        reportOnEvent
          ? "Event listing description appears misleading compared to published agenda."
          : "Organizer communication included inappropriate language in a reminder message.",
      evidenceUrls: [
        `https://evidence.event-demo.local/screenshots/${index}.png`,
        `https://evidence.event-demo.local/logs/${index}.txt`,
      ],
      status:
        index <= 4
          ? AbuseReportStatus.OPEN
          : index <= 8
            ? AbuseReportStatus.UNDER_REVIEW
            : AbuseReportStatus.RESOLVED,
      eventId: reportOnEvent ? event.id : null,
      organizationId: reportOnEvent ? event.orgId : organization.id,
      createdAt: subDays(input.now, 20 - index),
      resolvedAt: index > 8 ? subDays(input.now, 5 - (index % 3)) : null,
    });

    const severity =
      index <= 3
        ? RiskSeverity.LOW
        : index <= 6
          ? RiskSeverity.MEDIUM
          : index <= 9
            ? RiskSeverity.HIGH
            : RiskSeverity.CRITICAL;

    riskCases.push({
      id: ids.risk(index),
      scopeType: index % 3 === 0 ? ScopeType.ORGANIZATION : ScopeType.EVENT,
      scopeId: index % 3 === 0 ? organization.id : event.id,
      source:
        severity === RiskSeverity.CRITICAL
          ? "PAYMENT_ANOMALY_CLUSTER"
          : severity === RiskSeverity.HIGH
            ? "REVIEW_SPAM_BURST"
            : "MANUAL_MODERATION_TRIGGER",
      severity,
      status:
        index <= 5
          ? RiskStatus.OPEN
          : index <= 9
            ? RiskStatus.INVESTIGATING
            : index === 10
              ? RiskStatus.MITIGATED
              : RiskStatus.CLOSED,
      eventId: index % 3 === 0 ? null : event.id,
      organizationId: organization.id,
      createdBy: reporter.id,
      createdAt: addDays(subDays(input.now, 25), index),
    });
  }

  return {
    abuseReports,
    riskCases,
  };
}
