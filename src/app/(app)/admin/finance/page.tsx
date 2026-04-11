import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminFinanceCharts } from "@/components/admin/charts/admin-finance-charts";
import { prisma } from "@/core/db/prisma";

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (
    value !== null &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber?: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return 0;
}

export default async function AdminFinancePage() {
  const [orderTotals, paymentByStatus, refundTotals, settlementTotals, payoutTotals, disputeCases] =
    await Promise.all([
      prisma.order.aggregate({
        where: {
          status: "COMPLETED",
        },
        _count: {
          _all: true,
        },
        _sum: {
          totalAmount: true,
          feeAmount: true,
          taxAmount: true,
          discountAmount: true,
        },
      }),
      prisma.paymentAttempt.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.refund.aggregate({
        where: {
          status: "COMPLETED",
        },
        _count: {
          _all: true,
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.settlement.aggregate({
        _count: {
          _all: true,
        },
        _sum: {
          grossAmount: true,
          netAmount: true,
          platformFeeAmount: true,
          processorFeeAmount: true,
        },
      }),
      prisma.payout.aggregate({
        _count: {
          _all: true,
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.riskCase.groupBy({
        by: ["status"],
        where: {
          source: "PAYMENT_DISPUTE",
        },
        _count: {
          _all: true,
        },
      }),
    ]);

  const completedGross = toNumber(orderTotals._sum.totalAmount);
  const platformFees = toNumber(settlementTotals._sum.platformFeeAmount);
  const processorFees = toNumber(settlementTotals._sum.processorFeeAmount);
  const refundedAmount = toNumber(refundTotals._sum.amount);
  const payoutAmount = toNumber(payoutTotals._sum.amount);

  const paymentStatusChart = paymentByStatus
    .map((row) => ({
      status: row.status,
      attempts: row._count._all,
      amount: toNumber(row._sum.amount),
    }))
    .sort((left, right) => right.attempts - left.attempts);

  const cashflowBreakdown = [
    {
      label: "Gross Orders",
      value: completedGross,
    },
    {
      label: "Platform Fees",
      value: platformFees,
    },
    {
      label: "Processor Fees",
      value: processorFees,
    },
    {
      label: "Refunded",
      value: refundedAmount,
    },
    {
      label: "Payouts",
      value: payoutAmount,
    },
  ];

  const disputeBreakdown = disputeCases
    .map((risk) => ({
      label: risk.status,
      value: risk._count._all,
    }))
    .sort((left, right) => right.value - left.value);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Platform Finance</CardTitle>
          <CardDescription>
            Revenue, settlement, refund, and payout posture across all organizations.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Completed order volume</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{completedGross.toFixed(2)}</p>
            <p className="mt-1 text-xs text-gray-500">Orders: {orderTotals._count._all}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Platform fees</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{platformFees.toFixed(2)}</p>
            <p className="mt-1 text-xs text-gray-500">Processor fees: {processorFees.toFixed(2)}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Completed refunds</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{refundedAmount.toFixed(2)}</p>
            <p className="mt-1 text-xs text-gray-500">Refund count: {refundTotals._count._all}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Payout volume</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{payoutAmount.toFixed(2)}</p>
            <p className="mt-1 text-xs text-gray-500">Payouts: {payoutTotals._count._all}</p>
          </div>
        </CardContent>
      </Card>

      <AdminFinanceCharts
        paymentStatus={paymentStatusChart}
        cashflowBreakdown={cashflowBreakdown}
        disputeBreakdown={disputeBreakdown}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payment Attempt Distribution</CardTitle>
            <CardDescription>Count and amount by payment status.</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentByStatus.length === 0 ? (
              <p className="text-sm text-gray-500">No payment attempts recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Attempts</th>
                      <th className="py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentByStatus.map((row) => (
                      <tr key={row.status} className="border-b border-gray-200/60">
                        <td className="py-3 pr-4 text-gray-900">{row.status}</td>
                        <td className="py-3 pr-4 text-gray-500">{row._count._all}</td>
                        <td className="py-3 text-gray-500">{toNumber(row._sum.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dispute Risk Cases</CardTitle>
            <CardDescription>Risk case distribution for payment dispute investigations.</CardDescription>
          </CardHeader>
          <CardContent>
            {disputeCases.length === 0 ? (
              <p className="text-sm text-gray-500">No payment dispute risk cases found.</p>
            ) : (
              <div className="space-y-2">
                {disputeCases.map((risk) => (
                  <article key={risk.status} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">{risk.status}</p>
                    <p className="mt-1 text-xs text-gray-500">Cases: {risk._count._all}</p>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
