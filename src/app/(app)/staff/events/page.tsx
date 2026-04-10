import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "@/app/(app)/_lib/access";

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

export default async function StaffEventsPage() {
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

  const events = (await prisma.event.findMany({
    where: {
      id: {
        in: assignedEventIds,
      },
    },
    orderBy: {
      startAt: "asc",
    },
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
          Open event-day operations for your assigned events.
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
      </CardContent>
    </Card>
  );
}
