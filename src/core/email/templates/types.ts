import type { NotificationType } from "@prisma/client";

export type NotificationTemplateRecipient = {
  id: string;
  email: string;
};

export type NotificationEmailTemplateInput = {
  type: NotificationType;
  subject?: string;
  content: string;
  metadata?: unknown;
  recipient: NotificationTemplateRecipient;
};

export type NotificationEmailTemplateOutput = {
  subject: string;
  html: string;
  text: string;
};
