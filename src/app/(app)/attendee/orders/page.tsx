import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";
import { getMyOrderPaymentStatus } from "@/domains/ticketing/service";
import { requireDashboardSnapshot } from "../../_lib/access";

const PAGE_SIZE = 20;

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
    providerReference: string | null;
    updatedAt: Date;
  }>;
  tickets: Array<{
    id: string;
    status: string;
  }>;
};

const PENDING_CHAPA_STATUSES = new Set([
  "INITIATED",
  "PROCESSING",
  "REQUIRES_ACTION",
  "AUTHORIZED",
]);

type AttendeeOrdersPageProps = {
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
  return `/attendee/orders?page=${page}`;
}

async function loadAttendeeOrders(userId: string, page: number, pageSize: number) {
  return (await prisma.order.findMany({
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
          providerReference: true,
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
    skip: (page - 1) * pageSize,
    take: pageSize,
  })) as AttendeeOrder[];
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function AttendeeOrdersPage({ searchParams }: AttendeeOrdersPageProps) {
  const params = await searchParams;
  const requestedPage = parsePage(params.page);
  const snapshot = await requireDashboardSnapshot();
  const userId = snapshot.session.user.id;
  const totalOrders = await prisma.order.count({
    where: {
      buyerUserId: userId,
    },
  });
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  let orders = await loadAttendeeOrders(userId, page, PAGE_SIZE);

  const ordersNeedingSync = orders.filter((order) => {
    const latestAttempt = order.paymentAttempts[0];

    if (!latestAttempt || latestAttempt.provider !== "CHAPA") {
      return false;
    }

    if (order.status === "COMPLETED") {
      return false;
    }

    return (
      Boolean(latestAttempt.providerReference) &&
      PENDING_CHAPA_STATUSES.has(latestAttempt.status)
    );
  });

  if (ordersNeedingSync.length > 0) {
    await Promise.allSettled(
      ordersNeedingSync.slice(0, 12).map((order) =>
        getMyOrderPaymentStatus(order.event.id, order.id),
      ),
    );

    orders = await loadAttendeeOrders(userId, page, PAGE_SIZE);
  }

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
            <div className="space-y-4">
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

              <PaginationControls
                summary={`Page ${page} of ${totalPages} - ${totalOrders} orders`}
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
