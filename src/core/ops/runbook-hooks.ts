export type OperationalSeverity = "P0" | "P1";

export type RunbookHook = {
  code: string;
  severity: OperationalSeverity;
  title: string;
  trigger: string;
  runbookSection: string;
  immediateActions: string[];
  recoveryActions: string[];
};

const RUNBOOK_HOOKS: Record<string, RunbookHook> = {
  PAYMENT_CAPTURED_NO_TICKET_ISSUANCE: {
    code: "PAYMENT_CAPTURED_NO_TICKET_ISSUANCE",
    severity: "P0",
    title: "Captured payment without issued ticket",
    trigger: "Captured payments exceed ticket issuance threshold window.",
    runbookSection: "Runbook: Webhook Backlog and Reconciliation Lag",
    immediateActions: [
      "Identify blocked consumer and failing error class for payment finalization.",
      "Prioritize payment and ticket issuance processing lanes.",
      "Preserve idempotency and pause risky replay sources until validated.",
    ],
    recoveryActions: [
      "Drain retries in controlled batches.",
      "Run reconciliation for affected payment window.",
      "Confirm exactly-once ticket issuance integrity.",
    ],
  },
  INVENTORY_DRIFT_INVARIANT_VIOLATION: {
    code: "INVENTORY_DRIFT_INVARIANT_VIOLATION",
    severity: "P0",
    title: "Inventory drift invariant violation",
    trigger: "sold + activeHolds + blocked exceeds capacity.",
    runbookSection: "Runbook: Inventory Drift Alert",
    immediateActions: [
      "Freeze affected ticket class sales.",
      "Capture inventory snapshot for root-cause analysis.",
      "Audit reservation expiry and race-path behavior.",
    ],
    recoveryActions: [
      "Apply audited inventory remediation command.",
      "Re-open sales only after invariant checks pass.",
      "Run post-fix concurrency test before closing incident.",
    ],
  },
  CHECKIN_LATENCY_OR_ERROR_SPIKE: {
    code: "CHECKIN_LATENCY_OR_ERROR_SPIKE",
    severity: "P1",
    title: "Check-in latency or error spike",
    trigger: "Check-in API latency p95 or error rate exceeds threshold.",
    runbookSection: "Runbook: Event-Day Check-In Degradation",
    immediateActions: [
      "Switch scanner fleet to offline-capable mode.",
      "Activate gate fallback manual verification policy.",
      "Broadcast operational guidance to gate managers.",
    ],
    recoveryActions: [
      "Restore connectivity and begin sync.",
      "Resolve duplicate conflicts using canonical timestamp policy.",
      "Generate attendance correction report.",
    ],
  },
  WEBHOOK_BACKLOG_UNSAFE: {
    code: "WEBHOOK_BACKLOG_UNSAFE",
    severity: "P1",
    title: "Webhook backlog growth beyond safe threshold",
    trigger: "Pending webhook backlog or dead-letter queue exceeds threshold.",
    runbookSection: "Runbook: Webhook Backlog and Reconciliation Lag",
    immediateActions: [
      "Identify blocked consumers and poison messages.",
      "Scale workers and prioritize payment/ticket events.",
      "Throttle non-critical webhook lanes.",
    ],
    recoveryActions: [
      "Replay dead-letter safely after fix.",
      "Run reconciliation for affected window.",
      "Confirm no duplicate ticket issuance.",
    ],
  },
  CRITICAL_DEPENDENCY_FAILURE_SUSTAINED: {
    code: "CRITICAL_DEPENDENCY_FAILURE_SUSTAINED",
    severity: "P1",
    title: "Critical dependency sustained failure",
    trigger: "Gateway, webhook, or notification dependency failures exceed threshold.",
    runbookSection: "Runbook: Payment Gateway Degradation",
    immediateActions: [
      "Confirm blast radius by provider and region.",
      "Reduce retry pressure to avoid cascading failures.",
      "Show deterministic customer-facing degradation messaging.",
    ],
    recoveryActions: [
      "Drain pending retries in controlled batches.",
      "Reconcile delayed captures and pending orders.",
      "Verify ticket issuance consistency.",
    ],
  },
};

export function listRunbookHooks() {
  return Object.values(RUNBOOK_HOOKS);
}

export function getRunbookHook(code: string) {
  return RUNBOOK_HOOKS[code] ?? null;
}
