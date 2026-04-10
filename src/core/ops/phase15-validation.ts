export type Phase15LoadProfile = {
  concurrentBuyers: number;
  reservationThroughputPerMinute: number;
  checkinBurstPerSecond: number;
  notificationBurstMessages: number;
  reservationP95Ms: number;
  checkoutToPaymentInitP95Ms: number;
  ticketIssuanceP95Seconds: number;
  checkinValidationP95Ms: number;
};

export type Phase15FailureRecoveryProfile = {
  paymentGatewayTimeoutInjected: boolean;
  webhookConsumerFailureInjected: boolean;
  notificationDependencyFailureInjected: boolean;
  alertingValidated: boolean;
  backlogRecoveredMinutes: number;
  reconciliationCompleted: boolean;
  duplicateTicketIssuanceDetected: boolean;
};

export type Phase15ContinuityProfile = {
  rtoMinutes: number;
  rpoMinutes: number;
  degradedCheckinModeActivated: boolean;
  manualGateFallbackActivated: boolean;
  offlineSyncConvergenceMinutes: number;
};

export type Phase15ValidationInput = {
  profileName: string;
  observedAt: string;
  load: Phase15LoadProfile;
  failureRecovery: Phase15FailureRecoveryProfile;
  continuity: Phase15ContinuityProfile;
};

export type Phase15ValidationCheck = {
  id: string;
  requirement: string;
  expected: string;
  actual: string;
  passed: boolean;
};

export type Phase15ValidationSection = {
  section: string;
  passed: boolean;
  checks: Phase15ValidationCheck[];
};

export type Phase15ValidationReport = {
  generatedAt: string;
  profileName: string;
  observedAt: string;
  passed: boolean;
  sections: Phase15ValidationSection[];
  failedChecks: Phase15ValidationCheck[];
};

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "NaN";
  }

  return Number(value.toFixed(digits)).toString();
}

function makeNumericCheck(input: {
  id: string;
  requirement: string;
  actualValue: number;
  operator: "<=" | ">=";
  threshold: number;
  unit: string;
}) {
  const passed =
    input.operator === "<="
      ? input.actualValue <= input.threshold
      : input.actualValue >= input.threshold;

  return {
    id: input.id,
    requirement: input.requirement,
    expected: `${input.operator} ${formatNumber(input.threshold)} ${input.unit}`,
    actual: `${formatNumber(input.actualValue)} ${input.unit}`,
    passed,
  } satisfies Phase15ValidationCheck;
}

function makeBooleanCheck(input: {
  id: string;
  requirement: string;
  actualValue: boolean;
  expectedValue: boolean;
}) {
  return {
    id: input.id,
    requirement: input.requirement,
    expected: String(input.expectedValue),
    actual: String(input.actualValue),
    passed: input.actualValue === input.expectedValue,
  } satisfies Phase15ValidationCheck;
}

function evaluateLoadProfile(load: Phase15LoadProfile) {
  const checks: Phase15ValidationCheck[] = [
    makeNumericCheck({
      id: "load.concurrent_buyers",
      requirement: "Peak concurrent buyers for a high-demand event",
      actualValue: load.concurrentBuyers,
      operator: ">=",
      threshold: 10_000,
      unit: "buyers",
    }),
    makeNumericCheck({
      id: "load.reservation_throughput",
      requirement: "Burst reservation throughput",
      actualValue: load.reservationThroughputPerMinute,
      operator: ">=",
      threshold: 2_000,
      unit: "requests/min",
    }),
    makeNumericCheck({
      id: "load.checkin_burst",
      requirement: "Check-in burst throughput",
      actualValue: load.checkinBurstPerSecond,
      operator: ">=",
      threshold: 100,
      unit: "scans/sec",
    }),
    makeNumericCheck({
      id: "load.notification_burst",
      requirement: "Transactional notification burst handling",
      actualValue: load.notificationBurstMessages,
      operator: ">=",
      threshold: 100_000,
      unit: "messages",
    }),
    makeNumericCheck({
      id: "load.reservation_p95",
      requirement: "Reservation creation p95 latency",
      actualValue: load.reservationP95Ms,
      operator: "<=",
      threshold: 400,
      unit: "ms",
    }),
    makeNumericCheck({
      id: "load.checkout_payment_init_p95",
      requirement: "Checkout submit to payment-init p95 latency",
      actualValue: load.checkoutToPaymentInitP95Ms,
      operator: "<=",
      threshold: 700,
      unit: "ms",
    }),
    makeNumericCheck({
      id: "load.ticket_issuance_p95",
      requirement: "Ticket issuance after payment capture p95",
      actualValue: load.ticketIssuanceP95Seconds,
      operator: "<=",
      threshold: 60,
      unit: "seconds",
    }),
    makeNumericCheck({
      id: "load.checkin_validation_p95",
      requirement: "Check-in validation p95 latency",
      actualValue: load.checkinValidationP95Ms,
      operator: "<=",
      threshold: 250,
      unit: "ms",
    }),
  ];

  return {
    section: "Load Profile",
    passed: checks.every((check) => check.passed),
    checks,
  } satisfies Phase15ValidationSection;
}

function evaluateFailureRecovery(profile: Phase15FailureRecoveryProfile) {
  const checks: Phase15ValidationCheck[] = [
    makeBooleanCheck({
      id: "failure.payment_gateway_timeout_injected",
      requirement: "Payment gateway timeout failure mode exercised",
      actualValue: profile.paymentGatewayTimeoutInjected,
      expectedValue: true,
    }),
    makeBooleanCheck({
      id: "failure.webhook_consumer_failure_injected",
      requirement: "Webhook consumer failure mode exercised",
      actualValue: profile.webhookConsumerFailureInjected,
      expectedValue: true,
    }),
    makeBooleanCheck({
      id: "failure.notification_dependency_failure_injected",
      requirement: "Notification dependency failure mode exercised",
      actualValue: profile.notificationDependencyFailureInjected,
      expectedValue: true,
    }),
    makeBooleanCheck({
      id: "failure.alerting_validated",
      requirement: "Operational alerting validated during failure drills",
      actualValue: profile.alertingValidated,
      expectedValue: true,
    }),
    makeNumericCheck({
      id: "failure.backlog_recovery",
      requirement: "Queue backlog recovery after dependency outage",
      actualValue: profile.backlogRecoveredMinutes,
      operator: "<=",
      threshold: 120,
      unit: "minutes",
    }),
    makeBooleanCheck({
      id: "failure.reconciliation_completed",
      requirement: "Reconciliation run completed after recovery",
      actualValue: profile.reconciliationCompleted,
      expectedValue: true,
    }),
    makeBooleanCheck({
      id: "failure.no_duplicate_issuance",
      requirement: "No duplicate ticket issuance during replay/recovery",
      actualValue: profile.duplicateTicketIssuanceDetected,
      expectedValue: false,
    }),
  ];

  return {
    section: "Failure and Recovery",
    passed: checks.every((check) => check.passed),
    checks,
  } satisfies Phase15ValidationSection;
}

function evaluateContinuity(profile: Phase15ContinuityProfile) {
  const checks: Phase15ValidationCheck[] = [
    makeNumericCheck({
      id: "continuity.rto",
      requirement: "Critical outage Recovery Time Objective",
      actualValue: profile.rtoMinutes,
      operator: "<=",
      threshold: 60,
      unit: "minutes",
    }),
    makeNumericCheck({
      id: "continuity.rpo",
      requirement: "Transactional Recovery Point Objective",
      actualValue: profile.rpoMinutes,
      operator: "<=",
      threshold: 5,
      unit: "minutes",
    }),
    makeBooleanCheck({
      id: "continuity.degraded_checkin_mode",
      requirement: "Event-day degraded check-in mode activated",
      actualValue: profile.degradedCheckinModeActivated,
      expectedValue: true,
    }),
    makeBooleanCheck({
      id: "continuity.manual_gate_fallback",
      requirement: "Manual gate fallback procedure activated",
      actualValue: profile.manualGateFallbackActivated,
      expectedValue: true,
    }),
    makeNumericCheck({
      id: "continuity.offline_sync_convergence",
      requirement: "Offline check-in sync convergence after restore",
      actualValue: profile.offlineSyncConvergenceMinutes,
      operator: "<=",
      threshold: 5,
      unit: "minutes",
    }),
  ];

  return {
    section: "Business Continuity",
    passed: checks.every((check) => check.passed),
    checks,
  } satisfies Phase15ValidationSection;
}

export function buildPhase15ValidationReport(
  input: Phase15ValidationInput,
): Phase15ValidationReport {
  const sections = [
    evaluateLoadProfile(input.load),
    evaluateFailureRecovery(input.failureRecovery),
    evaluateContinuity(input.continuity),
  ];
  const failedChecks = sections.flatMap((section) =>
    section.checks.filter((check) => !check.passed),
  );

  return {
    generatedAt: new Date().toISOString(),
    profileName: input.profileName,
    observedAt: input.observedAt,
    passed: failedChecks.length === 0,
    sections,
    failedChecks,
  };
}
