import {
  CheckInMode,
  CheckInStatus,
  RiskSeverity,
  TicketStatus,
} from "@prisma/client";

export type CheckInScanInput = {
  qrToken: string;
  gateId: string;
  ticketId?: string;
  buyerId?: string;
  eventId?: string;
  boughtAt?: string;
  scannedAt?: Date;
  mode?: CheckInMode;
  deviceId?: string;
  clientScanId?: string;
};

export type ManualCheckInInput = {
  ticketId?: string;
  qrToken?: string;
  gateId: string;
  reason: string;
  scannedAt?: Date;
  mode?: CheckInMode;
  deviceId?: string;
  clientScanId?: string;
};

export type CheckInResult = {
  checkInEventId: string;
  ticketId: string;
  gateId: string;
  status: CheckInStatus;
  reason: string | null;
  scannedAt: Date;
  mode: CheckInMode;
  ticketStatus: TicketStatus;
  ticketClassId: string;
  manualOverride: boolean;
  attendee: {
    id: string;
    name: string;
  } | null;
};

export type CheckInGateMetrics = {
  gateId: string;
  accepted: number;
  rejected: number;
  duplicate: number;
};

export type CheckInMetrics = {
  eventId: string;
  generatedAt: string;
  totals: {
    accepted: number;
    rejected: number;
    duplicate: number;
  };
  gates: CheckInGateMetrics[];
};

export type OfflineCheckInSyncScan = {
  gateId: string;
  scannedAt: Date;
  clientScanId: string;
  deviceId?: string;
  mode?: CheckInMode;
  ticketId?: string;
  qrToken?: string;
  buyerId?: string;
  eventId?: string;
  boughtAt?: string;
  manualOverride?: boolean;
  reason?: string;
};

export type OfflineCheckInSyncInput = {
  scans: OfflineCheckInSyncScan[];
};

export type OfflineCheckInSyncResultItem = {
  clientScanId: string;
  status: CheckInStatus | "ERROR";
  result?: CheckInResult;
  error?: {
    code: string;
    message: string;
  };
};

export type OfflineCheckInSyncResult = {
  processed: number;
  accepted: number;
  rejected: number;
  duplicate: number;
  failed: number;
  results: OfflineCheckInSyncResultItem[];
};

export type CheckInIncidentInput = {
  gateId: string;
  severity: RiskSeverity;
  message: string;
  occurredAt?: Date;
};

export type CheckInIncident = {
  id: string;
  eventId: string;
  gateId: string;
  reportedBy: string;
  severity: RiskSeverity;
  message: string;
  occurredAt: Date;
  reportedAt: Date;
};
