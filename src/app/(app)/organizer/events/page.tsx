import Link from "next/link";
import { ScopeType } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select } from "@/components/ui/select";
import { prisma } from "@/core/db/prisma";
import { getEventsOverviewSnapshot } from "@/domains/events/service";

const PAGE_SIZE = 20;

type OrganizerEventsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sales?: string;
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

function createPageHref(input: {
  page: number;
  q: string;
  status: string;
  sales: string;
}) {
  const qSegment = input.q.length > 0 ? `&q=${encodeURIComponent(input.q)}` : "";
  const statusSegment = input.status !== "ALL" ? `&status=${encodeURIComponent(input.status)}` : "";
  const salesSegment = input.sales !== "ALL" ? `&sales=${encodeURIComponent(input.sales)}` : "";

  return `/organizer/events?page=${input.page}${qSegment}${statusSegment}${salesSegment}`;
}

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
  const requestedPage = parsePage(params.page);

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

  let contextWhereClause: Record<string, unknown> = {};

  if (overview.activeContext.type === ScopeType.ORGANIZATION) {
    contextWhereClause = {
      orgId: overview.activeContext.id,
    };
  } else if (overview.activeContext.type === ScopeType.EVENT) {
    contextWhereClause = {
      id: overview.activeContext.id,
    };
  } else if (overview.activeContext.type === ScopeType.PERSONAL) {
    contextWhereClause = {
      createdBy: overview.session.user.id,
    };
  }

  const whereClause = {
    ...contextWhereClause,
    ...(status !== "ALL" ? { status: status as never } : {}),
    ...(sales === "PAUSED"
      ? { ticketSalesPaused: true }
      : sales === "ACTIVE"
        ? { ticketSalesPaused: false }
        : {}),
    ...(q
      ? {
          OR: [
            {
              title: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              slug: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const totalEvents = overview.canReadEvents
    ? await prisma.event.count({
        where: whereClause,
      })
    : 0;

  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const filteredEvents = overview.canReadEvents
    ? await prisma.event.findMany({
        where: whereClause,
        orderBy: {
          startAt: "asc",
        },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          title: true,
          slug: true,
          visibility: true,
          venueMode: true,
          registrationType: true,
          status: true,
          ticketSalesPaused: true,
          startAt: true,
          endAt: true,
          timezone: true,
          totalCapacity: true,
          waitlistEnabled: true,
        },
      })
    : [];

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
            <input type="hidden" name="page" value="1" />
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
          <CardTitle>Portfolio ({totalEvents})</CardTitle>
          <CardDescription>
            Active context: {overview.activeContext.type} / {overview.activeContext.id} · Page {page} of {totalPages}
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

          {overview.canReadEvents ? (
            <PaginationControls
              summary={`Showing ${filteredEvents.length} events on this page`}
              previousHref={createPageHref({
                page: Math.max(1, page - 1),
                q,
                status,
                sales,
              })}
              nextHref={createPageHref({
                page: Math.min(totalPages, page + 1),
                q,
                status,
                sales,
              })}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
