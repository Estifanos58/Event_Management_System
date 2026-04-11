"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type TicketClassOption = {
  id: string;
  name: string;
  type: "FREE" | "PAID" | "VIP";
  price: number;
  currency: string;
  capacity: number;
};

type ReservationSummary = {
  id: string;
  expiresAt: string;
  items: Array<{
    ticketClassId: string;
    quantity: number;
  }>;
};

type OrderSummary = {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
};

type PaymentSummary = {
  id: string;
  status: string;
  checkoutUrl: string | null;
};

type PaymentStatusSnapshot = {
  orderId: string;
  orderStatus: string;
  totalAmount: number;
  currency: string;
  paymentAttemptId?: string;
  paymentAttemptStatus?: string;
  checkoutUrl?: string;
  isFinal: boolean;
};

type CheckoutFlowProps = {
  eventId: string;
  eventTitle: string;
  ticketClasses: TicketClassOption[];
  initialReservation?: ReservationSummary | null;
};

type ApiErrorShape = {
  error?: string;
  message?: string;
};

const reserveSchema = z.object({
  ticketClassId: z.string().min(1, "Ticket class is required."),
  quantity: z.number().int().min(1).max(10),
});

const checkoutSchema = z.object({
  buyerName: z.string().trim().min(2, "Buyer name must contain at least 2 characters."),
  buyerEmail: z.string().email("Enter a valid buyer email address."),
  buyerPhone: z.string().trim().max(40).optional(),
});

type ReserveFormValues = z.infer<typeof reserveSchema>;
type CheckoutFormValues = z.infer<typeof checkoutSchema>;

function parseError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const casted = payload as ApiErrorShape;
  return casted.error ?? casted.message ?? fallback;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(parseError(payload, "Request failed."));
  }

  return payload as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(parseError(payload, "Request failed."));
  }

  return payload as T;
}

function toAmount(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function CheckoutFlow({
  eventId,
  eventTitle,
  ticketClasses,
  initialReservation = null,
}: CheckoutFlowProps) {
  const [reservation, setReservation] = useState<ReservationSummary | null>(initialReservation);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [isStatusSyncing, setIsStatusSyncing] = useState(false);

  const ticketClassLookup = useMemo(
    () => new Map(ticketClasses.map((ticketClass) => [ticketClass.id, ticketClass])),
    [ticketClasses],
  );

  const reserveForm = useForm<ReserveFormValues>({
    resolver: zodResolver(reserveSchema),
    defaultValues: {
      ticketClassId: ticketClasses[0]?.id ?? "",
      quantity: 1,
    },
  });

  const checkoutForm = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      buyerName: "",
      buyerEmail: "",
      buyerPhone: "",
    },
  });

  const reserveMutation = useMutation({
    mutationFn: async (values: ReserveFormValues) => {
      const response = await postJson<{
        reservation: {
          id: string;
          expiresAt: string;
          items: Array<{
            ticketClassId: string;
            quantity: number;
          }>;
        };
      }>(`/api/events/${eventId}/reservations`, {
        idempotencyKey: crypto.randomUUID(),
        items: [
          {
            ticketClassId: values.ticketClassId,
            quantity: values.quantity,
          },
        ],
      });

      return response.reservation;
    },
    onSuccess: (nextReservation) => {
      setReservation({
        id: nextReservation.id,
        expiresAt: nextReservation.expiresAt,
        items: nextReservation.items,
      });
      setOrder(null);
      setPayment(null);
      toast.success("Reservation created.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create reservation.");
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (values: CheckoutFormValues) => {
      if (!reservation) {
        throw new Error("Create a reservation first.");
      }

      const attendees = reservation.items.flatMap((item) =>
        Array.from({ length: item.quantity }, () => ({
          ticketClassId: item.ticketClassId,
          attendeeName: values.buyerName,
          attendeeEmail: values.buyerEmail,
        })),
      );

      const response = await postJson<{
        order: {
          id: string;
          status: string;
          totalAmount: number | string;
          currency: string;
        };
      }>(`/api/events/${eventId}/checkout`, {
        reservationId: reservation.id,
        buyer: {
          name: values.buyerName,
          email: values.buyerEmail,
          phoneNumber: values.buyerPhone || undefined,
        },
        attendees,
        checkoutSessionFingerprint: crypto.randomUUID(),
      });

      return response.order;
    },
    onSuccess: (nextOrder) => {
      setOrder({
        id: nextOrder.id,
        status: nextOrder.status,
        totalAmount: toAmount(nextOrder.totalAmount),
        currency: nextOrder.currency,
      });
      setPayment(null);
      toast.success("Order created. Initialize payment to continue.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create order.");
    },
  });

  const initializePaymentMutation = useMutation({
    mutationFn: async () => {
      if (!order) {
        throw new Error("Create an order first.");
      }

      const returnUrlObject = new URL(window.location.href);
      ["trx_ref", "tx_ref", "ref_id", "status"].forEach((key) => {
        returnUrlObject.searchParams.delete(key);
      });
      returnUrlObject.searchParams.set("orderId", order.id);
      const returnUrl = returnUrlObject.toString();

      const response = await postJson<{
        paymentAttempt: {
          id: string;
          status: string;
          checkoutUrl?: string | null;
          checkout_url?: string | null;
        };
      }>(`/api/events/${eventId}/orders/${order.id}/payments/initialize`, {
        idempotencyKey: crypto.randomUUID(),
        returnUrl,
      });

      const checkoutUrl =
        response.paymentAttempt.checkoutUrl ?? response.paymentAttempt.checkout_url ?? null;

      return {
        id: response.paymentAttempt.id,
        status: response.paymentAttempt.status,
        checkoutUrl,
      };
    },
    onSuccess: (nextPayment) => {
      setPayment(nextPayment);

      if (nextPayment.checkoutUrl) {
        toast.success("Payment initialized. Continue in the payment window.");
      } else {
        toast.success("Payment initialized.");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to initialize payment.");
    },
  });

  const refreshPaymentStatus = useCallback(
    async (targetOrderId: string, options?: { silent?: boolean }) => {
      setIsStatusSyncing(true);

      try {
        const response = await getJson<{
          paymentStatus: PaymentStatusSnapshot;
        }>(`/api/events/${eventId}/orders/${targetOrderId}/payments/status`);

        const snapshot = response.paymentStatus;

        setOrder({
          id: snapshot.orderId,
          status: snapshot.orderStatus,
          totalAmount: toAmount(snapshot.totalAmount),
          currency: snapshot.currency,
        });

        if (snapshot.paymentAttemptId) {
          setPayment({
            id: snapshot.paymentAttemptId,
            status: snapshot.paymentAttemptStatus ?? "UNKNOWN",
            checkoutUrl: snapshot.checkoutUrl ?? null,
          });
        } else {
          setPayment(null);
        }

        if (!options?.silent) {
          if (snapshot.orderStatus === "COMPLETED") {
            toast.success("Payment completed and tickets have been issued.");
          } else if (snapshot.isFinal) {
            toast.error("Payment did not complete successfully.");
          } else {
            toast.message("Payment is still processing.");
          }
        }

        return snapshot;
      } catch (error) {
        if (!options?.silent) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to refresh payment status.",
          );
        }

        return null;
      } finally {
        setIsStatusSyncing(false);
      }
    },
    [eventId],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderIdFromReturn = params.get("orderId");

    if (!orderIdFromReturn) {
      return;
    }

    const hasChapaReturnSignal =
      Boolean(params.get("trx_ref")) ||
      Boolean(params.get("tx_ref")) ||
      Boolean(params.get("ref_id")) ||
      Boolean(params.get("status"));

    if (!hasChapaReturnSignal) {
      return;
    }

    void refreshPaymentStatus(orderIdFromReturn, {
      silent: false,
    });
  }, [refreshPaymentStatus]);

  const reservationTotal = reservation
    ? reservation.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Checkout for {eventTitle}</CardTitle>
          <CardDescription>
            Follow the sequence: reserve tickets, create order, then initialize payment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Step 1</p>
              <p className="mt-1 font-medium">Reservation</p>
              <p className="text-xs text-gray-500">{reservation ? "Completed" : "Pending"}</p>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Step 2</p>
              <p className="mt-1 font-medium">Order</p>
              <p className="text-xs text-gray-500">{order ? "Completed" : "Pending"}</p>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Step 3</p>
              <p className="mt-1 font-medium">Payment</p>
              <p className="text-xs text-gray-500">{payment ? "Initialized" : "Pending"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Reserve Tickets</CardTitle>
          <CardDescription>
            Select one ticket class and quantity. Reservation will hold inventory temporarily.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-3"
            onSubmit={reserveForm.handleSubmit((values) => reserveMutation.mutate(values))}
          >
            <label className="text-sm font-medium text-gray-900 sm:col-span-2">
              Ticket class
              <Select className="mt-1" {...reserveForm.register("ticketClassId")}>
                {ticketClasses.map((ticketClass) => (
                  <option key={ticketClass.id} value={ticketClass.id}>
                    {ticketClass.name} ({ticketClass.type}) - {formatMoney(ticketClass.price, ticketClass.currency)}
                  </option>
                ))}
              </Select>
              {reserveForm.formState.errors.ticketClassId ? (
                <p className="mt-1 text-xs text-red-600">
                  {reserveForm.formState.errors.ticketClassId.message}
                </p>
              ) : null}
            </label>

            <label className="text-sm font-medium text-gray-900">
              Quantity
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={10}
                {...reserveForm.register("quantity", { valueAsNumber: true })}
              />
              {reserveForm.formState.errors.quantity ? (
                <p className="mt-1 text-xs text-red-600">
                  {reserveForm.formState.errors.quantity.message}
                </p>
              ) : null}
            </label>

            <div className="sm:col-span-3">
              <Button type="submit" disabled={reserveMutation.isPending}>
                {reserveMutation.isPending ? "Creating reservation..." : "Create reservation"}
              </Button>
            </div>
          </form>

          {reservation ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
              <p className="font-medium text-gray-900">Reservation {reservation.id}</p>
              <p className="mt-1">Items reserved: {reservationTotal}</p>
              <p className="mt-1">Expires at: {formatDateTime(reservation.expiresAt)}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Create Order</CardTitle>
          <CardDescription>
            Submit buyer details and generate an order from your active reservation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={checkoutForm.handleSubmit((values) => checkoutMutation.mutate(values))}
          >
            <label className="text-sm font-medium text-gray-900">
              Buyer name
              <Input className="mt-1" {...checkoutForm.register("buyerName")} />
              {checkoutForm.formState.errors.buyerName ? (
                <p className="mt-1 text-xs text-red-600">
                  {checkoutForm.formState.errors.buyerName.message}
                </p>
              ) : null}
            </label>

            <label className="text-sm font-medium text-gray-900">
              Buyer email
              <Input className="mt-1" type="email" {...checkoutForm.register("buyerEmail")} />
              {checkoutForm.formState.errors.buyerEmail ? (
                <p className="mt-1 text-xs text-red-600">
                  {checkoutForm.formState.errors.buyerEmail.message}
                </p>
              ) : null}
            </label>

            <label className="text-sm font-medium text-gray-900 sm:col-span-2">
              Buyer phone (optional)
              <Input className="mt-1" {...checkoutForm.register("buyerPhone")} />
            </label>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={!reservation || checkoutMutation.isPending}>
                {checkoutMutation.isPending ? "Creating order..." : "Create order"}
              </Button>
            </div>
          </form>

          {order ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
              <p className="font-medium text-gray-900">Order {order.id}</p>
              <p className="mt-1">Status: {order.status}</p>
              <p className="mt-1">Total: {formatMoney(order.totalAmount, order.currency)}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Initialize Payment</CardTitle>
          <CardDescription>
            Initialize provider checkout for the order and continue to the payment URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => initializePaymentMutation.mutate()} disabled={!order || initializePaymentMutation.isPending}>
            {initializePaymentMutation.isPending ? "Initializing payment..." : "Initialize payment"}
          </Button>

          {payment ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
              <p className="font-medium text-gray-900">Payment attempt {payment.id}</p>
              <p className="mt-1">Status: {payment.status}</p>
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!order) {
                      return;
                    }

                    void refreshPaymentStatus(order.id);
                  }}
                  disabled={!order || isStatusSyncing}
                >
                  {isStatusSyncing ? "Refreshing status..." : "Refresh payment status"}
                </Button>
              </div>
              {payment.checkoutUrl ? (
                <a
                  href={payment.checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-medium text-orange-500"
                >
                  Continue to payment provider
                </a>
              ) : (
                <p className="mt-2">No checkout URL was returned for this attempt.</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {reservation ? (
        <Card>
          <CardHeader>
            <CardTitle>Reservation Summary</CardTitle>
            <CardDescription>Current held inventory for this checkout session.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-500">
              {reservation.items.map((item) => {
                const ticketClass = ticketClassLookup.get(item.ticketClassId);

                return (
                  <li key={`${item.ticketClassId}:${item.quantity}`} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                    <span>
                      {ticketClass?.name ?? "Ticket class"} ({ticketClass?.type ?? "N/A"})
                    </span>
                    <span className="font-medium text-gray-900">x{item.quantity}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
