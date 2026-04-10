import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createEventGateFormAction } from "@/domains/events/actions";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventGatesPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerEventGatesPage({ params }: OrganizerEventGatesPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event gate configuration is unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const formAction = createEventGateFormAction;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gate Access Map</CardTitle>
          <CardDescription>
            Control which ticket classes and staff assignments are allowed at each gate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event.gates.length === 0 ? (
            <p className="text-sm text-gray-500">No gates are configured yet.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {event.gates.map((gate) => (
                <article
                  key={gate.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                >
                  <p className="text-base font-semibold text-gray-900">{gate.name}</p>
                  <p className="mt-1 text-xs text-gray-500">Code: {gate.code ?? "-"}</p>

                  <div className="mt-3 space-y-2 text-sm text-gray-500">
                    <p className="font-medium text-gray-900">Ticket class access</p>
                    {gate.ticketClassAccesses.length === 0 ? (
                      <p>No ticket class restriction</p>
                    ) : (
                      <p>
                        {gate.ticketClassAccesses
                          .map((access) => access.ticketClass.name)
                          .join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-gray-500">
                    <p className="font-medium text-gray-900">Assigned staff</p>
                    {gate.staffAssignments.length === 0 ? (
                      <p>No staff assigned</p>
                    ) : (
                      <ul className="space-y-1">
                        {gate.staffAssignments.map((assignment) => (
                          <li key={assignment.id}>
                            {assignment.user.name} ({assignment.user.email})
                            {assignment.assignmentRole ? ` · ${assignment.assignmentRole}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {snapshot.canManageEvent ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Gate</CardTitle>
            <CardDescription>
              Define entry points and optional ticket class restrictions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-4 lg:grid-cols-2">
              <input type="hidden" name="eventId" value={event.id} />

              <label className="text-sm font-medium text-gray-900">
                Gate name
                <Input className="mt-1" name="name" required placeholder="Main Entrance" />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Gate code
                <Input className="mt-1" name="code" placeholder="GATE_A" />
              </label>

              <fieldset className="lg:col-span-2 rounded-xl border border-gray-200 p-4">
                <legend className="px-1 text-sm font-medium text-gray-900">
                  Allowed ticket classes
                </legend>
                {event.ticketClasses.length === 0 ? (
                  <p className="text-sm text-gray-500">Create ticket classes first to restrict gate access.</p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {event.ticketClasses.map((ticketClass) => (
                      <label
                        key={ticketClass.id}
                        className="inline-flex items-center gap-2 text-sm text-gray-900"
                      >
                        <input
                          type="checkbox"
                          name="allowedTicketClassIds"
                          value={ticketClass.id}
                          className="h-4 w-4"
                        />
                        {ticketClass.name}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
                >
                  Create gate
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
