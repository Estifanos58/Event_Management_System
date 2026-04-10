import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createEventSessionFormAction } from "@/domains/events/actions";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventSessionsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

function toDateTimeLocal(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

export default async function OrganizerEventSessionsPage({
  params,
}: OrganizerEventSessionsPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event sessions are unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const formAction = createEventSessionFormAction;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Sessions</CardTitle>
          <CardDescription>
            Configure room and timing for agenda sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event.eventSessions.length === 0 ? (
            <p className="text-sm text-gray-500">No sessions have been defined yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Schedule</th>
                    <th className="py-2 pr-4">Room</th>
                    <th className="py-2 pr-4">Capacity</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {event.eventSessions.map((session) => (
                    <tr key={session.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4 font-medium text-gray-900">{session.title}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{session.startAt.toLocaleString()}</p>
                        <p className="mt-1 text-xs">to {session.endAt.toLocaleString()}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{session.room ?? "-"}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{session.capacity}</p>
                        <p className="mt-1 text-xs">
                          Waitlist: {session.waitlistEnabled ? "enabled" : "disabled"}
                        </p>
                      </td>
                      <td className="py-3 text-gray-500">{session.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {snapshot.canManageEvent ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Session</CardTitle>
            <CardDescription>
              Add a new session block for event scheduling and capacity controls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-4 lg:grid-cols-2">
              <input type="hidden" name="eventId" value={event.id} />

              <label className="text-sm font-medium text-gray-900 lg:col-span-2">
                Session title
                <Input className="mt-1" name="title" required placeholder="Opening keynote" />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Start at
                <Input
                  className="mt-1"
                  name="startAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(event.startAt)}
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-900">
                End at
                <Input
                  className="mt-1"
                  name="endAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(event.endAt)}
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Room
                <Input className="mt-1" name="room" placeholder="Main Hall" />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Capacity
                <Input
                  className="mt-1"
                  name="capacity"
                  type="number"
                  min={1}
                  defaultValue={Math.max(event.totalCapacity ?? 100, 1)}
                  required
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 lg:col-span-2">
                <input name="waitlistEnabled" type="checkbox" className="h-4 w-4" />
                Enable waitlist for this session
              </label>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
                >
                  Create session
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
