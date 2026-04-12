import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
} from "@prisma/client";

export type NotificationAudienceType =
  | "ALL_ATTENDEES"
  | "CHECKED_IN_ATTENDEES"
  | "NOT_CHECKED_IN_ATTENDEES"
  | "TICKET_CLASS_BUYERS";

export type UpdateMyNotificationPreferencesInput = {
  emailEnabled?: unknown;
  smsEnabled?: unknown;
  pushEnabled?: unknown;
  inAppEnabled?: unknown;
  emailConsent?: unknown;
  smsConsent?: unknown;
  pushConsent?: unknown;
  marketingOptIn?: unknown;
};

export type NotificationPreferencesSnapshot = {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  emailConsent: boolean;
  smsConsent: boolean;
  pushConsent: boolean;
  marketingOptIn: boolean;
  updatedAt: string;
};

export type EnqueueTransactionalNotificationInput = {
  type?: unknown;
  userId?: unknown;
  subject?: unknown;
  content?: unknown;
  channels?: unknown;
  idempotencyKey?: unknown;
  scheduledFor?: unknown;
  metadata?: unknown;
  maxAttempts?: unknown;
};

export type SendOrganizerAnnouncementInput = {
  subject?: unknown;
  content?: unknown;
  channels?: unknown;
  audienceType?: unknown;
  ticketClassId?: unknown;
  idempotencyKey?: unknown;
  scheduledFor?: unknown;
  metadata?: unknown;
};

export type ListEventNotificationDeliveriesQuery = {
  type?: unknown;
  channel?: unknown;
  status?: unknown;
  userId?: unknown;
  take?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

export type ListMyNotificationsQuery = {
  status?: unknown;
  type?: unknown;
  take?: unknown;
};

export type NotificationDeliveryListItem = {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  subject?: string;
  content: string;
  recipientAddress?: string;
  scheduledFor: string;
  nextAttemptAt: string;
  attemptCount: number;
  maxAttempts: number;
  failureReason?: string;
  sentAt?: string;
  failedAt?: string;
  eventId?: string;
  userId: string;
  createdAt: string;
};

export type PagedNotificationDeliveryList = {
  items: NotificationDeliveryListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type NotificationsMaintenanceResult = {
  queuedReminders: number;
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  deadLettered: number;
  cancelled: number;
};

export type EnqueueNotificationResult = {
  created: number;
  deduped: number;
};

export type EnqueueSystemNotificationInput = {
  orgId?: string;
  eventId?: string;
  userIds: string[];
  type: NotificationType;
  subject?: string;
  content: string;
  channels?: NotificationChannel[];
  idempotencyKeyBase: string;
  metadata?: unknown;
  scheduledFor?: string | Date;
  maxAttempts?: number;
  createdBy?: string;
};
