import {
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
  WebhookEventType,
  WebhookOutboxStatus,
  type Prisma,
} from "@prisma/client";
import { addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrganizationProfile, SeedUserProfile } from "./types";

type WebhookSeedResult = {
  endpoints: Prisma.WebhookEndpointCreateManyInput[];
  outboxEvents: Prisma.WebhookOutboxEventCreateManyInput[];
  deliveryAttempts: Prisma.WebhookDeliveryAttemptCreateManyInput[];
};

const EVENT_TYPES = [
  WebhookEventType.ORDER_COMPLETED,
  WebhookEventType.PAYMENT_CAPTURED,
  WebhookEventType.TICKET_ISSUED,
  WebhookEventType.TICKET_CHECKED_IN,
  WebhookEventType.EVENT_PUBLISHED,
  WebhookEventType.EVENT_CANCELLED,
  WebhookEventType.RESERVATION_EXPIRED,
] as const;

export function buildWebhooks(input: {
  now: Date;
  organizations: SeedOrganizationProfile[];
  events: SeedEventProfile[];
  users: SeedUserProfile[];
}): WebhookSeedResult {
  const endpoints: Prisma.WebhookEndpointCreateManyInput[] = [];
  const outboxEvents: Prisma.WebhookOutboxEventCreateManyInput[] = [];
  const deliveryAttempts: Prisma.WebhookDeliveryAttemptCreateManyInput[] = [];

  const organizerUsers = input.users.filter((user) => user.group === "ORGANIZER");

  for (let index = 1; index <= 12; index += 1) {
    const organization = pickCyclic(input.organizations, index - 1);
    const event = pickCyclic(input.events, index - 1);
    const creator = pickCyclic(organizerUsers, index - 1);

    endpoints.push({
      id: ids.webhookEndpoint(index),
      orgId: organization.id,
      eventId: index % 3 === 0 ? event.id : null,
      name: `${organization.displayName} Webhook ${index}`,
      url: `https://hooks.event-demo.local/${organization.id}/${index}`,
      status:
        index % 8 === 0
          ? WebhookEndpointStatus.DISABLED
          : index % 5 === 0
            ? WebhookEndpointStatus.PAUSED
            : WebhookEndpointStatus.ACTIVE,
      subscribedEventTypes: EVENT_TYPES,
      activeSigningKeyId: `key_live_${index}`,
      activeSigningSecret: `secret_live_${index}`,
      previousSigningKeyId: index % 4 === 0 ? `key_prev_${index}` : null,
      previousSigningSecret: index % 4 === 0 ? `secret_prev_${index}` : null,
      lastRotatedAt: index % 4 === 0 ? subDays(input.now, 18 - index) : null,
      createdBy: creator.id,
      createdAt: subDays(input.now, 90 - index),
      updatedAt: subDays(input.now, 8 - (index % 4)),
    });
  }

  let deliveryAttemptIndex = 1;

  for (let index = 1; index <= 30; index += 1) {
    const organization = pickCyclic(input.organizations, index - 1);
    const event = pickCyclic(input.events, index + 1);
    const status =
      index % 7 === 0
        ? WebhookOutboxStatus.DEAD_LETTER
        : index % 3 === 0
          ? WebhookOutboxStatus.PENDING
          : WebhookOutboxStatus.DELIVERED;

    outboxEvents.push({
      id: ids.webhookOutbox(index),
      orgId: organization.id,
      eventId: event.id,
      eventType: pickCyclic([...EVENT_TYPES], index - 1),
      eventVersion: 1,
      idempotencyKey: ids.idempotency("webhook_outbox", index),
      payload: {
        eventId: event.id,
        organizationId: organization.id,
        occurredAt: addHours(event.startAt, index % 10).toISOString(),
      },
      metadata: {
        source: "seed",
      },
      status,
      attemptCount: status === WebhookOutboxStatus.DELIVERED ? 1 : status === WebhookOutboxStatus.DEAD_LETTER ? 4 : 2,
      maxAttempts: 8,
      nextAttemptAt: addHours(input.now, index % 6),
      lastError:
        status === WebhookOutboxStatus.DEAD_LETTER
          ? "Maximum retries exceeded"
          : status === WebhookOutboxStatus.PENDING
            ? "Endpoint timed out"
            : null,
      deadLetteredAt: status === WebhookOutboxStatus.DEAD_LETTER ? addHours(input.now, -2) : null,
      deliveredAt: status === WebhookOutboxStatus.DELIVERED ? addHours(input.now, -4) : null,
      createdAt: subDays(input.now, 20 - (index % 10)),
      updatedAt: addHours(subDays(input.now, 20 - (index % 10)), 6),
    });

    const endpointId = ids.webhookEndpoint(((index - 1) % 12) + 1);

    deliveryAttempts.push({
      id: ids.webhookDeliveryAttempt(deliveryAttemptIndex),
      outboxEventId: ids.webhookOutbox(index),
      endpointId,
      attemptNumber: 1,
      status:
        status === WebhookOutboxStatus.DELIVERED
          ? WebhookDeliveryStatus.SUCCESS
          : WebhookDeliveryStatus.FAILED,
      httpStatus: status === WebhookOutboxStatus.DELIVERED ? 200 : 500,
      responseBody:
        status === WebhookOutboxStatus.DELIVERED
          ? "ok"
          : "upstream gateway timeout",
      responseTimeMs: 140 + (index % 60),
      signatureKeyId: `key_live_${((index - 1) % 12) + 1}`,
      createdAt: addHours(subDays(input.now, 20 - (index % 10)), 1),
    });

    deliveryAttemptIndex += 1;

    if (status !== WebhookOutboxStatus.DELIVERED) {
      deliveryAttempts.push({
        id: ids.webhookDeliveryAttempt(deliveryAttemptIndex),
        outboxEventId: ids.webhookOutbox(index),
        endpointId,
        attemptNumber: 2,
        status:
          status === WebhookOutboxStatus.DEAD_LETTER
            ? WebhookDeliveryStatus.FAILED
            : WebhookDeliveryStatus.SUCCESS,
        httpStatus: status === WebhookOutboxStatus.DEAD_LETTER ? 500 : 200,
        responseBody:
          status === WebhookOutboxStatus.DEAD_LETTER
            ? "retry failed"
            : "recovered",
        responseTimeMs: 180 + (index % 80),
        signatureKeyId: `key_live_${((index - 1) % 12) + 1}`,
        createdAt: addHours(subDays(input.now, 20 - (index % 10)), 2),
      });

      deliveryAttemptIndex += 1;
    }
  }

  return {
    endpoints,
    outboxEvents,
    deliveryAttempts,
  };
}
