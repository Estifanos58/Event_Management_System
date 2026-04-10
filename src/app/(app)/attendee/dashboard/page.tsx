import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { listDiscoverableEvents } from "@/domains/discovery/service";
import type { DiscoveryListResult } from "@/domains/discovery/types";
import { listMyNotifications } from "@/domains/notifications/service";
import { requireDashboardSnapshot } from "../../_lib/access";

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

type DashboardUpcomingTicket = {
  id: string;
  status: string;
  event: {
    id: string;
    title: string;
    startAt: Date;
  };
  ticketClass: {
    name: string;
    type: string;
  };
};

type DashboardNotification = {
  id: string;
  type: string;
  subject: string | null;
  content: string;
  channel: string;
  status: string;
};

function formatDate(value: Date) {
  return value.toLocaleString();
}

export default async function AttendeeDashboardPage() {
  const snapshot = await requireDashboardSnapshot();
  const userId = snapshot.session.user.id;
  const now = new Date();

  const [ticketCount, activeReservations, pendingOrders, upcomingTickets, notifications, discover] =
    (await Promise.all([
      prisma.ticket.count({
        where: {
          OR: [{ ownerId: userId }, { attendeeId: userId }],
        },
      }),
      prisma.reservation.count({
        where: {
          userId,
          status: "PENDING",
          expiresAt: {
            gt: now,
          },
        },
      }),
      prisma.order.count({
        where: {
          buyerUserId: userId,
          status: {
            in: ["PENDING", "FAILED"],
          },
        },
      }),
      prisma.ticket.findMany({
        where: {
          OR: [{ ownerId: userId }, { attendeeId: userId }],
          status: {
            in: ["VALID", "USED"],
          },
          event: {
            startAt: {
              gte: now,
            },
          },
        },
        select: {
          id: true,
          status: true,
          event: {
            select: {
              id: true,
              title: true,
              startAt: true,
            },
          },
          ticketClass: {
            select: {
              name: true,
              type: true,
            },
          },
        },
        orderBy: {
          issuedAt: "asc",
        },
        take: 5,
      }),
      listMyNotifications({
        take: "5",
      }).catch(() => []),
      listDiscoverableEvents({
        page: "1",
        pageSize: "4",
        sort: "popularity",
      }).catch(() => null),
    ])) as [
      number,
      number,
      number,
      DashboardUpcomingTicket[],
      DashboardNotification[],
      DiscoveryListResult | null,
    ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Your Overview</h1>
        <p className="mt-2 text-sm text-gray-500">
          Everything you need to keep track of your upcoming experiences.
        </p>
      </header>

      <main className="space-y-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-linear-to-br from-orange-50 to-red-50">
            <CardContent className="p-6">
              <p className="text-sm font-medium text-orange-600">Total Tickets</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{ticketCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardContent className="p-6">
              <p className="text-sm font-medium text-gray-500">Active Reservations</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{activeReservations}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardContent className="p-6">
              <p className="text-sm font-medium text-gray-500">Pending Orders</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{pendingOrders}</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Your Upcoming Events</CardTitle>
              <CardDescription>Events you are attending soon.</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingTickets.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-500">No upcoming events yet.</p>
                  <Link
                    href="/discover"
                    className="mt-2 text-sm font-medium text-orange-500 hover:text-orange-600"
                  >
                    Discover events
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {upcomingTickets.map((ticket) => (
                    <li
                      key={ticket.id}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-gray-900">{ticket.event.title}</p>
                      <p className="mt-1 text-gray-500">
                        {ticket.ticketClass.name} ({ticket.ticketClass.type}) / {formatDate(ticket.event.startAt)}
                      </p>
                      <Link
                        href={`/attendee/tickets/${ticket.id}`}
                        className="mt-2 inline-block text-sm font-medium text-orange-500 hover:text-orange-600"
                      >
                        View ticket
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Notifications</CardTitle>
              <CardDescription>Latest delivery updates tied to your account.</CardDescription>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-500">No notifications yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      <p className="font-medium text-gray-900">{notification.subject ?? notification.type}</p>
                      <p className="mt-1 text-gray-500">{notification.content}</p>
                      <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">
                        {notification.channel} / {notification.status}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Recommended Discover Picks</CardTitle>
              <CardDescription>
                Trending events currently open for attendee exploration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!discover || discover.items.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No discover recommendations are available right now.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {discover.items.map((item) => (
                    <article key={item.id} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-sm">
                      <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.coverImageUrl ?? FALLBACK_EVENT_COVER}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent" />
                      </div>
                      <div className="px-4 py-3">
                      <p className="text-xs uppercase tracking-widest text-gray-500">
                        {item.venueMode} / {item.organizer.region}
                      </p>
                      <p className="mt-1 font-medium text-gray-900">{item.title}</p>
                      <p className="mt-1 text-gray-500">
                        {item.description ?? "No description available."}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <Link
                          href={`/attendee/events/${item.id}`}
                          className="font-medium text-orange-500 hover:text-orange-600"
                        >
                          Open details
                        </Link>
                        <Link
                          href={`/attendee/checkout/${item.id}`}
                          className="font-medium text-orange-500 hover:text-orange-600"
                        >
                          Start checkout
                        </Link>
                      </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
