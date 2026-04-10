import type {
  DataDeletionRequestStatus,
  DataExportStatus,
  PolicyDocumentType,
  ScopeType,
} from "@prisma/client";

export type AcceptPolicyInput = {
  documentType: unknown;
  documentVersion: unknown;
  scopeType?: unknown;
  scopeId?: unknown;
  ipAddress?: string;
  userAgent?: string;
};

export type RequestDataDeletionInput = {
  reason?: unknown;
};

export type CreateAttendeeExportJobInput = {
  reasonCode?: unknown;
  ttlHours?: unknown;
};

export type ListAttendeeExportJobsQuery = {
  take?: unknown;
};

export type PolicyAcceptanceRecord = {
  id: string;
  documentType: PolicyDocumentType;
  documentVersion: string;
  scopeType: ScopeType;
  scopeId: string;
  acceptedAt: string;
};

export type DataDeletionRequestRecord = {
  id: string;
  status: DataDeletionRequestStatus;
  reason?: string;
  requestedAt: string;
  processedAt?: string;
  processorNote?: string;
};

export type DataExportJobRecord = {
  id: string;
  eventId?: string;
  status: DataExportStatus;
  type: string;
  requestedReason?: string;
  completedAt?: string;
  expiresAt: string;
  createdAt: string;
};

export type EventAttendeeExportDownload = {
  jobId: string;
  fileName: string;
  content: string;
  rowCount: number;
};

export type ComplianceMaintenanceResult = {
  expiredExports: number;
  purgedExports: number;
  redactedInboundPayloads: number;
  prunedNotificationDeliveries: number;
  completedDeletionRequests: number;
  rejectedDeletionRequests: number;
};
