export type ReservationRequestItemInput = {
  ticketClassId: string;
  quantity: number;
  accessCode?: string;
};

export type CreateReservationInput = {
  idempotencyKey: string;
  source?: string;
  ttlMinutes?: number;
  items: ReservationRequestItemInput[];
};

export type JoinWaitlistInput = {
  ticketClassId: string;
};

export type ClaimWaitlistInput = {
  ticketClassId: string;
  idempotencyKey: string;
};

export type CheckoutBuyerInput = {
  name: string;
  email: string;
  phoneNumber?: string;
};

export type CheckoutAttendeeInput = {
  ticketClassId: string;
  attendeeUserId?: string;
  attendeeEmail?: string;
  attendeeName?: string;
};

export type CheckoutInput = {
  buyer: CheckoutBuyerInput;
  attendees: CheckoutAttendeeInput[];
  customFields?: unknown;
  promoCode?: string;
  referralCode?: string;
  invoiceRequested?: boolean;
  checkoutSessionFingerprint?: string;
  allowDuplicatePurchase?: boolean;
};

export type InitializePaymentInput = {
  idempotencyKey: string;
  returnUrl?: string;
  callbackUrl?: string;
};

export type RetryPaymentInput = {
  idempotencyKey: string;
  returnUrl?: string;
};

export type TicketTransferRequestInput = {
  toUserEmail: string;
  expiresInHours?: number;
  reason?: string;
};

export type TicketTransferResponseInput = {
  action: "ACCEPT" | "REJECT";
  reason?: string;
};

export type TicketCancellationInput = {
  reason?: string;
};

export type TicketingMaintenanceResult = {
  expiredReservations: number;
  promotedWaitlistEntries: number;
  expiredTransfers: number;
  expiredWaitlistClaims: number;
  reconciledPaymentAttempts: number;
  rotatedLegacyQrTokens: number;
};

export type PaymentReconciliationResult = {
  checked: number;
  captured: number;
  failed: number;
  unresolved: number;
};
