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

type FinanceBreakdownItem = {
  label: string;
  value: number;
};

type FinanceChartsProps = {
  settlementStatus: FinanceBreakdownItem[];
  payoutStatus: FinanceBreakdownItem[];
  disputeStatus: FinanceBreakdownItem[];
};

const PIE_COLORS = ["#2563eb", "#0f766e", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

function normalizeBreakdown(input: FinanceBreakdownItem[]) {
  const total = input.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return [{ label: "NONE", value: 1 }];
  }

  return input;
}

function BreakdownPie({
  title,
  data,
}: {
  title: string;
  data: FinanceBreakdownItem[];
}) {
  const normalized = normalizeBreakdown(data);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-gray-900">{title}</p>
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={normalized}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={72}
              label
            >
              {normalized.map((entry, index) => (
                <Cell
                  key={`${entry.label}-${index}`}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-1 text-xs text-gray-500">
        {normalized.map((item) => (
          <p key={item.label}>
            {item.label}: {item.value}
          </p>
        ))}
      </div>
    </div>
  );
}

export function FinanceCharts({
  settlementStatus,
  payoutStatus,
  disputeStatus,
}: FinanceChartsProps) {
  const statusKeys = new Set<string>();

  settlementStatus.forEach((item) => statusKeys.add(item.label));
  payoutStatus.forEach((item) => statusKeys.add(item.label));
  disputeStatus.forEach((item) => statusKeys.add(item.label));

  const statusComparison = Array.from(statusKeys)
    .map((status) => {
      const settlementValue =
        settlementStatus.find((item) => item.label === status)?.value ?? 0;
      const payoutValue = payoutStatus.find((item) => item.label === status)?.value ?? 0;
      const disputeValue = disputeStatus.find((item) => item.label === status)?.value ?? 0;

      return {
        status,
        settlements: settlementValue,
        payouts: payoutValue,
        disputes: disputeValue,
      };
    })
    .sort((left, right) => {
      const leftTotal = left.settlements + left.payouts + left.disputes;
      const rightTotal = right.settlements + right.payouts + right.disputes;

      return rightTotal - leftTotal;
    })
    .slice(0, 8);

  const mixData = [
    {
      name: "Settlements",
      value: settlementStatus.reduce((sum, item) => sum + item.value, 0),
      fill: "#2563eb",
    },
    {
      name: "Payouts",
      value: payoutStatus.reduce((sum, item) => sum + item.value, 0),
      fill: "#0f766e",
    },
    {
      name: "Disputes",
      value: disputeStatus.reduce((sum, item) => sum + item.value, 0),
      fill: "#dc2626",
    },
  ];

  const safeStatusComparison =
    statusComparison.length > 0
      ? statusComparison
      : [
          {
            status: "NONE",
            settlements: 0,
            payouts: 0,
            disputes: 0,
          },
        ];
  const safeMixData =
    mixData.reduce((sum, item) => sum + item.value, 0) > 0
      ? mixData
      : [
          {
            name: "No Data",
            value: 1,
            fill: "#94a3b8",
          },
        ];
  const safeMixTotal = Math.max(1, safeMixData.reduce((sum, item) => sum + item.value, 0));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownPie title="Settlements by status" data={settlementStatus} />
        <BreakdownPie title="Payouts by status" data={payoutStatus} />
        <BreakdownPie title="Disputes by status" data={disputeStatus} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">Status comparison by domain</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={safeStatusComparison} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="status" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="settlements" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="payouts" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="disputes" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">Overall finance activity mix</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="30%"
                outerRadius="88%"
                barSize={18}
                data={safeMixData}
              >
                <PolarAngleAxis type="number" domain={[0, safeMixTotal]} tick={false} />
                <RadialBar dataKey="value" background />
                <Tooltip />
                <Legend />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
