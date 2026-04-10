export const moderationDomain = {
  name: "moderation",
  description:
    "Owns abuse report intake, moderation queue, enforcement actions, trust signals, and case lifecycle.",
};

export {
  submitAbuseReport,
  listAbuseReports,
  updateAbuseReportStatus,
  createModerationCase,
  listModerationCases,
  transitionModerationCase,
  getModerationQueue,
  applyModerationEnforcement,
  getEventTrustSignals,
} from "@/domains/moderation/service";

export {
  ModerationDomainError,
  toModerationErrorResponse,
  type ModerationDomainErrorCode,
} from "@/domains/moderation/errors";

export type {
  SubmitAbuseReportInput,
  AbuseReportListQuery,
  UpdateAbuseReportStatusInput,
  CreateModerationCaseInput,
  ModerationCaseListQuery,
  TransitionModerationCaseInput,
  ModerationEnforcementAction,
  ApplyModerationEnforcementInput,
  ModerationQueueItem,
  ModerationQueueSnapshot,
  EventTrustSignals,
} from "@/domains/moderation/types";
