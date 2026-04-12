import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select } from "@/components/ui/select";
import { prisma } from "@/core/db/prisma";

const PAGE_SIZE = 20;

type AdminEventsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

type EventRow = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  venueMode: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  organization: {
    id: string;
    displayName: string;
  };
  _count: {
    orders: number;
    tickets: number;
    checkInEvents: number;
  };
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

function createPageHref(input: { page: number; q: string; status: string }) {
  const qSegment = input.q.length > 0 ? `&q=${encodeURIComponent(input.q)}` : "";
  const statusSegment = input.status !== "ALL" ? `&status=${encodeURIComponent(input.status)}` : "";
  return `/admin/events?page=${input.page}${qSegment}${statusSegment}`;
}

export default async function AdminEventsPage({ searchParams }: AdminEventsPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "ALL";
  const requestedPage = parsePage(params.page);

  const whereClause = {
    ...(status !== "ALL" ? { status: status as never } : {}),
    ...(q.length > 0
      ? {
          OR: [
            {
              title: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              organization: {
                displayName: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
  };

  const totalEvents = await prisma.event.count({
    where: whereClause,
  });

  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const events = (await prisma.event.findMany({
    where: whereClause,
    orderBy: {
      startAt: "desc",
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      status: true,
      visibility: true,
      venueMode: true,
      startAt: true,
      endAt: true,
      timezone: true,
      organization: {
        select: {
          id: true,
          displayName: true,
        },
      },
      _count: {
        select: {
          orders: true,
          tickets: true,
          checkInEvents: true,
        },
      },
    },
  })) as EventRow[];

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Event Governance</CardTitle>
          <CardDescription>
            Platform event lifecycle and operational signal monitoring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
            <input type="hidden" name="page" value="1" />
            <label className="text-sm font-medium text-gray-900">
              Search title or organization
              <Input className="mt-1" name="q" defaultValue={q} placeholder="Search events" />
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

            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-100"
              >
                Apply
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results ({totalEvents})</CardTitle>
          <CardDescription>
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No events matched the filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Window</th>
                    <th className="py-2 pr-4">Volume</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900">{event.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{event.organization.displayName}</p>
                        <p className="mt-1 text-xs text-gray-500">{event.visibility} · {event.venueMode}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{event.status}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{event.startAt.toLocaleString()}</p>
                        <p className="mt-1 text-xs">to {event.endAt.toLocaleString()}</p>
                        <p className="mt-1 text-xs">{event.timezone}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>Orders: {event._count.orders}</p>
                        <p className="mt-1 text-xs">Tickets: {event._count.tickets}</p>
                        <p className="mt-1 text-xs">Check-ins: {event._count.checkInEvents}</p>
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/admin/events/${event.id}`}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-900 hover:bg-gray-100"
                        >
                          Event detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <PaginationControls
            summary={`Showing ${events.length} events on this page`}
            previousHref={createPageHref({
              page: Math.max(1, page - 1),
              q,
              status,
            })}
            nextHref={createPageHref({
              page: Math.min(totalPages, page + 1),
              q,
              status,
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
