import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/core/db/prisma";
import { getEventDetailSnapshot } from "@/domains/events/service";
import {
  getFinancialReconciliationReport,
  listPaymentDisputes,
} from "@/domains/payments/service";
import type { FinancialReconciliationReport } from "@/domains/payments/types";
import dynamic from "next/dynamic";

const FinanceCharts = dynamic(
  () =>
    import("@/components/organizer/analytics/finance-charts").then(
      (module) => module.FinanceCharts,
    ),
  {
    loading: () => (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Loading finance visualizations...
        </CardContent>
      </Card>
    ),
  },
);

type OrganizerEventFinancePageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<{
    periodStart?: string;
    periodEnd?: string;
  }>;
};

type FinanceBreakdownItem = {
  label: string;
  value: number;
};

type SettlementRecord = {
  id: string;
  status: string;
  netAmount: unknown;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
};

type PayoutRecord = {
  id: string;
  status: string;
  amount: unknown;
  currency: string;
  reference: string | null;
  createdAt: Date;
};

type PaymentDisputeRecord = {
  id: string;
  severity: string;
  status: string;
  createdAt: Date;
};

function parseDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateInputValue(value?: string) {
  if (!value) {
    return "";
  }

  return value;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function OrganizerEventFinancePage({
  params,
  searchParams,
}: OrganizerEventFinancePageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event finance console is unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const periodStart = parseDate(query.periodStart);
  const periodEnd = parseDate(query.periodEnd);
  const defaultCurrency = snapshot.event.ticketClasses[0]?.currency ?? "USD";

  const [reportResult, disputesResult, recentSettlements, recentPayouts]: [
    {
      report: FinancialReconciliationReport | null;
      error: string | null;
    },
    {
      disputes: PaymentDisputeRecord[];
      error: string | null;
    },
    SettlementRecord[],
    PayoutRecord[],
  ] = await Promise.all([
    getFinancialReconciliationReport(eventId, {
      periodStart,
      periodEnd,
    })
      .then((report) => ({
        report,
        error: null as string | null,
      }))
      .catch((error: unknown) => ({
        report: null,
        error: error instanceof Error ? error.message : "Failed to load reconciliation.",
      })),
    listPaymentDisputes(eventId)
      .then((disputes: PaymentDisputeRecord[]) => ({
        disputes,
        error: null as string | null,
      }))
      .catch((error: unknown) => ({
        disputes: [] as PaymentDisputeRecord[],
        error: error instanceof Error ? error.message : "Failed to load disputes.",
      })),
    prisma.settlement.findMany({
      where: {
        eventId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      select: {
        id: true,
        status: true,
        netAmount: true,
        currency: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
      },
    }),
    prisma.payout.findMany({
      where: {
        orgId: snapshot.event.orgId,
        settlements: {
          some: {
            eventId,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        reference: true,
        createdAt: true,
      },
    }),
  ]);

  const report = reportResult.report;
  const reportError = reportResult.error;
  const disputes = disputesResult.disputes;
  const disputesError = disputesResult.error;

  const settlementStatus: FinanceBreakdownItem[] = report
    ? Object.entries(report.settlements.byStatus).map(([label, value]) => ({
        label,
        value: Number(value),
      }))
    : [];

  const payoutStatus: FinanceBreakdownItem[] = report
    ? Object.entries(report.payouts.byStatus).map(([label, value]) => ({
        label,
        value: Number(value),
      }))
    : [];

  const disputeStatus: FinanceBreakdownItem[] = report
    ? Object.entries(report.disputes.byStatus).map(([label, value]) => ({
        label,
        value: Number(value),
      }))
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Finance Summary</CardTitle>
          <CardDescription>
            Reconciliation and payout visibility for organizer operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]" method="get">
            <label className="text-sm font-medium text-gray-900">
              Period start
              <Input
                className="mt-1"
                name="periodStart"
                type="date"
                defaultValue={toDateInputValue(query.periodStart)}
              />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Period end
              <Input
                className="mt-1"
                name="periodEnd"
                type="date"
                defaultValue={toDateInputValue(query.periodEnd)}
              />
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-100"
              >
                Apply period
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {reportError ? (
        <Card>
          <CardContent className="py-6 text-sm text-red-600">{reportError}</CardContent>
        </Card>
      ) : null}

      {report ? (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Snapshot</CardTitle>
            <CardDescription>
              Orders, settlements, payouts, and variance in the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Orders total</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {formatMoney(report.orders.totalAmount, defaultCurrency)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Refunded</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {formatMoney(report.refunds.completedAmount, defaultCurrency)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Settlement net</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {formatMoney(report.settlements.netAmount, defaultCurrency)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Variance</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {formatMoney(report.reconciliation.variance, defaultCurrency)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <FinanceCharts
        settlementStatus={settlementStatus}
        payoutStatus={payoutStatus}
        disputeStatus={disputeStatus}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent Settlements and Payouts</CardTitle>
          <CardDescription>
            Most recent finance records tied to this event organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">Settlements</p>
            {recentSettlements.length === 0 ? (
              <p className="text-sm text-gray-500">No settlements recorded yet.</p>
            ) : (
              recentSettlements.map((settlement) => (
                <div
                  key={settlement.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm"
                >
                  <p className="font-medium text-gray-900">{settlement.status}</p>
                  <p className="mt-1 text-gray-500">
                    {formatMoney(Number(settlement.netAmount), settlement.currency)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {settlement.periodStart.toLocaleDateString()} to {settlement.periodEnd.toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">Payouts</p>
            {recentPayouts.length === 0 ? (
              <p className="text-sm text-gray-500">No payouts recorded yet.</p>
            ) : (
              recentPayouts.map((payout) => (
                <div
                  key={payout.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm"
                >
                  <p className="font-medium text-gray-900">{payout.status}</p>
                  <p className="mt-1 text-gray-500">
                    {formatMoney(Number(payout.amount), payout.currency)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Ref: {payout.reference ?? "n/a"} · {payout.createdAt.toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Disputes</CardTitle>
          <CardDescription>
            Current disputes and workflow status for risk operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {disputesError ? (
            <p className="text-sm text-red-600">{disputesError}</p>
          ) : disputes.length === 0 ? (
            <p className="text-sm text-gray-500">No payment disputes recorded for this event.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">Case ID</th>
                    <th className="py-2 pr-4">Severity</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((dispute) => (
                    <tr key={dispute.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4 text-gray-500">{dispute.id}</td>
                      <td className="py-3 pr-4 text-gray-500">{dispute.severity}</td>
                      <td className="py-3 pr-4 text-gray-500">{dispute.status}</td>
                      <td className="py-3 text-gray-500">{dispute.createdAt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
