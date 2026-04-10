import Link from "next/link";
import { CheckInStatus, OrderStatus, ReservationStatus } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventOverviewPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerEventOverviewPage({
  params,
}: OrganizerEventOverviewPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event overview is unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const [ticketCount, checkedInCount, completedOrdersCount, pendingReservationsCount] =
    await Promise.all([
      prisma.ticket.count({
        where: {
          eventId,
        },
      }),
      prisma.checkInEvent.count({
        where: {
          eventId,
          status: CheckInStatus.ACCEPTED,
        },
      }),
      prisma.order.count({
        where: {
          eventId,
          status: OrderStatus.COMPLETED,
        },
      }),
      prisma.reservation.count({
        where: {
          eventId,
          status: ReservationStatus.PENDING,
        },
      }),
    ]);

  const checkInRate = ticketCount > 0 ? (checkedInCount / ticketCount) * 100 : 0;
  const actionLinks = [
    { href: `/organizer/events/${eventId}/edit`, label: "Update event basics" },
    { href: `/organizer/events/${eventId}/tickets`, label: "Manage ticket classes" },
    { href: `/organizer/events/${eventId}/sales`, label: "Control ticket sales" },
    { href: `/organizer/events/${eventId}/engagement`, label: "Send attendee announcements" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace Overview</CardTitle>
          <CardDescription>
            Event health snapshot for {snapshot.event.title}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Tickets issued</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{ticketCount}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Check-ins</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{checkedInCount}</p>
            <p className="mt-1 text-xs text-gray-500">{checkInRate.toFixed(1)}% of issued tickets</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Completed orders</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{completedOrdersCount}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Pending reservations</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {pendingReservationsCount}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle Snapshot</CardTitle>
          <CardDescription>
            Current status and operations readiness for this event.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            <p>
              <span className="font-medium text-gray-900">Status:</span> {snapshot.event.status}
            </p>
            <p>
              <span className="font-medium text-gray-900">Sales state:</span>{" "}
              {snapshot.event.ticketSalesPaused ? "Paused" : "Active"}
            </p>
            <p>
              <span className="font-medium text-gray-900">Schedule:</span>{" "}
              {snapshot.event.startAt.toLocaleString()} to {snapshot.event.endAt.toLocaleString()}
            </p>
            <p>
              <span className="font-medium text-gray-900">Timezone:</span> {snapshot.event.timezone}
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <p className="font-medium text-gray-900">Quick actions</p>
            <div className="flex flex-wrap gap-2">
              {actionLinks.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-900 hover:bg-gray-100"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
