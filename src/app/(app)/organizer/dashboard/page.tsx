import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrganizerDashboardCharts } from "@/components/organizer/analytics/organizer-dashboard-charts";
import { prisma } from "@/core/db/prisma";
import { getEventsOverviewSnapshot } from "@/domains/events/service";
import { listMyNotifications } from "@/domains/notifications/service";

const TREND_DAYS = 30;

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function OrganizerDashboardPage() {
  const [overview, notifications] = await Promise.all([
    getEventsOverviewSnapshot(),
    listMyNotifications({ take: "6" }).catch(() => []),
  ]);

  if (!overview) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Organizer dashboard is unavailable right now.
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1));
  trendStart.setHours(0, 0, 0, 0);

  const totalEvents = overview.events.length;
  const upcomingEvents = overview.events.filter((event) => event.startAt >= now);
  const liveEvents = overview.events.filter((event) => event.status === "LIVE");
  const publishedEvents = overview.events.filter((event) => event.status === "PUBLISHED");
  const pausedSalesEvents = overview.events.filter((event) => event.ticketSalesPaused);
  const eventIds = overview.events.map((event) => event.id);

  const [ordersInTrend, ticketsInTrend, checkinsInTrend] =
    eventIds.length > 0
      ? await Promise.all([
          prisma.order.findMany({
            where: {
              eventId: {
                in: eventIds,
              },
              status: "COMPLETED",
              completedAt: {
                gte: trendStart,
              },
            },
            select: {
              eventId: true,
              completedAt: true,
              totalAmount: true,
              currency: true,
            },
          }),
          prisma.ticket.findMany({
            where: {
              eventId: {
                in: eventIds,
              },
              issuedAt: {
                gte: trendStart,
              },
            },
            select: {
              eventId: true,
              issuedAt: true,
            },
          }),
          prisma.checkInEvent.findMany({
            where: {
              eventId: {
                in: eventIds,
              },
              status: "ACCEPTED",
              scannedAt: {
                gte: trendStart,
              },
            },
            select: {
              eventId: true,
              scannedAt: true,
            },
          }),
        ])
      : [[], [], []];

  const trendSeed = new Map<
    string,
    {
      day: string;
      revenue: number;
      orders: number;
      tickets: number;
      checkins: number;
    }
  >();

  for (let index = 0; index < TREND_DAYS; index += 1) {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);

    trendSeed.set(toDayKey(date), {
      day: toDayLabel(date),
      revenue: 0,
      orders: 0,
      tickets: 0,
      checkins: 0,
    });
  }

  const eventMetricMap = new Map<
    string,
    {
      label: string;
      revenue: number;
      orders: number;
      checkins: number;
    }
  >();

  for (const event of overview.events) {
    eventMetricMap.set(event.id, {
      label: event.title,
      revenue: 0,
      orders: 0,
      checkins: 0,
    });
  }

  for (const order of ordersInTrend) {
    if (!order.completedAt) {
      continue;
    }

    const bucket = trendSeed.get(toDayKey(order.completedAt));
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += Number(order.totalAmount);
    }

    const metric = eventMetricMap.get(order.eventId);
    if (metric) {
      metric.orders += 1;
      metric.revenue += Number(order.totalAmount);
    }
  }

  for (const ticket of ticketsInTrend) {
    const bucket = trendSeed.get(toDayKey(ticket.issuedAt));
    if (bucket) {
      bucket.tickets += 1;
    }
  }

  for (const checkin of checkinsInTrend) {
    const bucket = trendSeed.get(toDayKey(checkin.scannedAt));
    if (bucket) {
      bucket.checkins += 1;
    }

    const metric = eventMetricMap.get(checkin.eventId);
    if (metric) {
      metric.checkins += 1;
    }
  }

  const eventStatusCount = new Map<string, number>();
  for (const event of overview.events) {
    eventStatusCount.set(event.status, (eventStatusCount.get(event.status) ?? 0) + 1);
  }

  const eventStatusBreakdown = Array.from(eventStatusCount.entries()).map(([status, value]) => ({
    status,
    value,
  }));

  const topEvents = Array.from(eventMetricMap.values())
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue;
      }

      if (right.orders !== left.orders) {
        return right.orders - left.orders;
      }

      return right.checkins - left.checkins;
    })
    .slice(0, 8);

  const totals = Array.from(trendSeed.values()).reduce(
    (sum, day) => {
      sum.tickets += day.tickets;
      sum.checkins += day.checkins;
      return sum;
    },
    {
      tickets: 0,
      checkins: 0,
    },
  );

  const currency = ordersInTrend[0]?.currency ?? "USD";

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Organizer Hub</h1>
          <p className="mt-2 text-sm text-gray-500">
            Active context: <span className="font-semibold">{overview.activeContext.type}</span> / {overview.activeContext.id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/organizer/events/new" className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-600 hover:shadow-md">
            + New Event
          </Link>
          <Link href="/organizer/events" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50">
            Manage All
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-none shadow-sm bg-linear-to-br from-orange-50 to-red-50">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-orange-600">Total Events</p>
            <p className="mt-2 text-4xl font-extrabold text-gray-900">{totalEvents}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gray-50">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-gray-500">Upcoming</p>
            <p className="mt-2 text-4xl font-extrabold text-gray-900">{upcomingEvents.length}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gray-50">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-gray-500">Live & Published</p>
            <p className="mt-2 text-4xl font-extrabold text-gray-900">
              {liveEvents.length} <span className="text-xl font-medium text-gray-400">/ {publishedEvents.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gray-50">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-gray-500">Sales Paused</p>
            <p className="mt-2 text-4xl font-extrabold text-gray-900">{pausedSalesEvents.length}</p>
          </CardContent>
        </Card>
      </div>

      <OrganizerDashboardCharts
        currency={currency}
        dailyTrend={Array.from(trendSeed.values())}
        eventStatusBreakdown={eventStatusBreakdown}
        topEvents={topEvents}
        conversion={{
          tickets: totals.tickets,
          checkins: totals.checkins,
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Event Timeline</CardTitle>
            <CardDescription>Next events in your current scope.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-500">No upcoming events found.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {upcomingEvents.slice(0, 8).map((event) => (
                  <li key={event.id} className="group relative rounded-xl border border-gray-100 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-900">{event.title}</p>
                        <p className="mt-1.5 flex items-center gap-2 text-xs font-medium text-gray-500">
                          <span className="flex h-2 w-2 rounded-full bg-orange-500"></span>
                          {event.startAt.toLocaleString()} • Status: <span className="lowercase">{event.status}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Link href={`/organizer/events/${event.id}`} className="text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors">
                          Workspace
                        </Link>
                        <Link href={`/organizer/events/${event.id}/edit`} className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                          Edit
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Notifications</CardTitle>
            <CardDescription>Latest system and event messages.</CardDescription>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
               <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
                 <p className="text-sm text-gray-500">No recent notifications.</p>
               </div>
            ) : (
              <ul className="space-y-3 text-sm">
                {notifications.map((notification) => (
                  <li key={notification.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="font-semibold text-gray-900">
                      {notification.subject ?? notification.type}
                    </p>
                    <p className="mt-1 line-clamp-2 text-gray-500">{notification.content}</p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                      {notification.channel} • {notification.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
