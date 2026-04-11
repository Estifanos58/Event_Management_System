"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
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

type TrendPoint = {
  day: string;
  revenue: number;
  orders: number;
  tickets: number;
  checkins: number;
};

type EventStatusPoint = {
  status: string;
  value: number;
};

type TopEventPoint = {
  label: string;
  revenue: number;
  orders: number;
  checkins: number;
};

type OrganizerDashboardChartsProps = {
  currency: string;
  dailyTrend: TrendPoint[];
  eventStatusBreakdown: EventStatusPoint[];
  topEvents: TopEventPoint[];
  conversion: {
    tickets: number;
    checkins: number;
  };
};

const PIE_COLORS = ["#f97316", "#0f766e", "#2563eb", "#9333ea", "#dc2626"];

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OrganizerDashboardCharts({
  currency,
  dailyTrend,
  eventStatusBreakdown,
  topEvents,
  conversion,
}: OrganizerDashboardChartsProps) {
  const safeTrend = dailyTrend.length
    ? dailyTrend
    : [{ day: "No Data", revenue: 0, orders: 0, tickets: 0, checkins: 0 }];
  const safeStatus = eventStatusBreakdown.length
    ? eventStatusBreakdown
    : [{ status: "NO_DATA", value: 1 }];
  const safeTopEvents = topEvents.length
    ? topEvents
    : [{ label: "No Data", revenue: 0, orders: 0, checkins: 0 }];

  const checkedIn = Math.max(0, conversion.checkins);
  const notCheckedIn = Math.max(0, conversion.tickets - checkedIn);
  const conversionData = [
    {
      name: "Checked In",
      value: checkedIn,
      fill: "#16a34a",
    },
    {
      name: "Not Checked In",
      value: notCheckedIn,
      fill: "#d97706",
    },
  ];
  const conversionTotal = Math.max(1, checkedIn + notCheckedIn);
  const conversionRate = (checkedIn / conversionTotal) * 100;

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">30-day revenue and order trend</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={safeTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
              <Tooltip
                formatter={(value, name) => {
                  const numericValue =
                    typeof value === "number"
                      ? value
                      : Number(value ?? 0);

                  if (name === "revenue") {
                    return formatMoney(numericValue, currency);
                  }

                  return numericValue.toLocaleString();
                }}
              />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#f97316" fill="#ffedd5" />
              <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#2563eb" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Top events drilldown (30 days)</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={safeTopEvents} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="orders" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="checkins" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Event lifecycle mix</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={safeStatus}
                dataKey="value"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={95}
                innerRadius={45}
                label
              >
                {safeStatus.map((entry, index) => (
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
        <p className="mb-3 text-sm font-medium text-gray-900">Attendance conversion</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="32%"
              outerRadius="88%"
              barSize={20}
              data={conversionData}
            >
              <PolarAngleAxis type="number" domain={[0, conversionTotal]} tick={false} />
              <RadialBar dataKey="value" background />
              <Tooltip />
              <Legend />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Check-in conversion: <span className="font-semibold text-gray-900">{conversionRate.toFixed(1)}%</span>
        </p>
      </div>
    </section>
  );
}
