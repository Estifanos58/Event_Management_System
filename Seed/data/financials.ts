import { EventStatus, PayoutStatus, SettlementStatus, type Prisma } from "@prisma/client";
import { addDays, addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { roundCurrency } from "../utils/helpers";
import type { SeedEventProfile, SeedOrderProfile } from "./types";

type FinancialSeedResult = {
  payouts: Prisma.PayoutCreateManyInput[];
  settlements: Prisma.SettlementCreateManyInput[];
};

export function buildFinancials(input: {
  events: SeedEventProfile[];
  orders: SeedOrderProfile[];
}): FinancialSeedResult {
  const completedEvents = input.events.filter((event) => event.status === EventStatus.COMPLETED);
  const payouts: Prisma.PayoutCreateManyInput[] = [];
  const settlements: Prisma.SettlementCreateManyInput[] = [];

  let payoutIndex = 1;
  let settlementIndex = 1;

  for (const event of completedEvents) {
    const eventOrders = input.orders.filter(
      (order) => order.eventId === event.id && order.status === "COMPLETED",
    );
    const gross = eventOrders.reduce((sum, order) => sum + order.subtotalAmount, 0);

    for (let period = 1; period <= 5; period += 1) {
      const periodRatio = 0.14 + period * 0.06;
      const grossAmount = roundCurrency(Math.max(100, gross * periodRatio));
      const taxAmount = roundCurrency(grossAmount * 0.12);
      const platformFeeAmount = roundCurrency(grossAmount * 0.07);
      const processorFeeAmount = roundCurrency(grossAmount * 0.03);
      const netAmount = roundCurrency(
        Math.max(0, grossAmount - taxAmount - platformFeeAmount - processorFeeAmount),
      );

      const payoutId = ids.payout(payoutIndex);
      const payoutStatus =
        payoutIndex % 5 === 0
          ? PayoutStatus.FAILED
          : payoutIndex % 3 === 0
            ? PayoutStatus.IN_TRANSIT
            : PayoutStatus.SETTLED;

      payouts.push({
        id: payoutId,
        orgId: event.orgId,
        amount: netAmount,
        currency: "USD",
        status: payoutStatus,
        reference: `PO-${payoutIndex.toString().padStart(5, "0")}`,
        paidAt: payoutStatus === PayoutStatus.SETTLED ? addDays(event.endAt, 18 + period) : null,
        createdAt: addDays(event.endAt, 14 + period),
      });

      settlements.push({
        id: ids.settlement(settlementIndex),
        orgId: event.orgId,
        eventId: event.id,
        grossAmount,
        taxAmount,
        platformFeeAmount,
        processorFeeAmount,
        netAmount,
        currency: "USD",
        status:
          payoutStatus === PayoutStatus.SETTLED
            ? SettlementStatus.PAID
            : payoutStatus === PayoutStatus.FAILED
              ? SettlementStatus.READY
              : SettlementStatus.PENDING,
        periodStart: addDays(event.endAt, period - 1),
        periodEnd: addDays(event.endAt, period),
        payoutId,
        createdAt: addHours(addDays(event.endAt, 16 + period), 2),
      });

      payoutIndex += 1;
      settlementIndex += 1;
    }
  }

  return {
    payouts,
    settlements,
  };
}
