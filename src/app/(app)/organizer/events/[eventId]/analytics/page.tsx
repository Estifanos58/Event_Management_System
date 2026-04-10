import { CheckInStatus, OrderStatus } from "@prisma/client";
import type { EventAnalyticsPoint } from "@/components/organizer/analytics/event-analytics-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { getEventDetailSnapshot } from "@/domains/events/service";
import dynamic from "next/dynamic";

const EventAnalyticsCharts = dynamic(
  () =>
    import("@/components/organizer/analytics/event-analytics-charts").then(
      (module) => module.EventAnalyticsCharts,
    ),
  {
    loading: () => (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Loading analytics visualizations...
        </CardContent>
      </Card>
    ),
  },
);

type OrganizerEventAnalyticsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

const WINDOW_DAYS = 14;

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function OrganizerEventAnalyticsPage({
  params,
}: OrganizerEventAnalyticsPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event analytics are unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const currency = event.ticketClasses[0]?.currency ?? "USD";

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1));
  windowStart.setHours(0, 0, 0, 0);

  const [orders, tickets, checkIns] = await Promise.all([
    prisma.order.findMany({
      where: {
        eventId,
        status: OrderStatus.COMPLETED,
        completedAt: {
          gte: windowStart,
        },
      },
      select: {
        completedAt: true,
        totalAmount: true,
      },
    }),
    prisma.ticket.findMany({
      where: {
        eventId,
        issuedAt: {
          gte: windowStart,
        },
      },
      select: {
        issuedAt: true,
      },
    }),
    prisma.checkInEvent.findMany({
      where: {
        eventId,
        status: CheckInStatus.ACCEPTED,
        scannedAt: {
          gte: windowStart,
        },
      },
      select: {
        scannedAt: true,
      },
    }),
  ]);

  const seed = new Map<string, EventAnalyticsPoint>();

  for (let index = 0; index < WINDOW_DAYS; index += 1) {
    const date = new Date(windowStart);
    date.setDate(windowStart.getDate() + index);
    const dayKey = toDayKey(date);

    seed.set(dayKey, {
      day: toDayLabel(date),
      orders: 0,
      tickets: 0,
      checkins: 0,
      revenue: 0,
    });
  }

  for (const order of orders) {
    if (!order.completedAt) {
      continue;
    }

    const dayKey = toDayKey(order.completedAt);
    const bucket = seed.get(dayKey);

    if (!bucket) {
      continue;
    }

    bucket.orders += 1;
    bucket.revenue += Number(order.totalAmount);
  }

  for (const ticket of tickets) {
    const dayKey = toDayKey(ticket.issuedAt);
    const bucket = seed.get(dayKey);

    if (!bucket) {
      continue;
    }

    bucket.tickets += 1;
  }

  for (const checkIn of checkIns) {
    const dayKey = toDayKey(checkIn.scannedAt);
    const bucket = seed.get(dayKey);

    if (!bucket) {
      continue;
    }

    bucket.checkins += 1;
  }

  const chartData = Array.from(seed.values());
  const totalRevenue = chartData.reduce((sum, point) => sum + point.revenue, 0);
  const totalTickets = chartData.reduce((sum, point) => sum + point.tickets, 0);
  const totalCheckIns = chartData.reduce((sum, point) => sum + point.checkins, 0);
  const checkInConversion = totalTickets > 0 ? (totalCheckIns / totalTickets) * 100 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Performance Window (Last {WINDOW_DAYS} Days)</CardTitle>
          <CardDescription>
            Sales and attendance velocity for organizer decision-making.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Revenue</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {formatMoney(totalRevenue, currency)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Completed orders</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{orders.length}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Tickets issued</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{totalTickets}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Check-in conversion</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {checkInConversion.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>

      <EventAnalyticsCharts data={chartData} />
    </div>
  );
}
