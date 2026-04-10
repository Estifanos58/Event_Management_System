import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "@/app/(app)/_lib/access";

type StaffDashboardEventRow = {
  id: string;
  title: string;
  status: string;
  timezone: string;
  startAt: Date;
  endAt: Date;
};

export default async function StaffDashboardPage() {
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
          <CardTitle>Staff Operations</CardTitle>
          <CardDescription>
            You do not have any event-scoped staff assignments in the current account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Ask an organizer to assign you to an event gate, then refresh this page.
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
      timezone: true,
      startAt: true,
      endAt: true,
    },
  })) as StaffDashboardEventRow[];

  const [acceptedCheckIns, rejectedCheckIns, duplicateCheckIns] = await Promise.all([
    prisma.checkInEvent.count({
      where: {
        eventId: {
          in: assignedEventIds,
        },
        status: "ACCEPTED",
      },
    }),
    prisma.checkInEvent.count({
      where: {
        eventId: {
          in: assignedEventIds,
        },
        status: "REJECTED",
      },
    }),
    prisma.checkInEvent.count({
      where: {
        eventId: {
          in: assignedEventIds,
        },
        status: "DUPLICATE",
      },
    }),
  ]);

  const liveEvents = events.filter((event) => event.status === "LIVE");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Staff Operations Snapshot</h1>
        <p className="mt-2 text-sm text-gray-500">
          Event-day check-in load and assignment visibility for your current scope.
        </p>
      </header>

      <main className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-linear-to-br from-orange-50 to-red-50">
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-orange-600">Assigned Events</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{events.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Accepted</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{acceptedCheckIns}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Rejected</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{rejectedCheckIns}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Duplicate</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{duplicateCheckIns}</p>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Live and Upcoming Events</CardTitle>
              <CardDescription>
                Open each event workspace for scanning, incidents, and realtime updates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {events.map((event) => (
                  <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{event.title}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {event.startAt.toLocaleString()} to {event.endAt.toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {event.status} / {event.timezone}
                        </p>
                      </div>

                      <Link
                        href={`/staff/events/${event.id}`}
                        className="inline-flex items-center rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
                      >
                        Open operations
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              <p className="mt-4 text-xs text-gray-500">Live events in assignment set: {liveEvents.length}</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
