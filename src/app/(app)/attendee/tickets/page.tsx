import { TicketTransferStatus } from "@prisma/client";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "../../_lib/access";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function AttendeeTicketsPage() {
  const snapshot = await requireDashboardSnapshot();
  const userId = snapshot.session.user.id;

  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [{ ownerId: userId }, { attendeeId: userId }],
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
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
      transfers: {
        where: {
          status: TicketTransferStatus.PENDING,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      issuedAt: "desc",
    },
    take: 120,
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Your Tickets</h1>
        <p className="mt-2 text-sm text-gray-500">
          Tickets where you are an owner or designated attendee.
        </p>
      </header>

      <main>
        {tickets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-gray-500">You have no tickets yet.</p>
              <div className="mt-4">
                <Link
                  href="/attendee/events"
                  className="inline-flex rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Browse events
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {tickets.map((ticket) => (
              <Card key={ticket.id}>
                <CardHeader>
                  <CardTitle className="text-base">{ticket.event.title}</CardTitle>
                  <CardDescription>{ticket.event.startAt.toLocaleString()}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-500">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Ticket</p>
                      <p className="mt-1 font-semibold text-gray-900">{ticket.id}</p>
                      <p className="mt-1 text-xs">Status: {ticket.status}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Class</p>
                      <p className="mt-1 font-semibold text-gray-900">
                        {ticket.ticketClass.name} ({ticket.ticketClass.type})
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Order</p>
                    <p className="mt-1 text-gray-900">{ticket.order.id}</p>
                    <p className="mt-1 text-xs">
                      {ticket.order.status} / {formatMoney(Number(ticket.order.totalAmount.toString()), ticket.order.currency)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Transfer</p>
                    <p className="mt-1">
                      {ticket.transfers[0]
                        ? `Pending until ${ticket.transfers[0].expiresAt.toLocaleString()}`
                        : "No active transfer"}
                    </p>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/attendee/tickets/${ticket.id}`}
                      className="inline-flex rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                    >
                      Open ticket
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </main>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">Need another ticket?</h2>
        <p className="mt-2 text-sm text-gray-500">Explore upcoming events and reserve instantly.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/attendee/events" className="text-sm font-semibold text-orange-500 hover:text-orange-600">
            Discover events
          </Link>
          <Link href="/attendee/orders" className="text-sm font-semibold text-orange-500 hover:text-orange-600">
            View orders
          </Link>
        </div>
      </section>
    </div>
  );
}
