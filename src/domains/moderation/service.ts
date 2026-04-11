import {
  AbuseReportStatus,
  AbuseTargetType,
  EventStatus,
  EventVisibility,
  NotificationType,
  Prisma,
  RiskSeverity,
  RiskStatus,
  ScopeType,
  TicketStatus,
} from "@prisma/client";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { prisma } from "@/core/db/prisma";
import { env } from "@/core/env";
import { createAccessContext, requirePermission } from "@/domains/identity/guards";
import { ModerationDomainError } from "@/domains/moderation/errors";
import { enqueueSystemNotification } from "@/domains/notifications/service";
import type {
  AbuseReportListQuery,
  ApplyModerationEnforcementInput,
  CreateModerationCaseInput,
  EventTrustSignals,
  ModerationCaseListQuery,
  ModerationEnforcementAction,
  ModerationQueueItem,
  ModerationQueueSnapshot,
  SubmitAbuseReportInput,
  TransitionModerationCaseInput,
  UpdateAbuseReportStatusInput,
} from "@/domains/moderation/types";

const OPEN_REPORT_STATUSES = [
  AbuseReportStatus.OPEN,
  AbuseReportStatus.UNDER_REVIEW,
] as const;
const OPEN_CASE_STATUSES = [RiskStatus.OPEN, RiskStatus.INVESTIGATING] as const;

const ABUSE_REPORT_TRANSITIONS: Record<AbuseReportStatus, AbuseReportStatus[]> = {
  [AbuseReportStatus.OPEN]: [
    AbuseReportStatus.UNDER_REVIEW,
    AbuseReportStatus.RESOLVED,
  ],
  [AbuseReportStatus.UNDER_REVIEW]: [
    AbuseReportStatus.OPEN,
    AbuseReportStatus.RESOLVED,
  ],
  [AbuseReportStatus.RESOLVED]: [AbuseReportStatus.UNDER_REVIEW],
};

const RISK_CASE_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  [RiskStatus.OPEN]: [RiskStatus.INVESTIGATING, RiskStatus.MITIGATED, RiskStatus.CLOSED],
  [RiskStatus.INVESTIGATING]: [RiskStatus.MITIGATED, RiskStatus.CLOSED],
  [RiskStatus.MITIGATED]: [RiskStatus.CLOSED, RiskStatus.INVESTIGATING],
  [RiskStatus.CLOSED]: [RiskStatus.INVESTIGATING],
};

const CATEGORY_SEVERITY_MAP: Record<string, RiskSeverity> = {
  FRAUD_SCAM: RiskSeverity.HIGH,
  MISLEADING_INFORMATION: RiskSeverity.MEDIUM,
  SAFETY_ISSUE: RiskSeverity.CRITICAL,
  INAPPROPRIATE_CONTENT: RiskSeverity.MEDIUM,
  REPEATED_CANCELLATIONS: RiskSeverity.MEDIUM,
  POOR_MANAGEMENT: RiskSeverity.MEDIUM,
  ABUSE_OR_HARASSMENT: RiskSeverity.CRITICAL,
  SYSTEM_BUG: RiskSeverity.MEDIUM,
  PAYMENT_ISSUE: RiskSeverity.HIGH,
  POLICY_VIOLATION: RiskSeverity.HIGH,
  OTHER: RiskSeverity.MEDIUM,
};

const CATEGORY_ALLOWLIST: Record<AbuseTargetType, Set<string>> = {
  [AbuseTargetType.EVENT]: new Set([
    "FRAUD_SCAM",
    "MISLEADING_INFORMATION",
    "SAFETY_ISSUE",
    "INAPPROPRIATE_CONTENT",
    "OTHER",
  ]),
  [AbuseTargetType.ORGANIZER]: new Set([
    "REPEATED_CANCELLATIONS",
    "POOR_MANAGEMENT",
    "ABUSE_OR_HARASSMENT",
    "OTHER",
  ]),
  [AbuseTargetType.PLATFORM]: new Set([
    "SYSTEM_BUG",
    "PAYMENT_ISSUE",
    "POLICY_VIOLATION",
    "OTHER",
  ]),
};

const SEVERITY_PRIORITY_WEIGHT: Record<RiskSeverity, number> = {
  [RiskSeverity.LOW]: 1,
  [RiskSeverity.MEDIUM]: 2,
  [RiskSeverity.HIGH]: 3,
  [RiskSeverity.CRITICAL]: 4,
};

const submitAbuseReportInputSchema = z.object({
  targetType: z.enum(AbuseTargetType),
  targetId: z.string().trim().max(120).optional(),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(2_000),
  evidenceUrls: z.array(z.url()).max(10).optional(),
  severityHint: z.enum(RiskSeverity).optional(),
  createRiskCase: z.boolean().optional(),
});

const abuseReportListQuerySchema = z.object({
  status: z.enum(AbuseReportStatus).optional(),
  targetType: z.enum(AbuseTargetType).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const updateAbuseReportStatusInputSchema = z.object({
  status: z.enum(AbuseReportStatus),
  reason: z.string().trim().max(240).optional(),
  severity: z.enum(RiskSeverity).optional(),
  createRiskCase: z.boolean().optional(),
});

const createModerationCaseInputSchema = z.object({
  reportId: z.string().trim().min(1).max(120).optional(),
  source: z.string().trim().max(120).optional(),
  scopeType: z.enum(ScopeType).optional(),
  scopeId: z.string().trim().max(120).optional(),
  severity: z.enum(RiskSeverity).optional(),
  reason: z.string().trim().max(240).optional(),
});

const moderationCaseListQuerySchema = z.object({
  status: z.enum(RiskStatus).optional(),
  severity: z.enum(RiskSeverity).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const transitionModerationCaseInputSchema = z.object({
  nextStatus: z.enum(RiskStatus),
  severity: z.enum(RiskSeverity).optional(),
  reason: z.string().trim().max(240).optional(),
});

const applyModerationEnforcementInputSchema = z.object({
  action: z.enum([
    "WARN_ORGANIZER",
    "UNLIST_EVENT",
    "PAUSE_TICKET_SALES",
    "RESOLVE_REPORT",
    "ESCALATE_CASE",
  ]),
  reason: z.string().trim().min(4).max(240),
  reportId: z.string().trim().min(1).max(120).optional(),
  riskCaseId: z.string().trim().min(1).max(120).optional(),
  metadata: z.unknown().optional(),
});

function now() {
  return new Date();
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeCategory(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, roundToTwo(value)));
}

function computeAgeHours(createdAt: Date) {
  return Math.max(0, (now().getTime() - createdAt.getTime()) / (1000 * 60 * 60));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function inferCategorySeverity(category: string, severityHint?: RiskSeverity) {
  if (severityHint) {
    return severityHint;
  }

  return CATEGORY_SEVERITY_MAP[category] ?? RiskSeverity.MEDIUM;
}

async function requireReporterPermission(eventId: string, action: string) {
  return requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "event.read",
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function requireModeratorPermission(eventId: string, action: string) {
  return requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "event.manage",
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function loadEventModerationContext(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
      title: true,
      status: true,
      visibility: true,
      ticketSalesPaused: true,
      createdBy: true,
    },
  });

  if (!event) {
    throw new ModerationDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  return event;
}

function parseSubmitAbuseReportInput(input: SubmitAbuseReportInput) {
  const parsed = submitAbuseReportInputSchema.parse(input);
  const category = normalizeCategory(parsed.category);

  if (!CATEGORY_ALLOWLIST[parsed.targetType].has(category)) {
    throw new ModerationDomainError(
      422,
      "UNPROCESSABLE_MODERATION",
      "Category is not valid for the selected abuse target type.",
    );
  }

  return {
    targetType: parsed.targetType,
    targetId: normalizeOptionalText(parsed.targetId),
    category,
    description: parsed.description,
    evidenceUrls: parsed.evidenceUrls ?? [],
    severityHint: parsed.severityHint,
    createRiskCase: parsed.createRiskCase ?? false,
  };
}

function parseAbuseReportListQuery(input: AbuseReportListQuery) {
  const parsed = abuseReportListQuerySchema.parse(input);

  return {
    status: parsed.status,
    targetType: parsed.targetType,
    take: parsed.take ?? 100,
  };
}

function parseUpdateAbuseReportStatusInput(input: UpdateAbuseReportStatusInput) {
  const parsed = updateAbuseReportStatusInputSchema.parse(input);

  return {
    status: parsed.status,
    reason: normalizeOptionalText(parsed.reason),
    severity: parsed.severity,
    createRiskCase: parsed.createRiskCase ?? false,
  };
}

function parseCreateModerationCaseInput(input: CreateModerationCaseInput) {
  const parsed = createModerationCaseInputSchema.parse(input);

  return {
    reportId: normalizeOptionalText(parsed.reportId),
    source: normalizeOptionalText(parsed.source),
    scopeType: parsed.scopeType,
    scopeId: normalizeOptionalText(parsed.scopeId),
    severity: parsed.severity ?? RiskSeverity.MEDIUM,
    reason: normalizeOptionalText(parsed.reason),
  };
}

function parseModerationCaseListQuery(input: ModerationCaseListQuery) {
  const parsed = moderationCaseListQuerySchema.parse(input);

  return {
    status: parsed.status,
    severity: parsed.severity,
    take: parsed.take ?? 100,
  };
}

function parseTransitionModerationCaseInput(input: TransitionModerationCaseInput) {
  const parsed = transitionModerationCaseInputSchema.parse(input);

  return {
    nextStatus: parsed.nextStatus,
    severity: parsed.severity,
    reason: normalizeOptionalText(parsed.reason),
  };
}

function parseApplyModerationEnforcementInput(input: ApplyModerationEnforcementInput) {
  const parsed = applyModerationEnforcementInputSchema.parse(input);

  return {
    action: parsed.action as ModerationEnforcementAction,
    reason: parsed.reason,
    reportId: normalizeOptionalText(parsed.reportId),
    riskCaseId: normalizeOptionalText(parsed.riskCaseId),
    metadata: parsed.metadata,
  };
}

function resolveReportTargetId(
  event: { id: string; orgId: string },
  input: ReturnType<typeof parseSubmitAbuseReportInput>,
) {
  if (input.targetType === AbuseTargetType.EVENT) {
    const targetId = input.targetId ?? event.id;

    if (targetId !== event.id) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "Event abuse reports must target the event in the route path.",
      );
    }

    return targetId;
  }

  if (input.targetType === AbuseTargetType.ORGANIZER) {
    const targetId = input.targetId ?? event.orgId;

    if (targetId !== event.orgId) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "Organizer abuse reports must target the organizer that owns this event.",
      );
    }

    return targetId;
  }

  return input.targetId ?? "platform";
}

async function ensureRiskCaseForReport(input: {
  eventId: string;
  organizationId?: string;
  reportId: string;
  severity: RiskSeverity;
  createdBy: string;
}) {
  const source = `ABUSE_REPORT:${input.reportId}`;

  const existing = await prisma.riskCase.findFirst({
    where: {
      eventId: input.eventId,
      source,
      status: {
        in: [...OPEN_CASE_STATUSES],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.riskCase.create({
    data: {
      scopeType: ScopeType.EVENT,
      scopeId: input.eventId,
      source,
      severity: input.severity,
      status: RiskStatus.OPEN,
      eventId: input.eventId,
      organizationId: input.organizationId,
      createdBy: input.createdBy,
    },
  });
}

function assertAbuseReportTransitionAllowed(current: AbuseReportStatus, next: AbuseReportStatus) {
  if (current === next) {
    return;
  }

  const allowedTransitions = ABUSE_REPORT_TRANSITIONS[current] ?? [];

  if (!allowedTransitions.includes(next)) {
    throw new ModerationDomainError(
      409,
      "INVALID_STATUS_TRANSITION",
      `Abuse report transition ${current} -> ${next} is not allowed.`,
    );
  }
}

function assertRiskCaseTransitionAllowed(current: RiskStatus, next: RiskStatus) {
  if (current === next) {
    return;
  }

  const allowedTransitions = RISK_CASE_TRANSITIONS[current] ?? [];

  if (!allowedTransitions.includes(next)) {
    throw new ModerationDomainError(
      409,
      "INVALID_STATUS_TRANSITION",
      `Risk case transition ${current} -> ${next} is not allowed.`,
    );
  }
}

export async function submitAbuseReport(eventId: string, input: SubmitAbuseReportInput) {
  const parsedInput = parseSubmitAbuseReportInput(input);
  const { session } = await requireReporterPermission(eventId, "moderation.report.submit");
  const event = await loadEventModerationContext(eventId);

  const targetId = resolveReportTargetId(event, parsedInput);
  const severity = inferCategorySeverity(parsedInput.category, parsedInput.severityHint);

  const existingOpenReport = await prisma.abuseReport.findFirst({
    where: {
      reporterId: session.user.id,
      targetType: parsedInput.targetType,
      targetId,
      category: parsedInput.category,
      status: {
        in: [...OPEN_REPORT_STATUSES],
      },
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
    },
  });

  if (existingOpenReport) {
    throw new ModerationDomainError(
      409,
      "DUPLICATE_REPORT",
      "A similar open abuse report already exists from this reporter in the last 24 hours.",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const report = await tx.abuseReport.create({
      data: {
        reporterId: session.user.id,
        targetType: parsedInput.targetType,
        targetId,
        category: parsedInput.category,
        description: parsedInput.description,
        evidenceUrls: parsedInput.evidenceUrls,
        status:
          parsedInput.createRiskCase || severity === RiskSeverity.HIGH || severity === RiskSeverity.CRITICAL
            ? AbuseReportStatus.UNDER_REVIEW
            : AbuseReportStatus.OPEN,
        eventId,
        organizationId: event.orgId,
      },
    });

    let riskCase: Awaited<ReturnType<typeof ensureRiskCaseForReport>> | null = null;

    if (
      parsedInput.createRiskCase ||
      severity === RiskSeverity.HIGH ||
      severity === RiskSeverity.CRITICAL
    ) {
      riskCase = await ensureRiskCaseForReport({
        eventId,
        organizationId: event.orgId,
        reportId: report.id,
        severity,
        createdBy: session.user.id,
      });
    }

    return {
      report,
      riskCase,
    };
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "moderation.abuse_report.submitted",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "AbuseReport",
    targetId: result.report.id,
    newValue: {
      targetType: result.report.targetType,
      targetId: result.report.targetId,
      category: result.report.category,
      severity,
      riskCaseId: result.riskCase?.id ?? null,
    },
  });

  return result;
}

export async function listAbuseReports(eventId: string, query: AbuseReportListQuery) {
  const parsedQuery = parseAbuseReportListQuery(query);
  await requireModeratorPermission(eventId, "moderation.report.list");

  return prisma.abuseReport.findMany({
    where: {
      eventId,
      ...(parsedQuery.status
        ? {
            status: parsedQuery.status,
          }
        : {}),
      ...(parsedQuery.targetType
        ? {
            targetType: parsedQuery.targetType,
          }
        : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: parsedQuery.take,
  });
}

export async function updateAbuseReportStatus(
  eventId: string,
  reportId: string,
  input: UpdateAbuseReportStatusInput,
) {
  const parsedInput = parseUpdateAbuseReportStatusInput(input);
  const { session } = await requireModeratorPermission(eventId, "moderation.report.update");

  const report = await prisma.abuseReport.findFirst({
    where: {
      id: reportId,
      eventId,
    },
  });

  if (!report) {
    throw new ModerationDomainError(404, "ABUSE_REPORT_NOT_FOUND", "Abuse report not found.");
  }

  assertAbuseReportTransitionAllowed(report.status, parsedInput.status);

  const severity = inferCategorySeverity(
    normalizeCategory(report.category),
    parsedInput.severity,
  );

  const updated = await prisma.abuseReport.update({
    where: {
      id: report.id,
    },
    data: {
      status: parsedInput.status,
      resolvedAt:
        parsedInput.status === AbuseReportStatus.RESOLVED
          ? now()
          : parsedInput.status === AbuseReportStatus.OPEN
            ? null
            : report.resolvedAt,
    },
  });

  let riskCase: Awaited<ReturnType<typeof ensureRiskCaseForReport>> | null = null;

  if (parsedInput.createRiskCase || parsedInput.status === AbuseReportStatus.UNDER_REVIEW) {
    const fallbackOrganizationId =
      report.organizationId ?? (await loadEventModerationContext(eventId)).orgId;

    riskCase = await ensureRiskCaseForReport({
      eventId,
      organizationId: fallbackOrganizationId,
      reportId: report.id,
      severity,
      createdBy: session.user.id,
    });
  }

  await writeAuditEvent({
    actorId: session.user.id,
    action: "moderation.abuse_report.status_updated",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "AbuseReport",
    targetId: report.id,
    reason: parsedInput.reason,
    oldValue: {
      status: report.status,
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
    },
    newValue: {
      status: updated.status,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      riskCaseId: riskCase?.id ?? null,
    },
  });

  return {
    report: updated,
    riskCase,
  };
}

export async function createModerationCase(eventId: string, input: CreateModerationCaseInput) {
  const parsedInput = parseCreateModerationCaseInput(input);
  const { session } = await requireModeratorPermission(eventId, "moderation.case.create");
  const event = await loadEventModerationContext(eventId);

  const report = parsedInput.reportId
    ? await prisma.abuseReport.findFirst({
        where: {
          id: parsedInput.reportId,
          eventId,
        },
      })
    : null;

  if (parsedInput.reportId && !report) {
    throw new ModerationDomainError(404, "ABUSE_REPORT_NOT_FOUND", "Abuse report not found.");
  }

  const scopeType = parsedInput.scopeType ?? ScopeType.EVENT;

  if (scopeType === ScopeType.PLATFORM || scopeType === ScopeType.PERSONAL) {
    throw new ModerationDomainError(
      422,
      "UNPROCESSABLE_MODERATION",
      "Event moderation case creation supports only EVENT or ORGANIZATION scope.",
    );
  }

  const scopeId =
    parsedInput.scopeId ??
    (scopeType === ScopeType.EVENT ? event.id : event.orgId);

  if (scopeType === ScopeType.EVENT && scopeId !== event.id) {
    throw new ModerationDomainError(
      422,
      "UNPROCESSABLE_MODERATION",
      "Scope id must match event id for EVENT-scoped moderation cases.",
    );
  }

  if (scopeType === ScopeType.ORGANIZATION && scopeId !== event.orgId) {
    throw new ModerationDomainError(
      422,
      "UNPROCESSABLE_MODERATION",
      "Scope id must match organizer id for ORGANIZATION-scoped moderation cases.",
    );
  }

  const source =
    parsedInput.source ??
    (report ? `ABUSE_REPORT:${report.id}` : "MODERATION_MANUAL");

  const riskCase = await prisma.$transaction(async (tx) => {
    const createdCase = await tx.riskCase.create({
      data: {
        scopeType,
        scopeId,
        source,
        severity: parsedInput.severity,
        status: RiskStatus.OPEN,
        eventId,
        organizationId: event.orgId,
        createdBy: session.user.id,
      },
    });

    if (report && report.status === AbuseReportStatus.OPEN) {
      await tx.abuseReport.update({
        where: {
          id: report.id,
        },
        data: {
          status: AbuseReportStatus.UNDER_REVIEW,
        },
      });
    }

    return createdCase;
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "moderation.case.created",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "RiskCase",
    targetId: riskCase.id,
    reason: parsedInput.reason,
    newValue: {
      reportId: report?.id ?? null,
      source,
      scopeType,
      scopeId,
      severity: riskCase.severity,
    },
  });

  return riskCase;
}

export async function listModerationCases(eventId: string, query: ModerationCaseListQuery) {
  const parsedQuery = parseModerationCaseListQuery(query);
  await requireModeratorPermission(eventId, "moderation.case.list");

  return prisma.riskCase.findMany({
    where: {
      eventId,
      ...(parsedQuery.status
        ? {
            status: parsedQuery.status,
          }
        : {}),
      ...(parsedQuery.severity
        ? {
            severity: parsedQuery.severity,
          }
        : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: parsedQuery.take,
  });
}

export async function transitionModerationCase(
  eventId: string,
  riskCaseId: string,
  input: TransitionModerationCaseInput,
) {
  const parsedInput = parseTransitionModerationCaseInput(input);
  const { session } = await requireModeratorPermission(eventId, "moderation.case.transition");

  const riskCase = await prisma.riskCase.findFirst({
    where: {
      id: riskCaseId,
      eventId,
    },
  });

  if (!riskCase) {
    throw new ModerationDomainError(404, "RISK_CASE_NOT_FOUND", "Risk case not found.");
  }

  assertRiskCaseTransitionAllowed(riskCase.status, parsedInput.nextStatus);

  const updatedRiskCase = await prisma.riskCase.update({
    where: {
      id: riskCase.id,
    },
    data: {
      status: parsedInput.nextStatus,
      severity: parsedInput.severity ?? riskCase.severity,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "moderation.case.transitioned",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "RiskCase",
    targetId: riskCase.id,
    reason: parsedInput.reason,
    oldValue: {
      status: riskCase.status,
      severity: riskCase.severity,
    },
    newValue: {
      status: updatedRiskCase.status,
      severity: updatedRiskCase.severity,
    },
  });

  return updatedRiskCase;
}

export async function getModerationQueue(eventId: string): Promise<ModerationQueueSnapshot> {
  await requireModeratorPermission(eventId, "moderation.queue.read");

  const [reports, riskCases] = await Promise.all([
    prisma.abuseReport.findMany({
      where: {
        eventId,
        status: {
          in: [...OPEN_REPORT_STATUSES],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 200,
    }),
    prisma.riskCase.findMany({
      where: {
        eventId,
        status: {
          in: [...OPEN_CASE_STATUSES],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 200,
    }),
  ]);

  const reportItems: ModerationQueueItem[] = reports.map((report) => {
    const severity = inferCategorySeverity(normalizeCategory(report.category));
    const ageHours = computeAgeHours(report.createdAt);

    return {
      kind: "ABUSE_REPORT",
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      status: report.status,
      severity,
      source: `ABUSE_REPORT:${report.category}`,
      category: report.category,
      createdAt: report.createdAt.toISOString(),
      ageHours: roundToTwo(ageHours),
      priorityScore: roundToTwo(
        SEVERITY_PRIORITY_WEIGHT[severity] * 10 +
          ageHours * 0.4 +
          (report.status === AbuseReportStatus.OPEN ? 8 : 4),
      ),
    };
  });

  const riskCaseItems: ModerationQueueItem[] = riskCases.map((riskCase) => {
    const ageHours = computeAgeHours(riskCase.createdAt);

    return {
      kind: "RISK_CASE",
      id: riskCase.id,
      status: riskCase.status,
      severity: riskCase.severity,
      source: riskCase.source,
      createdAt: riskCase.createdAt.toISOString(),
      ageHours: roundToTwo(ageHours),
      priorityScore: roundToTwo(
        SEVERITY_PRIORITY_WEIGHT[riskCase.severity] * 10 +
          ageHours * 0.5 +
          (riskCase.status === RiskStatus.OPEN ? 7 : 4),
      ),
    };
  });

  const items = [...reportItems, ...riskCaseItems].sort(
    (left, right) => right.priorityScore - left.priorityScore,
  );

  return {
    generatedAt: now().toISOString(),
    summary: {
      openReports: reports.filter((report) => report.status === AbuseReportStatus.OPEN).length,
      underReviewReports: reports.filter(
        (report) => report.status === AbuseReportStatus.UNDER_REVIEW,
      ).length,
      openRiskCases: riskCases.filter((riskCase) => riskCase.status === RiskStatus.OPEN)
        .length,
      investigatingRiskCases: riskCases.filter(
        (riskCase) => riskCase.status === RiskStatus.INVESTIGATING,
      ).length,
      criticalItems: items.filter((item) => item.severity === RiskSeverity.CRITICAL).length,
    },
    items,
  };
}

export async function applyModerationEnforcement(
  eventId: string,
  input: ApplyModerationEnforcementInput,
) {
  const parsedInput = parseApplyModerationEnforcementInput(input);
  const { session } = await requireModeratorPermission(eventId, "moderation.enforcement.apply");
  const event = await loadEventModerationContext(eventId);

  const result = await prisma.$transaction(async (tx) => {
    let updatedEvent: {
      id: string;
      visibility: EventVisibility;
      ticketSalesPaused: boolean;
      status: EventStatus;
    } | null = null;
    let updatedReport: {
      id: string;
      status: AbuseReportStatus;
      resolvedAt: Date | null;
    } | null = null;
    let updatedRiskCase: {
      id: string;
      status: RiskStatus;
      severity: RiskSeverity;
    } | null = null;

    if (parsedInput.action === "UNLIST_EVENT") {
      updatedEvent = await tx.event.update({
        where: {
          id: eventId,
        },
        data: {
          visibility: EventVisibility.UNLISTED,
        },
        select: {
          id: true,
          visibility: true,
          ticketSalesPaused: true,
          status: true,
        },
      });
    }

    if (parsedInput.action === "PAUSE_TICKET_SALES") {
      updatedEvent = await tx.event.update({
        where: {
          id: eventId,
        },
        data: {
          ticketSalesPaused: true,
        },
        select: {
          id: true,
          visibility: true,
          ticketSalesPaused: true,
          status: true,
        },
      });
    }

    if (parsedInput.action === "RESOLVE_REPORT") {
      if (!parsedInput.reportId) {
        throw new ModerationDomainError(
          422,
          "UNPROCESSABLE_MODERATION",
          "reportId is required for RESOLVE_REPORT enforcement action.",
        );
      }

      const report = await tx.abuseReport.findFirst({
        where: {
          id: parsedInput.reportId,
          eventId,
        },
      });

      if (!report) {
        throw new ModerationDomainError(404, "ABUSE_REPORT_NOT_FOUND", "Abuse report not found.");
      }

      updatedReport = await tx.abuseReport.update({
        where: {
          id: report.id,
        },
        data: {
          status: AbuseReportStatus.RESOLVED,
          resolvedAt: now(),
        },
        select: {
          id: true,
          status: true,
          resolvedAt: true,
        },
      });
    }

    if (parsedInput.action === "ESCALATE_CASE") {
      if (!parsedInput.riskCaseId) {
        throw new ModerationDomainError(
          422,
          "UNPROCESSABLE_MODERATION",
          "riskCaseId is required for ESCALATE_CASE enforcement action.",
        );
      }

      const riskCase = await tx.riskCase.findFirst({
        where: {
          id: parsedInput.riskCaseId,
          eventId,
        },
      });

      if (!riskCase) {
        throw new ModerationDomainError(404, "RISK_CASE_NOT_FOUND", "Risk case not found.");
      }

      updatedRiskCase = await tx.riskCase.update({
        where: {
          id: riskCase.id,
        },
        data: {
          severity: RiskSeverity.CRITICAL,
          status:
            riskCase.status === RiskStatus.CLOSED ? RiskStatus.INVESTIGATING : riskCase.status,
        },
        select: {
          id: true,
          status: true,
          severity: true,
        },
      });
    }

    return {
      updatedEvent,
      updatedReport,
      updatedRiskCase,
    };
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: `moderation.enforcement.${parsedInput.action.toLowerCase()}`,
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Event",
    targetId: eventId,
    reason: parsedInput.reason,
    oldValue: {
      visibility: event.visibility,
      ticketSalesPaused: event.ticketSalesPaused,
      status: event.status,
    },
    newValue: {
      action: parsedInput.action,
      reportId: parsedInput.reportId ?? null,
      riskCaseId: parsedInput.riskCaseId ?? null,
      updatedEvent: result.updatedEvent,
      updatedReport: result.updatedReport,
      updatedRiskCase: result.updatedRiskCase,
      metadata: toJsonValue(parsedInput.metadata),
    },
  });

  void enqueueSystemNotification({
    orgId: event.orgId,
    eventId,
    userIds: [event.createdBy],
    type: NotificationType.USER_RESTRICTED,
    subject: `Moderation action applied to ${event.title}`,
    content:
      "A moderation enforcement action affected your event operations. Review details in your dashboard.",
    idempotencyKeyBase: `txn:moderation-enforcement:${eventId}:${parsedInput.action}:${parsedInput.reportId ?? parsedInput.riskCaseId ?? "event"}`,
    metadata: {
      action: parsedInput.action,
      eventTitle: event.title,
      referenceId: parsedInput.reportId ?? parsedInput.riskCaseId ?? eventId,
      reason: parsedInput.reason,
      supportUrl: `${env.NEXT_PUBLIC_APP_URL}/support`,
    },
    maxAttempts: 6,
  }).catch((error) => {
    console.warn("Failed to enqueue moderation restriction notification", {
      eventId,
      action: parsedInput.action,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  return {
    action: parsedInput.action,
    reason: parsedInput.reason,
    result,
  };
}

export async function getEventTrustSignals(eventId: string): Promise<EventTrustSignals> {
  await requireModeratorPermission(eventId, "moderation.trust_signals.read");
  const event = await loadEventModerationContext(eventId);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    feedbackAggregate,
    eventTicketStatusBreakdown,
    organizerEvents,
    eventOpenReports,
    organizerOpenReports,
    openRiskCases,
    criticalRiskCases,
    reportVelocityCount,
  ] = await Promise.all([
    prisma.feedback.aggregate({
      where: {
        eventId,
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: {
        eventId,
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      _count: {
        _all: true,
      },
    }),
    prisma.event.findMany({
      where: {
        orgId: event.orgId,
      },
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.abuseReport.count({
      where: {
        eventId,
        status: {
          in: [...OPEN_REPORT_STATUSES],
        },
      },
    }),
    prisma.abuseReport.count({
      where: {
        organizationId: event.orgId,
        status: {
          in: [...OPEN_REPORT_STATUSES],
        },
      },
    }),
    prisma.riskCase.count({
      where: {
        eventId,
        status: {
          in: [...OPEN_CASE_STATUSES],
        },
      },
    }),
    prisma.riskCase.count({
      where: {
        eventId,
        status: {
          in: [...OPEN_CASE_STATUSES],
        },
        severity: RiskSeverity.CRITICAL,
      },
    }),
    prisma.abuseReport.count({
      where: {
        eventId,
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
    }),
  ]);

  let soldTickets = 0;
  let usedTickets = 0;

  for (const item of eventTicketStatusBreakdown) {
    soldTickets += item._count._all;

    if (item.status === TicketStatus.USED) {
      usedTickets += item._count._all;
    }
  }

  const attendanceRate = soldTickets > 0 ? usedTickets / soldTickets : 0;

  const organizerTotalEvents = organizerEvents.length;
  const organizerCancelledEvents = organizerEvents.filter(
    (candidate) =>
      candidate.status === EventStatus.CANCELLED ||
      candidate.status === EventStatus.POSTPONED,
  ).length;
  const organizerCancellationRate =
    organizerTotalEvents > 0 ? organizerCancelledEvents / organizerTotalEvents : 0;

  const ratingAverage = Number(feedbackAggregate._avg.rating ?? 0);
  const ratingCount = feedbackAggregate._count._all;
  const reportVelocity7d = reportVelocityCount / 7;

  const organizerTrustScore = clampScore(
    55 +
      (ratingAverage / 5) * 25 +
      attendanceRate * 20 -
      organizerCancellationRate * 30 -
      Math.min(28, organizerOpenReports * 4 + eventOpenReports * 5) -
      criticalRiskCases * 8,
  );

  const eventStatusComponent =
    event.status === EventStatus.CANCELLED
      ? -15
      : event.status === EventStatus.POSTPONED
        ? -8
        : event.status === EventStatus.COMPLETED
          ? 12
          : event.status === EventStatus.LIVE || event.status === EventStatus.PUBLISHED
            ? 8
            : 4;

  const eventReliabilityScore = clampScore(
    45 +
      (ratingAverage / 5) * 30 +
      attendanceRate * 30 +
      eventStatusComponent -
      Math.min(35, eventOpenReports * 7 + openRiskCases * 6),
  );

  const riskIndicators: string[] = [];

  if (eventOpenReports >= 3) {
    riskIndicators.push("HIGH_OPEN_REPORT_VOLUME");
  }

  if (reportVelocity7d >= 1) {
    riskIndicators.push("RISING_REPORT_VELOCITY");
  }

  if (organizerCancellationRate >= 0.25) {
    riskIndicators.push("HIGH_ORGANIZER_CANCELLATION_RATE");
  }

  if (criticalRiskCases > 0) {
    riskIndicators.push("CRITICAL_RISK_CASE_OPEN");
  }

  if (ratingCount >= 5 && ratingAverage < 2.5) {
    riskIndicators.push("LOW_EVENT_RATING_SIGNAL");
  }

  return {
    eventId,
    organizerId: event.orgId,
    generatedAt: now().toISOString(),
    organizerTrustScore,
    eventReliabilityScore,
    metrics: {
      ratingAverage: roundToTwo(ratingAverage),
      ratingCount,
      attendanceRate: roundToTwo(attendanceRate),
      organizerCancellationRate: roundToTwo(organizerCancellationRate),
      eventOpenReports,
      organizerOpenReports,
      openRiskCases,
      criticalRiskCases,
      reportVelocity7d: roundToTwo(reportVelocity7d),
    },
    riskIndicators,
  };
}
