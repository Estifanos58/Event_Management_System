import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getEventsOverviewSnapshot } from "@/domains/events/service";

type OrganizerEventsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sales?: string;
  }>;
};

export default async function OrganizerEventsPage({ searchParams }: OrganizerEventsPageProps) {
  const params = await searchParams;
  const overview = await getEventsOverviewSnapshot();

  if (!overview) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Organizer events portfolio is unavailable right now.
        </CardContent>
      </Card>
    );
  }

  const q = params.q?.trim().toLowerCase() || "";
  const status = params.status?.trim() || "ALL";
  const sales = params.sales?.trim() || "ALL";

  const statusOptions = [
    "ALL",
    "DRAFT",
    "IN_REVIEW",
    "APPROVED",
    "PUBLISHED",
    "LIVE",
    "COMPLETED",
    "ARCHIVED",
    "CANCELLED",
    "POSTPONED",
  ];

  const filteredEvents = overview.events.filter((event) => {
    if (q) {
      const inTitle = event.title.toLowerCase().includes(q);
      const inSlug = (event.slug ?? "").toLowerCase().includes(q);
      if (!inTitle && !inSlug) {
        return false;
      }
    }

    if (status !== "ALL" && event.status !== status) {
      return false;
    }

    if (sales === "PAUSED" && !event.ticketSalesPaused) {
      return false;
    }

    if (sales === "ACTIVE" && event.ticketSalesPaused) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organizer Events</CardTitle>
          <CardDescription>
            Filter and manage your event portfolio by lifecycle state and ticket sales status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]" method="get">
            <label className="text-sm font-medium text-gray-900">
              Search title or slug
              <Input className="mt-1" name="q" defaultValue={params.q ?? ""} placeholder="Search events" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Status
              <Select className="mt-1" name="status" defaultValue={status}>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>

            <label className="text-sm font-medium text-gray-900">
              Ticket sales
              <Select className="mt-1" name="sales" defaultValue={sales}>
                <option value="ALL">ALL</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
              </Select>
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Apply
              </button>
              {overview.canManageEvents ? (
                <Link href="/organizer/events/new" className="h-10 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900">
                  Create event
                </Link>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio ({filteredEvents.length})</CardTitle>
          <CardDescription>
            Active context: {overview.activeContext.type} / {overview.activeContext.id}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!overview.canReadEvents ? (
            <p className="text-sm text-gray-500">You do not currently have event.read permission in this context.</p>
          ) : filteredEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No events matched your current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Schedule</th>
                    <th className="py-2 pr-4">Capacity</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900">{event.title}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {event.visibility} / {event.venueMode} / {event.registrationType}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">slug: {event.slug ?? "n/a"}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{event.status}</p>
                        <p className="mt-1 text-xs">
                          Sales: {event.ticketSalesPaused ? "PAUSED" : "ACTIVE"}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{event.startAt.toLocaleString()}</p>
                        <p className="mt-1 text-xs">to {event.endAt.toLocaleString()}</p>
                        <p className="mt-1 text-xs">{event.timezone}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{event.totalCapacity ?? "n/a"}</p>
                        <p className="mt-1 text-xs">Waitlist: {event.waitlistEnabled ? "on" : "off"}</p>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Link href={`/organizer/events/${event.id}`} className="font-medium text-orange-500">
                            Workspace
                          </Link>
                          <Link href={`/organizer/events/${event.id}/edit`} className="font-medium text-orange-500">
                            Edit
                          </Link>
                          <Link href={`/organizer/events/${event.id}/analytics`} className="font-medium text-orange-500">
                            Analytics
                          </Link>
                        </div>
                      </td>
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
