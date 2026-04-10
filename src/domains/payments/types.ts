import { PayoutStatus, RiskSeverity, RiskStatus } from "@prisma/client";

export type CreateSettlementInput = {
  periodStart?: Date;
  periodEnd?: Date;
  processorFeeRateBps?: number;
};

export type SchedulePayoutInput = {
  settlementIds?: string[];
  reference?: string;
};

export type TransitionPayoutInput = {
  nextStatus: Extract<PayoutStatus, "IN_TRANSIT" | "SETTLED" | "FAILED">;
  reference?: string;
  reason?: string;
};

export type ExecuteOrderRefundInput = {
  amount?: number;
  reason: string;
  overridePolicy?: boolean;
  overrideReasonCode?: string;
};

export type RecordPaymentDisputeInput = {
  paymentAttemptId?: string;
  reason: string;
  severity?: RiskSeverity;
  restrictTicketAccess?: boolean;
  evidence?: unknown;
};

export type UpdatePaymentDisputeWorkflowInput = {
  nextStatus: RiskStatus;
  reason?: string;
};

export type FinancialReconciliationReportInput = {
  periodStart?: Date;
  periodEnd?: Date;
};

export type OrderRefundPolicyDecision = {
  orderId: string;
  currency: string;
  orderTotalAmount: number;
  refundedAmount: number;
  refundableRemaining: number;
  policyWindow: "FULL" | "PARTIAL" | "NONE";
  policyPercent: number;
  reasonCode: string;
  maxRefundAmount: number;
  hoursUntilStart: number;
  sessionCancellation: {
    totalSessions: number;
    cancelledSessions: number;
  };
};

export type FinancialReconciliationReport = {
  eventId: string;
  periodStart: string;
  periodEnd: string;
  orders: {
    completedCount: number;
    subtotalAmount: number;
    taxAmount: number;
    feeAmount: number;
    discountAmount: number;
    totalAmount: number;
  };
  payments: {
    capturedCount: number;
    capturedAmount: number;
    failedCount: number;
  };
  refunds: {
    completedCount: number;
    completedAmount: number;
  };
  settlements: {
    count: number;
    netAmount: number;
    byStatus: Record<string, number>;
  };
  payouts: {
    count: number;
    amount: number;
    byStatus: Record<string, number>;
  };
  disputes: {
    count: number;
    byStatus: Record<string, number>;
  };
  reconciliation: {
    expectedNetFromOrders: number;
    settlementNetRecorded: number;
    variance: number;
  };
};
