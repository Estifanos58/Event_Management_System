export const paymentsDomain = {
  name: "payments",
  description:
    "Owns order lifecycle, payment attempts, Chapa reconciliation, and exactly-once issuance triggers.",
};

export {
  createSettlementRecord,
  scheduleEventPayout,
  transitionEventPayoutStatus,
  getOrderRefundPolicyDecision,
  executeOrderRefund,
  reconcilePendingRefunds,
  recordPaymentDispute,
  listPaymentDisputes,
  updatePaymentDisputeWorkflow,
  getFinancialReconciliationReport,
} from "@/domains/payments/service";
export {
  initializeOrderPayment,
  processChapaWebhook,
  processChapaCallback,
  retryOrderPayment,
  reconcilePendingPayments,
  getMyOrderPaymentStatus,
  parseInitializePaymentInput,
  parseRetryPaymentInput,
} from "@/domains/ticketing/service";
export type {
  CreateSettlementInput,
  SchedulePayoutInput,
  TransitionPayoutInput,
  ExecuteOrderRefundInput,
  RecordPaymentDisputeInput,
  UpdatePaymentDisputeWorkflowInput,
  FinancialReconciliationReportInput,
  OrderRefundPolicyDecision,
  RefundReconciliationResult,
  FinancialReconciliationReport,
} from "@/domains/payments/types";
export type {
  InitializePaymentInput,
  RetryPaymentInput,
  PaymentReconciliationResult,
  ChapaTransactionProcessResult,
  OrderPaymentStatusSnapshot,
} from "@/domains/ticketing/types";
