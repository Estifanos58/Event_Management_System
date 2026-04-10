import { notFound } from "next/navigation";
import { TicketActions } from "@/components/attendee/ticket-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "../../../_lib/access";

type AttendeeTicketDetailPageProps = {
  params: Promise<{
    ticketId: string;
  }>;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function AttendeeTicketDetailPage({ params }: AttendeeTicketDetailPageProps) {
  const { ticketId } = await params;
  const snapshot = await requireDashboardSnapshot();
  const userId = snapshot.session.user.id;

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      OR: [{ ownerId: userId }, { attendeeId: userId }],
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
          timezone: true,
        },
      },
      ticketClass: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      order: {
        select: {
          id: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
        },
      },
      checkInEvents: {
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
        },
        orderBy: {
          scannedAt: "desc",
        },
        take: 8,
      },
      transfers: {
        select: {
          id: true,
          status: true,
          responseReason: true,
          createdAt: true,
          expiresAt: true,
          toUser: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
      },
    },
  });

  if (!ticket) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ticket {ticket.id}</CardTitle>
          <CardDescription>
            {ticket.event.title} - {ticket.ticketClass.name} ({ticket.ticketClass.type})
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Status</p>
            <p className="mt-1 font-medium text-gray-900">{ticket.status}</p>
          </article>
          <article className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Event Time</p>
            <p className="mt-1 font-medium text-gray-900">{ticket.event.startAt.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">{ticket.event.timezone}</p>
          </article>
          <article className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Order</p>
            <p className="mt-1 font-medium text-gray-900">{ticket.order.id}</p>
            <p className="mt-1 text-xs text-gray-500">
              {ticket.order.status} - {formatMoney(Number(ticket.order.totalAmount.toString()), ticket.order.currency)}
            </p>
          </article>
          <article className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Issued</p>
            <p className="mt-1 font-medium text-gray-900">{ticket.issuedAt.toLocaleString()}</p>
          </article>
        </CardContent>
      </Card>

      <TicketActions eventId={ticket.event.id} ticketId={ticket.id} ticketStatus={ticket.status} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Check-In Timeline</CardTitle>
            <CardDescription>Latest gate scans for this ticket.</CardDescription>
          </CardHeader>
          <CardContent>
            {ticket.checkInEvents.length === 0 ? (
              <p className="text-sm text-gray-500">No check-in events recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-500">
                {ticket.checkInEvents.map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="font-medium text-gray-900">
                      {entry.status} at {entry.gate.name}
                    </p>
                    <p className="mt-1">{entry.scannedAt.toLocaleString()}</p>
                    {entry.reason ? <p className="mt-1 text-xs">Reason: {entry.reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transfer Timeline</CardTitle>
            <CardDescription>Recent transfer records for this ticket.</CardDescription>
          </CardHeader>
          <CardContent>
            {ticket.transfers.length === 0 ? (
              <p className="text-sm text-gray-500">No transfer records found.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-500">
                {ticket.transfers.map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="font-medium text-gray-900">{entry.status}</p>
                    <p className="mt-1">
                      Recipient: {entry.toUser.name} ({entry.toUser.email})
                    </p>
                    <p className="mt-1 text-xs">
                      Created {entry.createdAt.toLocaleString()} - expires {entry.expiresAt.toLocaleString()}
                    </p>
                    {entry.responseReason ? (
                      <p className="mt-1 text-xs">Reason: {entry.responseReason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
