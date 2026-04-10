export const checkinDomain = {
  name: "checkin",
  description:
    "Owns gate validation, duplicate prevention, and offline sync reconciliation flows.",
};

export {
  getCheckInMetrics,
  issueCheckInWsAuthToken,
  logCheckInIncident,
  manualCheckInTicket,
  parseCheckInIncidentInput,
  parseCheckInScanInput,
  parseOfflineCheckInSyncInput,
  parseManualCheckInInput,
  scanTicketAtGate,
  syncOfflineCheckIns,
} from "@/domains/checkin/service";
export { sortOfflineCheckInScansForSync } from "@/domains/checkin/sync";
export {
  CheckInDomainError,
  toCheckInErrorResponse,
  type CheckInDomainErrorCode,
} from "@/domains/checkin/errors";
export type {
  CheckInIncident,
  CheckInIncidentInput,
  CheckInMetrics,
  CheckInResult,
  CheckInScanInput,
  ManualCheckInInput,
  OfflineCheckInSyncInput,
  OfflineCheckInSyncResult,
} from "@/domains/checkin/types";
