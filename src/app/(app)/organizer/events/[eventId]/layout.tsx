import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetailSnapshot } from "@/domains/events/service";

const WORKSPACE_LINKS = [
  { label: "Overview", segment: "" },
  { label: "Edit", segment: "edit" },
  { label: "Sessions", segment: "sessions" },
  { label: "Tickets", segment: "tickets" },
  { label: "Sales", segment: "sales" },
  { label: "Attendees", segment: "attendees" },
  { label: "Staff", segment: "staff" },
  { label: "Gates", segment: "gates" },
  { label: "Settings", segment: "settings" },
  { label: "Analytics", segment: "analytics" },
  { label: "Finance", segment: "finance" },
  { label: "Engagement", segment: "engagement" },
  { label: "Integrations", segment: "integrations" },
] as const;

type OrganizerEventWorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    eventId: string;
  }>;
};

function formatDateRange(startAt: Date, endAt: Date) {
  return `${startAt.toLocaleString()} to ${endAt.toLocaleString()}`;
}

export default async function OrganizerEventWorkspaceLayout({
  children,
  params,
}: OrganizerEventWorkspaceLayoutProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event workspace is not available in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event, canManageEvent } = snapshot;
  const basePath = `/organizer/events/${event.id}`;
  const navLinkClass =
    "rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{event.title}</CardTitle>
          <CardDescription>
            {event.visibility} / {event.venueMode} / {event.registrationType}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 text-sm text-gray-500 md:grid-cols-2">
            <p>Status: {event.status}</p>
            <p>Timezone: {event.timezone}</p>
            <p>Sales: {event.ticketSalesPaused ? "Paused" : "Active"}</p>
            <p>Schedule: {formatDateRange(event.startAt, event.endAt)}</p>
          </div>

          <nav className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-xs font-semibold">
            {WORKSPACE_LINKS.map((link) => {
              const href = link.segment ? `${basePath}/${link.segment}` : basePath;

              return (
                <Link key={link.label} href={href} className={navLinkClass}>
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {!canManageEvent ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              You currently have read-only access in this event context.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
