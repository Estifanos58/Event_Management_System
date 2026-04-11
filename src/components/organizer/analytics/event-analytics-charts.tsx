"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type EventAnalyticsPoint = {
  day: string;
  orders: number;
  tickets: number;
  checkins: number;
  revenue: number;
};

type BreakdownPoint = {
  label: string;
  value: number;
};

type EventAnalyticsChartsProps = {
  data: EventAnalyticsPoint[];
  orderStatusBreakdown: BreakdownPoint[];
  attendanceBreakdown: BreakdownPoint[];
};

const PIE_COLORS = ["#2563eb", "#0f766e", "#d97706", "#dc2626", "#7c3aed"];

function normalizedBreakdown(input: BreakdownPoint[]) {
  const total = input.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return [{ label: "No Data", value: 1 }];
  }

  return input;
}

export function EventAnalyticsCharts({
  data,
  orderStatusBreakdown,
  attendanceBreakdown,
}: EventAnalyticsChartsProps) {
  const safeOrderStatus = normalizedBreakdown(orderStatusBreakdown);
  const safeAttendance = normalizedBreakdown(attendanceBreakdown);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Orders, tickets, and check-ins</p>
        <div className="h-70 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="orders" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tickets" fill="#0f766e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="checkins" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Revenue trend</p>
        <div className="h-70 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Attendance velocity</p>
        <div className="h-70 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="tickets" stroke="#2563eb" fill="#bfdbfe" />
              <Area type="monotone" dataKey="checkins" stroke="#0f766e" fill="#99f6e4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Order status mix</p>
        <div className="h-70 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={safeOrderStatus}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={84}
                innerRadius={36}
                label
              >
                {safeOrderStatus.map((entry, index) => (
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
        <p className="mb-3 text-sm font-medium text-gray-900">Attendance composition</p>
        <div className="h-70 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={safeAttendance}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={42}
                label
              >
                {safeAttendance.map((entry, index) => (
                  <Cell key={`${entry.label}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
