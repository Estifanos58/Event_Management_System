export const notificationsDomain = {
  name: "notifications",
  description:
    "Owns transactional messaging, organizer announcements, channel consent preferences, and delivery retry/dead-letter flows.",
};

export {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  listMyNotifications,
  enqueueSystemNotification,
  enqueueTransactionalNotification,
  sendOrganizerAnnouncement,
  listEventNotificationDeliveries,
  enqueueOrderConfirmationNotification,
  runNotificationsMaintenance,
} from "@/domains/notifications/service";

export {
  NotificationDomainError,
  toNotificationErrorResponse,
  type NotificationDomainErrorCode,
} from "@/domains/notifications/errors";

export type {
  NotificationAudienceType,
  UpdateMyNotificationPreferencesInput,
  NotificationPreferencesSnapshot,
  EnqueueSystemNotificationInput,
  EnqueueTransactionalNotificationInput,
  SendOrganizerAnnouncementInput,
  ListEventNotificationDeliveriesQuery,
  ListMyNotificationsQuery,
  NotificationDeliveryListItem,
  NotificationsMaintenanceResult,
  EnqueueNotificationResult,
} from "@/domains/notifications/types";
