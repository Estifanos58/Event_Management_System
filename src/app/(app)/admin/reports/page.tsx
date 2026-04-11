import { CheckInStatus, PaymentAttemptStatus } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminReportsCharts } from "@/components/admin/charts/admin-reports-charts";
import { prisma } from "@/core/db/prisma";
import { collectOperationalMetricsSnapshot } from "@/core/ops/metrics-snapshot";

const TREND_DAYS = 30;

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function AdminReportsPage() {
  const snapshot = await collectOperationalMetricsSnapshot();
  const generatedAt = new Date(snapshot.generatedAt);
  const windowStart = new Date(generatedAt.getTime() - snapshot.windowMinutes * 60_000);
  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1));
  trendStart.setHours(0, 0, 0, 0);

  const [
    ordersInWindow,
    paymentsInWindow,
    checkInsInWindow,
    exportsInWindow,
    ordersInTrend,
    paymentsInTrend,
    checkinsInTrend,
    exportsInTrend,
    providerRegionPayments,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        createdAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.paymentAttempt.count({
      where: {
        createdAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.checkInEvent.count({
      where: {
        scannedAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.dataExportJob.count({
      where: {
        createdAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: trendStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.paymentAttempt.findMany({
      where: {
        createdAt: {
          gte: trendStart,
        },
      },
      select: {
        createdAt: true,
        status: true,
      },
    }),
    prisma.checkInEvent.findMany({
      where: {
        scannedAt: {
          gte: trendStart,
        },
      },
      select: {
        scannedAt: true,
        status: true,
      },
    }),
    prisma.dataExportJob.findMany({
      where: {
        createdAt: {
          gte: trendStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.paymentAttempt.findMany({
      where: {
        updatedAt: {
          gte: trendStart,
        },
        status: {
          in: [PaymentAttemptStatus.CAPTURED, PaymentAttemptStatus.FAILED],
        },
      },
      select: {
        provider: true,
        status: true,
        order: {
          select: {
            event: {
              select: {
                organization: {
                  select: {
                    region: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const trendSeed = new Map<
    string,
    {
      day: string;
      orders: number;
      payments: number;
      checkins: number;
      exports: number;
      totalOps: number;
      failedPayments: number;
      rejectedCheckins: number;
    }
  >();

  for (let index = 0; index < TREND_DAYS; index += 1) {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);

    trendSeed.set(toDayKey(date), {
      day: toDayLabel(date),
      orders: 0,
      payments: 0,
      checkins: 0,
      exports: 0,
      totalOps: 0,
      failedPayments: 0,
      rejectedCheckins: 0,
    });
  }

  for (const order of ordersInTrend) {
    const bucket = trendSeed.get(toDayKey(order.createdAt));
    if (!bucket) {
      continue;
    }

    bucket.orders += 1;
    bucket.totalOps += 1;
  }

  for (const payment of paymentsInTrend) {
    const bucket = trendSeed.get(toDayKey(payment.createdAt));
    if (!bucket) {
      continue;
    }

    bucket.payments += 1;
    bucket.totalOps += 1;

    if (payment.status === PaymentAttemptStatus.FAILED) {
      bucket.failedPayments += 1;
    }
  }

  for (const checkin of checkinsInTrend) {
    const bucket = trendSeed.get(toDayKey(checkin.scannedAt));
    if (!bucket) {
      continue;
    }

    bucket.checkins += 1;
    bucket.totalOps += 1;

    if (checkin.status === CheckInStatus.REJECTED) {
      bucket.rejectedCheckins += 1;
    }
  }

  for (const exportJob of exportsInTrend) {
    const bucket = trendSeed.get(toDayKey(exportJob.createdAt));
    if (!bucket) {
      continue;
    }

    bucket.exports += 1;
    bucket.totalOps += 1;
  }

  const providerRegionMap = new Map<
    string,
    {
      label: string;
      success: number;
      failure: number;
    }
  >();

  for (const attempt of providerRegionPayments) {
    const region = attempt.order.event.organization.region || "UNKNOWN";
    const label = `${attempt.provider}-${region}`;
    const record = providerRegionMap.get(label) ?? {
      label,
      success: 0,
      failure: 0,
    };

    if (attempt.status === PaymentAttemptStatus.CAPTURED) {
      record.success += 1;
    } else {
      record.failure += 1;
    }

    providerRegionMap.set(label, record);
  }

  const providerRegionPerformance = Array.from(providerRegionMap.values())
    .sort((left, right) => {
      const leftTotal = left.success + left.failure;
      const rightTotal = right.success + right.failure;

      return rightTotal - leftTotal;
    })
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Operational Reports</CardTitle>
          <CardDescription>
            Cross-domain metrics for the last {snapshot.windowMinutes} minute reporting window.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Reservation conversion</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {(snapshot.reservations.conversionRate * 100).toFixed(2)}%
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {snapshot.reservations.confirmedCount} of {snapshot.reservations.createdCount}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Payment failure rate</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {paymentsInWindow > 0
                ? ((snapshot.payments.failureCount / paymentsInWindow) * 100).toFixed(2)
                : "0.00"}
              %
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {snapshot.payments.failureCount} failed of {paymentsInWindow} attempts
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Check-in rejection rate</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {(snapshot.checkin.rejectionRate * 100).toFixed(2)}%
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {snapshot.checkin.rejectedCount} rejected · {checkInsInWindow} scans
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Webhook backlog</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {snapshot.webhooks.pendingBacklogCount}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Dead letters: {snapshot.webhooks.deadLetterCount}
            </p>
          </div>
        </CardContent>
      </Card>

      <AdminReportsCharts
        dailyVolumes={Array.from(trendSeed.values())}
        providerRegionPerformance={providerRegionPerformance}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Window Volume Summary</CardTitle>
            <CardDescription>Raw platform throughput across major operational surfaces.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-500">
            <p>
              <span className="font-medium text-gray-900">Orders created:</span> {ordersInWindow}
            </p>
            <p>
              <span className="font-medium text-gray-900">Payment attempts:</span> {paymentsInWindow}
            </p>
            <p>
              <span className="font-medium text-gray-900">Check-in scans:</span> {checkInsInWindow}
            </p>
            <p>
              <span className="font-medium text-gray-900">Data exports requested:</span> {exportsInWindow}
            </p>
            <p>
              <span className="font-medium text-gray-900">Snapshot generated:</span>{" "}
              {new Date(snapshot.generatedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments by Provider/Region</CardTitle>
            <CardDescription>Success/failure split of payment attempts in window.</CardDescription>
          </CardHeader>
          <CardContent>
            {snapshot.payments.byProviderRegion.length === 0 ? (
              <p className="text-sm text-gray-500">No provider-region payment activity in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                      <th className="py-2 pr-4">Provider</th>
                      <th className="py-2 pr-4">Region</th>
                      <th className="py-2 pr-4">Success</th>
                      <th className="py-2">Failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.payments.byProviderRegion.map((row) => (
                      <tr key={`${row.provider}-${row.region}`} className="border-b border-gray-200/60">
                        <td className="py-3 pr-4 text-gray-900">{row.provider}</td>
                        <td className="py-3 pr-4 text-gray-500">{row.region}</td>
                        <td className="py-3 pr-4 text-gray-500">{row.successCount}</td>
                        <td className="py-3 text-gray-500">{row.failureCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
