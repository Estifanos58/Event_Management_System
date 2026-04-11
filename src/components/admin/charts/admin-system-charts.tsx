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

type SystemCountPoint = {
  label: string;
  value: number;
};

type AdminSystemChartsProps = {
  healthScore: number;
  checkInBreakdown: {
    accepted: number;
    rejected: number;
    duplicate: number;
  };
  systemSignals: SystemCountPoint[];
};

const PIE_COLORS = ["#16a34a", "#dc2626", "#d97706"];

export function AdminSystemCharts({
  healthScore,
  checkInBreakdown,
  systemSignals,
}: AdminSystemChartsProps) {
  const normalizedHealth = Math.max(0, Math.min(100, healthScore));
  const checkInData = [
    {
      label: "Accepted",
      value: checkInBreakdown.accepted,
    },
    {
      label: "Rejected",
      value: checkInBreakdown.rejected,
    },
    {
      label: "Duplicate",
      value: checkInBreakdown.duplicate,
    },
  ];

  const safeCheckInData =
    checkInData.reduce((sum, item) => sum + item.value, 0) > 0
      ? checkInData
      : [{ label: "No Data", value: 1 }];

  const safeSignals = systemSignals.length > 0 ? systemSignals : [{ label: "No Data", value: 0 }];

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Platform health score</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="38%"
              outerRadius="86%"
              barSize={26}
              data={[
                {
                  name: "Health",
                  value: normalizedHealth,
                  fill: normalizedHealth >= 70 ? "#16a34a" : normalizedHealth >= 40 ? "#f97316" : "#dc2626",
                },
              ]}
              startAngle={180}
              endAngle={0}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background dataKey="value" />
              <Tooltip />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Composite health: <span className="font-semibold text-gray-900">{normalizedHealth.toFixed(0)}%</span>
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Check-in outcome composition</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={safeCheckInData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={95}
                innerRadius={40}
                label
              >
                {safeCheckInData.map((entry, index) => (
                  <Cell key={`${entry.label}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 xl:col-span-2">
        <p className="mb-3 text-sm font-medium text-gray-900">System signal counters</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={safeSignals} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
