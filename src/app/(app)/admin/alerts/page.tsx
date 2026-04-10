import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { env } from "@/core/env";
import { collectOperationalMetricsSnapshot } from "@/core/ops/metrics-snapshot";

type AlertSignal = {
  code: string;
  severity: "P0" | "P1";
  active: boolean;
  summary: string;
  metricValue: number;
  thresholdValue: number;
};

type AlertAuditRow = {
  id: string;
  reason: string | null;
  createdAt: Date;
  newValue: {
    severity?: string;
    metrics?: Record<string, number>;
    runbookSection?: string;
  } | null;
};

function buildAlertSignals(snapshot: Awaited<ReturnType<typeof collectOperationalMetricsSnapshot>>) {
  const signals: AlertSignal[] = [
    {
      code: "INVENTORY_DRIFT_INVARIANT_VIOLATION",
      severity: "P0",
      active: snapshot.inventory.driftViolationCount > env.OPS_ALERT_INVENTORY_DRIFT_THRESHOLD,
      summary: "Inventory drift invariants exceeded threshold.",
      metricValue: snapshot.inventory.driftViolationCount,
      thresholdValue: env.OPS_ALERT_INVENTORY_DRIFT_THRESHOLD,
    },
    {
      code: "CHECKIN_LATENCY_OR_ERROR_SPIKE",
      severity: "P1",
      active:
        snapshot.checkin.apiLatencyP95Ms > env.OPS_ALERT_CHECKIN_API_P95_MS_THRESHOLD ||
        snapshot.checkin.apiErrorRate > env.OPS_ALERT_CHECKIN_ERROR_RATE_THRESHOLD,
      summary: "Check-in latency p95 or API error rate crossed configured threshold.",
      metricValue: Math.max(snapshot.checkin.apiLatencyP95Ms, snapshot.checkin.apiErrorRate),
      thresholdValue: Math.max(
        env.OPS_ALERT_CHECKIN_API_P95_MS_THRESHOLD,
        env.OPS_ALERT_CHECKIN_ERROR_RATE_THRESHOLD,
      ),
    },
    {
      code: "WEBHOOK_BACKLOG_UNSAFE",
      severity: "P1",
      active:
        snapshot.webhooks.pendingBacklogCount > env.OPS_ALERT_WEBHOOK_BACKLOG_THRESHOLD ||
        snapshot.webhooks.deadLetterCount > env.OPS_ALERT_WEBHOOK_DEAD_LETTER_THRESHOLD,
      summary: "Webhook backlog or dead-letter queue is above operational threshold.",
      metricValue: Math.max(
        snapshot.webhooks.pendingBacklogCount,
        snapshot.webhooks.deadLetterCount,
      ),
      thresholdValue: Math.max(
        env.OPS_ALERT_WEBHOOK_BACKLOG_THRESHOLD,
        env.OPS_ALERT_WEBHOOK_DEAD_LETTER_THRESHOLD,
      ),
    },
    {
      code: "CRITICAL_DEPENDENCY_FAILURE_SUSTAINED",
      severity: "P1",
      active:
        snapshot.dependencies.sustainedFailureCount >
        env.OPS_ALERT_DEPENDENCY_FAILURE_COUNT_THRESHOLD,
      summary: "Critical dependency failure count exceeded threshold.",
      metricValue: snapshot.dependencies.sustainedFailureCount,
      thresholdValue: env.OPS_ALERT_DEPENDENCY_FAILURE_COUNT_THRESHOLD,
    },
  ];

  if (snapshot.ticketing.stuckOrderCount > 0) {
    signals.unshift({
      code: "PAYMENT_CAPTURED_NO_TICKET_ISSUANCE",
      severity: "P0",
      active: true,
      summary: "Captured-payment-to-ticket issuance gap detected.",
      metricValue: snapshot.ticketing.stuckOrderCount,
      thresholdValue: 0,
    });
  }

  return signals;
}

export default async function AdminAlertsPage() {
  const [snapshot, recentAlertEvents] = await Promise.all([
    collectOperationalMetricsSnapshot(),
    prisma.auditEvent.findMany({
      where: {
        action: "ops.alert.triggered",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 80,
      select: {
        id: true,
        reason: true,
        createdAt: true,
        newValue: true,
      },
    }) as Promise<AlertAuditRow[]>,
  ]);

  const alertSignals = buildAlertSignals(snapshot);
  const activeAlerts = alertSignals.filter((signal) => signal.active);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Active Alert Signals</CardTitle>
          <CardDescription>
            Threshold evaluation from the latest {snapshot.windowMinutes}-minute metrics window.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {alertSignals.map((signal) => (
            <article
              key={signal.code}
              className="rounded-xl border border-gray-200 bg-gray-50 p-3"
            >
              <p className="text-sm font-semibold text-gray-900">
                {signal.code} · {signal.severity}
              </p>
              <p className="mt-1 text-xs text-gray-500">{signal.summary}</p>
              <p className="mt-2 text-xs text-gray-500">
                Value: {signal.metricValue.toFixed(4)} · Threshold: {signal.thresholdValue.toFixed(4)}
              </p>
              <p className="mt-2 text-xs font-medium text-gray-900">
                Status: {signal.active ? "ACTIVE" : "clear"}
              </p>
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert Emission History</CardTitle>
          <CardDescription>
            Recent emitted alert audit entries ({recentAlertEvents.length}) · active now ({activeAlerts.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentAlertEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No emitted alert entries recorded yet.</p>
          ) : (
            <div className="max-h-140 space-y-2 overflow-y-auto pr-1">
              {recentAlertEvents.map((entry) => (
                <article key={entry.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {entry.reason ?? "Operational alert triggered"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{entry.createdAt.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Severity: {entry.newValue?.severity ?? "n/a"} · Runbook:{" "}
                    {entry.newValue?.runbookSection ?? "n/a"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
