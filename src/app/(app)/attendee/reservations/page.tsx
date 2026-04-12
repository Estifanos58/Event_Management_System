import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "../../_lib/access";

const PAGE_SIZE = 20;

type AttendeeReservationsPageProps = {
  searchParams: Promise<{
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

function createPageHref(page: number) {
  return `/attendee/reservations?page=${page}`;
}

export default async function AttendeeReservationsPage({
  searchParams,
}: AttendeeReservationsPageProps) {
  const params = await searchParams;
  const requestedPage = parsePage(params.page);
  const snapshot = await requireDashboardSnapshot();
  const userId = snapshot.session.user.id;
  const now = new Date();

  const totalReservations = await prisma.reservation.count({
    where: {
      userId,
    },
  });
  const totalPages = Math.max(1, Math.ceil(totalReservations / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const reservations = await prisma.reservation.findMany({
    where: {
      userId,
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
        },
      },
      items: {
        include: {
          ticketClass: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reservations</CardTitle>
          <CardDescription>
            Reservation holds, expiration windows, and checkout entry points.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reservations.length === 0 ? (
            <p className="text-sm text-gray-500">No reservations found for this account.</p>
          ) : (
            <div className="space-y-4">
              <ul className="space-y-4">
                {reservations.map((reservation) => {
                  const isActive = reservation.expiresAt > now && reservation.status === "PENDING";
                  const totalQuantity = reservation.items.reduce((sum, item) => sum + item.quantity, 0);

                  return (
                    <li key={reservation.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">{reservation.event.title}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Reservation {reservation.id} - status {reservation.status}
                          </p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <p>Created {reservation.createdAt.toLocaleString()}</p>
                          <p>Expires {reservation.expiresAt.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span className="rounded-lg border border-gray-200 px-2 py-1">Items: {totalQuantity}</span>
                        <span className="rounded-lg border border-gray-200 px-2 py-1">
                          {isActive ? "Active hold" : "Inactive"}
                        </span>
                        <Link href={`/attendee/events/${reservation.event.id}`} className="font-medium text-orange-500">
                          Event details
                        </Link>
                        <Link href={`/attendee/checkout/${reservation.event.id}`} className="font-medium text-orange-500">
                          Checkout
                        </Link>
                      </div>

                      <ul className="mt-3 grid gap-2 md:grid-cols-2">
                        {reservation.items.map((item) => (
                          <li key={item.id} className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500">
                            <span className="font-medium text-gray-900">{item.ticketClass.name}</span> ({item.ticketClass.type}) x{item.quantity}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>

              <PaginationControls
                summary={`Page ${page} of ${totalPages} - ${totalReservations} reservations`}
                previousHref={createPageHref(Math.max(1, page - 1))}
                nextHref={createPageHref(Math.min(totalPages, page + 1))}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
