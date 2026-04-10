export const notificationsDomain = {
  name: "notifications",
  description:
    "Owns transactional messaging, organizer announcements, channel consent preferences, and delivery retry/dead-letter flows.",
};

export {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  listMyNotifications,
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
  EnqueueTransactionalNotificationInput,
  SendOrganizerAnnouncementInput,
  ListEventNotificationDeliveriesQuery,
  ListMyNotificationsQuery,
  NotificationDeliveryListItem,
  NotificationsMaintenanceResult,
  EnqueueNotificationResult,
} from "@/domains/notifications/types";
