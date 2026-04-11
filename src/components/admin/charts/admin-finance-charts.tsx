"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PaymentStatusPoint = {
  status: string;
  attempts: number;
  amount: number;
};

type BreakdownPoint = {
  label: string;
  value: number;
};

type AdminFinanceChartsProps = {
  paymentStatus: PaymentStatusPoint[];
  cashflowBreakdown: BreakdownPoint[];
  disputeBreakdown: BreakdownPoint[];
};

const PIE_COLORS = ["#2563eb", "#f97316", "#0f766e", "#9333ea", "#dc2626", "#0891b2"];

function fallbackBreakdown(input: BreakdownPoint[]) {
  if (input.length === 0) {
    return [{ label: "No Data", value: 1 }];
  }

  return input;
}

export function AdminFinanceCharts({
  paymentStatus,
  cashflowBreakdown,
  disputeBreakdown,
}: AdminFinanceChartsProps) {
  const safePaymentData = paymentStatus.length
    ? paymentStatus
    : [{ status: "NO_DATA", attempts: 1, amount: 0 }];
  const safeCashflow = fallbackBreakdown(cashflowBreakdown);
  const safeDisputes = fallbackBreakdown(disputeBreakdown);
  const totalCashflow = Math.max(1, safeCashflow.reduce((sum, item) => sum + item.value, 0));

  const cashflowRadial = safeCashflow.map((entry, index) => ({
    ...entry,
    fill: PIE_COLORS[index % PIE_COLORS.length],
  }));

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Payment attempts by status</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={safePaymentData}
                dataKey="attempts"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={45}
                label
              >
                {safePaymentData.map((entry, index) => (
                  <Cell key={`${entry.status}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Amount by payment status</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={safePaymentData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Cashflow mix</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="28%"
              outerRadius="88%"
              barSize={16}
              data={cashflowRadial}
            >
              <PolarAngleAxis type="number" domain={[0, totalCashflow]} tick={false} />
              <RadialBar dataKey="value" background />
              <Tooltip />
              <Legend />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Dispute cases by status</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={safeDisputes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
