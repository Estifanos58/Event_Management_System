import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

type AdminEventDetailPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

type EventDetailRecord = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  venueMode: string;
  registrationType: string;
  timezone: string;
  startAt: Date;
  endAt: Date;
  ticketSalesPaused: boolean;
  organization: {
    id: string;
    displayName: string;
    kycStatus: string;
  };
  _count: {
    eventSessions: number;
    gates: number;
    ticketClasses: number;
    orders: number;
    tickets: number;
    checkInEvents: number;
    riskCases: number;
    abuseReports: number;
    dataExportJobs: number;
  };
};

export default async function AdminEventDetailPage({ params }: AdminEventDetailPageProps) {
  const { eventId } = await params;

  const event = (await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      visibility: true,
      venueMode: true,
      registrationType: true,
      timezone: true,
      startAt: true,
      endAt: true,
      ticketSalesPaused: true,
      organization: {
        select: {
          id: true,
          displayName: true,
          kycStatus: true,
        },
      },
      _count: {
        select: {
          eventSessions: true,
          gates: true,
          ticketClasses: true,
          orders: true,
          tickets: true,
          checkInEvents: true,
          riskCases: true,
          abuseReports: true,
          dataExportJobs: true,
        },
      },
    },
  })) as EventDetailRecord | null;

  if (!event) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Event Not Found</CardTitle>
          <CardDescription>No event exists for the requested identifier.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/events"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            Back to events
          </Link>
        </CardContent>
      </Card>
    );
  }

  const [disputesCount, pendingReservationsCount, completedOrdersCount] = await Promise.all([
    prisma.riskCase.count({
      where: {
        eventId,
        source: "PAYMENT_DISPUTE",
      },
    }),
    prisma.reservation.count({
      where: {
        eventId,
        status: "PENDING",
      },
    }),
    prisma.order.count({
      where: {
        eventId,
        status: "COMPLETED",
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{event.title}</CardTitle>
          <CardDescription>
            {event.organization.displayName} · {event.status} · {event.visibility}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Schedule</p>
            <p className="mt-1 text-xs text-gray-900">{event.startAt.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">to {event.endAt.toLocaleString()}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Topology</p>
            <p className="mt-1 text-xs text-gray-500">Sessions: {event._count.eventSessions}</p>
            <p className="mt-1 text-xs text-gray-500">Gates: {event._count.gates}</p>
            <p className="mt-1 text-xs text-gray-500">Ticket classes: {event._count.ticketClasses}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Commerce</p>
            <p className="mt-1 text-xs text-gray-500">Orders: {event._count.orders}</p>
            <p className="mt-1 text-xs text-gray-500">Completed: {completedOrdersCount}</p>
            <p className="mt-1 text-xs text-gray-500">Pending reservations: {pendingReservationsCount}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Risk & compliance</p>
            <p className="mt-1 text-xs text-gray-500">Risk cases: {event._count.riskCases}</p>
            <p className="mt-1 text-xs text-gray-500">Disputes: {disputesCount}</p>
            <p className="mt-1 text-xs text-gray-500">Exports: {event._count.dataExportJobs}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Governance Profile</CardTitle>
          <CardDescription>
            Event mode, registration policy, and organization verification posture.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-500">
          <p>
            <span className="font-medium text-gray-900">Venue mode:</span> {event.venueMode}
          </p>
          <p>
            <span className="font-medium text-gray-900">Registration type:</span> {event.registrationType}
          </p>
          <p>
            <span className="font-medium text-gray-900">Timezone:</span> {event.timezone}
          </p>
          <p>
            <span className="font-medium text-gray-900">Ticket sales:</span>{" "}
            {event.ticketSalesPaused ? "Paused" : "Active"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Organization KYC:</span>{" "}
            {event.organization.kycStatus}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
