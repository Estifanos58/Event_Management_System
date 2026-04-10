import {
  CheckInMode,
  CheckInStatus,
  EventStatus,
  Prisma,
  RiskSeverity,
  ScopeType,
  TicketStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { prisma } from "@/core/db/prisma";
import { env } from "@/core/env";
import { createWsAuthToken } from "@/core/ws/auth";
import { WS_CHANNELS, WS_EVENTS } from "@/core/ws/events";
import { publishWsChannelEvent } from "@/core/ws/publisher";
import { CheckInDomainError } from "@/domains/checkin/errors";
import { sortOfflineCheckInScansForSync } from "@/domains/checkin/sync";
import type {
  CheckInIncident,
  CheckInIncidentInput,
  CheckInMetrics,
  CheckInResult,
  CheckInScanInput,
  ManualCheckInInput,
  OfflineCheckInSyncInput,
  OfflineCheckInSyncResult,
} from "@/domains/checkin/types";
import {
  AuthorizationError,
  createAccessContext,
  requirePermission,
} from "@/domains/identity/guards";
import { canAccess } from "@/domains/identity/permissions";
import type { PermissionResolution } from "@/domains/identity/types";

const scanPayloadSchema = z.object({
  qrToken: z
    .string()
    .trim()
    .min(12, "QR token must contain at least 12 characters."),
  gateId: z.string().trim().min(1, "Gate id is required."),
  scannedAt: z.coerce.date().optional(),
  mode: z.enum(CheckInMode).optional(),
  deviceId: z
    .string()
    .trim()
    .max(120, "Device id cannot exceed 120 characters.")
    .optional(),
  clientScanId: z
    .string()
    .trim()
    .max(120, "Client scan id cannot exceed 120 characters.")
    .optional(),
});

const manualPayloadSchema = z
  .object({
    ticketId: z.string().trim().min(1, "Ticket id is required.").optional(),
    qrToken: z
      .string()
      .trim()
      .min(12, "QR token must contain at least 12 characters.")
      .optional(),
    gateId: z.string().trim().min(1, "Gate id is required."),
    reason: z
      .string()
      .trim()
      .min(4, "Manual override reason must contain at least 4 characters.")
      .max(240, "Manual override reason cannot exceed 240 characters."),
    scannedAt: z.coerce.date().optional(),
    mode: z.enum(CheckInMode).optional(),
    deviceId: z
      .string()
      .trim()
      .max(120, "Device id cannot exceed 120 characters.")
      .optional(),
    clientScanId: z
      .string()
      .trim()
      .max(120, "Client scan id cannot exceed 120 characters.")
      .optional(),
  })
  .refine((payload) => Boolean(payload.ticketId || payload.qrToken), {
    message: "Either ticket id or QR token is required.",
    path: ["ticketId"],
  });

const offlineSyncPayloadSchema = z.object({
  scans: z
    .array(
      z
        .object({
          gateId: z.string().trim().min(1, "Gate id is required."),
          scannedAt: z.coerce.date({
            error: "Offline sync scan timestamp is required.",
          }),
          clientScanId: z
            .string()
            .trim()
            .min(1, "Client scan id is required.")
            .max(120, "Client scan id cannot exceed 120 characters."),
          deviceId: z
            .string()
            .trim()
            .max(120, "Device id cannot exceed 120 characters.")
            .optional(),
          mode: z.enum(CheckInMode).optional(),
          ticketId: z.string().trim().min(1, "Ticket id is required.").optional(),
          qrToken: z
            .string()
            .trim()
            .min(12, "QR token must contain at least 12 characters.")
            .optional(),
          manualOverride: z.boolean().optional(),
          reason: z
            .string()
            .trim()
            .max(240, "Manual override reason cannot exceed 240 characters.")
            .optional(),
        })
        .refine((payload) => Boolean(payload.ticketId || payload.qrToken), {
          message: "Either ticket id or QR token is required.",
          path: ["ticketId"],
        })
        .refine(
          (payload) => !payload.manualOverride || Boolean(payload.reason?.trim()),
          {
            message: "Manual override entries must include a reason.",
            path: ["reason"],
          },
        ),
    )
    .min(1, "At least one offline scan is required for sync.")
    .max(500, "Offline sync payload cannot exceed 500 scans."),
});

const incidentPayloadSchema = z.object({
  gateId: z.string().trim().min(1, "Gate id is required."),
  severity: z.enum(RiskSeverity),
  message: z
    .string()
    .trim()
    .min(4, "Incident message must contain at least 4 characters.")
    .max(500, "Incident message cannot exceed 500 characters."),
  occurredAt: z.coerce.date().optional(),
});

const checkInEventSelect = {
  id: true,
  gateId: true,
  status: true,
  reason: true,
  scannedAt: true,
  mode: true,
  ticket: {
    select: {
      id: true,
      ticketClassId: true,
      status: true,
      attendee: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.CheckInEventSelect;

type CheckInPermission = "checkin.scan" | "checkin.manual";

type CheckInRecord = Prisma.CheckInEventGetPayload<{
  select: typeof checkInEventSelect;
}>;

type TicketLookup = {
  ticketId?: string;
  qrToken?: string;
};

type ProcessCheckInInput = {
  eventId: string;
  gateId: string;
  scannedBy: string;
  scannedAt: Date;
  mode: CheckInMode;
  deviceId?: string;
  clientScanId?: string;
  lookup: TicketLookup;
  allowGatePolicyBypass: boolean;
  manualReason?: string;
  manualOverride: boolean;
};

type CheckInStatusCounts = {
  accepted: number;
  rejected: number;
  duplicate: number;
};

function createEmptyStatusCounts(): CheckInStatusCounts {
  return {
    accepted: 0,
    rejected: 0,
    duplicate: 0,
  };
}

function toSyncErrorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof CheckInDomainError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof AuthorizationError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    };
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected check-in sync failure.",
  };
}

async function loadCheckInMetricsSnapshot(eventId: string): Promise<CheckInMetrics> {
  const [totalsGrouped, gateGrouped] = await Promise.all([
    prisma.checkInEvent.groupBy({
      by: ["status"],
      where: {
        eventId,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.checkInEvent.groupBy({
      by: ["gateId", "status"],
      where: {
        eventId,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const totals = createEmptyStatusCounts();

  for (const item of totalsGrouped) {
    if (item.status === CheckInStatus.ACCEPTED) {
      totals.accepted = item._count._all;
    } else if (item.status === CheckInStatus.REJECTED) {
      totals.rejected = item._count._all;
    } else if (item.status === CheckInStatus.DUPLICATE) {
      totals.duplicate = item._count._all;
    }
  }

  const gateMetricsMap = new Map<string, CheckInStatusCounts>();

  for (const item of gateGrouped) {
    const current = gateMetricsMap.get(item.gateId) ?? createEmptyStatusCounts();

    if (item.status === CheckInStatus.ACCEPTED) {
      current.accepted = item._count._all;
    } else if (item.status === CheckInStatus.REJECTED) {
      current.rejected = item._count._all;
    } else if (item.status === CheckInStatus.DUPLICATE) {
      current.duplicate = item._count._all;
    }

    gateMetricsMap.set(item.gateId, current);
  }

  return {
    eventId,
    generatedAt: now().toISOString(),
    totals,
    gates: Array.from(gateMetricsMap.entries())
      .map(([gateId, values]) => ({
        gateId,
        accepted: values.accepted,
        rejected: values.rejected,
        duplicate: values.duplicate,
      }))
      .sort((left, right) => left.gateId.localeCompare(right.gateId)),
  };
}

async function publishCheckInRealtimeUpdates(
  eventId: string,
  gateId: string,
  result: CheckInResult,
) {
  try {
    const metrics = await loadCheckInMetricsSnapshot(eventId);
    const gateMetrics =
      metrics.gates.find((entry) => entry.gateId === gateId) ?? {
        gateId,
        accepted: 0,
        rejected: 0,
        duplicate: 0,
      };

    await Promise.allSettled([
      publishWsChannelEvent(WS_CHANNELS.eventCheckIn(eventId), {
        type: WS_EVENTS.CHECKIN_UPDATED,
        payload: {
          eventId,
          metrics,
          lastResult: {
            checkInEventId: result.checkInEventId,
            gateId: result.gateId,
            status: result.status,
            scannedAt: result.scannedAt.toISOString(),
          },
        },
      }),
      publishWsChannelEvent(WS_CHANNELS.eventGateLoad(eventId, gateId), {
        type: WS_EVENTS.GATE_LOAD_UPDATED,
        payload: {
          eventId,
          gateId,
          metrics: gateMetrics,
          lastResult: {
            checkInEventId: result.checkInEventId,
            status: result.status,
            scannedAt: result.scannedAt.toISOString(),
          },
        },
      }),
    ]);
  } catch (error) {
    console.warn("Failed to publish check-in realtime metrics.", {
      eventId,
      gateId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

function buildWsServerUrl() {
  const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);
  appUrl.protocol = appUrl.protocol === "https:" ? "wss:" : "ws:";
  appUrl.port = String(env.WS_PORT);
  appUrl.pathname = "/ws";
  appUrl.search = "";

  return appUrl.toString();
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function now() {
  return new Date();
}

function toCheckInResult(
  record: CheckInRecord,
  manualOverride: boolean,
): CheckInResult {
  return {
    checkInEventId: record.id,
    ticketId: record.ticket.id,
    gateId: record.gateId,
    status: record.status,
    reason: record.reason,
    scannedAt: record.scannedAt,
    mode: record.mode,
    ticketStatus: record.ticket.status,
    ticketClassId: record.ticket.ticketClassId,
    manualOverride,
    attendee: record.ticket.attendee,
  };
}

function isClientScanUniqueViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("eventId") && target.includes("clientScanId");
  }

  const renderedTarget = String(target ?? "");

  return (
    renderedTarget.includes("CheckInEvent_eventId_clientScanId_key") ||
    (renderedTarget.includes("eventId") && renderedTarget.includes("clientScanId"))
  );
}

async function requireCheckInPermission(
  eventId: string,
  permission: CheckInPermission,
  action: string,
) {
  const context = createAccessContext(ScopeType.EVENT, eventId);
  return requirePermission({
    context,
    permission,
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function loadGateOrThrow(eventId: string, gateId: string) {
  const gate = await prisma.gate.findFirst({
    where: {
      id: gateId,
      eventId,
    },
    select: {
      id: true,
      event: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!gate) {
    throw new CheckInDomainError(404, "GATE_NOT_FOUND", "Gate not found.");
  }

  return gate;
}

async function assertEventExists(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
    },
  });

  if (!event) {
    throw new CheckInDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }
}

function assertEventReadyForCheckIn(status: EventStatus) {
  if (status !== EventStatus.PUBLISHED && status !== EventStatus.LIVE) {
    throw new CheckInDomainError(
      409,
      "INVALID_STATE",
      "Check-in is available only while event status is PUBLISHED or LIVE.",
    );
  }
}

async function assertGateScannerAccess(
  eventId: string,
  gateId: string,
  userId: string,
  resolution: PermissionResolution,
) {
  if (canAccess(resolution, "event.manage")) {
    return;
  }

  const assignment = await prisma.gateStaffAssignment.findFirst({
    where: {
      eventId,
      gateId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!assignment) {
    throw new AuthorizationError(403, "You are not assigned to this gate.");
  }
}

async function findByClientScanId(
  eventId: string,
  clientScanId?: string,
): Promise<CheckInRecord | null> {
  if (!clientScanId) {
    return null;
  }

  return prisma.checkInEvent.findUnique({
    where: {
      eventId_clientScanId: {
        eventId,
        clientScanId,
      },
    },
    select: checkInEventSelect,
  });
}

async function processCheckIn(input: ProcessCheckInInput): Promise<CheckInResult> {
  const existingRecord = await findByClientScanId(input.eventId, input.clientScanId);

  if (existingRecord) {
    return toCheckInResult(existingRecord, input.manualOverride);
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      const ticketLocator = await tx.ticket.findFirst({
        where: {
          eventId: input.eventId,
          ...(input.lookup.ticketId
            ? { id: input.lookup.ticketId }
            : { qrToken: input.lookup.qrToken }),
        },
        select: {
          id: true,
        },
      });

      if (!ticketLocator) {
        throw new CheckInDomainError(
          404,
          "TICKET_NOT_FOUND",
          "Ticket not found for this event.",
        );
      }

      await tx.$executeRaw`
        SELECT 1 FROM "Ticket"
        WHERE "id" = ${ticketLocator.id}
        FOR UPDATE
      `;

      const ticket = await tx.ticket.findUnique({
        where: {
          id: ticketLocator.id,
        },
        select: {
          id: true,
          ticketClassId: true,
          status: true,
          attendee: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!ticket) {
        throw new CheckInDomainError(
          404,
          "TICKET_NOT_FOUND",
          "Ticket not found for this event.",
        );
      }

      const createCheckInRecord = (
        status: CheckInStatus,
        reason: string | null,
      ) => {
        return tx.checkInEvent.create({
          data: {
            ticketId: ticket.id,
            eventId: input.eventId,
            gateId: input.gateId,
            scannedBy: input.scannedBy,
            mode: input.mode,
            status,
            reason,
            deviceId: input.deviceId,
            clientScanId: input.clientScanId,
            scannedAt: input.scannedAt,
            syncedAt: input.mode === CheckInMode.OFFLINE ? now() : undefined,
          },
          select: checkInEventSelect,
        });
      };

      if (ticket.status === TicketStatus.USED) {
        return createCheckInRecord(
          CheckInStatus.DUPLICATE,
          "ticket_already_redeemed",
        );
      }

      if (ticket.status !== TicketStatus.VALID) {
        return createCheckInRecord(
          CheckInStatus.REJECTED,
          `ticket_status_${ticket.status.toLowerCase()}`,
        );
      }

      if (!input.allowGatePolicyBypass) {
        const gateAccess = await tx.gateTicketClassAccess.findFirst({
          where: {
            eventId: input.eventId,
            gateId: input.gateId,
            ticketClassId: ticket.ticketClassId,
          },
          select: {
            id: true,
          },
        });

        if (!gateAccess) {
          return createCheckInRecord(CheckInStatus.REJECTED, "gate_policy_mismatch");
        }
      }

      await tx.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          status: TicketStatus.USED,
        },
      });

      return createCheckInRecord(CheckInStatus.ACCEPTED, input.manualReason ?? null);
    });

    const actionPrefix = input.manualOverride ? "checkin.manual" : "checkin.scan";

    await writeAuditEvent({
      actorId: input.scannedBy,
      action: `${actionPrefix}.${record.status.toLowerCase()}`,
      scopeType: ScopeType.EVENT,
      scopeId: input.eventId,
      targetType: "Ticket",
      targetId: record.ticket.id,
      reason: input.manualReason,
      newValue: {
        checkInEventId: record.id,
        gateId: input.gateId,
        status: record.status,
        reason: record.reason,
        mode: record.mode,
        scannedAt: record.scannedAt.toISOString(),
        ticketStatus: record.ticket.status,
        ticketClassId: record.ticket.ticketClassId,
        deviceId: input.deviceId,
        clientScanId: input.clientScanId,
        manualOverride: input.manualOverride,
      },
    });

    const result = toCheckInResult(record, input.manualOverride);
    void publishCheckInRealtimeUpdates(input.eventId, input.gateId, result);

    return result;
  } catch (error) {
    if (input.clientScanId && isClientScanUniqueViolation(error)) {
      const dedupedRecord = await findByClientScanId(
        input.eventId,
        input.clientScanId,
      );

      if (dedupedRecord) {
        return toCheckInResult(dedupedRecord, input.manualOverride);
      }
    }

    throw error;
  }
}

export function parseCheckInScanInput(payload: unknown): CheckInScanInput {
  const parsed = scanPayloadSchema.parse(payload);

  return {
    qrToken: parsed.qrToken,
    gateId: parsed.gateId,
    scannedAt: parsed.scannedAt,
    mode: parsed.mode ?? CheckInMode.ONLINE,
    deviceId: normalizeOptionalText(parsed.deviceId),
    clientScanId: normalizeOptionalText(parsed.clientScanId),
  };
}

export function parseManualCheckInInput(payload: unknown): ManualCheckInInput {
  const parsed = manualPayloadSchema.parse(payload);

  return {
    ticketId: normalizeOptionalText(parsed.ticketId),
    qrToken: normalizeOptionalText(parsed.qrToken),
    gateId: parsed.gateId,
    reason: parsed.reason,
    scannedAt: parsed.scannedAt,
    mode: parsed.mode ?? CheckInMode.ONLINE,
    deviceId: normalizeOptionalText(parsed.deviceId),
    clientScanId: normalizeOptionalText(parsed.clientScanId),
  };
}

export function parseOfflineCheckInSyncInput(
  payload: unknown,
): OfflineCheckInSyncInput {
  const parsed = offlineSyncPayloadSchema.parse(payload);

  return {
    scans: parsed.scans.map((scan) => ({
      gateId: scan.gateId,
      scannedAt: scan.scannedAt,
      clientScanId: scan.clientScanId,
      deviceId: normalizeOptionalText(scan.deviceId),
      mode: scan.mode ?? CheckInMode.OFFLINE,
      ticketId: normalizeOptionalText(scan.ticketId),
      qrToken: normalizeOptionalText(scan.qrToken),
      manualOverride: scan.manualOverride ?? false,
      reason: normalizeOptionalText(scan.reason),
    })),
  };
}

export function parseCheckInIncidentInput(payload: unknown): CheckInIncidentInput {
  const parsed = incidentPayloadSchema.parse(payload);

  return {
    gateId: parsed.gateId,
    severity: parsed.severity,
    message: parsed.message,
    occurredAt: parsed.occurredAt,
  };
}

export async function scanTicketAtGate(
  eventId: string,
  input: CheckInScanInput,
): Promise<CheckInResult> {
  const parsedInput = parseCheckInScanInput(input);
  const { session, resolution } = await requireCheckInPermission(
    eventId,
    "checkin.scan",
    "checkin.ticket.scan",
  );

  const gate = await loadGateOrThrow(eventId, parsedInput.gateId);
  assertEventReadyForCheckIn(gate.event.status);

  await assertGateScannerAccess(
    eventId,
    parsedInput.gateId,
    session.user.id,
    resolution,
  );

  return processCheckIn({
    eventId,
    gateId: parsedInput.gateId,
    scannedBy: session.user.id,
    scannedAt: parsedInput.scannedAt ?? now(),
    mode: parsedInput.mode ?? CheckInMode.ONLINE,
    deviceId: parsedInput.deviceId,
    clientScanId: parsedInput.clientScanId,
    lookup: {
      qrToken: parsedInput.qrToken,
    },
    allowGatePolicyBypass: false,
    manualOverride: false,
  });
}

export async function manualCheckInTicket(
  eventId: string,
  input: ManualCheckInInput,
): Promise<CheckInResult> {
  const parsedInput = parseManualCheckInInput(input);
  const { session, resolution } = await requireCheckInPermission(
    eventId,
    "checkin.manual",
    "checkin.ticket.manual_override",
  );

  const gate = await loadGateOrThrow(eventId, parsedInput.gateId);
  assertEventReadyForCheckIn(gate.event.status);

  await assertGateScannerAccess(
    eventId,
    parsedInput.gateId,
    session.user.id,
    resolution,
  );

  return processCheckIn({
    eventId,
    gateId: parsedInput.gateId,
    scannedBy: session.user.id,
    scannedAt: parsedInput.scannedAt ?? now(),
    mode: parsedInput.mode ?? CheckInMode.ONLINE,
    deviceId: parsedInput.deviceId,
    clientScanId: parsedInput.clientScanId,
    lookup: {
      ticketId: parsedInput.ticketId,
      qrToken: parsedInput.qrToken,
    },
    allowGatePolicyBypass: true,
    manualReason: parsedInput.reason,
    manualOverride: true,
  });
}

export async function getCheckInMetrics(eventId: string): Promise<CheckInMetrics> {
  await assertEventExists(eventId);

  await requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "checkin.metrics",
    action: "checkin.metrics.read",
    targetType: "Event",
    targetId: eventId,
  });

  return loadCheckInMetricsSnapshot(eventId);
}

export async function syncOfflineCheckIns(
  eventId: string,
  input: OfflineCheckInSyncInput,
): Promise<OfflineCheckInSyncResult> {
  const parsedInput = parseOfflineCheckInSyncInput(input);
  const { session, resolution } = await requireCheckInPermission(
    eventId,
    "checkin.scan",
    "checkin.offline.sync",
  );

  const canManualOverride =
    canAccess(resolution, "event.manage") || canAccess(resolution, "checkin.manual");
  const sortedScans = sortOfflineCheckInScansForSync(parsedInput.scans);
  const validatedGates = new Set<string>();

  const results: OfflineCheckInSyncResult["results"] = [];
  let accepted = 0;
  let rejected = 0;
  let duplicate = 0;
  let failed = 0;

  for (const scan of sortedScans) {
    try {
      if (!validatedGates.has(scan.gateId)) {
        const gate = await loadGateOrThrow(eventId, scan.gateId);
        assertEventReadyForCheckIn(gate.event.status);

        await assertGateScannerAccess(
          eventId,
          scan.gateId,
          session.user.id,
          resolution,
        );

        validatedGates.add(scan.gateId);
      }

      if (scan.manualOverride && !canManualOverride) {
        throw new AuthorizationError(
          403,
          "Manual override scans require checkin.manual permission.",
        );
      }

      const result = await processCheckIn({
        eventId,
        gateId: scan.gateId,
        scannedBy: session.user.id,
        scannedAt: scan.scannedAt,
        mode: CheckInMode.OFFLINE,
        deviceId: scan.deviceId,
        clientScanId: scan.clientScanId,
        lookup: {
          ticketId: scan.ticketId,
          qrToken: scan.qrToken,
        },
        allowGatePolicyBypass: Boolean(scan.manualOverride),
        manualReason: scan.manualOverride ? scan.reason : undefined,
        manualOverride: Boolean(scan.manualOverride),
      });

      if (result.status === CheckInStatus.ACCEPTED) {
        accepted += 1;
      } else if (result.status === CheckInStatus.REJECTED) {
        rejected += 1;
      } else {
        duplicate += 1;
      }

      results.push({
        clientScanId: scan.clientScanId,
        status: result.status,
        result,
      });
    } catch (error) {
      failed += 1;

      results.push({
        clientScanId: scan.clientScanId,
        status: "ERROR",
        error: toSyncErrorPayload(error),
      });
    }
  }

  await writeAuditEvent({
    actorId: session.user.id,
    action: "checkin.offline.sync",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "CheckInEvent",
    targetId: eventId,
    newValue: {
      processed: sortedScans.length,
      accepted,
      rejected,
      duplicate,
      failed,
    },
  });

  return {
    processed: sortedScans.length,
    accepted,
    rejected,
    duplicate,
    failed,
    results,
  };
}

export async function logCheckInIncident(
  eventId: string,
  input: CheckInIncidentInput,
): Promise<CheckInIncident> {
  const parsedInput = parseCheckInIncidentInput(input);
  const { session, resolution } = await requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "checkin.incident",
    action: "checkin.incident.log",
    targetType: "Event",
    targetId: eventId,
  });

  const gate = await loadGateOrThrow(eventId, parsedInput.gateId);
  assertEventReadyForCheckIn(gate.event.status);

  await assertGateScannerAccess(eventId, parsedInput.gateId, session.user.id, resolution);

  const incident: CheckInIncident = {
    id: randomUUID(),
    eventId,
    gateId: parsedInput.gateId,
    reportedBy: session.user.id,
    severity: parsedInput.severity,
    message: parsedInput.message,
    occurredAt: parsedInput.occurredAt ?? now(),
    reportedAt: now(),
  };

  await writeAuditEvent({
    actorId: session.user.id,
    action: "checkin.incident.logged",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "CheckInIncident",
    targetId: incident.id,
    reason: incident.message,
    newValue: {
      gateId: incident.gateId,
      severity: incident.severity,
      message: incident.message,
      occurredAt: incident.occurredAt.toISOString(),
      reportedAt: incident.reportedAt.toISOString(),
    },
  });

  await publishWsChannelEvent(WS_CHANNELS.eventIncidents(eventId), {
    type: WS_EVENTS.INCIDENT_LOGGED,
    payload: {
      incident: {
        id: incident.id,
        eventId: incident.eventId,
        gateId: incident.gateId,
        reportedBy: incident.reportedBy,
        severity: incident.severity,
        message: incident.message,
        occurredAt: incident.occurredAt.toISOString(),
        reportedAt: incident.reportedAt.toISOString(),
      },
    },
  });

  return incident;
}

export async function issueCheckInWsAuthToken(eventId: string) {
  await assertEventExists(eventId);

  const { session, resolution } = await requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "event.read",
    action: "checkin.ws.token.issue",
    targetType: "Event",
    targetId: eventId,
  });

  const metrics =
    canAccess(resolution, "event.manage") || canAccess(resolution, "checkin.metrics");
  const incident =
    canAccess(resolution, "event.manage") || canAccess(resolution, "checkin.incident");

  if (!metrics && !incident) {
    throw new AuthorizationError(
      403,
      "You are not authorized to subscribe to check-in realtime channels.",
    );
  }

  const wsToken = createWsAuthToken({
    userId: session.user.id,
    eventId,
    permissions: {
      metrics,
      incident,
    },
  });

  return {
    token: wsToken.token,
    expiresAt: wsToken.expiresAt.toISOString(),
    wsUrl: buildWsServerUrl(),
    permissions: {
      metrics,
      incident,
    },
    channels: {
      checkIn: WS_CHANNELS.eventCheckIn(eventId),
      gatePrefix: `event:${eventId}:gate:`,
      incidents: WS_CHANNELS.eventIncidents(eventId),
    },
  };
}
