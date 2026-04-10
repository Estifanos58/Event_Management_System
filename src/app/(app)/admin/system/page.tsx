import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { collectOperationalMetricsSnapshot } from "@/core/ops/metrics-snapshot";
import { listRunbookHooks } from "@/core/ops/runbook-hooks";

export default async function AdminSystemPage() {
  const [snapshot, runbookHooks, activeSessions, pendingOutboxCount, failedInboundCount] =
    await Promise.all([
      collectOperationalMetricsSnapshot(),
      Promise.resolve(listRunbookHooks()),
      prisma.session.count({
        where: {
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
      prisma.webhookOutboxEvent.count({
        where: {
          status: "PENDING",
        },
      }),
      prisma.inboundProviderEvent.count({
        where: {
          status: "FAILED",
        },
      }),
    ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>
            Runtime snapshot for active sessions, integration backlogs, and platform reliability.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Active sessions</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{activeSessions}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Check-in API p95</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {snapshot.checkin.apiLatencyP95Ms.toFixed(0)} ms
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Outbound webhook backlog</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{pendingOutboxCount}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Failed inbound events</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{failedInboundCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reliability Indicators</CardTitle>
          <CardDescription>Derived from the latest operational metrics snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-500">
          <p>
            <span className="font-medium text-gray-900">Snapshot window:</span>{" "}
            {snapshot.windowMinutes} minutes
          </p>
          <p>
            <span className="font-medium text-gray-900">Dependency sustained failures:</span>{" "}
            {snapshot.dependencies.sustainedFailureCount}
          </p>
          <p>
            <span className="font-medium text-gray-900">Inventory drift violations:</span>{" "}
            {snapshot.inventory.driftViolationCount}
          </p>
          <p>
            <span className="font-medium text-gray-900">Webhook dead letters:</span>{" "}
            {snapshot.webhooks.deadLetterCount}
          </p>
          <p>
            <span className="font-medium text-gray-900">Snapshot generated:</span>{" "}
            {new Date(snapshot.generatedAt).toLocaleString()}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runbook Hooks</CardTitle>
          <CardDescription>Operational playbooks mapped to alert classes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 xl:grid-cols-2">
            {runbookHooks.map((hook) => (
              <article
                key={hook.code}
                className="rounded-xl border border-gray-200 bg-gray-50 p-3"
              >
                <p className="text-sm font-semibold text-gray-900">
                  {hook.code} · {hook.severity}
                </p>
                <p className="mt-1 text-xs text-gray-500">{hook.title}</p>
                <p className="mt-2 text-xs text-gray-500">Trigger: {hook.trigger}</p>
                <p className="mt-2 text-xs text-gray-500">Runbook: {hook.runbookSection}</p>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
