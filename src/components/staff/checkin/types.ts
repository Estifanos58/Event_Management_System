export type StaffGateOption = {
  id: string;
  name: string;
  code?: string | null;
};

export type CheckInResultRecord = {
  checkInEventId: string;
  ticketId: string;
  gateId: string;
  status: "ACCEPTED" | "REJECTED" | "DUPLICATE";
  reason: string | null;
  scannedAt: string;
  mode: "ONLINE" | "OFFLINE";
  ticketStatus: string;
  ticketClassId: string;
  manualOverride: boolean;
  attendee: {
    id: string;
    name: string;
  } | null;
};

export type CheckInMetricsSnapshot = {
  eventId: string;
  generatedAt: string;
  totals: {
    accepted: number;
    rejected: number;
    duplicate: number;
  };
  gates: Array<{
    gateId: string;
    accepted: number;
    rejected: number;
    duplicate: number;
  }>;
};

export type OfflineQueuedScan = {
  clientScanId: string;
  gateId: string;
  scannedAt: string;
  deviceId: string;
  manualOverride: boolean;
  reason?: string;
  ticketId?: string;
  qrToken?: string;
  buyerId?: string;
  eventId?: string;
  boughtAt?: string;
};

export type SyncResultItem = {
  clientScanId: string;
  status: "ACCEPTED" | "REJECTED" | "DUPLICATE" | "ERROR";
  result?: CheckInResultRecord;
  error?: {
    code: string;
    message: string;
  };
};

export type SyncOfflineCheckInResult = {
  processed: number;
  accepted: number;
  rejected: number;
  duplicate: number;
  failed: number;
  results: SyncResultItem[];
};
