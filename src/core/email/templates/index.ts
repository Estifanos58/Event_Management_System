import { NotificationType } from "@prisma/client";
import { renderCheckInAcceptedTemplate } from "@/core/email/templates/checkin-accepted";
import { renderEventStatusChangedTemplate } from "@/core/email/templates/event-status-changed";
import { renderGenericNotificationTemplate } from "@/core/email/templates/generic";
import { renderOrderConfirmationTemplate } from "@/core/email/templates/order-confirmation";
import { renderOrganizationCreatedTemplate } from "@/core/email/templates/organization-created";
import { renderPaymentFailedTemplate } from "@/core/email/templates/payment-failed";
import { renderRefundCompletedTemplate } from "@/core/email/templates/refund";
import { renderRestrictionTemplate } from "@/core/email/templates/restriction";
import { renderStaffAssignedTemplate } from "@/core/email/templates/staff-assigned";
import {
  renderTransferReceivedTemplate,
  renderTransferRequestedTemplate,
  renderTransferUpdatedTemplate,
} from "@/core/email/templates/transfer";
import type {
  NotificationEmailTemplateInput,
  NotificationEmailTemplateOutput,
} from "@/core/email/templates/types";
import { renderWaitlistPromotedTemplate } from "@/core/email/templates/waitlist-promoted";
import { renderWelcomeTemplate } from "@/core/email/templates/welcome";

export async function renderNotificationEmailTemplate(
  input: NotificationEmailTemplateInput,
): Promise<NotificationEmailTemplateOutput> {
  if (input.type === NotificationType.ORDER_CONFIRMATION) {
    return renderOrderConfirmationTemplate(input);
  }

  if (input.type === NotificationType.WELCOME) {
    return renderWelcomeTemplate(input);
  }

  if (input.type === NotificationType.ORGANIZATION_CREATED) {
    return renderOrganizationCreatedTemplate(input);
  }

  if (input.type === NotificationType.TICKET_TRANSFER_REQUESTED) {
    return renderTransferRequestedTemplate(input);
  }

  if (input.type === NotificationType.TICKET_TRANSFER_UPDATED) {
    return renderTransferUpdatedTemplate(input);
  }

  if (input.type === NotificationType.TICKET_TRANSFER_RECEIVED) {
    return renderTransferReceivedTemplate(input);
  }

  if (input.type === NotificationType.REFUND_COMPLETED) {
    return renderRefundCompletedTemplate(input);
  }

  if (input.type === NotificationType.USER_RESTRICTED) {
    return renderRestrictionTemplate(input);
  }

  if (input.type === NotificationType.STAFF_ASSIGNED) {
    return renderStaffAssignedTemplate(input);
  }

  if (input.type === NotificationType.CHECKIN_ACCEPTED) {
    return renderCheckInAcceptedTemplate(input);
  }

  if (input.type === NotificationType.WAITLIST_PROMOTED) {
    return renderWaitlistPromotedTemplate(input);
  }

  if (input.type === NotificationType.PAYMENT_FAILED) {
    return renderPaymentFailedTemplate(input);
  }

  if (input.type === NotificationType.EVENT_STATUS_CHANGED) {
    return renderEventStatusChangedTemplate(input);
  }

  return renderGenericNotificationTemplate(input);
}
