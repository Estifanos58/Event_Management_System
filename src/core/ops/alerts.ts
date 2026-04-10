import { ScopeType } from "@prisma/client";
import { env } from "@/core/env";
import { collectOperationalMetricsSnapshot } from "@/core/ops/metrics-snapshot";
import { getRunbookHook, listRunbookHooks, type OperationalSeverity } from "@/core/ops/runbook-hooks";
import { logWarn } from "@/core/observability/logger";
import { redis } from "@/core/redis/client";
import { writeAuditEvent } from "@/core/audit/audit";

export type OperationalAlert = {
  code: string;
  severity: OperationalSeverity;
  summary: string;
  detectedAt: string;
  runbook: {
    section: string;
    immediateActions: string[];
    recoveryActions: string[];
  };
  metrics: Record<string, number>;
};

const localSuppressionCache = new Map<string, number>();
let redisConnectPromise: Promise<void> | null = null;

async function ensureRedisConnected() {
  if (redis.status === "ready" || redis.status === "connecting") {
    return;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redis.connect().catch(() => {
      // Ignore redis unavailability.
    });
  }

  await redisConnectPromise;
}

async function shouldEmitAlert(code: string, force: boolean) {
  if (force) {
    return true;
  }

  const nowMs = Date.now();
  const localSuppressedUntil = localSuppressionCache.get(code) ?? 0;

  if (localSuppressedUntil > nowMs) {
    return false;
  }

  const ttlSeconds = env.OPS_ALERT_SUPPRESSION_SECONDS;
  localSuppressionCache.set(code, nowMs + ttlSeconds * 1000);

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      const redisResult = await redis.set(
        `ops:alerts:suppress:${code}`,
        "1",
        "EX",
        ttlSeconds,
        "NX",
      );

      return redisResult === "OK";
    }
  } catch {
    return true;
  }

  return true;
}

function buildAlert(input: {
  code: string;
  severity: OperationalSeverity;
  summary: string;
  metrics: Record<string, number>;
}) {
  const hook = getRunbookHook(input.code);

  return {
    code: input.code,
    severity: input.severity,
    summary: input.summary,
    detectedAt: new Date().toISOString(),
    runbook: {
      section: hook?.runbookSection ?? "Runbook mapping missing",
      immediateActions: hook?.immediateActions ?? [],
      recoveryActions: hook?.recoveryActions ?? [],
    },
    metrics: input.metrics,
  } satisfies OperationalAlert;
}

function evaluateOperationalAlerts(snapshot: Awaited<ReturnType<typeof collectOperationalMetricsSnapshot>>) {
  const alerts: OperationalAlert[] = [];

  if (snapshot.ticketing.stuckOrderCount > 0) {
    alerts.push(
      buildAlert({
        code: "PAYMENT_CAPTURED_NO_TICKET_ISSUANCE",
        severity: "P0",
        summary: "Detected captured payments without issued tickets beyond threshold window.",
        metrics: {
          stuckOrderCount: snapshot.ticketing.stuckOrderCount,
          issuanceLagP95Ms: snapshot.ticketing.issuanceLagP95Ms,
        },
      }),
    );
  }

  if (snapshot.inventory.driftViolationCount > env.OPS_ALERT_INVENTORY_DRIFT_THRESHOLD) {
    alerts.push(
      buildAlert({
        code: "INVENTORY_DRIFT_INVARIANT_VIOLATION",
        severity: "P0",
        summary: "Inventory drift invariant violation detected.",
        metrics: {
          driftViolationCount: snapshot.inventory.driftViolationCount,
        },
      }),
    );
  }

  if (
    snapshot.checkin.apiLatencyP95Ms > env.OPS_ALERT_CHECKIN_API_P95_MS_THRESHOLD ||
    snapshot.checkin.apiErrorRate > env.OPS_ALERT_CHECKIN_ERROR_RATE_THRESHOLD
  ) {
    alerts.push(
      buildAlert({
        code: "CHECKIN_LATENCY_OR_ERROR_SPIKE",
        severity: "P1",
        summary: "Check-in latency or error rate exceeded configured threshold.",
        metrics: {
          apiLatencyP95Ms: snapshot.checkin.apiLatencyP95Ms,
          apiErrorRate: snapshot.checkin.apiErrorRate,
        },
      }),
    );
  }

  if (
    snapshot.webhooks.pendingBacklogCount > env.OPS_ALERT_WEBHOOK_BACKLOG_THRESHOLD ||
    snapshot.webhooks.deadLetterCount > env.OPS_ALERT_WEBHOOK_DEAD_LETTER_THRESHOLD
  ) {
    alerts.push(
      buildAlert({
        code: "WEBHOOK_BACKLOG_UNSAFE",
        severity: "P1",
        summary: "Webhook backlog exceeded safe threshold.",
        metrics: {
          pendingBacklogCount: snapshot.webhooks.pendingBacklogCount,
          deadLetterCount: snapshot.webhooks.deadLetterCount,
        },
      }),
    );
  }

  if (
    snapshot.dependencies.sustainedFailureCount >
    env.OPS_ALERT_DEPENDENCY_FAILURE_COUNT_THRESHOLD
  ) {
    alerts.push(
      buildAlert({
        code: "CRITICAL_DEPENDENCY_FAILURE_SUSTAINED",
        severity: "P1",
        summary: "Critical dependency failures exceeded threshold in the active metrics window.",
        metrics: {
          sustainedFailureCount: snapshot.dependencies.sustainedFailureCount,
        },
      }),
    );
  }

  return alerts;
}

export async function runOperationalAlertSweep(options?: {
  forceEmit?: boolean;
  windowMinutes?: number;
}) {
  const snapshot = await collectOperationalMetricsSnapshot({
    windowMinutes: options?.windowMinutes,
  });
  const candidateAlerts = evaluateOperationalAlerts(snapshot);

  const emittedAlerts: OperationalAlert[] = [];
  const suppressedAlerts: OperationalAlert[] = [];

  for (const alert of candidateAlerts) {
    const emit = await shouldEmitAlert(alert.code, Boolean(options?.forceEmit));

    if (!emit) {
      suppressedAlerts.push(alert);
      continue;
    }

    emittedAlerts.push(alert);

    logWarn("ops.alert.triggered", {
      code: alert.code,
      severity: alert.severity,
      summary: alert.summary,
      metrics: alert.metrics,
      runbookSection: alert.runbook.section,
    });

    await writeAuditEvent({
      action: "ops.alert.triggered",
      scopeType: ScopeType.PLATFORM,
      scopeId: "platform",
      targetType: "OperationalAlert",
      targetId: `${alert.code}:${Date.now()}`,
      reason: alert.summary,
      newValue: {
        severity: alert.severity,
        metrics: alert.metrics,
        runbookSection: alert.runbook.section,
        immediateActions: alert.runbook.immediateActions,
        recoveryActions: alert.runbook.recoveryActions,
      },
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    snapshot,
    alerts: candidateAlerts,
    emittedAlerts,
    suppressedAlerts,
    runbookHooks: listRunbookHooks(),
  };
}
