import { CheckInStatus } from "@prisma/client";
import {
  AttendeesTable,
  type AttendeeTableRow,
} from "@/components/organizer/tables/attendees-table";
import {
  OrdersTable,
  type OrderTableRow,
} from "@/components/organizer/tables/orders-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventAttendeesPageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 10;

function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function createPageHref(eventId: string, ticketPage: number, orderPage: number) {
  return `/organizer/events/${eventId}/attendees?ticketPage=${ticketPage}&orderPage=${orderPage}`;
}

export default async function OrganizerEventAttendeesPage({
  params,
  searchParams,
}: OrganizerEventAttendeesPageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const ticketPage = parsePage(query.ticketPage);
  const orderPage = parsePage(query.orderPage);
  const ticketSkip = (ticketPage - 1) * PAGE_SIZE;
  const orderSkip = (orderPage - 1) * PAGE_SIZE;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event attendee records are unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const [tickets, orders, attendeeTicketsCount, checkedInCount, orderCount] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        eventId,
      },
      orderBy: {
        issuedAt: "desc",
      },
      skip: ticketSkip,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        issuedAt: true,
        orderId: true,
        attendee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        ticketClass: {
          select: {
            name: true,
          },
        },
        checkInEvents: {
          where: {
            status: CheckInStatus.ACCEPTED,
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.order.findMany({
      where: {
        eventId,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: orderSkip,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        totalAmount: true,
        currency: true,
        completedAt: true,
        createdAt: true,
        buyer: {
          select: {
            name: true,
            email: true,
          },
        },
        paymentAttempts: {
          take: 1,
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            status: true,
          },
        },
      },
    }),
    prisma.ticket.count({
      where: {
        eventId,
      },
    }),
    prisma.ticket.count({
      where: {
        eventId,
        checkInEvents: {
          some: {
            status: CheckInStatus.ACCEPTED,
          },
        },
      },
    }),
    prisma.order.count({
      where: {
        eventId,
      },
    }),
  ]);

  const attendeeRows: AttendeeTableRow[] = tickets.map((ticket) => ({
    ticketId: ticket.id,
    attendeeUserId: ticket.attendee.id,
    attendeeName: ticket.attendee.name?.trim() || "Unnamed attendee",
    attendeeEmail: ticket.attendee.email,
    ticketClass: ticket.ticketClass.name,
    ticketStatus: ticket.status,
    checkedIn: ticket.checkInEvents.length > 0,
    issuedAt: ticket.issuedAt.toISOString(),
    orderId: ticket.orderId,
  }));

  const orderRows: OrderTableRow[] = orders.map((order) => ({
    orderId: order.id,
    buyerName: order.buyer.name?.trim() || "Unnamed buyer",
    buyerEmail: order.buyer.email,
    status: order.status,
    paymentStatus: order.paymentAttempts[0]?.status ?? "NONE",
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    completedAt: order.completedAt?.toISOString(),
    createdAt: order.createdAt.toISOString(),
  }));

  const totalTicketPages = Math.max(1, Math.ceil(attendeeTicketsCount / PAGE_SIZE));
  const totalOrderPages = Math.max(1, Math.ceil(orderCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendee Operations</CardTitle>
          <CardDescription>
            Searchable attendee and order datasets with sorting and pagination.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Attendee tickets</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{attendeeTicketsCount}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Checked in</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{checkedInCount}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Orders</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{orderCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendee Ticket Ledger</CardTitle>
          <CardDescription>
            Latest ticket ownership and check-in state for this event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttendeesTable
            rows={attendeeRows}
            organizationId={snapshot.event.orgId}
            eventId={eventId}
          />

          <PaginationControls
            summary={`Ticket page ${ticketPage} of ${totalTicketPages}`}
            previousHref={createPageHref(eventId, Math.max(1, ticketPage - 1), orderPage)}
            nextHref={createPageHref(
              eventId,
              Math.min(totalTicketPages, ticketPage + 1),
              orderPage,
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order Ledger</CardTitle>
          <CardDescription>
            Buyer, payment, and order completion status with quick filtering.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrdersTable rows={orderRows} />

          <PaginationControls
            summary={`Order page ${orderPage} of ${totalOrderPages}`}
            previousHref={createPageHref(eventId, ticketPage, Math.max(1, orderPage - 1))}
            nextHref={createPageHref(eventId, ticketPage, Math.min(totalOrderPages, orderPage + 1))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
