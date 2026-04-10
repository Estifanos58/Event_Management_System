import { PaymentAttemptStatus, RefundStatus, type Prisma } from "@prisma/client";
import { addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { roundCurrency } from "../utils/helpers";
import type { SeedOrderProfile } from "./types";

type PaymentSeedResult = {
  paymentAttempts: Prisma.PaymentAttemptCreateManyInput[];
  refunds: Prisma.RefundCreateManyInput[];
  refundedOrderIds: Set<string>;
};

export function buildPayments(input: {
  orders: SeedOrderProfile[];
  fallbackRequestedBy: string;
}): PaymentSeedResult {
  const paymentAttempts: Prisma.PaymentAttemptCreateManyInput[] = [];
  const refunds: Prisma.RefundCreateManyInput[] = [];
  const refundedOrderIds = new Set<string>();

  for (let index = 1; index <= input.orders.length; index += 1) {
    const order = input.orders[index - 1];

    if (order.status === "COMPLETED" && index % 10 === 0) {
      paymentAttempts.push({
        id: ids.paymentAttempt(index, 1),
        orderId: order.id,
        provider: "CHAPA",
        providerReference: `chapa_reference_${index}_1`,
        providerEventId: ids.providerEvent("chapa", index * 10 + 1),
        checkoutUrl: `https://checkout.chapa.co/pay/${index}-1`,
        status: PaymentAttemptStatus.FAILED,
        amount: order.totalAmount,
        currency: order.currency,
        idempotencyKey: ids.idempotency("payment_attempt", index * 10 + 1),
        failureCode: "NETWORK_TIMEOUT",
        metadata: {
          retryEligible: true,
        },
        callbackPayload: {
          message: "Temporary upstream gateway timeout",
        },
        createdAt: addHours(order.createdAt, 1),
        updatedAt: addHours(order.createdAt, 2),
      });

      paymentAttempts.push({
        id: ids.paymentAttempt(index, 2),
        orderId: order.id,
        provider: "CHAPA",
        providerReference: `chapa_reference_${index}_2`,
        providerEventId: ids.providerEvent("chapa", index * 10 + 2),
        checkoutUrl: `https://checkout.chapa.co/pay/${index}-2`,
        status: PaymentAttemptStatus.CAPTURED,
        amount: order.totalAmount,
        currency: order.currency,
        idempotencyKey: ids.idempotency("payment_attempt", index * 10 + 2),
        metadata: {
          retriedFrom: ids.paymentAttempt(index, 1),
        },
        callbackPayload: {
          message: "Captured after retry",
        },
        createdAt: addHours(order.createdAt, 3),
        updatedAt: addHours(order.createdAt, 4),
      });

      continue;
    }

    const baseStatus =
      order.status === "COMPLETED"
        ? PaymentAttemptStatus.CAPTURED
        : order.status === "FAILED"
          ? PaymentAttemptStatus.FAILED
          : order.status === "CANCELLED"
            ? PaymentAttemptStatus.VOIDED
            : PaymentAttemptStatus.PROCESSING;

    const refunded = order.status === "COMPLETED" && index % 8 === 0;

    paymentAttempts.push({
      id: ids.paymentAttempt(index, 1),
      orderId: order.id,
      provider: "CHAPA",
      providerReference: `chapa_reference_${index}`,
      providerEventId: ids.providerEvent("chapa", index),
      checkoutUrl: `https://checkout.chapa.co/pay/${index}`,
      status: refunded ? PaymentAttemptStatus.REFUNDED : baseStatus,
      amount: order.totalAmount,
      currency: order.currency,
      idempotencyKey: ids.idempotency("payment_attempt", index),
      failureCode:
        baseStatus === PaymentAttemptStatus.FAILED ? "CARD_DECLINED" : null,
      metadata: {
        orderStatus: order.status,
      },
      callbackPayload:
        baseStatus === PaymentAttemptStatus.FAILED
          ? { reason: "Insufficient funds" }
          : { reason: "Processed" },
      createdAt: addHours(order.createdAt, 1),
      updatedAt: addHours(order.createdAt, 2),
    });

    if (refunded) {
      refundedOrderIds.add(order.id);

      refunds.push({
        id: ids.refund(refunds.length + 1),
        orderId: order.id,
        paymentAttemptId: ids.paymentAttempt(index, 1),
        amount: roundCurrency(Math.max(5, order.totalAmount * 0.6)),
        currency: order.currency,
        reason: "Attendee cancellation within policy window",
        status: index % 16 === 0 ? RefundStatus.COMPLETED : RefundStatus.PROCESSING,
        requestedBy: input.fallbackRequestedBy,
        createdAt: addHours(order.createdAt, 36),
        completedAt: index % 16 === 0 ? addHours(order.createdAt, 72) : null,
      });
    }
  }

  return {
    paymentAttempts,
    refunds,
    refundedOrderIds,
  };
}
