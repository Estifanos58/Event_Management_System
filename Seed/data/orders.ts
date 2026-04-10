import { OrderStatus, type Prisma } from "@prisma/client";
import { addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { roundCurrency } from "../utils/helpers";
import type {
  SeedOrderProfile,
  SeedReservationItemProfile,
  SeedReservationProfile,
  SeedTicketClassProfile,
} from "./types";

type OrderSeedResult = {
  orderProfiles: SeedOrderProfile[];
  orders: Prisma.OrderCreateManyInput[];
};

function statusForOrder(index: number): OrderStatus {
  if (index <= 65) {
    return OrderStatus.COMPLETED;
  }

  if (index <= 72) {
    return OrderStatus.FAILED;
  }

  if (index <= 76) {
    return OrderStatus.CANCELLED;
  }

  return OrderStatus.PENDING;
}

export function buildOrders(input: {
  reservations: SeedReservationProfile[];
  reservationItems: SeedReservationItemProfile[];
  ticketClasses: SeedTicketClassProfile[];
}): OrderSeedResult {
  const reservationById = new Map(input.reservations.map((reservation) => [reservation.id, reservation]));
  const ticketClassById = new Map(input.ticketClasses.map((ticketClass) => [ticketClass.id, ticketClass]));

  const confirmedReservations = input.reservations
    .filter((reservation) => reservation.status === "CONFIRMED")
    .slice(0, 80);

  const orderProfiles: SeedOrderProfile[] = [];
  const orders: Prisma.OrderCreateManyInput[] = [];

  for (let index = 1; index <= confirmedReservations.length; index += 1) {
    const reservation = confirmedReservations[index - 1];
    const status = statusForOrder(index);
    const items = input.reservationItems.filter((item) => item.reservationId === reservation.id);

    let subtotalAmount = 0;
    let quantity = 0;
    let currency = "USD";

    for (const item of items) {
      const ticketClass = ticketClassById.get(item.ticketClassId);

      if (!ticketClass) {
        continue;
      }

      subtotalAmount += ticketClass.price * item.quantity;
      quantity += item.quantity;
      currency = ticketClass.currency;
    }

    const taxAmount = roundCurrency(subtotalAmount * 0.12);
    const feeAmount = roundCurrency(subtotalAmount * 0.06);
    const discountAmount = index % 9 === 0 ? roundCurrency(subtotalAmount * 0.08) : 0;
    const totalAmount = roundCurrency(Math.max(0, subtotalAmount + taxAmount + feeAmount - discountAmount));

    const createdAt = addHours(reservation.createdAt, 2);
    const completedAt = status === OrderStatus.COMPLETED ? addHours(createdAt, 1) : null;

    const profile: SeedOrderProfile = {
      id: ids.order(index),
      reservationId: reservation.id,
      orgId: reservation.orgId,
      eventId: reservation.eventId,
      buyerUserId: reservation.userId,
      status,
      subtotalAmount,
      taxAmount,
      feeAmount,
      discountAmount,
      totalAmount,
      currency,
      createdAt,
      completedAt,
      quantity: Math.max(1, quantity),
    };

    orderProfiles.push(profile);

    const reservationMeta = reservationById.get(reservation.id);

    orders.push({
      id: profile.id,
      orgId: profile.orgId,
      eventId: profile.eventId,
      reservationId: profile.reservationId,
      buyerUserId: profile.buyerUserId,
      buyerSnapshot: {
        userId: profile.buyerUserId,
        reservationId: profile.reservationId,
      },
      attendeeSnapshot: {
        primaryAttendeeUserId: profile.buyerUserId,
        quantity: profile.quantity,
      },
      customFieldResponses: {
        dietaryPreference: index % 5 === 0 ? "Vegetarian" : "No preference",
      },
      promoCode: index % 7 === 0 ? `PROMO${100 + index}` : null,
      referralCode: index % 6 === 0 ? `REF${200 + index}` : null,
      invoiceRequested: index % 4 === 0,
      invoiceReference: index % 4 === 0 ? `INV-${index.toString().padStart(5, "0")}` : null,
      checkoutSessionFingerprint: ids.idempotency("checkout", index),
      status: profile.status,
      subtotalAmount: profile.subtotalAmount,
      taxAmount: profile.taxAmount,
      feeAmount: profile.feeAmount,
      discountAmount: profile.discountAmount,
      totalAmount: profile.totalAmount,
      currency: profile.currency,
      completedAt: profile.completedAt,
      createdAt: profile.createdAt,
      updatedAt: addHours(profile.createdAt, reservationMeta ? 2 : 1),
    });
  }

  return {
    orderProfiles,
    orders,
  };
}
