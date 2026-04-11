"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DailyVolumePoint = {
  day: string;
  orders: number;
  payments: number;
  checkins: number;
  exports: number;
  totalOps: number;
  failedPayments: number;
  rejectedCheckins: number;
};

type ProviderRegionPoint = {
  label: string;
  success: number;
  failure: number;
};

type AdminReportsChartsProps = {
  dailyVolumes: DailyVolumePoint[];
  providerRegionPerformance: ProviderRegionPoint[];
};

const EMPTY_DAILY_POINT: DailyVolumePoint = {
  day: "No Data",
  orders: 0,
  payments: 0,
  checkins: 0,
  exports: 0,
  totalOps: 0,
  failedPayments: 0,
  rejectedCheckins: 0,
};

const EMPTY_PROVIDER_POINT: ProviderRegionPoint = {
  label: "No Data",
  success: 0,
  failure: 0,
};

export function AdminReportsCharts({
  dailyVolumes,
  providerRegionPerformance,
}: AdminReportsChartsProps) {
  const safeDaily = dailyVolumes.length > 0 ? dailyVolumes : [EMPTY_DAILY_POINT];
  const safeProvider =
    providerRegionPerformance.length > 0 ? providerRegionPerformance : [EMPTY_PROVIDER_POINT];

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">30-day operational volume</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={safeDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="orders" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="payments" stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="checkins" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="exports" stroke="#9333ea" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Total ops pressure trend</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={safeDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="totalOps" stroke="#f97316" fill="#ffedd5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Failure signals by day</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={safeDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="failedPayments" fill="#dc2626" radius={[4, 4, 0, 0]} />
              <Bar dataKey="rejectedCheckins" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Provider-region success vs failure</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={safeProvider} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failure" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
