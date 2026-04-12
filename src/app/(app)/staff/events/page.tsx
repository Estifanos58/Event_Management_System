import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "@/app/(app)/_lib/access";

const PAGE_SIZE = 15;

type StaffAssignedEventRow = {
  id: string;
  title: string;
  status: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  _count: {
    gates: number;
    checkInEvents: number;
  };
};

type StaffEventsPageProps = {
  searchParams: Promise<{
    page?: string;
  }>;
};

function parsePage(value: string | undefined) {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function createPageHref(page: number) {
  return `/staff/events?page=${page}`;
}

export default async function StaffEventsPage({ searchParams }: StaffEventsPageProps) {
  const params = await searchParams;
  const requestedPage = parsePage(params.page);
  const snapshot = await requireDashboardSnapshot();

  const assignedEventIds = Array.from(
    new Set(
      snapshot.contexts
        .filter((context) => context.type === "EVENT")
        .map((context) => context.id),
    ),
  );

  if (assignedEventIds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assigned Events</CardTitle>
          <CardDescription>No event assignments were found for this staff account.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Ask an organizer to bind your account to an event gate assignment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalEvents = await prisma.event.count({
    where: {
      id: {
        in: assignedEventIds,
      },
    },
  });

  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const events = (await prisma.event.findMany({
    where: {
      id: {
        in: assignedEventIds,
      },
    },
    orderBy: {
      startAt: "asc",
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      timezone: true,
      _count: {
        select: {
          gates: true,
          checkInEvents: true,
        },
      },
    },
  })) as StaffAssignedEventRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Events</CardTitle>
        <CardDescription>
          Open event-day operations for your assigned events. Page {page} of {totalPages}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Schedule</th>
                <th className="py-2 pr-4">Gates</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-gray-200/60 align-top">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{event.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{event.id}</p>
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{event.status}</td>
                  <td className="py-3 pr-4 text-gray-500">
                    <p>{event.startAt.toLocaleString()}</p>
                    <p className="mt-1 text-xs">to {event.endAt.toLocaleString()}</p>
                    <p className="mt-1 text-xs">{event.timezone}</p>
                  </td>
                  <td className="py-3 pr-4 text-gray-500">
                    <p>{event._count.gates}</p>
                    <p className="mt-1 text-xs">Check-ins: {event._count.checkInEvents}</p>
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/staff/events/${event.id}`}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-900 hover:bg-gray-100"
                    >
                      Open operations
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          summary={`Showing ${events.length} events on this page - ${totalEvents} assigned events`}
          previousHref={createPageHref(Math.max(1, page - 1))}
          nextHref={createPageHref(Math.min(totalPages, page + 1))}
        />
      </CardContent>
    </Card>
  );
}
