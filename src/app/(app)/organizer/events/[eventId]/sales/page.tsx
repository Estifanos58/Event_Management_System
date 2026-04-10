import {
  OrderStatus,
  PaymentAttemptStatus,
  ReservationStatus,
} from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/core/db/prisma";
import { setEventTicketSalesPausedFormAction } from "@/domains/events/actions";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventSalesPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function OrganizerEventSalesPage({ params }: OrganizerEventSalesPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event sales controls are unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const defaultCurrency = event.ticketClasses[0]?.currency ?? "USD";

  const [pendingOrders, completedOrders, activeReservations, capturedPayments] =
    await Promise.all([
      prisma.order.count({
        where: {
          eventId,
          status: OrderStatus.PENDING,
        },
      }),
      prisma.order.count({
        where: {
          eventId,
          status: OrderStatus.COMPLETED,
        },
      }),
      prisma.reservation.count({
        where: {
          eventId,
          status: ReservationStatus.PENDING,
        },
      }),
      prisma.paymentAttempt.aggregate({
        where: {
          order: {
            eventId,
          },
          status: {
            in: [PaymentAttemptStatus.CAPTURED, PaymentAttemptStatus.REFUNDED],
          },
        },
        _count: {
          _all: true,
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

  const capturedAmount = Number(capturedPayments._sum.amount ?? 0);
  const salesAction = setEventTicketSalesPausedFormAction;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sales Control Console</CardTitle>
          <CardDescription>
            Live checkout and payment pulse for organizer troubleshooting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Sales state</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {event.ticketSalesPaused ? "Paused" : "Active"}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Pending orders</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{pendingOrders}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Completed orders</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{completedOrders}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Captured amount</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {formatMoney(capturedAmount, defaultCurrency)}
            </p>
            <p className="mt-1 text-xs text-gray-500">Attempts: {capturedPayments._count._all}</p>
          </div>
        </CardContent>
      </Card>

      {snapshot.canManageEvent ? (
        <Card>
          <CardHeader>
            <CardTitle>Pause / Resume Ticket Sales</CardTitle>
            <CardDescription>
              Temporarily stop or resume checkout while preserving event configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={salesAction} className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <input type="hidden" name="eventId" value={event.id} />
              <input
                type="hidden"
                name="paused"
                value={event.ticketSalesPaused ? "false" : "true"}
              />

              <label className="text-sm font-medium text-gray-900">
                Change reason
                <Input
                  className="mt-1"
                  name="reason"
                  placeholder={
                    event.ticketSalesPaused
                      ? "Resuming after issue resolution"
                      : "Checkout processor degraded"
                  }
                />
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
                >
                  {event.ticketSalesPaused ? "Resume sales" : "Pause sales"}
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              <p>
                Active reservations in hold window: <span className="font-medium text-gray-900">{activeReservations}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Ticket Class Sales Windows</CardTitle>
          <CardDescription>
            Validate each ticket class against its configured sales interval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event.ticketClasses.length === 0 ? (
            <p className="text-sm text-gray-500">No ticket classes configured yet.</p>
          ) : (
            <div className="space-y-2">
              {event.ticketClasses.map((ticketClass) => (
                <div
                  key={ticketClass.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm"
                >
                  <p className="font-medium text-gray-900">{ticketClass.name}</p>
                  <p className="mt-1 text-gray-500">
                    {ticketClass.salesStartAt.toLocaleString()} to {ticketClass.salesEndAt.toLocaleString()}
                  </p>
                  <p className="mt-1 text-gray-500">
                    Capacity {ticketClass.capacity} | Per-order {ticketClass.perOrderLimit}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
