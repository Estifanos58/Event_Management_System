import {
  CheckInStatus,
  EventStatus,
  NotificationDeliveryStatus,
  OrderStatus,
  PaymentAttemptStatus,
  ReservationStatus,
  TicketStatus,
  WebhookDeliveryStatus,
  WebhookOutboxStatus,
} from "@prisma/client";
import { env } from "@/core/env";
import {
  calculatePercentile,
  getCounterValue,
  getDurationSamples,
  setGauge,
} from "@/core/observability/metrics";
import { prisma } from "@/core/db/prisma";

type ProviderRegionMetric = {
  provider: string;
  region: string;
  successCount: number;
  failureCount: number;
};

export type OperationalMetricsSnapshot = {
  generatedAt: string;
  windowMinutes: number;
  reservations: {
    createdCount: number;
    confirmedCount: number;
    expiredCount: number;
    conversionRate: number;
  };
  payments: {
    successCount: number;
    failureCount: number;
    byProviderRegion: ProviderRegionMetric[];
  };
  ticketing: {
    issuanceLagP95Ms: number;
    issuanceLagAvgMs: number;
    stuckOrderCount: number;
  };
  checkin: {
    acceptedCount: number;
    rejectedCount: number;
    duplicateCount: number;
    rejectionRate: number;
    duplicateRate: number;
    apiLatencyP95Ms: number;
    apiErrorRate: number;
  };
  webhooks: {
    pendingBacklogCount: number;
    deadLetterCount: number;
  };
  inventory: {
    driftViolationCount: number;
  };
  dependencies: {
    sustainedFailureCount: number;
  };
};

function roundNumber(value: number, precision = 4) {
  const multiplier = 10 ** precision;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function safeDivide(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

async function computeInventoryDriftViolations() {
  const activeEvents = await prisma.event.findMany({
    where: {
      status: {
        in: [EventStatus.PUBLISHED, EventStatus.LIVE],
      },
    },
    select: {
      id: true,
      totalCapacity: true,
    },
  });

  if (!activeEvents.length) {
    return 0;
  }

  const activeEventIds = activeEvents.map((event) => event.id);

  const [ticketClasses, classSoldCounts, classHoldCounts, eventSoldCounts, activeReservations] =
    await Promise.all([
      prisma.ticketClass.findMany({
        where: {
          eventId: {
            in: activeEventIds,
          },
        },
        select: {
          id: true,
          eventId: true,
          capacity: true,
        },
      }),
      prisma.ticket.groupBy({
        by: ["ticketClassId"],
        where: {
          eventId: {
            in: activeEventIds,
          },
          status: {
            in: [TicketStatus.VALID, TicketStatus.USED],
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.reservationItem.groupBy({
        by: ["ticketClassId"],
        where: {
          reservation: {
            eventId: {
              in: activeEventIds,
            },
            status: ReservationStatus.PENDING,
            expiresAt: {
              gt: new Date(),
            },
          },
        },
        _sum: {
          quantity: true,
        },
      }),
      prisma.ticket.groupBy({
        by: ["eventId"],
        where: {
          eventId: {
            in: activeEventIds,
          },
          status: {
            in: [TicketStatus.VALID, TicketStatus.USED],
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.reservation.findMany({
        where: {
          eventId: {
            in: activeEventIds,
          },
          status: ReservationStatus.PENDING,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          eventId: true,
          items: {
            select: {
              quantity: true,
            },
          },
        },
      }),
    ]);

  const classSoldMap = new Map(
    classSoldCounts.map((item) => [item.ticketClassId, item._count._all]),
  );
  const classHoldsMap = new Map(
    classHoldCounts.map((item) => [item.ticketClassId, item._sum.quantity ?? 0]),
  );

  let driftViolations = 0;

  for (const ticketClass of ticketClasses) {
    const sold = classSoldMap.get(ticketClass.id) ?? 0;
    const activeHolds = classHoldsMap.get(ticketClass.id) ?? 0;

    if (sold + activeHolds > ticketClass.capacity) {
      driftViolations += 1;
    }
  }

  const eventSoldMap = new Map(
    eventSoldCounts.map((item) => [item.eventId, item._count._all]),
  );
  const eventHoldsMap = new Map<string, number>();

  for (const reservation of activeReservations) {
    const quantity = reservation.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    eventHoldsMap.set(
      reservation.eventId,
      (eventHoldsMap.get(reservation.eventId) ?? 0) + quantity,
    );
  }

  for (const event of activeEvents) {
    if (event.totalCapacity === null) {
      continue;
    }

    const sold = eventSoldMap.get(event.id) ?? 0;
    const activeHolds = eventHoldsMap.get(event.id) ?? 0;

    if (sold + activeHolds > event.totalCapacity) {
      driftViolations += 1;
    }
  }

  return driftViolations;
}

export async function collectOperationalMetricsSnapshot(input?: {
  windowMinutes?: number;
}) {
  const windowMinutes = Math.max(1, input?.windowMinutes ?? env.OPS_METRICS_WINDOW_MINUTES);
  const windowStart = new Date(Date.now() - windowMinutes * 60_000);

  const [
    reservationCreatedCount,
    reservationConfirmedCount,
    reservationExpiredCount,
    paymentAttempts,
    completedOrders,
    stuckOrderCount,
    checkInStats,
    pendingWebhookBacklogCount,
    deadLetterWebhookCount,
    inventoryDriftViolationCount,
    failedPaymentCount,
    failedWebhookDeliveryCount,
    failedNotificationCount,
    checkInDurationSamples,
    checkInRequestCount,
    checkInErrorCount,
  ] = await Promise.all([
    prisma.reservation.count({
      where: {
        createdAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.reservation.count({
      where: {
        status: ReservationStatus.CONFIRMED,
        updatedAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.reservation.count({
      where: {
        status: ReservationStatus.EXPIRED,
        updatedAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.paymentAttempt.findMany({
      where: {
        updatedAt: {
          gte: windowStart,
        },
        status: {
          in: [PaymentAttemptStatus.CAPTURED, PaymentAttemptStatus.FAILED],
        },
      },
      select: {
        provider: true,
        status: true,
        order: {
          select: {
            event: {
              select: {
                organization: {
                  select: {
                    region: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: {
          gte: windowStart,
        },
      },
      select: {
        id: true,
        paymentAttempts: {
          where: {
            status: PaymentAttemptStatus.CAPTURED,
          },
          orderBy: {
            updatedAt: "asc",
          },
          take: 1,
          select: {
            updatedAt: true,
          },
        },
        tickets: {
          orderBy: {
            issuedAt: "asc",
          },
          take: 1,
          select: {
            issuedAt: true,
          },
        },
      },
    }),
    prisma.paymentAttempt.count({
      where: {
        status: PaymentAttemptStatus.CAPTURED,
        updatedAt: {
          lte: new Date(
            Date.now() - env.OPS_ALERT_PAYMENT_CAPTURE_NO_TICKET_MINUTES * 60_000,
          ),
        },
        order: {
          tickets: {
            none: {},
          },
        },
      },
    }),
    prisma.checkInEvent.groupBy({
      by: ["status"],
      where: {
        scannedAt: {
          gte: windowStart,
        },
      },
      _count: {
        _all: true,
      },
    }),
    prisma.webhookOutboxEvent.count({
      where: {
        status: WebhookOutboxStatus.PENDING,
      },
    }),
    prisma.webhookOutboxEvent.count({
      where: {
        status: WebhookOutboxStatus.DEAD_LETTER,
      },
    }),
    computeInventoryDriftViolations(),
    prisma.paymentAttempt.count({
      where: {
        status: PaymentAttemptStatus.FAILED,
        updatedAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.webhookDeliveryAttempt.count({
      where: {
        status: WebhookDeliveryStatus.FAILED,
        createdAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.notificationDelivery.count({
      where: {
        status: {
          in: [
            NotificationDeliveryStatus.FAILED,
            NotificationDeliveryStatus.DEAD_LETTER,
          ],
        },
        updatedAt: {
          gte: windowStart,
        },
      },
    }),
    getDurationSamples("checkin.api.duration_ms", {
      method: "POST",
    }),
    getCounterValue("checkin.api.request_total", {
      method: "POST",
    }),
    getCounterValue("checkin.api.error_total", {
      method: "POST",
    }),
  ]);

  const paymentByProviderRegion = new Map<string, ProviderRegionMetric>();
  let paymentSuccessCount = 0;
  let paymentFailureCount = 0;

  for (const attempt of paymentAttempts) {
    const region = attempt.order.event.organization.region || "UNKNOWN";
    const key = `${attempt.provider}|${region}`;
    const metric =
      paymentByProviderRegion.get(key) ?? {
        provider: attempt.provider,
        region,
        successCount: 0,
        failureCount: 0,
      };

    if (attempt.status === PaymentAttemptStatus.CAPTURED) {
      metric.successCount += 1;
      paymentSuccessCount += 1;
    } else if (attempt.status === PaymentAttemptStatus.FAILED) {
      metric.failureCount += 1;
      paymentFailureCount += 1;
    }

    paymentByProviderRegion.set(key, metric);
  }

  const issuanceLagValues: number[] = [];

  for (const order of completedOrders) {
    const capturedAt = order.paymentAttempts[0]?.updatedAt;
    const firstIssuedAt = order.tickets[0]?.issuedAt;

    if (!capturedAt || !firstIssuedAt) {
      continue;
    }

    issuanceLagValues.push(Math.max(0, firstIssuedAt.getTime() - capturedAt.getTime()));
  }

  const issuanceLagP95Ms = calculatePercentile(issuanceLagValues, 95);
  const issuanceLagAvgMs = issuanceLagValues.length
    ? issuanceLagValues.reduce((sum, value) => sum + value, 0) /
      issuanceLagValues.length
    : 0;

  const checkInAcceptedCount =
    checkInStats.find((item) => item.status === CheckInStatus.ACCEPTED)?._count._all ??
    0;
  const checkInRejectedCount =
    checkInStats.find((item) => item.status === CheckInStatus.REJECTED)?._count._all ??
    0;
  const checkInDuplicateCount =
    checkInStats.find((item) => item.status === CheckInStatus.DUPLICATE)?._count._all ??
    0;
  const checkInTotal = checkInAcceptedCount + checkInRejectedCount + checkInDuplicateCount;

  const rejectionRate = safeDivide(checkInRejectedCount, checkInTotal);
  const duplicateRate = safeDivide(checkInDuplicateCount, checkInTotal);
  const checkInApiLatencyP95Ms = calculatePercentile(checkInDurationSamples, 95);
  const checkInApiErrorRate = safeDivide(checkInErrorCount, checkInRequestCount);

  const reservationConversionRate = safeDivide(
    reservationConfirmedCount,
    reservationCreatedCount,
  );

  const sustainedFailureCount =
    failedPaymentCount + failedWebhookDeliveryCount + failedNotificationCount;

  const snapshot: OperationalMetricsSnapshot = {
    generatedAt: new Date().toISOString(),
    windowMinutes,
    reservations: {
      createdCount: reservationCreatedCount,
      confirmedCount: reservationConfirmedCount,
      expiredCount: reservationExpiredCount,
      conversionRate: roundNumber(reservationConversionRate),
    },
    payments: {
      successCount: paymentSuccessCount,
      failureCount: paymentFailureCount,
      byProviderRegion: Array.from(paymentByProviderRegion.values()).sort((left, right) => {
        if (left.provider !== right.provider) {
          return left.provider.localeCompare(right.provider);
        }

        return left.region.localeCompare(right.region);
      }),
    },
    ticketing: {
      issuanceLagP95Ms: roundNumber(issuanceLagP95Ms),
      issuanceLagAvgMs: roundNumber(issuanceLagAvgMs),
      stuckOrderCount,
    },
    checkin: {
      acceptedCount: checkInAcceptedCount,
      rejectedCount: checkInRejectedCount,
      duplicateCount: checkInDuplicateCount,
      rejectionRate: roundNumber(rejectionRate),
      duplicateRate: roundNumber(duplicateRate),
      apiLatencyP95Ms: roundNumber(checkInApiLatencyP95Ms),
      apiErrorRate: roundNumber(checkInApiErrorRate),
    },
    webhooks: {
      pendingBacklogCount: pendingWebhookBacklogCount,
      deadLetterCount: deadLetterWebhookCount,
    },
    inventory: {
      driftViolationCount: inventoryDriftViolationCount,
    },
    dependencies: {
      sustainedFailureCount,
    },
  };

  await Promise.all([
    setGauge("reservations.created.count", snapshot.reservations.createdCount),
    setGauge("reservations.confirmed.count", snapshot.reservations.confirmedCount),
    setGauge("reservations.expired.count", snapshot.reservations.expiredCount),
    setGauge("reservations.conversion.rate", snapshot.reservations.conversionRate),
    setGauge("payments.success.count", snapshot.payments.successCount),
    setGauge("payments.failure.count", snapshot.payments.failureCount),
    setGauge("ticketing.issuance_lag.p95_ms", snapshot.ticketing.issuanceLagP95Ms),
    setGauge("ticketing.issuance_lag.avg_ms", snapshot.ticketing.issuanceLagAvgMs),
    setGauge("ticketing.stuck_order.count", snapshot.ticketing.stuckOrderCount),
    setGauge("checkin.rejected.count", snapshot.checkin.rejectedCount),
    setGauge("checkin.duplicate.count", snapshot.checkin.duplicateCount),
    setGauge("checkin.rejection.rate", snapshot.checkin.rejectionRate),
    setGauge("checkin.duplicate.rate", snapshot.checkin.duplicateRate),
    setGauge("checkin.api_latency.p95_ms", snapshot.checkin.apiLatencyP95Ms),
    setGauge("checkin.api_error.rate", snapshot.checkin.apiErrorRate),
    setGauge("webhooks.backlog.pending.count", snapshot.webhooks.pendingBacklogCount),
    setGauge("webhooks.backlog.dead_letter.count", snapshot.webhooks.deadLetterCount),
    setGauge("inventory.drift_violation.count", snapshot.inventory.driftViolationCount),
    setGauge(
      "dependencies.failure.sustained.count",
      snapshot.dependencies.sustainedFailureCount,
    ),
  ]);

  for (const metric of snapshot.payments.byProviderRegion) {
    await Promise.all([
      setGauge("payments.success.by_provider_region.count", metric.successCount, {
        provider: metric.provider,
        region: metric.region,
      }),
      setGauge("payments.failure.by_provider_region.count", metric.failureCount, {
        provider: metric.provider,
        region: metric.region,
      }),
    ]);
  }

  return snapshot;
}
