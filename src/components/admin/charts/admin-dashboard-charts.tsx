"use client";

import {
  Area,
  AreaChart,
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

type GrowthPoint = {
  day: string;
  users: number;
  events: number;
  sessions: number;
};

type BreakdownPoint = {
  label: string;
  value: number;
};

type AdminDashboardChartsProps = {
  growthTrend: GrowthPoint[];
  eventStatusBreakdown: BreakdownPoint[];
  auditActionBreakdown: BreakdownPoint[];
  emailVerification: {
    verified: number;
    unverified: number;
  };
};

const PIE_COLORS = ["#f97316", "#0f766e", "#2563eb", "#9333ea", "#dc2626", "#0891b2"];

function safeBreakdownData(input: BreakdownPoint[]) {
  if (input.length === 0) {
    return [{ label: "No Data", value: 1 }];
  }

  return input;
}

export function AdminDashboardCharts({
  growthTrend,
  eventStatusBreakdown,
  auditActionBreakdown,
  emailVerification,
}: AdminDashboardChartsProps) {
  const verificationData = [
    {
      name: "Verified",
      value: emailVerification.verified,
      fill: "#16a34a",
    },
    {
      name: "Unverified",
      value: emailVerification.unverified,
      fill: "#dc2626",
    },
  ];
  const safeVerificationTotal = Math.max(
    1,
    emailVerification.verified + emailVerification.unverified,
  );
  const verifiedPercent = (emailVerification.verified / safeVerificationTotal) * 100;

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">30-Day growth trend</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growthTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="users"
                stroke="#f97316"
                fill="#fed7aa"
                fillOpacity={0.8}
              />
              <Area
                type="monotone"
                dataKey="events"
                stroke="#2563eb"
                fill="#bfdbfe"
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="sessions"
                stroke="#0f766e"
                fill="#99f6e4"
                fillOpacity={0.35}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Event status distribution</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={safeBreakdownData(eventStatusBreakdown)}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Audit action composition (30 days)</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={safeBreakdownData(auditActionBreakdown)}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={95}
                innerRadius={45}
                label
              >
                {safeBreakdownData(auditActionBreakdown).map((entry, index) => (
                  <Cell
                    key={`${entry.label}-${index}`}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Email verification health</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="35%"
              outerRadius="90%"
              barSize={26}
              data={verificationData}
              startAngle={180}
              endAngle={0}
            >
              <PolarAngleAxis type="number" domain={[0, safeVerificationTotal]} tick={false} />
              <RadialBar background dataKey="value" />
              <Tooltip />
              <Legend />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Verified accounts: <span className="font-semibold text-gray-900">{verifiedPercent.toFixed(1)}%</span>
        </p>
      </div>
    </section>
  );
}
