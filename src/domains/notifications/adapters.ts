import { NotificationChannel, NotificationType, type Prisma } from "@prisma/client";
import { sendEmail } from "@/core/email/sender";
import { renderNotificationEmailTemplate } from "@/core/email/templates";

type NotificationDispatchInput = {
  type: NotificationType;
  subject?: string;
  content: string;
  metadata?: Prisma.JsonValue;
  recipientAddress?: string;
  user: {
    id: string;
    email: string;
  };
};

export type NotificationDispatchResult = {
  success: boolean;
  provider: string;
  responseCode?: string;
  responseMessage?: string;
  resolvedRecipientAddress?: string;
};

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveRecipientAddress(
  channel: NotificationChannel,
  input: NotificationDispatchInput,
) {
  if (channel === NotificationChannel.EMAIL) {
    return normalizeOptionalText(input.recipientAddress) ?? input.user.email;
  }

  return normalizeOptionalText(input.recipientAddress);
}

export async function dispatchNotificationChannel(
  channel: NotificationChannel,
  input: NotificationDispatchInput,
): Promise<NotificationDispatchResult> {
  const resolvedRecipientAddress = resolveRecipientAddress(channel, input);

  if (channel === NotificationChannel.IN_APP) {
    return {
      success: true,
      provider: "INTERNAL_IN_APP",
      responseCode: "IN_APP_QUEUED",
      responseMessage: "In-app notification stored.",
      resolvedRecipientAddress,
    };
  }

  if (channel === NotificationChannel.PUSH) {
    return {
      success: true,
      provider: "INTERNAL_PUSH",
      responseCode: "PUSH_QUEUED",
      responseMessage: "Push notification queued.",
      resolvedRecipientAddress,
    };
  }

  if (channel === NotificationChannel.EMAIL) {
    if (!resolvedRecipientAddress || !resolvedRecipientAddress.includes("@")) {
      return {
        success: false,
        provider: "GMAIL_SMTP",
        responseCode: "EMAIL_ADDRESS_MISSING",
        responseMessage: "Recipient email is unavailable.",
      };
    }

    const rendered = await renderNotificationEmailTemplate({
      type: input.type,
      subject: input.subject,
      content: input.content,
      metadata: input.metadata,
      recipient: input.user,
    });

    const sendResult = await sendEmail({
      to: resolvedRecipientAddress,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    return {
      success: sendResult.success,
      provider: sendResult.provider,
      responseCode: sendResult.responseCode,
      responseMessage: sendResult.responseMessage,
      resolvedRecipientAddress,
    };
  }

  if (!resolvedRecipientAddress) {
    return {
      success: false,
      provider: "INTERNAL_SMS",
      responseCode: "SMS_ADDRESS_MISSING",
      responseMessage: "Recipient phone number is unavailable.",
    };
  }

  return {
    success: true,
    provider: "INTERNAL_SMS",
    responseCode: "SMS_QUEUED",
    responseMessage: "SMS notification queued.",
    resolvedRecipientAddress,
  };
}
