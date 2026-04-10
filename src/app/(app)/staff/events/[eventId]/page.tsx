import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { getEventDetailSnapshot } from "@/domains/events/service";
import { StaffCheckInOpsConsole } from "@/components/staff/checkin/checkin-ops-console";
import { CheckInRealtimeConsole } from "@/components/staff/realtime/checkin-realtime-console";

type RecentCheckInRow = {
  id: string;
  status: string;
  reason: string | null;
  scannedAt: Date;
  gate: {
    name: string;
  };
  ticket: {
    id: string;
    attendee: {
      name: string | null;
    };
  };
  scanner: {
    name: string | null;
  };
};

type StaffEventOperationsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function StaffEventOperationsPage({
  params,
}: StaffEventOperationsPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event operations are unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const gates = event.gates.map((gate) => ({
    id: gate.id,
    name: gate.name,
    code: gate.code,
  }));

  const recentCheckIns = (await prisma.checkInEvent.findMany({
    where: {
      eventId,
    },
    orderBy: {
      scannedAt: "desc",
    },
    take: 20,
    select: {
      id: true,
      status: true,
      reason: true,
      scannedAt: true,
      gate: {
        select: {
          name: true,
        },
      },
      ticket: {
        select: {
          id: true,
          attendee: {
            select: {
              name: true,
            },
          },
        },
      },
      scanner: {
        select: {
          name: true,
        },
      },
    },
  })) as RecentCheckInRow[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Staff Event Operations</CardTitle>
          <CardDescription>
            Check-in and incident console for {event.title}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Event status</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{event.status}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Registered gates</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{gates.length}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Recent scans</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{recentCheckIns.length}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Window</p>
            <p className="mt-2 text-xs text-gray-900">{event.startAt.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">to {event.endAt.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <StaffCheckInOpsConsole
          key={`ops-${event.id}`}
          eventId={event.id}
          eventTitle={event.title}
          gates={gates}
        />

        <CheckInRealtimeConsole key={`realtime-${event.id}`} eventId={event.id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Check-In History</CardTitle>
          <CardDescription>
            Latest persisted scans for this event from all staff scanners.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentCheckIns.length === 0 ? (
            <p className="text-sm text-gray-500">No check-ins have been recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Gate</th>
                    <th className="py-2 pr-4">Attendee</th>
                    <th className="py-2 pr-4">Scanner</th>
                    <th className="py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCheckIns.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{entry.status}</p>
                        {entry.reason ? <p className="mt-1 text-xs">{entry.reason}</p> : null}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{entry.gate.name}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        {entry.ticket.attendee.name || "Unnamed attendee"}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{entry.scanner.name || "Unknown"}</td>
                      <td className="py-3 text-gray-500">{entry.scannedAt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
