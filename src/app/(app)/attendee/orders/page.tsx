import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "../../_lib/access";

type AttendeeOrder = {
  id: string;
  status: string;
  totalAmount: { toString(): string };
  currency: string;
  createdAt: Date;
  event: {
    id: string;
    title: string;
    startAt: Date;
    timezone: string;
  };
  paymentAttempts: Array<{
    id: string;
    status: string;
    provider: string;
    updatedAt: Date;
  }>;
  tickets: Array<{
    id: string;
    status: string;
  }>;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function AttendeeOrdersPage() {
  const snapshot = await requireDashboardSnapshot();
  const userId = snapshot.session.user.id;

  const orders = (await prisma.order.findMany({
    where: {
      buyerUserId: userId,
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
      paymentAttempts: {
        select: {
          id: true,
          status: true,
          provider: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
      },
      tickets: {
        select: {
          id: true,
          status: true,
        },
        take: 5,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 80,
  })) as AttendeeOrder[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>
            Track payment lifecycle, event mapping, and issued ticket status per order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500">No orders found for this account.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.12em] text-gray-500">
                    <th className="py-2 pr-4">Order</th>
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">Total</th>
                    <th className="py-2 pr-4">Payment</th>
                    <th className="py-2">Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const latestPaymentAttempt = order.paymentAttempts[0];

                    return (
                      <tr key={order.id} className="border-b border-gray-200/60 align-top">
                        <td className="py-3 pr-4 text-gray-500">
                          <p className="font-medium text-gray-900">{order.id}</p>
                          <p className="mt-1 text-xs">{order.status}</p>
                          <p className="mt-1 text-xs">Created {order.createdAt.toLocaleString()}</p>
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          <p className="font-medium text-gray-900">{order.event.title}</p>
                          <p className="mt-1 text-xs">
                            {order.event.startAt.toLocaleString()} - {order.event.timezone}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {formatMoney(Number(order.totalAmount.toString()), order.currency)}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {latestPaymentAttempt ? (
                            <>
                              <p>
                                {latestPaymentAttempt.provider} - {latestPaymentAttempt.status}
                              </p>
                              <p className="mt-1 text-xs">
                                Updated {latestPaymentAttempt.updatedAt.toLocaleString()}
                              </p>
                            </>
                          ) : (
                            <p>No payment attempt</p>
                          )}
                        </td>
                        <td className="py-3 text-gray-500">
                          {order.tickets.length === 0 ? (
                            <p>No tickets issued</p>
                          ) : (
                            <ul className="space-y-1 text-xs">
                              {order.tickets.map((ticket) => (
                                <li key={ticket.id}>
                                  {ticket.id} - {ticket.status}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
