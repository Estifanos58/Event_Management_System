import {
  NotificationAttemptStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  type Prisma,
} from "@prisma/client";
import { addDays, addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrderProfile, SeedUserProfile } from "./types";

type NotificationSeedResult = {
  preferences: Prisma.NotificationPreferenceCreateManyInput[];
  deliveries: Prisma.NotificationDeliveryCreateManyInput[];
  attempts: Prisma.NotificationDeliveryAttemptCreateManyInput[];
};

export function buildNotifications(input: {
  now: Date;
  users: SeedUserProfile[];
  events: SeedEventProfile[];
  orders: SeedOrderProfile[];
}): NotificationSeedResult {
  const preferences: Prisma.NotificationPreferenceCreateManyInput[] = input.users.map((user, index) => ({
    id: ids.notificationPreference(index + 1),
    userId: user.id,
    emailEnabled: true,
    smsEnabled: index % 4 === 0,
    pushEnabled: index % 3 !== 0,
    inAppEnabled: true,
    emailConsent: true,
    smsConsent: index % 4 === 0,
    pushConsent: index % 3 !== 0,
    marketingOptIn: index % 5 === 0,
    createdAt: subDays(input.now, 90 - index),
    updatedAt: subDays(input.now, 6 - (index % 5)),
  }));

  const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = [];
  const attempts: Prisma.NotificationDeliveryAttemptCreateManyInput[] = [];

  let deliveryIndex = 1;
  let attemptIndex = 1;

  for (const order of input.orders.slice(0, 80)) {
    const status =
      order.status === "COMPLETED"
        ? NotificationDeliveryStatus.SENT
        : order.status === "FAILED"
          ? NotificationDeliveryStatus.FAILED
          : NotificationDeliveryStatus.PENDING;

    deliveries.push({
      id: ids.notificationDelivery(deliveryIndex),
      orgId: order.orgId,
      eventId: order.eventId,
      userId: order.buyerUserId,
      type: NotificationType.ORDER_CONFIRMATION,
      channel: deliveryIndex % 2 === 0 ? NotificationChannel.EMAIL : NotificationChannel.IN_APP,
      subject: `Order ${order.id} status update`,
      content:
        order.status === "COMPLETED"
          ? "Your order is confirmed and tickets are ready in your attendee workspace."
          : "Your order is still processing. Please check payment details or retry.",
      recipientAddress:
        deliveryIndex % 2 === 0 ? `${order.buyerUserId}@event-demo.local` : null,
      metadata: {
        orderId: order.id,
      },
      status,
      scheduledFor: addHours(order.createdAt, 1),
      nextAttemptAt: addHours(order.createdAt, 2),
      attemptCount: status === NotificationDeliveryStatus.SENT ? 1 : 2,
      maxAttempts: 6,
      sentAt: status === NotificationDeliveryStatus.SENT ? addHours(order.createdAt, 2) : null,
      failedAt: status === NotificationDeliveryStatus.FAILED ? addHours(order.createdAt, 3) : null,
      failureReason: status === NotificationDeliveryStatus.FAILED ? "SMTP provider timeout" : null,
      idempotencyKey: ids.idempotency("notification", deliveryIndex),
      createdBy: null,
      createdAt: order.createdAt,
      updatedAt: addHours(order.createdAt, 3),
    });

    attempts.push({
      id: ids.notificationAttempt(attemptIndex),
      notificationId: ids.notificationDelivery(deliveryIndex),
      attemptNumber: 1,
      status:
        status === NotificationDeliveryStatus.SENT
          ? NotificationAttemptStatus.SENT
          : NotificationAttemptStatus.FAILED,
      provider: deliveryIndex % 2 === 0 ? "sendgrid" : "in-app-broker",
      responseCode: status === NotificationDeliveryStatus.SENT ? "200" : "500",
      responseMessage:
        status === NotificationDeliveryStatus.SENT
          ? "Delivered"
          : "Temporary provider failure",
      createdAt: addHours(order.createdAt, 2),
    });

    attemptIndex += 1;

    if (status === NotificationDeliveryStatus.FAILED) {
      attempts.push({
        id: ids.notificationAttempt(attemptIndex),
        notificationId: ids.notificationDelivery(deliveryIndex),
        attemptNumber: 2,
        status: NotificationAttemptStatus.FAILED,
        provider: deliveryIndex % 2 === 0 ? "sendgrid" : "in-app-broker",
        responseCode: "500",
        responseMessage: "Retry exhausted",
        createdAt: addHours(order.createdAt, 4),
      });

      attemptIndex += 1;
    }

    deliveryIndex += 1;
  }

  for (let reminderIndex = 1; reminderIndex <= 40; reminderIndex += 1) {
    const event = pickCyclic(input.events, reminderIndex);
    const user = pickCyclic(input.users, reminderIndex * 2);
    const status = reminderIndex % 9 === 0 ? NotificationDeliveryStatus.FAILED : NotificationDeliveryStatus.SENT;

    deliveries.push({
      id: ids.notificationDelivery(deliveryIndex),
      orgId: event.orgId,
      eventId: event.id,
      userId: user.id,
      type: reminderIndex % 3 === 0 ? NotificationType.EVENT_UPDATE : NotificationType.EVENT_REMINDER,
      channel: reminderIndex % 2 === 0 ? NotificationChannel.EMAIL : NotificationChannel.IN_APP,
      subject: `${event.title} reminder`,
      content:
        reminderIndex % 3 === 0
          ? "Schedule updated. Review latest agenda details in your event page."
          : "Your event starts soon. Arrive 30 minutes early for check-in.",
      recipientAddress: reminderIndex % 2 === 0 ? user.email : null,
      metadata: {
        reminderWindowHours: 24,
      },
      status,
      scheduledFor: addDays(event.startAt, -1),
      nextAttemptAt: addHours(addDays(event.startAt, -1), 2),
      attemptCount: status === NotificationDeliveryStatus.SENT ? 1 : 2,
      maxAttempts: 6,
      sentAt: status === NotificationDeliveryStatus.SENT ? addHours(addDays(event.startAt, -1), 1) : null,
      failedAt: status === NotificationDeliveryStatus.FAILED ? addHours(addDays(event.startAt, -1), 3) : null,
      failureReason: status === NotificationDeliveryStatus.FAILED ? "Mailbox unavailable" : null,
      idempotencyKey: ids.idempotency("notification", deliveryIndex),
      createdBy: event.createdBy,
      createdAt: addDays(event.startAt, -2),
      updatedAt: addDays(event.startAt, -1),
    });

    attempts.push({
      id: ids.notificationAttempt(attemptIndex),
      notificationId: ids.notificationDelivery(deliveryIndex),
      attemptNumber: 1,
      status:
        status === NotificationDeliveryStatus.SENT
          ? NotificationAttemptStatus.SENT
          : NotificationAttemptStatus.FAILED,
      provider: reminderIndex % 2 === 0 ? "sendgrid" : "in-app-broker",
      responseCode: status === NotificationDeliveryStatus.SENT ? "200" : "429",
      responseMessage:
        status === NotificationDeliveryStatus.SENT
          ? "Delivered"
          : "Rate limited",
      createdAt: addDays(event.startAt, -1),
    });

    attemptIndex += 1;
    deliveryIndex += 1;
  }

  return {
    preferences,
    deliveries,
    attempts,
  };
}
