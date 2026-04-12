import {
  AbuseReportStatus,
  AbuseTargetType,
  EventStatus,
  EventVisibility,
  ModerationAppealStatus,
  ModerationBanScope,
  ModerationBanStatus,
  NotificationType,
  Prisma,
  Role,
  RiskSeverity,
  RiskStatus,
  ScopeType,
  TicketStatus,
} from "@prisma/client";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { getServerSessionOrNull } from "@/core/auth/session";
import { prisma } from "@/core/db/prisma";
import { env } from "@/core/env";
import {
  AuthorizationError,
  createAccessContext,
  requirePermission,
} from "@/domains/identity/guards";
import { ModerationDomainError } from "@/domains/moderation/errors";
import { enqueueSystemNotification } from "@/domains/notifications/service";
import type {
  AbuseReportListQuery,
  ApplyModerationEnforcementInput,
  CreateModerationAppealInput,
  CreateModerationBanInput,
  CreateModerationCaseInput,
  EventTrustSignals,
  ModerationAppealEntry,
  ModerationAppealListQuery,
  ModerationBanEntry,
  ModerationBanListQuery,
  ModerationCaseListQuery,
  ModerationEnforcementAction,
  ModerationQueueItem,
  ModerationQueueSnapshot,
  PagedModerationAppeals,
  PagedModerationBans,
  ReviewModerationAppealInput,
  SubmitAbuseReportInput,
  TransitionModerationCaseInput,
  UpdateAbuseReportStatusInput,
} from "@/domains/moderation/types";

const OPEN_REPORT_STATUSES = [
  AbuseReportStatus.OPEN,
  AbuseReportStatus.UNDER_REVIEW,
] as const;
const OPEN_CASE_STATUSES = [RiskStatus.OPEN, RiskStatus.INVESTIGATING] as const;
const PLATFORM_SCOPE_ID = "platform";

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
  [AbuseTargetType.USER]: new Set([
    "ABUSE_OR_HARASSMENT",
    "FRAUD_SCAM",
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

const createModerationBanInputSchema = z.object({
  scope: z.enum(ModerationBanScope),
  reason: z.string().trim().min(4).max(300),
  subjectUserId: z.string().trim().min(1).max(120).optional(),
  subjectOrganizationId: z.string().trim().min(1).max(120).optional(),
  scopeOrganizationId: z.string().trim().min(1).max(120).optional(),
  sourceReportId: z.string().trim().min(1).max(120).optional(),
  sourceRiskCaseId: z.string().trim().min(1).max(120).optional(),
  metadata: z.unknown().optional(),
});

const moderationBanListQuerySchema = z.object({
  scope: z.enum(ModerationBanScope).optional(),
  status: z.enum(ModerationBanStatus).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const createModerationAppealInputSchema = z.object({
  banId: z.string().trim().min(1).max(120),
  message: z.string().trim().min(8).max(2_000),
  metadata: z.unknown().optional(),
});

const moderationAppealListQuerySchema = z.object({
  status: z.enum(ModerationAppealStatus).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const reviewModerationAppealInputSchema = z.object({
  decision: z.enum([ModerationAppealStatus.APPROVED, ModerationAppealStatus.REJECTED]),
  note: z.string().trim().max(500).optional(),
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

function parseCreateModerationBanInput(input: CreateModerationBanInput) {
  const parsed = createModerationBanInputSchema.parse(input);

  const normalized = {
    scope: parsed.scope,
    reason: parsed.reason,
    subjectUserId: normalizeOptionalText(parsed.subjectUserId),
    subjectOrganizationId: normalizeOptionalText(parsed.subjectOrganizationId),
    scopeOrganizationId: normalizeOptionalText(parsed.scopeOrganizationId),
    sourceReportId: normalizeOptionalText(parsed.sourceReportId),
    sourceRiskCaseId: normalizeOptionalText(parsed.sourceRiskCaseId),
    metadata: parsed.metadata,
  };

  if (normalized.scope === ModerationBanScope.GLOBAL_USER) {
    if (!normalized.subjectUserId) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "subjectUserId is required for GLOBAL_USER bans.",
      );
    }
  }

  if (normalized.scope === ModerationBanScope.GLOBAL_ORGANIZATION) {
    if (!normalized.subjectOrganizationId) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "subjectOrganizationId is required for GLOBAL_ORGANIZATION bans.",
      );
    }
  }

  if (normalized.scope === ModerationBanScope.ORGANIZATION_USER) {
    if (!normalized.subjectUserId || !normalized.scopeOrganizationId) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "subjectUserId and scopeOrganizationId are required for ORGANIZATION_USER bans.",
      );
    }
  }

  return normalized;
}

function parseModerationBanListQuery(input: ModerationBanListQuery) {
  const parsed = moderationBanListQuerySchema.parse(input);

  return {
    scope: parsed.scope,
    status: parsed.status,
    page: parsed.page ?? 1,
    pageSize: parsed.pageSize ?? 20,
  };
}

function parseCreateModerationAppealInput(input: CreateModerationAppealInput) {
  const parsed = createModerationAppealInputSchema.parse(input);

  return {
    banId: parsed.banId,
    message: parsed.message,
    metadata: parsed.metadata,
  };
}

function parseModerationAppealListQuery(input: ModerationAppealListQuery) {
  const parsed = moderationAppealListQuerySchema.parse(input);

  return {
    status: parsed.status,
    page: parsed.page ?? 1,
    pageSize: parsed.pageSize ?? 20,
  };
}

function parseReviewModerationAppealInput(input: ReviewModerationAppealInput) {
  const parsed = reviewModerationAppealInputSchema.parse(input);

  return {
    decision: parsed.decision,
    note: normalizeOptionalText(parsed.note),
  };
}

async function requirePlatformAdminPermission(action: string, targetType: string, targetId: string) {
  return requirePermission({
    context: createAccessContext(ScopeType.PLATFORM, PLATFORM_SCOPE_ID),
    permission: "platform.admin",
    action,
    targetType,
    targetId,
  });
}

async function requireOrganizationManagePermission(
  organizationId: string,
  action: string,
  targetType: string,
  targetId: string,
) {
  return requirePermission({
    context: createAccessContext(ScopeType.ORGANIZATION, organizationId),
    permission: "org.manage",
    action,
    targetType,
    targetId,
  });
}

function toBanEntry(
  ban: {
    id: string;
    scope: ModerationBanScope;
    status: ModerationBanStatus;
    reason: string;
    subjectUserId: string | null;
    subjectOrganizationId: string | null;
    scopeOrganizationId: string | null;
    sourceReportId: string | null;
    sourceRiskCaseId: string | null;
    createdBy: string;
    liftedBy: string | null;
    liftedAt: Date | null;
    createdAt: Date;
    subjectOrganization?: {
      displayName: string;
    } | null;
    scopeOrganization?: {
      displayName: string;
    } | null;
  },
): ModerationBanEntry {
  return {
    id: ban.id,
    scope: ban.scope,
    status: ban.status,
    reason: ban.reason,
    subjectUserId: ban.subjectUserId,
    subjectOrganizationId: ban.subjectOrganizationId,
    subjectOrganizationName: ban.subjectOrganization?.displayName ?? null,
    scopeOrganizationId: ban.scopeOrganizationId,
    scopeOrganizationName: ban.scopeOrganization?.displayName ?? null,
    sourceReportId: ban.sourceReportId,
    sourceRiskCaseId: ban.sourceRiskCaseId,
    createdBy: ban.createdBy,
    liftedBy: ban.liftedBy,
    liftedAt: ban.liftedAt?.toISOString() ?? null,
    createdAt: ban.createdAt.toISOString(),
  };
}

function toAppealEntry(
  appeal: {
    id: string;
    banId: string;
    requesterId: string;
    status: ModerationAppealStatus;
    message: string;
    reviewerNote: string | null;
    reviewedBy: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
    requester: {
      name: string;
      email: string;
    };
    reviewer: {
      name: string;
    } | null;
    ban: {
      id: string;
      scope: ModerationBanScope;
      status: ModerationBanStatus;
      reason: string;
      subjectUserId: string | null;
      subjectOrganizationId: string | null;
      scopeOrganizationId: string | null;
      sourceReportId: string | null;
      sourceRiskCaseId: string | null;
      createdBy: string;
      liftedBy: string | null;
      liftedAt: Date | null;
      createdAt: Date;
      subjectOrganization: {
        displayName: string;
      } | null;
      scopeOrganization: {
        displayName: string;
      } | null;
    };
  },
): ModerationAppealEntry {
  return {
    id: appeal.id,
    banId: appeal.banId,
    requesterId: appeal.requesterId,
    requesterName: appeal.requester.name,
    requesterEmail: appeal.requester.email,
    status: appeal.status,
    message: appeal.message,
    reviewerNote: appeal.reviewerNote,
    reviewedBy: appeal.reviewedBy,
    reviewedByName: appeal.reviewer?.name ?? null,
    createdAt: appeal.createdAt.toISOString(),
    reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
    ban: toBanEntry(appeal.ban),
  };
}

function buildBanMessageForNotification(ban: ModerationBanEntry) {
  if (ban.scope === ModerationBanScope.GLOBAL_USER) {
    return "Your account has been globally restricted by moderation.";
  }

  if (ban.scope === ModerationBanScope.GLOBAL_ORGANIZATION) {
    return `Organization ${ban.subjectOrganizationName ?? ban.subjectOrganizationId ?? ""} has been restricted.`.trim();
  }

  return `Your account has been restricted from organizer operations in ${ban.scopeOrganizationName ?? "the selected organization"}.`;
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

  if (input.targetType === AbuseTargetType.USER) {
    if (!input.targetId) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "User abuse reports require a target user id.",
      );
    }

    return input.targetId;
  }

  if (!input.targetId) {
    throw new ModerationDomainError(
      422,
      "UNPROCESSABLE_MODERATION",
      "Platform abuse reports require a target id.",
    );
  }

  return input.targetId;
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

async function getPlatformAdminUserIds() {
  const rows = await prisma.roleBinding.findMany({
    where: {
      role: Role.SUPER_ADMIN,
      scopeType: ScopeType.PLATFORM,
    },
    select: {
      userId: true,
    },
    distinct: ["userId"],
    take: 10_000,
  });

  return rows.map((row) => row.userId);
}

async function getOrganizationManagerUserIds(organizationId: string) {
  const rows = await prisma.roleBinding.findMany({
    where: {
      scopeType: ScopeType.ORGANIZATION,
      scopeId: organizationId,
      role: {
        in: [Role.ORGANIZER, Role.SUPER_ADMIN],
      },
    },
    select: {
      userId: true,
    },
    distinct: ["userId"],
    take: 10_000,
  });

  return rows.map((row) => row.userId);
}

async function requireBanCreationPermission(input: {
  scope: ModerationBanScope;
  scopeOrganizationId?: string;
}) {
  if (
    input.scope === ModerationBanScope.GLOBAL_USER ||
    input.scope === ModerationBanScope.GLOBAL_ORGANIZATION
  ) {
    const adminAuthz = await requirePlatformAdminPermission(
      "moderation.ban.create",
      "ModerationBan",
      input.scope,
    );

    return {
      session: adminAuthz.session,
      isPlatformAdmin: true,
    };
  }

  try {
    const adminAuthz = await requirePlatformAdminPermission(
      "moderation.ban.create",
      "ModerationBan",
      input.scopeOrganizationId ?? "organization",
    );

    return {
      session: adminAuthz.session,
      isPlatformAdmin: true,
    };
  } catch (error) {
    if (!(error instanceof AuthorizationError) || error.status !== 403) {
      throw error;
    }
  }

  if (!input.scopeOrganizationId) {
    throw new ModerationDomainError(
      422,
      "UNPROCESSABLE_MODERATION",
      "scopeOrganizationId is required for organizer-scoped user bans.",
    );
  }

  const organizationAuthz = await requireOrganizationManagePermission(
    input.scopeOrganizationId,
    "moderation.ban.create",
    "ModerationBan",
    input.scopeOrganizationId,
  );

  return {
    session: organizationAuthz.session,
    isPlatformAdmin: false,
  };
}

async function requireAppealReviewPermission(input: {
  appealId: string;
  banScope: ModerationBanScope;
  scopeOrganizationId?: string | null;
}) {
  try {
    const adminAuthz = await requirePlatformAdminPermission(
      "moderation.appeal.review",
      "ModerationAppeal",
      input.appealId,
    );

    return {
      session: adminAuthz.session,
      isPlatformAdmin: true,
    };
  } catch (error) {
    if (!(error instanceof AuthorizationError) || error.status !== 403) {
      throw error;
    }
  }

  if (
    input.banScope !== ModerationBanScope.ORGANIZATION_USER ||
    !input.scopeOrganizationId
  ) {
    throw new AuthorizationError(403, "You do not have permission to review this appeal.");
  }

  const organizerAuthz = await requireOrganizationManagePermission(
    input.scopeOrganizationId,
    "moderation.appeal.review",
    "ModerationAppeal",
    input.appealId,
  );

  return {
    session: organizerAuthz.session,
    isPlatformAdmin: false,
  };
}

async function assertAppealRequesterPermission(input: {
  banId: string;
  scope: ModerationBanScope;
  subjectUserId?: string | null;
  subjectOrganizationId?: string | null;
  scopeOrganizationId?: string | null;
  requesterId: string;
}) {
  if (input.scope === ModerationBanScope.GLOBAL_USER) {
    if (input.subjectUserId !== input.requesterId) {
      throw new AuthorizationError(403, "Only the banned user can appeal this restriction.");
    }

    return;
  }

  if (input.scope === ModerationBanScope.GLOBAL_ORGANIZATION) {
    if (!input.subjectOrganizationId) {
      throw new ModerationDomainError(404, "BAN_NOT_FOUND", "Moderation ban not found.");
    }

    await requireOrganizationManagePermission(
      input.subjectOrganizationId,
      "moderation.appeal.create",
      "ModerationBan",
      input.banId,
    );

    return;
  }

  if (input.subjectUserId === input.requesterId) {
    return;
  }

  if (!input.scopeOrganizationId) {
    throw new ModerationDomainError(404, "BAN_NOT_FOUND", "Moderation ban not found.");
  }

  await requireOrganizationManagePermission(
    input.scopeOrganizationId,
    "moderation.appeal.create",
    "ModerationBan",
    input.banId,
  );
}

function getBanPriority(scope: ModerationBanScope) {
  if (scope === ModerationBanScope.GLOBAL_USER) {
    return 3;
  }

  if (scope === ModerationBanScope.ORGANIZATION_USER) {
    return 2;
  }

  return 1;
}

export async function findBlockingUserBanForOrganization(
  organizationId: string,
  userId: string,
): Promise<ModerationBanEntry | null> {
  const bans = await prisma.moderationBan.findMany({
    where: {
      status: ModerationBanStatus.ACTIVE,
      OR: [
        {
          scope: ModerationBanScope.GLOBAL_USER,
          subjectUserId: userId,
        },
        {
          scope: ModerationBanScope.GLOBAL_ORGANIZATION,
          subjectOrganizationId: organizationId,
        },
        {
          scope: ModerationBanScope.ORGANIZATION_USER,
          subjectUserId: userId,
          scopeOrganizationId: organizationId,
        },
      ],
    },
    include: {
      subjectOrganization: {
        select: {
          displayName: true,
        },
      },
      scopeOrganization: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  if (!bans.length) {
    return null;
  }

  const prioritized = bans.sort(
    (left, right) =>
      getBanPriority(right.scope) - getBanPriority(left.scope) ||
      right.createdAt.getTime() - left.createdAt.getTime(),
  );

  return toBanEntry(prioritized[0]!);
}

export async function findGlobalOrganizationBan(
  organizationId: string,
): Promise<ModerationBanEntry | null> {
  const ban = await prisma.moderationBan.findFirst({
    where: {
      status: ModerationBanStatus.ACTIVE,
      scope: ModerationBanScope.GLOBAL_ORGANIZATION,
      subjectOrganizationId: organizationId,
    },
    include: {
      subjectOrganization: {
        select: {
          displayName: true,
        },
      },
      scopeOrganization: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return ban ? toBanEntry(ban) : null;
}

export async function listActiveBansForUser(userId: string): Promise<ModerationBanEntry[]> {
  const roleBindings = await prisma.roleBinding.findMany({
    where: {
      userId,
      scopeType: ScopeType.ORGANIZATION,
    },
    select: {
      scopeId: true,
    },
    distinct: ["scopeId"],
    take: 10_000,
  });

  const organizationIds = roleBindings.map((binding) => binding.scopeId);

  const bans = await prisma.moderationBan.findMany({
    where: {
      status: ModerationBanStatus.ACTIVE,
      OR: [
        {
          scope: ModerationBanScope.GLOBAL_USER,
          subjectUserId: userId,
        },
        {
          scope: ModerationBanScope.ORGANIZATION_USER,
          subjectUserId: userId,
        },
        ...(organizationIds.length
          ? [
              {
                scope: ModerationBanScope.GLOBAL_ORGANIZATION,
                subjectOrganizationId: {
                  in: organizationIds,
                },
              },
            ]
          : []),
      ],
    },
    include: {
      subjectOrganization: {
        select: {
          displayName: true,
        },
      },
      scopeOrganization: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  return bans.map((ban) => toBanEntry(ban));
}

export async function listModerationBans(query: ModerationBanListQuery): Promise<PagedModerationBans> {
  await requirePlatformAdminPermission("moderation.ban.list", "ModerationBan", "platform");
  const parsedQuery = parseModerationBanListQuery(query);

  const skip = (parsedQuery.page - 1) * parsedQuery.pageSize;

  const where: Prisma.ModerationBanWhereInput = {
    ...(parsedQuery.scope
      ? {
          scope: parsedQuery.scope,
        }
      : {}),
    ...(parsedQuery.status
      ? {
          status: parsedQuery.status,
        }
      : {}),
  };

  const [total, bans] = await Promise.all([
    prisma.moderationBan.count({ where }),
    prisma.moderationBan.findMany({
      where,
      include: {
        subjectOrganization: {
          select: {
            displayName: true,
          },
        },
        scopeOrganization: {
          select: {
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: parsedQuery.pageSize,
    }),
  ]);

  return {
    items: bans.map((ban) => toBanEntry(ban)),
    total,
    page: parsedQuery.page,
    pageSize: parsedQuery.pageSize,
  };
}

export async function createModerationBan(input: CreateModerationBanInput) {
  const parsedInput = parseCreateModerationBanInput(input);
  const authz = await requireBanCreationPermission({
    scope: parsedInput.scope,
    scopeOrganizationId: parsedInput.scopeOrganizationId,
  });

  if (parsedInput.subjectUserId) {
    const subjectUser = await prisma.user.findUnique({
      where: {
        id: parsedInput.subjectUserId,
      },
      select: {
        id: true,
      },
    });

    if (!subjectUser) {
      throw new ModerationDomainError(422, "UNPROCESSABLE_MODERATION", "Subject user not found.");
    }
  }

  if (parsedInput.subjectOrganizationId) {
    const subjectOrganization = await prisma.organization.findUnique({
      where: {
        id: parsedInput.subjectOrganizationId,
      },
      select: {
        id: true,
      },
    });

    if (!subjectOrganization) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "Subject organization not found.",
      );
    }
  }

  if (parsedInput.scopeOrganizationId) {
    const scopeOrganization = await prisma.organization.findUnique({
      where: {
        id: parsedInput.scopeOrganizationId,
      },
      select: {
        id: true,
      },
    });

    if (!scopeOrganization) {
      throw new ModerationDomainError(
        422,
        "UNPROCESSABLE_MODERATION",
        "Scope organization not found.",
      );
    }
  }

  if (parsedInput.sourceReportId) {
    const report = await prisma.abuseReport.findUnique({
      where: {
        id: parsedInput.sourceReportId,
      },
      select: {
        id: true,
      },
    });

    if (!report) {
      throw new ModerationDomainError(404, "ABUSE_REPORT_NOT_FOUND", "Abuse report not found.");
    }
  }

  if (parsedInput.sourceRiskCaseId) {
    const riskCase = await prisma.riskCase.findUnique({
      where: {
        id: parsedInput.sourceRiskCaseId,
      },
      select: {
        id: true,
      },
    });

    if (!riskCase) {
      throw new ModerationDomainError(404, "RISK_CASE_NOT_FOUND", "Risk case not found.");
    }
  }

  const existing = await prisma.moderationBan.findFirst({
    where: {
      scope: parsedInput.scope,
      status: ModerationBanStatus.ACTIVE,
      subjectUserId: parsedInput.subjectUserId ?? null,
      subjectOrganizationId: parsedInput.subjectOrganizationId ?? null,
      scopeOrganizationId: parsedInput.scopeOrganizationId ?? null,
    },
    include: {
      subjectOrganization: {
        select: {
          displayName: true,
        },
      },
      scopeOrganization: {
        select: {
          displayName: true,
        },
      },
    },
  });

  if (existing) {
    return {
      created: false,
      ban: toBanEntry(existing),
    };
  }

  const createdBan = await prisma.moderationBan.create({
    data: {
      scope: parsedInput.scope,
      status: ModerationBanStatus.ACTIVE,
      reason: parsedInput.reason,
      subjectUserId: parsedInput.subjectUserId,
      subjectOrganizationId: parsedInput.subjectOrganizationId,
      scopeOrganizationId: parsedInput.scopeOrganizationId,
      sourceReportId: parsedInput.sourceReportId,
      sourceRiskCaseId: parsedInput.sourceRiskCaseId,
      metadata: toJsonValue(parsedInput.metadata),
      createdBy: authz.session.user.id,
    },
    include: {
      subjectOrganization: {
        select: {
          displayName: true,
        },
      },
      scopeOrganization: {
        select: {
          displayName: true,
        },
      },
    },
  });

  const banEntry = toBanEntry(createdBan);

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "moderation.ban.created",
    scopeType:
      createdBan.scope === ModerationBanScope.ORGANIZATION_USER
        ? ScopeType.ORGANIZATION
        : ScopeType.PLATFORM,
    scopeId:
      createdBan.scope === ModerationBanScope.ORGANIZATION_USER
        ? createdBan.scopeOrganizationId ?? PLATFORM_SCOPE_ID
        : PLATFORM_SCOPE_ID,
    targetType: "ModerationBan",
    targetId: createdBan.id,
    reason: createdBan.reason,
    newValue: {
      scope: createdBan.scope,
      subjectUserId: createdBan.subjectUserId,
      subjectOrganizationId: createdBan.subjectOrganizationId,
      scopeOrganizationId: createdBan.scopeOrganizationId,
      sourceReportId: createdBan.sourceReportId,
      sourceRiskCaseId: createdBan.sourceRiskCaseId,
    },
  });

  const recipientUserIds = new Set<string>();

  if (createdBan.subjectUserId) {
    recipientUserIds.add(createdBan.subjectUserId);
  }

  if (createdBan.scope === ModerationBanScope.GLOBAL_ORGANIZATION && createdBan.subjectOrganizationId) {
    const managers = await getOrganizationManagerUserIds(createdBan.subjectOrganizationId);
    for (const managerId of managers) {
      recipientUserIds.add(managerId);
    }
  }

  if (recipientUserIds.size > 0) {
    void enqueueSystemNotification({
      orgId: createdBan.scopeOrganizationId ?? createdBan.subjectOrganizationId ?? undefined,
      userIds: Array.from(recipientUserIds),
      type: NotificationType.USER_RESTRICTED,
      subject: "Moderation restriction applied",
      content: buildBanMessageForNotification(banEntry),
      idempotencyKeyBase: `txn:moderation-ban:${createdBan.id}`,
      metadata: {
        banId: createdBan.id,
        scope: createdBan.scope,
        reason: createdBan.reason,
      },
      maxAttempts: 6,
    }).catch((error) => {
      console.warn("Failed to enqueue moderation ban notification", {
        banId: createdBan.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }

  return {
    created: true,
    ban: banEntry,
  };
}

export async function createModerationAppeal(input: CreateModerationAppealInput) {
  const parsedInput = parseCreateModerationAppealInput(input);
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new AuthorizationError(401, "Authentication is required.");
  }

  const ban = await prisma.moderationBan.findUnique({
    where: {
      id: parsedInput.banId,
    },
    include: {
      subjectOrganization: {
        select: {
          displayName: true,
        },
      },
      scopeOrganization: {
        select: {
          displayName: true,
        },
      },
    },
  });

  if (!ban) {
    throw new ModerationDomainError(404, "BAN_NOT_FOUND", "Moderation ban not found.");
  }

  if (ban.status !== ModerationBanStatus.ACTIVE) {
    throw new ModerationDomainError(409, "BAN_ALREADY_LIFTED", "This ban is no longer active.");
  }

  await assertAppealRequesterPermission({
    banId: ban.id,
    scope: ban.scope,
    subjectUserId: ban.subjectUserId,
    subjectOrganizationId: ban.subjectOrganizationId,
    scopeOrganizationId: ban.scopeOrganizationId,
    requesterId: session.user.id,
  });

  const appeal = await prisma.moderationAppeal.create({
    data: {
      banId: ban.id,
      requesterId: session.user.id,
      status: ModerationAppealStatus.OPEN,
      message: parsedInput.message,
      metadata: toJsonValue(parsedInput.metadata),
    },
    include: {
      requester: {
        select: {
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          name: true,
        },
      },
      ban: {
        include: {
          subjectOrganization: {
            select: {
              displayName: true,
            },
          },
          scopeOrganization: {
            select: {
              displayName: true,
            },
          },
        },
      },
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "moderation.appeal.created",
    scopeType:
      ban.scope === ModerationBanScope.ORGANIZATION_USER
        ? ScopeType.ORGANIZATION
        : ScopeType.PLATFORM,
    scopeId:
      ban.scope === ModerationBanScope.ORGANIZATION_USER
        ? ban.scopeOrganizationId ?? PLATFORM_SCOPE_ID
        : PLATFORM_SCOPE_ID,
    targetType: "ModerationAppeal",
    targetId: appeal.id,
    newValue: {
      banId: ban.id,
      scope: ban.scope,
      requesterId: session.user.id,
    },
  });

  const reviewerIds = new Set<string>();

  if (ban.scope === ModerationBanScope.ORGANIZATION_USER && ban.scopeOrganizationId) {
    const managers = await getOrganizationManagerUserIds(ban.scopeOrganizationId);
    for (const managerId of managers) {
      if (managerId !== session.user.id) {
        reviewerIds.add(managerId);
      }
    }
  } else {
    const admins = await getPlatformAdminUserIds();
    for (const adminId of admins) {
      if (adminId !== session.user.id) {
        reviewerIds.add(adminId);
      }
    }
  }

  if (reviewerIds.size > 0) {
    void enqueueSystemNotification({
      orgId: ban.scopeOrganizationId ?? ban.subjectOrganizationId ?? undefined,
      userIds: Array.from(reviewerIds),
      type: NotificationType.USER_RESTRICTED,
      subject: "New moderation appeal submitted",
      content: "A moderation appeal requires review.",
      idempotencyKeyBase: `txn:moderation-appeal:${appeal.id}`,
      metadata: {
        appealId: appeal.id,
        banId: ban.id,
        scope: ban.scope,
      },
      maxAttempts: 6,
    }).catch((error) => {
      console.warn("Failed to enqueue moderation appeal notification", {
        appealId: appeal.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }

  return toAppealEntry(appeal);
}

export async function listModerationAppeals(
  query: ModerationAppealListQuery,
): Promise<PagedModerationAppeals> {
  await requirePlatformAdminPermission("moderation.appeal.list", "ModerationAppeal", "platform");
  const parsedQuery = parseModerationAppealListQuery(query);
  const skip = (parsedQuery.page - 1) * parsedQuery.pageSize;

  const where: Prisma.ModerationAppealWhereInput = {
    ...(parsedQuery.status
      ? {
          status: parsedQuery.status,
        }
      : {}),
  };

  const [total, appeals] = await Promise.all([
    prisma.moderationAppeal.count({ where }),
    prisma.moderationAppeal.findMany({
      where,
      include: {
        requester: {
          select: {
            name: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            name: true,
          },
        },
        ban: {
          include: {
            subjectOrganization: {
              select: {
                displayName: true,
              },
            },
            scopeOrganization: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: parsedQuery.pageSize,
    }),
  ]);

  return {
    items: appeals.map((appeal) => toAppealEntry(appeal)),
    total,
    page: parsedQuery.page,
    pageSize: parsedQuery.pageSize,
  };
}

export async function reviewModerationAppeal(
  appealId: string,
  input: ReviewModerationAppealInput,
) {
  const parsedInput = parseReviewModerationAppealInput(input);

  const existingAppeal = await prisma.moderationAppeal.findUnique({
    where: {
      id: appealId,
    },
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          name: true,
        },
      },
      ban: {
        include: {
          subjectOrganization: {
            select: {
              displayName: true,
            },
          },
          scopeOrganization: {
            select: {
              displayName: true,
            },
          },
        },
      },
    },
  });

  if (!existingAppeal) {
    throw new ModerationDomainError(404, "APPEAL_NOT_FOUND", "Moderation appeal not found.");
  }

  const reviewerAuthz = await requireAppealReviewPermission({
    appealId,
    banScope: existingAppeal.ban.scope,
    scopeOrganizationId: existingAppeal.ban.scopeOrganizationId,
  });

  if (existingAppeal.status !== ModerationAppealStatus.OPEN && !reviewerAuthz.isPlatformAdmin) {
    throw new ModerationDomainError(
      409,
      "APPEAL_ALREADY_REVIEWED",
      "This appeal has already been reviewed.",
    );
  }

  const updatedAppeal = await prisma.$transaction(async (tx) => {
    if (
      parsedInput.decision === ModerationAppealStatus.APPROVED &&
      existingAppeal.ban.status === ModerationBanStatus.ACTIVE
    ) {
      await tx.moderationBan.update({
        where: {
          id: existingAppeal.ban.id,
        },
        data: {
          status: ModerationBanStatus.LIFTED,
          liftedBy: reviewerAuthz.session.user.id,
          liftedAt: now(),
        },
      });
    }

    return tx.moderationAppeal.update({
      where: {
        id: appealId,
      },
      data: {
        status: parsedInput.decision,
        reviewerNote: parsedInput.note,
        reviewedBy: reviewerAuthz.session.user.id,
        reviewedAt: now(),
      },
      include: {
        requester: {
          select: {
            name: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            name: true,
          },
        },
        ban: {
          include: {
            subjectOrganization: {
              select: {
                displayName: true,
              },
            },
            scopeOrganization: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
    });
  });

  await writeAuditEvent({
    actorId: reviewerAuthz.session.user.id,
    action: "moderation.appeal.reviewed",
    scopeType:
      updatedAppeal.ban.scope === ModerationBanScope.ORGANIZATION_USER
        ? ScopeType.ORGANIZATION
        : ScopeType.PLATFORM,
    scopeId:
      updatedAppeal.ban.scope === ModerationBanScope.ORGANIZATION_USER
        ? updatedAppeal.ban.scopeOrganizationId ?? PLATFORM_SCOPE_ID
        : PLATFORM_SCOPE_ID,
    targetType: "ModerationAppeal",
    targetId: updatedAppeal.id,
    reason: parsedInput.note,
    oldValue: {
      status: existingAppeal.status,
    },
    newValue: {
      status: updatedAppeal.status,
      decision: parsedInput.decision,
      banStatus:
        parsedInput.decision === ModerationAppealStatus.APPROVED
          ? ModerationBanStatus.LIFTED
          : existingAppeal.ban.status,
    },
  });

  const recipientUserIds = new Set<string>([existingAppeal.requester.id]);
  if (updatedAppeal.ban.subjectUserId) {
    recipientUserIds.add(updatedAppeal.ban.subjectUserId);
  }

  void enqueueSystemNotification({
    orgId: updatedAppeal.ban.scopeOrganizationId ?? updatedAppeal.ban.subjectOrganizationId ?? undefined,
    userIds: Array.from(recipientUserIds),
    type: NotificationType.USER_RESTRICTED,
    subject: `Moderation appeal ${parsedInput.decision.toLowerCase()}`,
    content:
      parsedInput.decision === ModerationAppealStatus.APPROVED
        ? "Your moderation appeal was approved and the restriction has been lifted."
        : "Your moderation appeal was reviewed and remains restricted.",
    idempotencyKeyBase: `txn:moderation-appeal-review:${updatedAppeal.id}:${parsedInput.decision}`,
    metadata: {
      appealId: updatedAppeal.id,
      banId: updatedAppeal.ban.id,
      decision: parsedInput.decision,
      reviewerNote: parsedInput.note,
    },
    maxAttempts: 6,
  }).catch((error) => {
    console.warn("Failed to enqueue moderation appeal review notification", {
      appealId: updatedAppeal.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  return toAppealEntry(updatedAppeal);
}
