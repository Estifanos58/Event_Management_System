import {
  DataDeletionRequestStatus,
  DataExportStatus,
  InboundProviderEventStatus,
  NotificationDeliveryStatus,
  Prisma,
  ScopeType,
} from "@prisma/client";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { getServerSessionOrNull, resolveActiveContext } from "@/core/auth/session";
import { prisma } from "@/core/db/prisma";
import { env } from "@/core/env";
import { createAccessContext, requirePermission } from "@/domains/identity/guards";
import { ComplianceDomainError } from "@/domains/compliance/errors";
import type {
  AcceptPolicyInput,
  ComplianceMaintenanceResult,
  CreateAttendeeExportJobInput,
  DataDeletionRequestRecord,
  DataExportJobRecord,
  EventAttendeeExportDownload,
  ListAttendeeExportJobsQuery,
  PolicyAcceptanceRecord,
  RequestDataDeletionInput,
} from "@/domains/compliance/types";

const ATTENDEE_EXPORT_TYPE = "EVENT_ATTENDEES_CSV";

const acceptPolicySchema = z.object({
  documentType: z.enum(["TERMS_OF_SERVICE", "PRIVACY_POLICY", "MARKETING_COMMUNICATIONS"]),
  documentVersion: z
    .string()
    .trim()
    .min(1, "documentVersion is required.")
    .max(80, "documentVersion cannot exceed 80 characters."),
  scopeType: z.enum(ScopeType).optional(),
  scopeId: z
    .string()
    .trim()
    .min(1, "scopeId cannot be empty.")
    .max(120, "scopeId cannot exceed 120 characters.")
    .optional(),
  ipAddress: z.string().trim().max(120).optional(),
  userAgent: z.string().trim().max(500).optional(),
});

const requestDeletionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, "Deletion reason must contain at least 4 characters.")
    .max(400, "Deletion reason cannot exceed 400 characters.")
    .optional(),
});

const createAttendeeExportJobSchema = z.object({
  reasonCode: z
    .string()
    .trim()
    .min(3, "reasonCode is required for attendee exports.")
    .max(120, "reasonCode cannot exceed 120 characters."),
  ttlHours: z.coerce
    .number()
    .int("ttlHours must be an integer.")
    .min(1, "ttlHours must be at least 1.")
    .max(168, "ttlHours cannot exceed 168.")
    .optional(),
});

const listAttendeeExportJobsSchema = z.object({
  take: z.coerce
    .number()
    .int("take must be an integer.")
    .min(1, "take must be at least 1.")
    .max(100, "take cannot exceed 100.")
    .optional(),
});

function now() {
  return new Date();
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replace(/\r?\n/g, " ");

  if (normalized.includes(",") || normalized.includes('"')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function formatIsoDate(value: Date | null | undefined) {
  if (!value) {
    return "";
  }

  return value.toISOString();
}

function toPolicyAcceptanceRecord(entry: {
  id: string;
  documentType: "TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "MARKETING_COMMUNICATIONS";
  documentVersion: string;
  scopeType: ScopeType;
  scopeId: string;
  acceptedAt: Date;
}): PolicyAcceptanceRecord {
  return {
    id: entry.id,
    documentType: entry.documentType,
    documentVersion: entry.documentVersion,
    scopeType: entry.scopeType,
    scopeId: entry.scopeId,
    acceptedAt: entry.acceptedAt.toISOString(),
  };
}

function toDataDeletionRequestRecord(entry: {
  id: string;
  status: DataDeletionRequestStatus;
  reason: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  processorNote: string | null;
}): DataDeletionRequestRecord {
  return {
    id: entry.id,
    status: entry.status,
    reason: entry.reason ?? undefined,
    requestedAt: entry.requestedAt.toISOString(),
    processedAt: formatIsoDate(entry.processedAt) || undefined,
    processorNote: entry.processorNote ?? undefined,
  };
}

function toDataExportJobRecord(entry: {
  id: string;
  eventId: string | null;
  status: DataExportStatus;
  type: string;
  requestedReason: string | null;
  completedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}): DataExportJobRecord {
  return {
    id: entry.id,
    eventId: entry.eventId ?? undefined,
    status: entry.status,
    type: entry.type,
    requestedReason: entry.requestedReason ?? undefined,
    completedAt: formatIsoDate(entry.completedAt) || undefined,
    expiresAt: entry.expiresAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
  };
}

async function requireAuthenticatedSession() {
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new ComplianceDomainError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  return session;
}

async function requireEventManagePermission(
  eventId: string,
  action: string,
  highRisk = false,
) {
  return requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "event.manage",
    action,
    targetType: "Event",
    targetId: eventId,
    highRisk,
  });
}

async function loadEventExportContext(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
      title: true,
    },
  });

  if (!event) {
    throw new ComplianceDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  return event;
}

function parseAcceptPolicyInput(input: AcceptPolicyInput) {
  const parsed = acceptPolicySchema.parse(input);

  return {
    documentType: parsed.documentType,
    documentVersion: parsed.documentVersion,
    scopeType: parsed.scopeType,
    scopeId: normalizeOptionalText(parsed.scopeId),
    ipAddress: normalizeOptionalText(parsed.ipAddress),
    userAgent: normalizeOptionalText(parsed.userAgent),
  };
}

function parseRequestDeletionInput(input: RequestDataDeletionInput) {
  const parsed = requestDeletionSchema.parse(input);

  return {
    reason: normalizeOptionalText(parsed.reason),
  };
}

function parseCreateAttendeeExportJobInput(input: CreateAttendeeExportJobInput) {
  const parsed = createAttendeeExportJobSchema.parse(input);

  return {
    reasonCode: parsed.reasonCode,
    ttlHours: parsed.ttlHours ?? env.DATA_EXPORT_TTL_HOURS,
  };
}

function parseListAttendeeExportJobsQuery(input: ListAttendeeExportJobsQuery) {
  const parsed = listAttendeeExportJobsSchema.parse(input);

  return {
    take: parsed.take ?? 20,
  };
}

async function buildAttendeeExportCsv(eventId: string) {
  const tickets = await prisma.ticket.findMany({
    where: {
      eventId,
    },
    orderBy: {
      issuedAt: "asc",
    },
    select: {
      id: true,
      status: true,
      issuedAt: true,
      ticketClass: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      attendee: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      order: {
        select: {
          id: true,
          currency: true,
          totalAmount: true,
        },
      },
    },
  });

  const header = [
    "ticketId",
    "ticketStatus",
    "issuedAt",
    "ticketClassId",
    "ticketClassName",
    "ticketClassType",
    "ownerUserId",
    "ownerName",
    "ownerEmail",
    "attendeeUserId",
    "attendeeName",
    "attendeeEmail",
    "orderId",
    "orderCurrency",
    "orderTotalAmount",
  ];

  const lines = [header.join(",")];

  for (const ticket of tickets) {
    lines.push(
      [
        ticket.id,
        ticket.status,
        ticket.issuedAt.toISOString(),
        ticket.ticketClass.id,
        ticket.ticketClass.name,
        ticket.ticketClass.type,
        ticket.owner.id,
        ticket.owner.name,
        ticket.owner.email,
        ticket.attendee.id,
        ticket.attendee.name,
        ticket.attendee.email,
        ticket.order.id,
        ticket.order.currency,
        Number(ticket.order.totalAmount.toString()),
      ]
        .map((entry) => escapeCsvValue(entry))
        .join(","),
    );
  }

  return {
    rowCount: tickets.length,
    content: `${lines.join("\n")}\n`,
  };
}

function toExportFileName(eventTitle: string) {
  const slug = eventTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const safeSlug = slug || "event";
  const dateSuffix = new Date().toISOString().slice(0, 10);
  return `${safeSlug}-attendees-${dateSuffix}.csv`;
}

export async function listMyPolicyAcceptances(): Promise<PolicyAcceptanceRecord[]> {
  const session = await requireAuthenticatedSession();

  const acceptances = await prisma.policyAcceptance.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      acceptedAt: "desc",
    },
    select: {
      id: true,
      documentType: true,
      documentVersion: true,
      scopeType: true,
      scopeId: true,
      acceptedAt: true,
    },
  });

  return acceptances.map((entry) => toPolicyAcceptanceRecord(entry));
}

export async function acceptPolicyDocument(
  input: AcceptPolicyInput,
): Promise<PolicyAcceptanceRecord> {
  const parsed = parseAcceptPolicyInput(input);
  const session = await requireAuthenticatedSession();

  const activeContext =
    resolveActiveContext(session, session.user.id) ?? {
      type: ScopeType.PERSONAL,
      id: session.user.id,
    };

  if (parsed.scopeType && parsed.scopeType !== ScopeType.PERSONAL && !parsed.scopeId) {
    throw new ComplianceDomainError(
      400,
      "BAD_REQUEST",
      "scopeId is required when scopeType is provided.",
    );
  }

  const scopeType = parsed.scopeType ?? activeContext.type;
  const scopeId =
    parsed.scopeId ?? (scopeType === ScopeType.PERSONAL ? session.user.id : activeContext.id);

  const acceptance = await prisma.policyAcceptance.upsert({
    where: {
      userId_documentType_documentVersion_scopeType_scopeId: {
        userId: session.user.id,
        documentType: parsed.documentType,
        documentVersion: parsed.documentVersion,
        scopeType,
        scopeId,
      },
    },
    update: {
      acceptedAt: now(),
      ipAddress: parsed.ipAddress,
      userAgent: parsed.userAgent,
    },
    create: {
      userId: session.user.id,
      documentType: parsed.documentType,
      documentVersion: parsed.documentVersion,
      scopeType,
      scopeId,
      ipAddress: parsed.ipAddress,
      userAgent: parsed.userAgent,
    },
    select: {
      id: true,
      documentType: true,
      documentVersion: true,
      scopeType: true,
      scopeId: true,
      acceptedAt: true,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "compliance.policy.accepted",
    scopeType,
    scopeId,
    targetType: "PolicyAcceptance",
    targetId: acceptance.id,
    newValue: {
      documentType: acceptance.documentType,
      documentVersion: acceptance.documentVersion,
      ipAddress: parsed.ipAddress,
      userAgent: parsed.userAgent,
    },
  });

  return toPolicyAcceptanceRecord(acceptance);
}

export async function listMyDataDeletionRequests(): Promise<DataDeletionRequestRecord[]> {
  const session = await requireAuthenticatedSession();

  const requests = await prisma.dataDeletionRequest.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      requestedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      reason: true,
      requestedAt: true,
      processedAt: true,
      processorNote: true,
    },
  });

  return requests.map((entry) => toDataDeletionRequestRecord(entry));
}

export async function requestMyDataDeletion(
  input: RequestDataDeletionInput,
): Promise<DataDeletionRequestRecord> {
  const parsed = parseRequestDeletionInput(input);
  const session = await requireAuthenticatedSession();

  const existing = await prisma.dataDeletionRequest.findFirst({
    where: {
      userId: session.user.id,
      status: {
        in: [
          DataDeletionRequestStatus.REQUESTED,
          DataDeletionRequestStatus.PROCESSING,
        ],
      },
    },
    orderBy: {
      requestedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      reason: true,
      requestedAt: true,
      processedAt: true,
      processorNote: true,
    },
  });

  if (existing) {
    return toDataDeletionRequestRecord(existing);
  }

  const created = await prisma.dataDeletionRequest.create({
    data: {
      userId: session.user.id,
      status: DataDeletionRequestStatus.REQUESTED,
      reason: parsed.reason,
    },
    select: {
      id: true,
      status: true,
      reason: true,
      requestedAt: true,
      processedAt: true,
      processorNote: true,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "compliance.data_deletion.requested",
    scopeType: ScopeType.PERSONAL,
    scopeId: session.user.id,
    targetType: "DataDeletionRequest",
    targetId: created.id,
    reason: parsed.reason,
  });

  return toDataDeletionRequestRecord(created);
}

export async function createEventAttendeeExportJob(
  eventId: string,
  input: CreateAttendeeExportJobInput,
): Promise<DataExportJobRecord> {
  const parsed = parseCreateAttendeeExportJobInput(input);
  const authz = await requireEventManagePermission(
    eventId,
    "compliance.export.attendees.request",
    true,
  );
  const event = await loadEventExportContext(eventId);

  const expiresAt = new Date(now().getTime() + parsed.ttlHours * 60 * 60 * 1_000);

  const job = await prisma.dataExportJob.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      requestedBy: authz.session.user.id,
      type: ATTENDEE_EXPORT_TYPE,
      status: DataExportStatus.QUEUED,
      requestedReason: parsed.reasonCode,
      expiresAt,
    },
    select: {
      id: true,
      eventId: true,
      status: true,
      type: true,
      requestedReason: true,
      completedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "compliance.export.attendees.queued",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "DataExportJob",
    targetId: job.id,
    reason: parsed.reasonCode,
    newValue: {
      expiresAt: job.expiresAt.toISOString(),
      type: job.type,
    },
  });

  return toDataExportJobRecord(job);
}

export async function listEventAttendeeExportJobs(
  eventId: string,
  query: ListAttendeeExportJobsQuery,
): Promise<DataExportJobRecord[]> {
  const parsed = parseListAttendeeExportJobsQuery(query);
  const authz = await requireEventManagePermission(
    eventId,
    "compliance.export.attendees.list",
  );
  const event = await loadEventExportContext(eventId);

  const jobs = await prisma.dataExportJob.findMany({
    where: {
      orgId: event.orgId,
      eventId: event.id,
      requestedBy: authz.session.user.id,
      type: ATTENDEE_EXPORT_TYPE,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: parsed.take,
    select: {
      id: true,
      eventId: true,
      status: true,
      type: true,
      requestedReason: true,
      completedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return jobs.map((entry) => toDataExportJobRecord(entry));
}

export async function downloadEventAttendeeExport(
  eventId: string,
  jobId: string,
): Promise<EventAttendeeExportDownload> {
  const authz = await requireEventManagePermission(
    eventId,
    "compliance.export.attendees.download",
    true,
  );
  const event = await loadEventExportContext(eventId);

  const job = await prisma.dataExportJob.findFirst({
    where: {
      id: jobId,
      orgId: event.orgId,
      eventId: event.id,
      requestedBy: authz.session.user.id,
      type: ATTENDEE_EXPORT_TYPE,
    },
    select: {
      id: true,
      status: true,
      requestedReason: true,
      expiresAt: true,
    },
  });

  if (!job) {
    throw new ComplianceDomainError(404, "EXPORT_JOB_NOT_FOUND", "Export job not found.");
  }

  if (job.expiresAt.getTime() <= Date.now()) {
    await prisma.dataExportJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: DataExportStatus.EXPIRED,
      },
    });

    throw new ComplianceDomainError(
      410,
      "EXPORT_JOB_EXPIRED",
      "Export job has expired and must be requested again.",
    );
  }

  await prisma.dataExportJob.update({
    where: {
      id: job.id,
    },
    data: {
      status: DataExportStatus.RUNNING,
    },
  });

  const exportPayload = await buildAttendeeExportCsv(eventId);

  await prisma.dataExportJob.update({
    where: {
      id: job.id,
    },
    data: {
      status: DataExportStatus.COMPLETED,
      completedAt: now(),
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "compliance.export.attendees.downloaded",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "DataExportJob",
    targetId: job.id,
    reason: job.requestedReason ?? undefined,
    newValue: {
      rowCount: exportPayload.rowCount,
      expiresAt: job.expiresAt.toISOString(),
    },
  });

  return {
    jobId: job.id,
    fileName: toExportFileName(event.title),
    content: exportPayload.content,
    rowCount: exportPayload.rowCount,
  };
}

export async function runComplianceMaintenance(): Promise<ComplianceMaintenanceResult> {
  const nowDate = now();
  const exportPurgeCutoff = new Date(
    nowDate.getTime() - env.DATA_EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );
  const inboundPayloadCutoff = new Date(
    nowDate.getTime() - env.INBOUND_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );
  const notificationCutoff = new Date(
    nowDate.getTime() - env.NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );

  const expiredExports = await prisma.dataExportJob.updateMany({
    where: {
      status: {
        in: [
          DataExportStatus.QUEUED,
          DataExportStatus.RUNNING,
          DataExportStatus.COMPLETED,
        ],
      },
      expiresAt: {
        lt: nowDate,
      },
    },
    data: {
      status: DataExportStatus.EXPIRED,
    },
  });

  const purgedExports = await prisma.dataExportJob.deleteMany({
    where: {
      status: DataExportStatus.EXPIRED,
      expiresAt: {
        lt: exportPurgeCutoff,
      },
    },
  });

  const redactedInboundPayloads = await prisma.inboundProviderEvent.updateMany({
    where: {
      createdAt: {
        lt: inboundPayloadCutoff,
      },
      status: {
        in: [
          InboundProviderEventStatus.PROCESSED,
          InboundProviderEventStatus.FAILED,
        ],
      },
    },
    data: {
      payload: {} as Prisma.InputJsonValue,
      signature: null,
    },
  });

  const prunedNotificationDeliveries = await prisma.notificationDelivery.deleteMany({
    where: {
      createdAt: {
        lt: notificationCutoff,
      },
      status: {
        in: [
          NotificationDeliveryStatus.SENT,
          NotificationDeliveryStatus.FAILED,
          NotificationDeliveryStatus.DEAD_LETTER,
          NotificationDeliveryStatus.CANCELLED,
        ],
      },
    },
  });

  const pendingDeletionRequests = await prisma.dataDeletionRequest.findMany({
    where: {
      status: DataDeletionRequestStatus.REQUESTED,
    },
    orderBy: {
      requestedAt: "asc",
    },
    take: 25,
    select: {
      id: true,
      userId: true,
      reason: true,
    },
  });

  let completedDeletionRequests = 0;
  let rejectedDeletionRequests = 0;

  for (const deletionRequest of pendingDeletionRequests) {
    try {
      const anonymizedEmail = `deleted+${deletionRequest.userId}@redacted.local`;

      await prisma.$transaction(async (tx) => {
        await tx.dataDeletionRequest.update({
          where: {
            id: deletionRequest.id,
          },
          data: {
            status: DataDeletionRequestStatus.PROCESSING,
          },
        });

        await tx.session.deleteMany({
          where: {
            userId: deletionRequest.userId,
          },
        });

        await tx.account.deleteMany({
          where: {
            userId: deletionRequest.userId,
          },
        });

        await tx.notificationPreference.deleteMany({
          where: {
            userId: deletionRequest.userId,
          },
        });

        await tx.user.update({
          where: {
            id: deletionRequest.userId,
          },
          data: {
            name: "Deleted User",
            email: anonymizedEmail,
            image: null,
            emailVerified: false,
          },
        });

        await tx.order.updateMany({
          where: {
            buyerUserId: deletionRequest.userId,
          },
          data: {
            buyerSnapshot: {
              name: "Deleted User",
              email: anonymizedEmail,
            } as Prisma.InputJsonValue,
          },
        });

        await tx.dataDeletionRequest.update({
          where: {
            id: deletionRequest.id,
          },
          data: {
            status: DataDeletionRequestStatus.COMPLETED,
            processedAt: now(),
            processorNote: "User profile anonymized and active sessions revoked.",
          },
        });
      });

      await writeAuditEvent({
        action: "compliance.data_deletion.completed",
        scopeType: ScopeType.PERSONAL,
        scopeId: deletionRequest.userId,
        targetType: "DataDeletionRequest",
        targetId: deletionRequest.id,
        reason: deletionRequest.reason ?? undefined,
        newValue: {
          status: DataDeletionRequestStatus.COMPLETED,
        },
      });

      completedDeletionRequests += 1;
    } catch (error) {
      rejectedDeletionRequests += 1;

      await prisma.dataDeletionRequest.update({
        where: {
          id: deletionRequest.id,
        },
        data: {
          status: DataDeletionRequestStatus.REJECTED,
          processorNote: truncateText(
            error instanceof Error ? error.message : "Data deletion request failed.",
            300,
          ),
        },
      });
    }
  }

  return {
    expiredExports: expiredExports.count,
    purgedExports: purgedExports.count,
    redactedInboundPayloads: redactedInboundPayloads.count,
    prunedNotificationDeliveries: prunedNotificationDeliveries.count,
    completedDeletionRequests,
    rejectedDeletionRequests,
  };
}
