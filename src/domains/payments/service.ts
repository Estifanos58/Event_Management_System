import {
  EventSessionStatus,
  EventStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PayoutStatus,
  Prisma,
  RefundStatus,
  RiskSeverity,
  RiskStatus,
  ScopeType,
  SettlementStatus,
  TicketStatus,
} from "@prisma/client";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { prisma } from "@/core/db/prisma";
import {
  createAccessContext,
  requirePermission,
} from "@/domains/identity/guards";
import { TicketingDomainError } from "@/domains/ticketing/errors";
import type {
  CreateSettlementInput,
  FinancialReconciliationReport,
  FinancialReconciliationReportInput,
  OrderRefundPolicyDecision,
  RecordPaymentDisputeInput,
  SchedulePayoutInput,
  TransitionPayoutInput,
  UpdatePaymentDisputeWorkflowInput,
  ExecuteOrderRefundInput,
} from "@/domains/payments/types";

const EPSILON = 0.009;

const createSettlementInputSchema = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  processorFeeRateBps: z.coerce
    .number()
    .int("Processor fee rate must be an integer basis points value.")
    .min(0, "Processor fee rate cannot be negative.")
    .max(2_000, "Processor fee rate cannot exceed 2000 bps.")
    .optional(),
});

const schedulePayoutInputSchema = z.object({
  settlementIds: z
    .array(z.string().trim().min(1, "Settlement id is required."))
    .min(1, "At least one settlement id is required.")
    .max(500, "Cannot schedule more than 500 settlements per payout.")
    .optional(),
  reference: z
    .string()
    .trim()
    .max(120, "Payout reference cannot exceed 120 characters.")
    .optional(),
});

const transitionPayoutInputSchema = z.object({
  nextStatus: z.enum([PayoutStatus.IN_TRANSIT, PayoutStatus.SETTLED, PayoutStatus.FAILED]),
  reference: z
    .string()
    .trim()
    .max(120, "Payout reference cannot exceed 120 characters.")
    .optional(),
  reason: z
    .string()
    .trim()
    .max(240, "Payout transition reason cannot exceed 240 characters.")
    .optional(),
});

const executeRefundInputSchema = z
  .object({
    amount: z.coerce
      .number()
      .positive("Refund amount must be greater than zero.")
      .max(1_000_000_000, "Refund amount is too large.")
      .optional(),
    reason: z
      .string()
      .trim()
      .min(4, "Refund reason must contain at least 4 characters.")
      .max(240, "Refund reason cannot exceed 240 characters."),
    overridePolicy: z.boolean().optional(),
    overrideReasonCode: z
      .string()
      .trim()
      .max(80, "Override reason code cannot exceed 80 characters.")
      .optional(),
  })
  .refine(
    (payload) => !payload.overridePolicy || Boolean(payload.overrideReasonCode?.trim()),
    {
      message: "Override reason code is required when overridePolicy is enabled.",
      path: ["overrideReasonCode"],
    },
  );

const recordPaymentDisputeInputSchema = z.object({
  paymentAttemptId: z.string().trim().min(1, "Payment attempt id is required.").optional(),
  reason: z
    .string()
    .trim()
    .min(4, "Dispute reason must contain at least 4 characters.")
    .max(500, "Dispute reason cannot exceed 500 characters."),
  severity: z.enum(RiskSeverity).optional(),
  restrictTicketAccess: z.boolean().optional(),
  evidence: z.unknown().optional(),
});

const updatePaymentDisputeWorkflowInputSchema = z.object({
  nextStatus: z.enum(RiskStatus),
  reason: z
    .string()
    .trim()
    .max(240, "Dispute workflow reason cannot exceed 240 characters.")
    .optional(),
});

const financialReconciliationReportInputSchema = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

const payoutTransitionMap: Record<PayoutStatus, PayoutStatus[]> = {
  [PayoutStatus.SCHEDULED]: [PayoutStatus.IN_TRANSIT, PayoutStatus.SETTLED, PayoutStatus.FAILED],
  [PayoutStatus.IN_TRANSIT]: [PayoutStatus.SETTLED, PayoutStatus.FAILED],
  [PayoutStatus.SETTLED]: [],
  [PayoutStatus.FAILED]: [],
};

const disputeTransitionMap: Record<RiskStatus, RiskStatus[]> = {
  [RiskStatus.OPEN]: [RiskStatus.INVESTIGATING, RiskStatus.CLOSED],
  [RiskStatus.INVESTIGATING]: [RiskStatus.MITIGATED, RiskStatus.CLOSED],
  [RiskStatus.MITIGATED]: [RiskStatus.CLOSED],
  [RiskStatus.CLOSED]: [],
};

function now() {
  return new Date();
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toDecimalNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(value.toString());
}

function roundCurrency(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function assertValidPeriod(periodStart: Date, periodEnd: Date) {
  if (periodStart.getTime() >= periodEnd.getTime()) {
    throw new TicketingDomainError(
      422,
      "UNPROCESSABLE_TICKETING",
      "Financial period end must be after period start.",
    );
  }
}

async function requireFinancePermission(
  eventId: string,
  action: string,
  highRisk = false,
) {
  return requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "finance.manage",
    action,
    targetType: "Event",
    targetId: eventId,
    highRisk,
  });
}

async function loadEventFinanceContext(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
    },
  });

  if (!event) {
    throw new TicketingDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  return event;
}

function parseCreateSettlementInput(payload: unknown): CreateSettlementInput {
  const parsed = createSettlementInputSchema.parse(payload);

  return {
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    processorFeeRateBps: parsed.processorFeeRateBps,
  };
}

function parseSchedulePayoutInput(payload: unknown): SchedulePayoutInput {
  const parsed = schedulePayoutInputSchema.parse(payload);

  return {
    settlementIds: parsed.settlementIds,
    reference: normalizeOptionalText(parsed.reference),
  };
}

function parseTransitionPayoutInput(payload: unknown): TransitionPayoutInput {
  const parsed = transitionPayoutInputSchema.parse(payload);

  return {
    nextStatus: parsed.nextStatus,
    reference: normalizeOptionalText(parsed.reference),
    reason: normalizeOptionalText(parsed.reason),
  };
}

function parseExecuteOrderRefundInput(payload: unknown): ExecuteOrderRefundInput {
  const parsed = executeRefundInputSchema.parse(payload);

  return {
    amount: parsed.amount,
    reason: parsed.reason,
    overridePolicy: parsed.overridePolicy ?? false,
    overrideReasonCode: normalizeOptionalText(parsed.overrideReasonCode),
  };
}

function parseRecordPaymentDisputeInput(payload: unknown): RecordPaymentDisputeInput {
  const parsed = recordPaymentDisputeInputSchema.parse(payload);

  return {
    paymentAttemptId: normalizeOptionalText(parsed.paymentAttemptId),
    reason: parsed.reason,
    severity: parsed.severity ?? RiskSeverity.HIGH,
    restrictTicketAccess: parsed.restrictTicketAccess ?? false,
    evidence: parsed.evidence,
  };
}

function parseUpdatePaymentDisputeWorkflowInput(
  payload: unknown,
): UpdatePaymentDisputeWorkflowInput {
  const parsed = updatePaymentDisputeWorkflowInputSchema.parse(payload);

  return {
    nextStatus: parsed.nextStatus,
    reason: normalizeOptionalText(parsed.reason),
  };
}

function parseFinancialReconciliationReportInput(
  payload: unknown,
): FinancialReconciliationReportInput {
  const parsed = financialReconciliationReportInputSchema.parse(payload);

  return {
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
  };
}

export async function createSettlementRecord(
  eventId: string,
  input: CreateSettlementInput,
) {
  const parsedInput = parseCreateSettlementInput(input);
  const { session } = await requireFinancePermission(
    eventId,
    "finance.settlement.create",
  );
  const event = await loadEventFinanceContext(eventId);

  const periodStart = parsedInput.periodStart ?? event.startAt;
  const periodEnd = parsedInput.periodEnd ?? new Date(Math.min(now().getTime(), event.endAt.getTime()));
  assertValidPeriod(periodStart, periodEnd);

  const existing = await prisma.settlement.findFirst({
    where: {
      eventId,
      periodStart,
      periodEnd,
    },
  });

  if (existing) {
    return {
      settlement: existing,
      reused: true,
    };
  }

  const [orderAggregate, refundAggregate, currencySample] = await Promise.all([
    prisma.order.aggregate({
      where: {
        eventId,
        status: OrderStatus.COMPLETED,
        completedAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      _sum: {
        totalAmount: true,
        taxAmount: true,
        feeAmount: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.refund.aggregate({
      where: {
        order: {
          eventId,
        },
        status: RefundStatus.COMPLETED,
        completedAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.order.findFirst({
      where: {
        eventId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        currency: true,
      },
    }),
  ]);

  const grossAmount = roundCurrency(toDecimalNumber(orderAggregate._sum.totalAmount));
  const taxAmount = roundCurrency(toDecimalNumber(orderAggregate._sum.taxAmount));
  const platformFeeAmount = roundCurrency(toDecimalNumber(orderAggregate._sum.feeAmount));
  const refundAmount = roundCurrency(toDecimalNumber(refundAggregate._sum.amount));
  const processorFeeRateBps = parsedInput.processorFeeRateBps ?? 0;
  const processorFeeAmount = roundCurrency(grossAmount * (processorFeeRateBps / 10_000));
  const netAmount = roundCurrency(
    Math.max(0, grossAmount - taxAmount - platformFeeAmount - processorFeeAmount - refundAmount),
  );
  const currency = currencySample?.currency ?? "USD";
  const settlementStatus = periodEnd.getTime() <= now().getTime() ? SettlementStatus.READY : SettlementStatus.PENDING;

  const settlement = await prisma.settlement.create({
    data: {
      orgId: event.orgId,
      eventId,
      grossAmount,
      taxAmount,
      platformFeeAmount,
      processorFeeAmount,
      netAmount,
      currency,
      status: settlementStatus,
      periodStart,
      periodEnd,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "finance.settlement.created",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Settlement",
    targetId: settlement.id,
    newValue: {
      periodStart: settlement.periodStart.toISOString(),
      periodEnd: settlement.periodEnd.toISOString(),
      grossAmount,
      taxAmount,
      platformFeeAmount,
      processorFeeAmount,
      refundAmount,
      netAmount,
      currency,
      orderCount: orderAggregate._count._all,
    },
  });

  return {
    settlement,
    reused: false,
  };
}

export async function scheduleEventPayout(eventId: string, input: SchedulePayoutInput) {
  const parsedInput = parseSchedulePayoutInput(input);
  const { session } = await requireFinancePermission(eventId, "finance.payout.schedule");
  const event = await loadEventFinanceContext(eventId);

  const settlements = await prisma.settlement.findMany({
    where: {
      orgId: event.orgId,
      eventId,
      status: SettlementStatus.READY,
      payoutId: null,
      ...(parsedInput.settlementIds
        ? {
            id: {
              in: parsedInput.settlementIds,
            },
          }
        : {}),
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (settlements.length === 0) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "No READY settlements available for payout scheduling.",
    );
  }

  const currencySet = new Set(settlements.map((settlement) => settlement.currency));

  if (currencySet.size > 1) {
    throw new TicketingDomainError(
      422,
      "UNPROCESSABLE_TICKETING",
      "All settlements in a payout batch must share the same currency.",
    );
  }

  const amount = roundCurrency(
    settlements.reduce((sum, settlement) => sum + toDecimalNumber(settlement.netAmount), 0),
  );

  const payout = await prisma.$transaction(async (tx) => {
    const createdPayout = await tx.payout.create({
      data: {
        orgId: event.orgId,
        amount,
        currency: settlements[0].currency,
        status: PayoutStatus.SCHEDULED,
        reference: parsedInput.reference,
      },
    });

    await tx.settlement.updateMany({
      where: {
        id: {
          in: settlements.map((settlement) => settlement.id),
        },
      },
      data: {
        payoutId: createdPayout.id,
      },
    });

    return createdPayout;
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "finance.payout.scheduled",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Payout",
    targetId: payout.id,
    newValue: {
      settlementIds: settlements.map((settlement) => settlement.id),
      settlementCount: settlements.length,
      amount,
      currency: payout.currency,
      reference: payout.reference,
    },
  });

  return {
    payout,
    settlements,
  };
}

export async function transitionEventPayoutStatus(
  eventId: string,
  payoutId: string,
  input: TransitionPayoutInput,
) {
  const parsedInput = parseTransitionPayoutInput(input);
  const { session } = await requireFinancePermission(eventId, "finance.payout.transition");
  const event = await loadEventFinanceContext(eventId);

  const payout = await prisma.payout.findUnique({
    where: {
      id: payoutId,
    },
    include: {
      settlements: {
        select: {
          id: true,
          eventId: true,
          status: true,
        },
      },
    },
  });

  if (!payout || payout.orgId !== event.orgId) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Payout not found.");
  }

  if (payout.settlements.length === 0 || payout.settlements.some((settlement) => settlement.eventId !== eventId)) {
    throw new TicketingDomainError(
      422,
      "UNPROCESSABLE_TICKETING",
      "Payout does not belong to the requested event settlement scope.",
    );
  }

  if (payout.status === parsedInput.nextStatus) {
    return payout;
  }

  const allowedNextStatuses = payoutTransitionMap[payout.status] ?? [];

  if (!allowedNextStatuses.includes(parsedInput.nextStatus)) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      `Payout transition ${payout.status} -> ${parsedInput.nextStatus} is not allowed.`,
    );
  }

  const updatedPayout = await prisma.$transaction(async (tx) => {
    const nextPayout = await tx.payout.update({
      where: {
        id: payout.id,
      },
      data: {
        status: parsedInput.nextStatus,
        reference: parsedInput.reference ?? payout.reference,
        paidAt: parsedInput.nextStatus === PayoutStatus.SETTLED ? now() : payout.paidAt,
      },
    });

    if (parsedInput.nextStatus === PayoutStatus.SETTLED) {
      await tx.settlement.updateMany({
        where: {
          id: {
            in: payout.settlements.map((settlement) => settlement.id),
          },
        },
        data: {
          status: SettlementStatus.PAID,
        },
      });
    }

    if (parsedInput.nextStatus === PayoutStatus.FAILED) {
      await tx.settlement.updateMany({
        where: {
          id: {
            in: payout.settlements.map((settlement) => settlement.id),
          },
        },
        data: {
          status: SettlementStatus.READY,
          payoutId: null,
        },
      });
    }

    return nextPayout;
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "finance.payout.transitioned",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Payout",
    targetId: payout.id,
    reason: parsedInput.reason,
    oldValue: {
      status: payout.status,
    },
    newValue: {
      status: updatedPayout.status,
      paidAt: updatedPayout.paidAt?.toISOString() ?? null,
      reference: updatedPayout.reference,
      settlementIds: payout.settlements.map((settlement) => settlement.id),
    },
  });

  return updatedPayout;
}

async function evaluateRefundPolicyForOrder(
  eventId: string,
  orderId: string,
): Promise<OrderRefundPolicyDecision> {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      eventId,
    },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      currency: true,
      event: {
        select: {
          id: true,
          status: true,
          startAt: true,
        },
      },
    },
  });

  if (!order) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Order not found.");
  }

  if (order.status !== OrderStatus.COMPLETED) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Refund policy applies only to completed orders.",
    );
  }

  const [completedRefundAggregate, totalSessions, cancelledSessions] = await Promise.all([
    prisma.refund.aggregate({
      where: {
        orderId,
        status: RefundStatus.COMPLETED,
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.eventSession.count({
      where: {
        eventId,
      },
    }),
    prisma.eventSession.count({
      where: {
        eventId,
        status: EventSessionStatus.CANCELLED,
      },
    }),
  ]);

  const orderTotalAmount = roundCurrency(toDecimalNumber(order.totalAmount));
  const refundedAmount = roundCurrency(toDecimalNumber(completedRefundAggregate._sum.amount));
  const refundableRemaining = roundCurrency(Math.max(0, orderTotalAmount - refundedAmount));

  let policyWindow: OrderRefundPolicyDecision["policyWindow"] = "NONE";
  let policyPercent = 0;
  let reasonCode = "REFUND_WINDOW_CLOSED";

  const hoursUntilStart = (order.event.startAt.getTime() - now().getTime()) / (60 * 60 * 1000);

  if (order.event.status === EventStatus.CANCELLED || order.event.status === EventStatus.POSTPONED) {
    policyWindow = "FULL";
    policyPercent = 100;
    reasonCode = "EVENT_STATUS_REFUND_FULL";
  } else if (hoursUntilStart >= 72) {
    policyWindow = "FULL";
    policyPercent = 100;
    reasonCode = "REFUND_WINDOW_FULL";
  } else if (hoursUntilStart >= 24) {
    policyWindow = "PARTIAL";
    policyPercent = 50;
    reasonCode = "REFUND_WINDOW_PARTIAL";
  }

  if (totalSessions > 0 && cancelledSessions > 0 && order.event.status !== EventStatus.CANCELLED) {
    if (cancelledSessions >= totalSessions) {
      policyWindow = "FULL";
      policyPercent = 100;
      reasonCode = "SESSIONS_CANCELLED_FULL";
    } else {
      const sessionPartialPercent = Math.max(
        1,
        Math.min(99, Math.round((cancelledSessions / totalSessions) * 100)),
      );

      if (sessionPartialPercent > policyPercent) {
        policyWindow = "PARTIAL";
        policyPercent = sessionPartialPercent;
        reasonCode = "SESSIONS_CANCELLED_PARTIAL";
      }
    }
  }

  const policyEligibleAmount = roundCurrency((orderTotalAmount * policyPercent) / 100);
  const policyEligibleRemaining = roundCurrency(Math.max(0, policyEligibleAmount - refundedAmount));
  const maxRefundAmount = roundCurrency(
    Math.max(0, Math.min(refundableRemaining, policyEligibleRemaining)),
  );

  return {
    orderId: order.id,
    currency: order.currency,
    orderTotalAmount,
    refundedAmount,
    refundableRemaining,
    policyWindow,
    policyPercent,
    reasonCode,
    maxRefundAmount,
    hoursUntilStart,
    sessionCancellation: {
      totalSessions,
      cancelledSessions,
    },
  };
}

export async function getOrderRefundPolicyDecision(eventId: string, orderId: string) {
  await requireFinancePermission(eventId, "finance.refund.policy.read");
  return evaluateRefundPolicyForOrder(eventId, orderId);
}

export async function executeOrderRefund(
  eventId: string,
  orderId: string,
  input: ExecuteOrderRefundInput,
) {
  const parsedInput = parseExecuteOrderRefundInput(input);
  const { session } = await requireFinancePermission(
    eventId,
    "finance.refund.execute",
    parsedInput.overridePolicy,
  );

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      eventId,
    },
    select: {
      id: true,
      totalAmount: true,
      currency: true,
      paymentAttempts: {
        where: {
          status: {
            in: [PaymentAttemptStatus.CAPTURED, PaymentAttemptStatus.REFUNDED],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!order) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Order not found.");
  }

  const paymentAttempt = order.paymentAttempts[0];

  if (!paymentAttempt) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Refund requires a captured payment attempt.",
    );
  }

  const policy = await evaluateRefundPolicyForOrder(eventId, orderId);
  const requestedAmount = roundCurrency(parsedInput.amount ?? policy.maxRefundAmount);

  if (requestedAmount <= 0) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "No refundable amount is currently available for this order.",
    );
  }

  if (requestedAmount > policy.refundableRemaining + EPSILON) {
    throw new TicketingDomainError(
      422,
      "UNPROCESSABLE_TICKETING",
      "Requested refund amount exceeds remaining refundable balance.",
    );
  }

  if (!parsedInput.overridePolicy && requestedAmount > policy.maxRefundAmount + EPSILON) {
    throw new TicketingDomainError(
      422,
      "UNPROCESSABLE_TICKETING",
      "Requested refund amount exceeds policy-allowed amount.",
    );
  }

  const orderTotalAmount = roundCurrency(toDecimalNumber(order.totalAmount));

  const result = await prisma.$transaction(async (tx) => {
    const requestedRefund = await tx.refund.create({
      data: {
        orderId: order.id,
        paymentAttemptId: paymentAttempt.id,
        amount: requestedAmount,
        currency: order.currency,
        reason: parsedInput.reason,
        status: RefundStatus.REQUESTED,
        requestedBy: session.user.id,
      },
    });

    await tx.refund.update({
      where: {
        id: requestedRefund.id,
      },
      data: {
        status: RefundStatus.PROCESSING,
      },
    });

    const completedRefund = await tx.refund.update({
      where: {
        id: requestedRefund.id,
      },
      data: {
        status: RefundStatus.COMPLETED,
        completedAt: now(),
      },
    });

    const completedRefundAggregate = await tx.refund.aggregate({
      where: {
        orderId: order.id,
        status: RefundStatus.COMPLETED,
      },
      _sum: {
        amount: true,
      },
    });

    const totalRefunded = roundCurrency(toDecimalNumber(completedRefundAggregate._sum.amount));
    const fullyRefunded = totalRefunded >= orderTotalAmount - EPSILON;

    if (fullyRefunded) {
      await tx.paymentAttempt.update({
        where: {
          id: paymentAttempt.id,
        },
        data: {
          status: PaymentAttemptStatus.REFUNDED,
        },
      });

      await tx.ticket.updateMany({
        where: {
          orderId: order.id,
          status: {
            in: [TicketStatus.VALID, TicketStatus.CANCELLED],
          },
        },
        data: {
          status: TicketStatus.REFUNDED,
        },
      });
    }

    return {
      refund: completedRefund,
      totalRefunded,
      fullyRefunded,
    };
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: parsedInput.overridePolicy ? "finance.refund.override.processed" : "finance.refund.processed",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Refund",
    targetId: result.refund.id,
    reason: parsedInput.reason,
    newValue: {
      orderId,
      amount: requestedAmount,
      currency: order.currency,
      policyWindow: policy.policyWindow,
      policyPercent: policy.policyPercent,
      policyMaxRefundAmount: policy.maxRefundAmount,
      overridePolicy: parsedInput.overridePolicy,
      overrideReasonCode: parsedInput.overrideReasonCode,
      totalRefunded: result.totalRefunded,
      fullyRefunded: result.fullyRefunded,
    },
  });

  return {
    refund: result.refund,
    policy,
    totalRefunded: result.totalRefunded,
    fullyRefunded: result.fullyRefunded,
  };
}

export async function recordPaymentDispute(
  eventId: string,
  orderId: string,
  input: RecordPaymentDisputeInput,
) {
  const parsedInput = parseRecordPaymentDisputeInput(input);
  const { session } = await requireFinancePermission(
    eventId,
    "finance.dispute.record",
    parsedInput.restrictTicketAccess,
  );
  const event = await loadEventFinanceContext(eventId);

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      eventId,
    },
    select: {
      id: true,
      paymentAttempts: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          status: true,
          provider: true,
          providerReference: true,
        },
      },
    },
  });

  if (!order) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Order not found.");
  }

  const paymentAttempt = parsedInput.paymentAttemptId
    ? order.paymentAttempts.find((attempt) => attempt.id === parsedInput.paymentAttemptId)
    : order.paymentAttempts[0];

  if (!paymentAttempt) {
    throw new TicketingDomainError(
      422,
      "UNPROCESSABLE_TICKETING",
      "A related payment attempt is required to record a dispute.",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const riskCase = await tx.riskCase.create({
      data: {
        scopeType: ScopeType.EVENT,
        scopeId: eventId,
        source: "PAYMENT_DISPUTE",
        severity: parsedInput.severity ?? RiskSeverity.HIGH,
        status: RiskStatus.OPEN,
        eventId,
        organizationId: event.orgId,
        createdBy: session.user.id,
      },
    });

    let restrictedTicketCount = 0;

    if (parsedInput.restrictTicketAccess) {
      const updateResult = await tx.ticket.updateMany({
        where: {
          orderId,
          status: TicketStatus.VALID,
        },
        data: {
          status: TicketStatus.VOID,
        },
      });

      restrictedTicketCount = updateResult.count;
    }

    return {
      riskCase,
      restrictedTicketCount,
    };
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "finance.dispute.recorded",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "RiskCase",
    targetId: result.riskCase.id,
    reason: parsedInput.reason,
    newValue: {
      source: "PAYMENT_DISPUTE",
      orderId,
      paymentAttemptId: paymentAttempt.id,
      paymentAttemptStatus: paymentAttempt.status,
      severity: parsedInput.severity,
      restrictTicketAccess: parsedInput.restrictTicketAccess,
      restrictedTicketCount: result.restrictedTicketCount,
      evidence: parsedInput.evidence,
    },
  });

  return {
    riskCase: result.riskCase,
    paymentAttempt,
    restrictedTicketCount: result.restrictedTicketCount,
  };
}

export async function listPaymentDisputes(eventId: string) {
  await requireFinancePermission(eventId, "finance.dispute.list");

  return prisma.riskCase.findMany({
    where: {
      eventId,
      source: "PAYMENT_DISPUTE",
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function updatePaymentDisputeWorkflow(
  eventId: string,
  riskCaseId: string,
  input: UpdatePaymentDisputeWorkflowInput,
) {
  const parsedInput = parseUpdatePaymentDisputeWorkflowInput(input);
  const { session } = await requireFinancePermission(
    eventId,
    "finance.dispute.workflow.update",
  );

  const riskCase = await prisma.riskCase.findFirst({
    where: {
      id: riskCaseId,
      eventId,
      source: "PAYMENT_DISPUTE",
    },
  });

  if (!riskCase) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Dispute case not found.");
  }

  if (riskCase.status === parsedInput.nextStatus) {
    return riskCase;
  }

  const allowedTransitions = disputeTransitionMap[riskCase.status] ?? [];

  if (!allowedTransitions.includes(parsedInput.nextStatus)) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      `Dispute workflow transition ${riskCase.status} -> ${parsedInput.nextStatus} is not allowed.`,
    );
  }

  const updatedRiskCase = await prisma.riskCase.update({
    where: {
      id: riskCase.id,
    },
    data: {
      status: parsedInput.nextStatus,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "finance.dispute.workflow.updated",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "RiskCase",
    targetId: riskCase.id,
    reason: parsedInput.reason,
    oldValue: {
      status: riskCase.status,
    },
    newValue: {
      status: updatedRiskCase.status,
    },
  });

  return updatedRiskCase;
}

export async function getFinancialReconciliationReport(
  eventId: string,
  input: FinancialReconciliationReportInput,
): Promise<FinancialReconciliationReport> {
  const parsedInput = parseFinancialReconciliationReportInput(input);
  await requireFinancePermission(eventId, "finance.reconciliation.report.read");
  const event = await loadEventFinanceContext(eventId);

  const periodStart = parsedInput.periodStart ?? event.startAt;
  const periodEnd = parsedInput.periodEnd ?? now();
  assertValidPeriod(periodStart, periodEnd);

  const periodFilter = {
    gte: periodStart,
    lte: periodEnd,
  };

  const [
    completedOrderAggregate,
    capturedPaymentAggregate,
    failedPaymentCount,
    completedRefundAggregate,
    settlements,
    payouts,
    disputesByStatus,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: {
        eventId,
        status: OrderStatus.COMPLETED,
        completedAt: periodFilter,
      },
      _count: {
        _all: true,
      },
      _sum: {
        subtotalAmount: true,
        taxAmount: true,
        feeAmount: true,
        discountAmount: true,
        totalAmount: true,
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
        updatedAt: periodFilter,
      },
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.paymentAttempt.count({
      where: {
        order: {
          eventId,
        },
        status: PaymentAttemptStatus.FAILED,
        updatedAt: periodFilter,
      },
    }),
    prisma.refund.aggregate({
      where: {
        order: {
          eventId,
        },
        status: RefundStatus.COMPLETED,
        completedAt: periodFilter,
      },
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.settlement.findMany({
      where: {
        eventId,
        periodStart: {
          gte: periodStart,
        },
        periodEnd: {
          lte: periodEnd,
        },
      },
      select: {
        id: true,
        status: true,
        netAmount: true,
      },
    }),
    prisma.payout.findMany({
      where: {
        orgId: event.orgId,
        settlements: {
          some: {
            eventId,
          },
        },
        createdAt: periodFilter,
      },
      select: {
        id: true,
        status: true,
        amount: true,
      },
    }),
    prisma.riskCase.groupBy({
      by: ["status"],
      where: {
        eventId,
        source: "PAYMENT_DISPUTE",
        createdAt: periodFilter,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const completedOrderTotals = {
    subtotal: roundCurrency(toDecimalNumber(completedOrderAggregate._sum.subtotalAmount)),
    tax: roundCurrency(toDecimalNumber(completedOrderAggregate._sum.taxAmount)),
    fee: roundCurrency(toDecimalNumber(completedOrderAggregate._sum.feeAmount)),
    discount: roundCurrency(toDecimalNumber(completedOrderAggregate._sum.discountAmount)),
    total: roundCurrency(toDecimalNumber(completedOrderAggregate._sum.totalAmount)),
  };
  const capturedPaymentAmount = roundCurrency(toDecimalNumber(capturedPaymentAggregate._sum.amount));
  const completedRefundAmount = roundCurrency(toDecimalNumber(completedRefundAggregate._sum.amount));

  const settlementStatusBreakdown = settlements.reduce<Record<string, number>>((acc, settlement) => {
    const key = settlement.status;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const payoutStatusBreakdown = payouts.reduce<Record<string, number>>((acc, payout) => {
    const key = payout.status;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const disputeStatusBreakdown = disputesByStatus.reduce<Record<string, number>>((acc, item) => {
    const key = item.status;
    acc[key] = item._count._all;
    return acc;
  }, {});

  const settlementNetAmount = roundCurrency(
    settlements.reduce((sum, settlement) => sum + toDecimalNumber(settlement.netAmount), 0),
  );
  const payoutAmount = roundCurrency(
    payouts.reduce((sum, payout) => sum + toDecimalNumber(payout.amount), 0),
  );

  const expectedNetFromOrders = roundCurrency(
    completedOrderTotals.total - completedOrderTotals.tax - completedOrderTotals.fee - completedRefundAmount,
  );
  const variance = roundCurrency(expectedNetFromOrders - settlementNetAmount);

  return {
    eventId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    orders: {
      completedCount: completedOrderAggregate._count._all,
      subtotalAmount: completedOrderTotals.subtotal,
      taxAmount: completedOrderTotals.tax,
      feeAmount: completedOrderTotals.fee,
      discountAmount: completedOrderTotals.discount,
      totalAmount: completedOrderTotals.total,
    },
    payments: {
      capturedCount: capturedPaymentAggregate._count._all,
      capturedAmount: capturedPaymentAmount,
      failedCount: failedPaymentCount,
    },
    refunds: {
      completedCount: completedRefundAggregate._count._all,
      completedAmount: completedRefundAmount,
    },
    settlements: {
      count: settlements.length,
      netAmount: settlementNetAmount,
      byStatus: settlementStatusBreakdown,
    },
    payouts: {
      count: payouts.length,
      amount: payoutAmount,
      byStatus: payoutStatusBreakdown,
    },
    disputes: {
      count: disputesByStatus.reduce((sum, item) => sum + item._count._all, 0),
      byStatus: disputeStatusBreakdown,
    },
    reconciliation: {
      expectedNetFromOrders,
      settlementNetRecorded: settlementNetAmount,
      variance,
    },
  };
}
