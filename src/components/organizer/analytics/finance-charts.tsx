"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <BreakdownPie title="Settlements by status" data={settlementStatus} />
      <BreakdownPie title="Payouts by status" data={payoutStatus} />
      <BreakdownPie title="Disputes by status" data={disputeStatus} />
    </div>
  );
}
