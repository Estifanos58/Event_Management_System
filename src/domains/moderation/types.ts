import { AbuseReportStatus, AbuseTargetType, RiskSeverity, RiskStatus } from "@prisma/client";

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
