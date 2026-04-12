import {
  AbuseReportStatus,
  AbuseTargetType,
  ModerationAppealStatus,
  ModerationBanScope,
  ModerationBanStatus,
  RiskSeverity,
  RiskStatus,
} from "@prisma/client";

export type SubmitAbuseReportInput = {
  targetType?: unknown;
  targetId?: unknown;
  category?: unknown;
  description?: unknown;
  evidenceUrls?: unknown;
  severityHint?: unknown;
  createRiskCase?: unknown;
};

export type AbuseReportListQuery = {
  status?: unknown;
  targetType?: unknown;
  take?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

export type UpdateAbuseReportStatusInput = {
  status?: unknown;
  reason?: unknown;
  severity?: unknown;
  createRiskCase?: unknown;
};

export type CreateModerationCaseInput = {
  reportId?: unknown;
  source?: unknown;
  scopeType?: unknown;
  scopeId?: unknown;
  severity?: unknown;
  reason?: unknown;
};

export type ModerationCaseListQuery = {
  status?: unknown;
  severity?: unknown;
  take?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

export type CreateModerationBanInput = {
  scope?: unknown;
  reason?: unknown;
  subjectUserId?: unknown;
  subjectOrganizationId?: unknown;
  scopeOrganizationId?: unknown;
  sourceReportId?: unknown;
  sourceRiskCaseId?: unknown;
  metadata?: unknown;
};

export type ModerationBanListQuery = {
  scope?: unknown;
  status?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

export type CreateModerationAppealInput = {
  banId?: unknown;
  message?: unknown;
  metadata?: unknown;
};

export type ReviewModerationAppealInput = {
  decision?: unknown;
  note?: unknown;
};

export type ModerationAppealListQuery = {
  status?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

export type ModerationBanEntry = {
  id: string;
  scope: ModerationBanScope;
  status: ModerationBanStatus;
  reason: string;
  subjectUserId: string | null;
  subjectOrganizationId: string | null;
  subjectOrganizationName: string | null;
  scopeOrganizationId: string | null;
  scopeOrganizationName: string | null;
  sourceReportId: string | null;
  sourceRiskCaseId: string | null;
  createdBy: string;
  liftedBy: string | null;
  liftedAt: string | null;
  createdAt: string;
};

export type ModerationAppealEntry = {
  id: string;
  banId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  status: ModerationAppealStatus;
  message: string;
  reviewerNote: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  createdAt: string;
  reviewedAt: string | null;
  ban: ModerationBanEntry;
};

export type PagedModerationBans = {
  items: ModerationBanEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type PagedModerationAppeals = {
  items: ModerationAppealEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type TransitionModerationCaseInput = {
  nextStatus?: unknown;
  severity?: unknown;
  reason?: unknown;
};

export type ModerationEnforcementAction =
  | "WARN_ORGANIZER"
  | "UNLIST_EVENT"
  | "PAUSE_TICKET_SALES"
  | "RESOLVE_REPORT"
  | "ESCALATE_CASE";

export type ApplyModerationEnforcementInput = {
  action?: unknown;
  reason?: unknown;
  reportId?: unknown;
  riskCaseId?: unknown;
  metadata?: unknown;
};

export type ModerationQueueItem = {
  kind: "ABUSE_REPORT" | "RISK_CASE";
  id: string;
  targetType?: AbuseTargetType;
  targetId?: string;
  status: AbuseReportStatus | RiskStatus;
  severity: RiskSeverity;
  source: string;
  category?: string;
  createdAt: string;
  ageHours: number;
  priorityScore: number;
};

export type ModerationQueueSnapshot = {
  generatedAt: string;
  summary: {
    openReports: number;
    underReviewReports: number;
    openRiskCases: number;
    investigatingRiskCases: number;
    criticalItems: number;
  };
  items: ModerationQueueItem[];
};

export type EventTrustSignals = {
  eventId: string;
  organizerId: string;
  generatedAt: string;
  organizerTrustScore: number;
  eventReliabilityScore: number;
  metrics: {
    ratingAverage: number;
    ratingCount: number;
    attendanceRate: number;
    organizerCancellationRate: number;
    eventOpenReports: number;
    organizerOpenReports: number;
    openRiskCases: number;
    criticalRiskCases: number;
    reportVelocity7d: number;
  };
  riskIndicators: string[];
};
