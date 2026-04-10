import {
  StaffTable,
  type StaffTableRow,
} from "@/components/organizer/tables/staff-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { assignEventStaffFormAction } from "@/domains/events/actions";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventStaffPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerEventStaffPage({ params }: OrganizerEventStaffPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event staff operations are unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const formAction = assignEventStaffFormAction;

  const gateAssignmentsByUser = new Map<string, Set<string>>();

  for (const gate of event.gates) {
    for (const assignment of gate.staffAssignments) {
      const existing = gateAssignmentsByUser.get(assignment.userId) ?? new Set<string>();
      existing.add(gate.name);
      gateAssignmentsByUser.set(assignment.userId, existing);
    }
  }

  const rows: StaffTableRow[] = event.staffBindings.map((binding) => {
    const gates = Array.from(gateAssignmentsByUser.get(binding.userId) ?? []);

    return {
      userId: binding.user.id,
      name: binding.user.name,
      email: binding.user.email,
      gateAssignments: gates.length > 0 ? gates.join(", ") : "No gate assignment",
      assignmentCount: gates.length,
    };
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Staff Roster</CardTitle>
          <CardDescription>
            Manage gate assignments for bound event staff members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffTable rows={rows} />
        </CardContent>
      </Card>

      {snapshot.canManageEvent ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign Staff Member</CardTitle>
            <CardDescription>
              Assign a staff identity to a gate and optional assignment role label.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-4 lg:grid-cols-2">
              <input type="hidden" name="eventId" value={event.id} />

              <label className="text-sm font-medium text-gray-900">
                Staff email
                <Input
                  className="mt-1"
                  type="email"
                  name="staffEmail"
                  required
                  placeholder="staff@your-org.com"
                />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Gate
                <Select className="mt-1" name="gateId" defaultValue="">
                  <option value="">No gate restriction</option>
                  {event.gates.map((gate) => (
                    <option key={gate.id} value={gate.id}>
                      {gate.name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="text-sm font-medium text-gray-900 lg:col-span-2">
                Assignment role
                <Input
                  className="mt-1"
                  name="assignmentRole"
                  placeholder="ENTRY_SCANNER"
                />
              </label>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
                >
                  Assign staff
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
