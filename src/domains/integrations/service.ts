import crypto from "node:crypto";
import {
  InboundProviderEventStatus,
  Prisma,
  ScopeType,
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
  WebhookEventType,
  WebhookOutboxStatus,
} from "@prisma/client";
import { INTEGRATION_PROVIDER_TYPES } from "@/domains/integrations/types";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { prisma } from "@/core/db/prisma";
import { createAccessContext, requirePermission } from "@/domains/identity/guards";
import { resolveInboundProviderAdapter } from "@/domains/integrations/adapters";
import { IntegrationDomainError } from "@/domains/integrations/errors";
import type {
  CreateWebhookEndpointInput,
  IntegrationProviderType,
  InboundProviderEventListItem,
  InboundProviderEventListQuery,
  IngestInboundProviderCallbackInput,
  IngestInboundProviderCallbackResult,
  IntegrationsMaintenanceResult,
  ListWebhookOutboxEventsQuery,
  PublishWebhookEventInput,
  ReplayWebhookEventsInput,
  UpdateWebhookEndpointInput,
  WebhookEndpointListItem,
  WebhookOutboxListItem,
} from "@/domains/integrations/types";

const REPLAY_RETENTION_DAYS = 30;
const DELIVERY_BATCH_SIZE = 25;
const MAX_DELIVERY_ATTEMPTS = 12;

const WEBHOOK_EVENT_TOPIC_MAP: Record<WebhookEventType, string> = {
  [WebhookEventType.RESERVATION_CREATED]: "reservation.created",
  [WebhookEventType.RESERVATION_EXPIRED]: "reservation.expired",
  [WebhookEventType.ORDER_COMPLETED]: "order.completed",
  [WebhookEventType.PAYMENT_CAPTURED]: "payment.captured",
  [WebhookEventType.TICKET_ISSUED]: "ticket.issued",
  [WebhookEventType.TICKET_TRANSFERRED]: "ticket.transferred",
  [WebhookEventType.TICKET_CHECKED_IN]: "ticket.checked_in",
  [WebhookEventType.REFUND_PROCESSED]: "refund.processed",
  [WebhookEventType.EVENT_PUBLISHED]: "event.published",
  [WebhookEventType.EVENT_CANCELLED]: "event.cancelled",
};

const TOPIC_TO_EVENT_TYPE = new Map<string, WebhookEventType>(
  Object.entries(WEBHOOK_EVENT_TOPIC_MAP).map(([eventType, topic]) => [
    topic.toLowerCase(),
    eventType as WebhookEventType,
  ]),
);

const WEBHOOK_EVENT_TYPE_VALUES = Object.values(WebhookEventType);

const createWebhookEndpointInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.url().max(2_000),
  eventTypes: z.array(z.string().trim().min(1)).min(1).max(20),
  signingKeyId: z.string().trim().min(4).max(120).optional(),
  signingSecret: z.string().trim().min(8).max(500).optional(),
  status: z.enum(WebhookEndpointStatus).optional(),
});

const updateWebhookEndpointInputSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  url: z.url().max(2_000).optional(),
  eventTypes: z.array(z.string().trim().min(1)).min(1).max(20).optional(),
  status: z.enum(WebhookEndpointStatus).optional(),
  rotateSigningKey: z.boolean().optional(),
  newSigningKeyId: z.string().trim().min(4).max(120).optional(),
  newSigningSecret: z.string().trim().min(8).max(500).optional(),
});

const publishWebhookEventInputSchema = z.object({
  eventType: z.string().trim().min(3).max(80),
  payload: z.unknown(),
  metadata: z.unknown().optional(),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(MAX_DELIVERY_ATTEMPTS).optional(),
});

const listWebhookOutboxEventsQuerySchema = z.object({
  status: z.enum(WebhookOutboxStatus).optional(),
  eventType: z.string().trim().min(3).max(80).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const replayWebhookEventsInputSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  eventTypes: z.array(z.string().trim().min(3).max(80)).max(20).optional(),
  maxEvents: z.coerce.number().int().min(1).max(200).optional(),
});

const ingestInboundProviderCallbackInputSchema = z.object({
  providerType: z.enum(INTEGRATION_PROVIDER_TYPES),
  provider: z.string().trim().min(2).max(120),
  signature: z.string().trim().max(500).optional(),
  rawBody: z.string().min(1).max(2_000_000),
  payload: z.unknown(),
  providerEventId: z.string().trim().max(200).optional(),
  eventType: z.string().trim().max(120).optional(),
  orgId: z.string().trim().max(120).optional(),
  eventId: z.string().trim().max(120).optional(),
});

const inboundProviderEventListQuerySchema = z.object({
  providerType: z.enum(INTEGRATION_PROVIDER_TYPES).optional(),
  status: z.enum(InboundProviderEventStatus).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
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

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function toEventScope(scopeId: string) {
  return createAccessContext(ScopeType.EVENT, scopeId);
}

async function requireIntegrationReadPermission(eventId: string, action: string) {
  return requirePermission({
    context: toEventScope(eventId),
    permission: "event.read",
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function requireIntegrationManagePermission(eventId: string, action: string) {
  return requirePermission({
    context: toEventScope(eventId),
    permission: "event.manage",
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function loadEventIntegrationContext(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
    },
  });

  if (!event) {
    throw new IntegrationDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  return event;
}

function generateSigningSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function generateSigningKeyId() {
  return `whk_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function normalizeWebhookEventType(rawValue: string): WebhookEventType {
  const normalized = rawValue.trim();
  if (!normalized) {
    throw new IntegrationDomainError(
      422,
      "UNPROCESSABLE_INTEGRATION",
      "Webhook event type cannot be empty.",
    );
  }

  const topicMatch = TOPIC_TO_EVENT_TYPE.get(normalized.toLowerCase());
  if (topicMatch) {
    return topicMatch;
  }

  const enumCandidate = normalized
    .toUpperCase()
    .replace(/[.\-\s]+/g, "_") as WebhookEventType;

  if (WEBHOOK_EVENT_TYPE_VALUES.includes(enumCandidate)) {
    return enumCandidate;
  }

  throw new IntegrationDomainError(
    422,
    "UNPROCESSABLE_INTEGRATION",
    `Unsupported webhook event type: ${rawValue}`,
  );
}

function toWebhookEventTopic(eventType: WebhookEventType) {
  return WEBHOOK_EVENT_TOPIC_MAP[eventType];
}

function normalizeWebhookEventTypeList(eventTypes: string[]) {
  return Array.from(new Set(eventTypes.map((eventType) => normalizeWebhookEventType(eventType))));
}

function parseStoredWebhookEventTypes(value: Prisma.JsonValue | null): WebhookEventType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: WebhookEventType[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    try {
      parsed.push(normalizeWebhookEventType(entry));
    } catch {
      continue;
    }
  }

  return Array.from(new Set(parsed));
}

function getRetryDelayMs(attemptCount: number) {
  const baseSeconds = 30;
  const exponent = Math.max(0, attemptCount - 1);
  const delaySeconds = Math.min(3_600, baseSeconds * 2 ** exponent);
  return delaySeconds * 1_000;
}

function signOutboundPayload(timestamp: string, rawBody: string, secret: string) {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return `sha256=${digest}`;
}

function parseCreateWebhookEndpointInput(input: CreateWebhookEndpointInput) {
  const parsed = createWebhookEndpointInputSchema.parse(input);

  return {
    name: parsed.name,
    url: parsed.url,
    eventTypes: normalizeWebhookEventTypeList(parsed.eventTypes),
    signingKeyId: normalizeOptionalText(parsed.signingKeyId),
    signingSecret: normalizeOptionalText(parsed.signingSecret),
    status: parsed.status ?? WebhookEndpointStatus.ACTIVE,
  };
}

function parseUpdateWebhookEndpointInput(input: UpdateWebhookEndpointInput) {
  const parsed = updateWebhookEndpointInputSchema.parse(input);

  return {
    name: normalizeOptionalText(parsed.name),
    url: normalizeOptionalText(parsed.url),
    eventTypes: parsed.eventTypes
      ? normalizeWebhookEventTypeList(parsed.eventTypes)
      : undefined,
    status: parsed.status,
    rotateSigningKey: parsed.rotateSigningKey ?? false,
    newSigningKeyId: normalizeOptionalText(parsed.newSigningKeyId),
    newSigningSecret: normalizeOptionalText(parsed.newSigningSecret),
  };
}

function parsePublishWebhookEventInput(input: PublishWebhookEventInput) {
  const parsed = publishWebhookEventInputSchema.parse(input);

  return {
    eventType: normalizeWebhookEventType(parsed.eventType),
    payload: parsed.payload,
    metadata: parsed.metadata,
    idempotencyKey: normalizeOptionalText(parsed.idempotencyKey),
    maxAttempts: parsed.maxAttempts ?? 8,
  };
}

function parseListWebhookOutboxEventsQuery(input: ListWebhookOutboxEventsQuery) {
  const parsed = listWebhookOutboxEventsQuerySchema.parse(input);

  return {
    status: parsed.status,
    eventType: parsed.eventType ? normalizeWebhookEventType(parsed.eventType) : undefined,
    take: parsed.take ?? 100,
  };
}

function parseReplayWebhookEventsInput(input: ReplayWebhookEventsInput) {
  const parsed = replayWebhookEventsInputSchema.parse(input);

  const parsedFrom = parsed.from ? new Date(parsed.from) : undefined;
  const parsedTo = parsed.to ? new Date(parsed.to) : undefined;

  const to = parsedTo ?? now();
  const from = parsedFrom ?? new Date(to.getTime() - 24 * 60 * 60 * 1_000);

  if (from.getTime() > to.getTime()) {
    throw new IntegrationDomainError(
      422,
      "UNPROCESSABLE_INTEGRATION",
      "Replay range is invalid. `from` must be before `to`.",
    );
  }

  const replayWindowFloor = new Date(
    now().getTime() - REPLAY_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );

  if (from.getTime() < replayWindowFloor.getTime()) {
    throw new IntegrationDomainError(
      422,
      "UNPROCESSABLE_INTEGRATION",
      `Replay window exceeds retention of ${REPLAY_RETENTION_DAYS} days.`,
    );
  }

  return {
    from,
    to,
    eventTypes: parsed.eventTypes
      ? normalizeWebhookEventTypeList(parsed.eventTypes)
      : undefined,
    maxEvents: parsed.maxEvents ?? 100,
  };
}

function parseIngestInboundProviderCallbackInput(input: IngestInboundProviderCallbackInput) {
  const parsed = ingestInboundProviderCallbackInputSchema.parse(input);

  return {
    providerType: parsed.providerType,
    provider: parsed.provider.trim().toUpperCase(),
    signature: normalizeOptionalText(parsed.signature),
    rawBody: parsed.rawBody,
    payload: parsed.payload,
    providerEventId: normalizeOptionalText(parsed.providerEventId),
    eventType: normalizeOptionalText(parsed.eventType),
    orgId: normalizeOptionalText(parsed.orgId),
    eventId: normalizeOptionalText(parsed.eventId),
  };
}

function parseInboundProviderEventListQuery(input: InboundProviderEventListQuery) {
  const parsed = inboundProviderEventListQuerySchema.parse(input);

  return {
    providerType: parsed.providerType,
    status: parsed.status,
    take: parsed.take ?? 100,
  };
}

function toWebhookEndpointListItem(endpoint: {
  id: string;
  name: string;
  url: string;
  status: WebhookEndpointStatus;
  subscribedEventTypes: Prisma.JsonValue;
  activeSigningKeyId: string;
  previousSigningKeyId: string | null;
  lastRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WebhookEndpointListItem {
  const eventTypes = parseStoredWebhookEventTypes(endpoint.subscribedEventTypes);

  return {
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url,
    status: endpoint.status,
    eventTypes: eventTypes.map((eventType) => toWebhookEventTopic(eventType)),
    activeSigningKeyId: endpoint.activeSigningKeyId,
    previousSigningKeyId: endpoint.previousSigningKeyId ?? undefined,
    lastRotatedAt: endpoint.lastRotatedAt?.toISOString(),
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

function toWebhookOutboxListItem(event: {
  id: string;
  eventType: WebhookEventType;
  status: WebhookOutboxStatus;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  deadLetteredAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  lastError: string | null;
}): WebhookOutboxListItem {
  return {
    id: event.id,
    eventType: toWebhookEventTopic(event.eventType),
    eventTypeEnum: event.eventType,
    status: event.status,
    idempotencyKey: event.idempotencyKey,
    attemptCount: event.attemptCount,
    maxAttempts: event.maxAttempts,
    nextAttemptAt: event.nextAttemptAt.toISOString(),
    deadLetteredAt: event.deadLetteredAt?.toISOString(),
    deliveredAt: event.deliveredAt?.toISOString(),
    createdAt: event.createdAt.toISOString(),
    lastError: event.lastError ?? undefined,
  };
}

function toInboundProviderEventListItem(event: {
  id: string;
  providerType: IntegrationProviderType;
  provider: string;
  providerEventId: string;
  eventType: string | null;
  status: InboundProviderEventStatus;
  createdAt: Date;
  processedAt: Date | null;
  errorMessage: string | null;
}): InboundProviderEventListItem {
  return {
    id: event.id,
    providerType: event.providerType,
    provider: event.provider,
    providerEventId: event.providerEventId,
    eventType: event.eventType ?? undefined,
    status: event.status,
    createdAt: event.createdAt.toISOString(),
    processedAt: event.processedAt?.toISOString(),
    errorMessage: event.errorMessage ?? undefined,
  };
}

export function listSupportedWebhookEventTopics() {
  return Object.values(WEBHOOK_EVENT_TOPIC_MAP);
}

export async function createWebhookEndpoint(
  eventId: string,
  input: CreateWebhookEndpointInput,
) {
  const parsed = parseCreateWebhookEndpointInput(input);
  const authz = await requireIntegrationManagePermission(
    eventId,
    "integrations.webhooks.endpoint.create",
  );
  const event = await loadEventIntegrationContext(eventId);

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      name: parsed.name,
      url: parsed.url,
      status: parsed.status,
      subscribedEventTypes: parsed.eventTypes as unknown as Prisma.InputJsonValue,
      activeSigningKeyId: parsed.signingKeyId ?? generateSigningKeyId(),
      activeSigningSecret: parsed.signingSecret ?? generateSigningSecret(),
      createdBy: authz.session.user.id,
    },
    select: {
      id: true,
      name: true,
      url: true,
      status: true,
      subscribedEventTypes: true,
      activeSigningKeyId: true,
      previousSigningKeyId: true,
      lastRotatedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "integrations.webhooks.endpoint.created",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "WebhookEndpoint",
    targetId: endpoint.id,
    newValue: {
      name: endpoint.name,
      status: endpoint.status,
      eventTypes: parseStoredWebhookEventTypes(endpoint.subscribedEventTypes).map((eventType) =>
        toWebhookEventTopic(eventType),
      ),
      signingKeyId: endpoint.activeSigningKeyId,
    },
  });

  return toWebhookEndpointListItem(endpoint);
}

export async function listWebhookEndpoints(eventId: string) {
  await requireIntegrationReadPermission(eventId, "integrations.webhooks.endpoint.list");
  const event = await loadEventIntegrationContext(eventId);

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      orgId: event.orgId,
      OR: [{ eventId: event.id }, { eventId: null }],
    },
    orderBy: [
      {
        createdAt: "asc",
      },
    ],
    select: {
      id: true,
      name: true,
      url: true,
      status: true,
      subscribedEventTypes: true,
      activeSigningKeyId: true,
      previousSigningKeyId: true,
      lastRotatedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return endpoints.map((endpoint) => toWebhookEndpointListItem(endpoint));
}

export async function updateWebhookEndpoint(
  eventId: string,
  endpointId: string,
  input: UpdateWebhookEndpointInput,
) {
  const parsed = parseUpdateWebhookEndpointInput(input);
  const authz = await requireIntegrationManagePermission(
    eventId,
    "integrations.webhooks.endpoint.update",
  );
  const event = await loadEventIntegrationContext(eventId);

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: endpointId,
      orgId: event.orgId,
      OR: [{ eventId: event.id }, { eventId: null }],
    },
  });

  if (!endpoint) {
    throw new IntegrationDomainError(
      404,
      "WEBHOOK_ENDPOINT_NOT_FOUND",
      "Webhook endpoint not found.",
    );
  }

  const nextActiveSigningSecret = parsed.rotateSigningKey
    ? parsed.newSigningSecret ?? generateSigningSecret()
    : endpoint.activeSigningSecret;

  const nextActiveSigningKeyId = parsed.rotateSigningKey
    ? parsed.newSigningKeyId ?? generateSigningKeyId()
    : endpoint.activeSigningKeyId;

  const updated = await prisma.webhookEndpoint.update({
    where: {
      id: endpoint.id,
    },
    data: {
      name: parsed.name,
      url: parsed.url,
      status: parsed.status,
      subscribedEventTypes: parsed.eventTypes
        ? (parsed.eventTypes as unknown as Prisma.InputJsonValue)
        : undefined,
      activeSigningSecret: nextActiveSigningSecret,
      activeSigningKeyId: nextActiveSigningKeyId,
      previousSigningSecret: parsed.rotateSigningKey
        ? endpoint.activeSigningSecret
        : endpoint.previousSigningSecret,
      previousSigningKeyId: parsed.rotateSigningKey
        ? endpoint.activeSigningKeyId
        : endpoint.previousSigningKeyId,
      lastRotatedAt: parsed.rotateSigningKey ? now() : endpoint.lastRotatedAt,
    },
    select: {
      id: true,
      name: true,
      url: true,
      status: true,
      subscribedEventTypes: true,
      activeSigningKeyId: true,
      previousSigningKeyId: true,
      lastRotatedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: parsed.rotateSigningKey
      ? "integrations.webhooks.endpoint.key_rotated"
      : "integrations.webhooks.endpoint.updated",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "WebhookEndpoint",
    targetId: endpoint.id,
    newValue: {
      status: updated.status,
      eventTypes: parseStoredWebhookEventTypes(updated.subscribedEventTypes).map((eventType) =>
        toWebhookEventTopic(eventType),
      ),
      activeSigningKeyId: updated.activeSigningKeyId,
      previousSigningKeyId: updated.previousSigningKeyId,
    },
  });

  return toWebhookEndpointListItem(updated);
}

export async function publishWebhookEvent(
  eventId: string,
  input: PublishWebhookEventInput,
) {
  const parsed = parsePublishWebhookEventInput(input);
  const authz = await requireIntegrationManagePermission(
    eventId,
    "integrations.webhooks.event.publish",
  );
  const event = await loadEventIntegrationContext(eventId);

  const idempotencyKey =
    parsed.idempotencyKey ??
    `evt:${event.id}:${parsed.eventType}:${crypto.randomUUID().replace(/-/g, "")}`;

  try {
    const created = await prisma.webhookOutboxEvent.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        eventType: parsed.eventType,
        idempotencyKey,
        payload: toJsonValue(parsed.payload) ?? ({} as Prisma.InputJsonValue),
        metadata: toJsonValue(parsed.metadata),
        maxAttempts: parsed.maxAttempts,
        nextAttemptAt: now(),
      },
      select: {
        id: true,
        eventType: true,
        status: true,
        idempotencyKey: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        deadLetteredAt: true,
        deliveredAt: true,
        createdAt: true,
        lastError: true,
      },
    });

    await writeAuditEvent({
      actorId: authz.session.user.id,
      action: "integrations.webhooks.event.enqueued",
      scopeType: ScopeType.EVENT,
      scopeId: eventId,
      targetType: "WebhookOutboxEvent",
      targetId: created.id,
      newValue: {
        eventType: toWebhookEventTopic(created.eventType),
        idempotencyKey: created.idempotencyKey,
      },
    });

    return {
      idempotent: false,
      event: toWebhookOutboxListItem(created),
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.webhookOutboxEvent.findUnique({
        where: {
          idempotencyKey,
        },
        select: {
          id: true,
          eventType: true,
          status: true,
          idempotencyKey: true,
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
          deadLetteredAt: true,
          deliveredAt: true,
          createdAt: true,
          lastError: true,
        },
      });

      if (existing) {
        return {
          idempotent: true,
          event: toWebhookOutboxListItem(existing),
        };
      }
    }

    throw error;
  }
}

export async function listWebhookOutboxEvents(
  eventId: string,
  query: ListWebhookOutboxEventsQuery,
) {
  const parsed = parseListWebhookOutboxEventsQuery(query);
  await requireIntegrationReadPermission(eventId, "integrations.webhooks.outbox.list");
  await loadEventIntegrationContext(eventId);

  const events = await prisma.webhookOutboxEvent.findMany({
    where: {
      eventId,
      status: parsed.status,
      eventType: parsed.eventType,
    },
    orderBy: [
      {
        createdAt: "desc",
      },
    ],
    take: parsed.take,
    select: {
      id: true,
      eventType: true,
      status: true,
      idempotencyKey: true,
      attemptCount: true,
      maxAttempts: true,
      nextAttemptAt: true,
      deadLetteredAt: true,
      deliveredAt: true,
      createdAt: true,
      lastError: true,
    },
  });

  return events.map((event) => toWebhookOutboxListItem(event));
}

export async function listWebhookDeadLetters(eventId: string, take = 100) {
  return listWebhookOutboxEvents(eventId, {
    status: WebhookOutboxStatus.DEAD_LETTER,
    take,
  });
}

export async function replayWebhookEvents(
  eventId: string,
  input: ReplayWebhookEventsInput,
) {
  const parsed = parseReplayWebhookEventsInput(input);
  const authz = await requireIntegrationManagePermission(
    eventId,
    "integrations.webhooks.replay.create",
  );
  const event = await loadEventIntegrationContext(eventId);

  const sourceEvents = await prisma.webhookOutboxEvent.findMany({
    where: {
      orgId: event.orgId,
      eventId: event.id,
      createdAt: {
        gte: parsed.from,
        lte: parsed.to,
      },
      ...(parsed.eventTypes
        ? {
            eventType: {
              in: parsed.eventTypes,
            },
          }
        : {}),
    },
    orderBy: {
      createdAt: "asc",
    },
    take: parsed.maxEvents,
  });

  let replayedCount = 0;

  for (const sourceEvent of sourceEvents) {
    await prisma.webhookOutboxEvent.create({
      data: {
        orgId: sourceEvent.orgId,
        eventId: sourceEvent.eventId,
        eventType: sourceEvent.eventType,
        eventVersion: sourceEvent.eventVersion,
        payload: sourceEvent.payload as Prisma.InputJsonValue,
        metadata: {
          replayedFromEventId: sourceEvent.id,
          replayedFromCreatedAt: sourceEvent.createdAt.toISOString(),
          replayRequestedAt: now().toISOString(),
        } as Prisma.InputJsonValue,
        idempotencyKey: `replay:${sourceEvent.id}:${crypto.randomUUID()}`,
        maxAttempts: sourceEvent.maxAttempts,
        nextAttemptAt: now(),
      },
    });

    replayedCount += 1;
  }

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "integrations.webhooks.replay.enqueued",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "WebhookOutboxEvent",
    targetId: eventId,
    newValue: {
      replayedCount,
      from: parsed.from.toISOString(),
      to: parsed.to.toISOString(),
      eventTypes: parsed.eventTypes?.map((eventType) => toWebhookEventTopic(eventType)),
    },
  });

  return {
    replayedCount,
    from: parsed.from.toISOString(),
    to: parsed.to.toISOString(),
  };
}

type DeliveryOutcome = "delivered" | "retried" | "dead_lettered";

async function deliverWebhookOutboxEvent(outboxEvent: {
  id: string;
  orgId: string;
  eventId: string | null;
  eventType: WebhookEventType;
  eventVersion: number;
  idempotencyKey: string;
  payload: Prisma.JsonValue;
  metadata: Prisma.JsonValue | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
}): Promise<DeliveryOutcome> {
  const candidateEndpoints = await prisma.webhookEndpoint.findMany({
    where: {
      orgId: outboxEvent.orgId,
      status: WebhookEndpointStatus.ACTIVE,
      ...(outboxEvent.eventId
        ? {
            OR: [{ eventId: outboxEvent.eventId }, { eventId: null }],
          }
        : {
            eventId: null,
          }),
    },
    select: {
      id: true,
      url: true,
      subscribedEventTypes: true,
      activeSigningKeyId: true,
      activeSigningSecret: true,
    },
  });

  const endpoints = candidateEndpoints.filter((endpoint) =>
    parseStoredWebhookEventTypes(endpoint.subscribedEventTypes).includes(
      outboxEvent.eventType,
    ),
  );

  if (!endpoints.length) {
    await prisma.webhookOutboxEvent.update({
      where: {
        id: outboxEvent.id,
      },
      data: {
        status: WebhookOutboxStatus.DELIVERED,
        deliveredAt: now(),
        lastError: null,
      },
    });

    return "delivered";
  }

  const envelope = {
    id: outboxEvent.id,
    type: toWebhookEventTopic(outboxEvent.eventType),
    version: outboxEvent.eventVersion,
    occurredAt: outboxEvent.createdAt.toISOString(),
    idempotencyKey: outboxEvent.idempotencyKey,
    tenant: {
      orgId: outboxEvent.orgId,
      eventId: outboxEvent.eventId,
    },
    data: outboxEvent.payload,
    metadata: outboxEvent.metadata,
  };

  const rawBody = JSON.stringify(envelope);
  const attemptNumber = outboxEvent.attemptCount + 1;
  const failedEndpointErrors: string[] = [];

  for (const endpoint of endpoints) {
    const timestamp = now().toISOString();
    const signature = signOutboundPayload(
      timestamp,
      rawBody,
      endpoint.activeSigningSecret,
    );

    const startedAt = Date.now();
    let status: WebhookDeliveryStatus = WebhookDeliveryStatus.SUCCESS;
    let httpStatus: number | null = null;
    let responseBody: string | null = null;

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": outboxEvent.id,
          "X-Webhook-Event": toWebhookEventTopic(outboxEvent.eventType),
          "X-Webhook-Timestamp": timestamp,
          "X-Webhook-Key-Id": endpoint.activeSigningKeyId,
          "X-Webhook-Signature": signature,
        },
        body: rawBody,
      });

      httpStatus = response.status;
      responseBody = truncateText(await response.text(), 1_000);

      if (!response.ok) {
        status = WebhookDeliveryStatus.FAILED;
      }
    } catch (error) {
      status = WebhookDeliveryStatus.FAILED;
      responseBody =
        error instanceof Error
          ? truncateText(error.message, 1_000)
          : "Unknown delivery error.";
    }

    await prisma.webhookDeliveryAttempt.create({
      data: {
        outboxEventId: outboxEvent.id,
        endpointId: endpoint.id,
        attemptNumber,
        status,
        httpStatus: httpStatus ?? undefined,
        responseBody: responseBody ?? undefined,
        responseTimeMs: Date.now() - startedAt,
        signatureKeyId: endpoint.activeSigningKeyId,
      },
    });

    if (status === WebhookDeliveryStatus.FAILED) {
      failedEndpointErrors.push(
        `endpoint:${endpoint.id}${httpStatus ? `:http_${httpStatus}` : ""}`,
      );
    }
  }

  if (!failedEndpointErrors.length) {
    await prisma.webhookOutboxEvent.update({
      where: {
        id: outboxEvent.id,
      },
      data: {
        status: WebhookOutboxStatus.DELIVERED,
        deliveredAt: now(),
        attemptCount: attemptNumber,
        nextAttemptAt: now(),
        lastError: null,
      },
    });

    return "delivered";
  }

  const shouldDeadLetter = attemptNumber >= outboxEvent.maxAttempts;

  await prisma.webhookOutboxEvent.update({
    where: {
      id: outboxEvent.id,
    },
    data: {
      status: shouldDeadLetter
        ? WebhookOutboxStatus.DEAD_LETTER
        : WebhookOutboxStatus.PENDING,
      attemptCount: attemptNumber,
      deadLetteredAt: shouldDeadLetter ? now() : null,
      nextAttemptAt: shouldDeadLetter
        ? now()
        : new Date(now().getTime() + getRetryDelayMs(attemptNumber)),
      lastError: failedEndpointErrors.join(","),
    },
  });

  if (shouldDeadLetter) {
    await writeAuditEvent({
      action: "integrations.webhooks.dead_lettered",
      scopeType: outboxEvent.eventId ? ScopeType.EVENT : ScopeType.ORGANIZATION,
      scopeId: outboxEvent.eventId ?? outboxEvent.orgId,
      targetType: "WebhookOutboxEvent",
      targetId: outboxEvent.id,
      reason: "retry_exhausted",
      newValue: {
        attemptCount: attemptNumber,
        maxAttempts: outboxEvent.maxAttempts,
        errors: failedEndpointErrors,
      },
    });

    return "dead_lettered";
  }

  return "retried";
}

async function purgeExpiredWebhookReplayWindow() {
  const cutoff = new Date(now().getTime() - REPLAY_RETENTION_DAYS * 24 * 60 * 60 * 1_000);

  const result = await prisma.webhookOutboxEvent.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
      status: {
        in: [WebhookOutboxStatus.DELIVERED, WebhookOutboxStatus.DEAD_LETTER],
      },
    },
  });

  return result.count;
}

export async function runIntegrationsMaintenance(
  eventId?: string,
): Promise<IntegrationsMaintenanceResult> {
  const dueEvents = await prisma.webhookOutboxEvent.findMany({
    where: {
      status: WebhookOutboxStatus.PENDING,
      nextAttemptAt: {
        lte: now(),
      },
      ...(eventId
        ? {
            eventId,
          }
        : {}),
    },
    orderBy: [
      {
        nextAttemptAt: "asc",
      },
    ],
    take: DELIVERY_BATCH_SIZE,
    select: {
      id: true,
      orgId: true,
      eventId: true,
      eventType: true,
      eventVersion: true,
      idempotencyKey: true,
      payload: true,
      metadata: true,
      attemptCount: true,
      maxAttempts: true,
      createdAt: true,
    },
  });

  const result: IntegrationsMaintenanceResult = {
    processed: 0,
    delivered: 0,
    retried: 0,
    deadLettered: 0,
    purged: 0,
  };

  for (const dueEvent of dueEvents) {
    const outcome = await deliverWebhookOutboxEvent(dueEvent);
    result.processed += 1;

    if (outcome === "delivered") {
      result.delivered += 1;
    } else if (outcome === "retried") {
      result.retried += 1;
    } else if (outcome === "dead_lettered") {
      result.deadLettered += 1;
    }
  }

  result.purged = await purgeExpiredWebhookReplayWindow();

  return result;
}

export async function ingestInboundProviderCallback(
  input: IngestInboundProviderCallbackInput,
): Promise<IngestInboundProviderCallbackResult> {
  const parsed = parseIngestInboundProviderCallbackInput(input);
  const adapter = resolveInboundProviderAdapter(parsed.providerType, parsed.provider);

  const signatureVerified = adapter.verifySignature({
    signature: parsed.signature ?? null,
    rawBody: parsed.rawBody,
    payload: parsed.payload,
  });

  if (!signatureVerified) {
    throw new IntegrationDomainError(
      401,
      "INVALID_SIGNATURE",
      "Inbound callback signature verification failed.",
    );
  }

  const providerEventId =
    parsed.providerEventId ?? adapter.extractProviderEventId(parsed.payload);

  if (!providerEventId) {
    throw new IntegrationDomainError(
      422,
      "PROVIDER_EVENT_ID_MISSING",
      "Inbound callback is missing providerEventId.",
    );
  }

  const resolvedEventType = parsed.eventType ?? adapter.extractEventType(parsed.payload);

  const existing = await prisma.inboundProviderEvent.findUnique({
    where: {
      provider_providerEventId: {
        provider: parsed.provider,
        providerEventId,
      },
    },
  });

  if (existing?.status === InboundProviderEventStatus.PROCESSED) {
    return {
      idempotent: true,
      shouldProcess: false,
      inboundEventId: existing.id,
      providerEventId,
      provider: parsed.provider,
      providerType: parsed.providerType,
    };
  }

  if (existing) {
    await prisma.inboundProviderEvent.update({
      where: {
        id: existing.id,
      },
      data: {
        status: InboundProviderEventStatus.RECEIVED,
        signature: parsed.signature,
        payload: toJsonValue(parsed.payload) ?? ({} as Prisma.InputJsonValue),
        eventType: resolvedEventType,
        errorMessage: null,
        orgId: parsed.orgId,
        eventId: parsed.eventId,
      },
    });

    return {
      idempotent: false,
      shouldProcess: true,
      inboundEventId: existing.id,
      providerEventId,
      provider: parsed.provider,
      providerType: parsed.providerType,
    };
  }

  const created = await prisma.inboundProviderEvent.create({
    data: {
      providerType: parsed.providerType,
      provider: parsed.provider,
      providerEventId,
      eventType: resolvedEventType,
      signature: parsed.signature,
      payload: toJsonValue(parsed.payload) ?? ({} as Prisma.InputJsonValue),
      orgId: parsed.orgId,
      eventId: parsed.eventId,
      status: InboundProviderEventStatus.RECEIVED,
    },
    select: {
      id: true,
    },
  });

  return {
    idempotent: false,
    shouldProcess: true,
    inboundEventId: created.id,
    providerEventId,
    provider: parsed.provider,
    providerType: parsed.providerType,
  };
}

export async function markInboundProviderEventProcessed(
  inboundEventId: string,
  result?: unknown,
) {
  const existing = await prisma.inboundProviderEvent.findUnique({
    where: {
      id: inboundEventId,
    },
    select: {
      id: true,
      provider: true,
      providerEventId: true,
      providerType: true,
      eventId: true,
      orgId: true,
    },
  });

  if (!existing) {
    throw new IntegrationDomainError(
      404,
      "INBOUND_EVENT_NOT_FOUND",
      "Inbound provider event not found.",
    );
  }

  await prisma.inboundProviderEvent.update({
    where: {
      id: existing.id,
    },
    data: {
      status: InboundProviderEventStatus.PROCESSED,
      processedAt: now(),
      errorMessage: null,
    },
  });

  if (existing.eventId) {
    await writeAuditEvent({
      action: "integrations.inbound_callback.processed",
      scopeType: ScopeType.EVENT,
      scopeId: existing.eventId,
      targetType: "InboundProviderEvent",
      targetId: existing.id,
      newValue: {
        providerType: existing.providerType,
        provider: existing.provider,
        providerEventId: existing.providerEventId,
        result: toJsonValue(result),
      },
    });
  }
}

export async function markInboundProviderEventFailed(
  inboundEventId: string,
  errorMessage: string,
) {
  const existing = await prisma.inboundProviderEvent.findUnique({
    where: {
      id: inboundEventId,
    },
    select: {
      id: true,
      eventId: true,
    },
  });

  if (!existing) {
    throw new IntegrationDomainError(
      404,
      "INBOUND_EVENT_NOT_FOUND",
      "Inbound provider event not found.",
    );
  }

  await prisma.inboundProviderEvent.update({
    where: {
      id: existing.id,
    },
    data: {
      status: InboundProviderEventStatus.FAILED,
      errorMessage: truncateText(errorMessage, 1_000),
    },
  });

  if (existing.eventId) {
    await writeAuditEvent({
      action: "integrations.inbound_callback.failed",
      scopeType: ScopeType.EVENT,
      scopeId: existing.eventId,
      targetType: "InboundProviderEvent",
      targetId: existing.id,
      reason: "callback_processing_failure",
      newValue: {
        error: truncateText(errorMessage, 1_000),
      },
    });
  }
}

export async function listInboundProviderEvents(
  eventId: string,
  query: InboundProviderEventListQuery,
) {
  const parsed = parseInboundProviderEventListQuery(query);
  await requireIntegrationReadPermission(eventId, "integrations.inbound_callback.list");
  await loadEventIntegrationContext(eventId);

  const events = await prisma.inboundProviderEvent.findMany({
    where: {
      eventId,
      providerType: parsed.providerType,
      status: parsed.status,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: parsed.take,
    select: {
      id: true,
      providerType: true,
      provider: true,
      providerEventId: true,
      eventType: true,
      status: true,
      createdAt: true,
      processedAt: true,
      errorMessage: true,
    },
  });

  return events.map((event) => toInboundProviderEventListItem(event));
}
