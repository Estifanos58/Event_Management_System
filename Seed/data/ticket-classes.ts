import { TicketReleaseStrategy, TicketType, type Prisma } from "@prisma/client";
import { addDays, addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import type { SeedEventProfile, SeedTicketClassProfile } from "./types";

type TicketClassSeedResult = {
  profiles: SeedTicketClassProfile[];
  ticketClasses: Prisma.TicketClassCreateManyInput[];
};

export function buildTicketClasses(events: SeedEventProfile[]): TicketClassSeedResult {
  const profiles: SeedTicketClassProfile[] = [];
  const ticketClasses: Prisma.TicketClassCreateManyInput[] = [];

  for (const event of events) {
    const tiers: Array<{
      tier: SeedTicketClassProfile["tier"];
      type: TicketType;
      price: number;
      releaseStrategy: TicketReleaseStrategy;
      capacityMultiplier: number;
      hidden: boolean;
      unlockCode: string | null;
    }> = [
      {
        tier: "FREE",
        type: TicketType.FREE,
        price: 0,
        releaseStrategy: TicketReleaseStrategy.STANDARD,
        capacityMultiplier: 0.45,
        hidden: false,
        unlockCode: null,
      },
      {
        tier: "PAID",
        type: TicketType.PAID,
        price: 45 + event.sequence * 4,
        releaseStrategy: TicketReleaseStrategy.EARLY_BIRD,
        capacityMultiplier: 0.4,
        hidden: false,
        unlockCode: null,
      },
      {
        tier: "VIP",
        type: TicketType.VIP,
        price: 120 + event.sequence * 8,
        releaseStrategy: TicketReleaseStrategy.PHASED,
        capacityMultiplier: 0.15,
        hidden: event.scenario === "PRIVATE",
        unlockCode: event.scenario === "PRIVATE" ? `VIP-${event.sequence}` : null,
      },
    ];

    for (const tier of tiers) {
      const id = ids.ticketClass(event.sequence, tier.tier);
      const capacity = Math.max(20, Math.floor(event.totalCapacity * tier.capacityMultiplier));

      profiles.push({
        id,
        eventId: event.id,
        eventSequence: event.sequence,
        name: `${tier.tier} Pass`,
        tier: tier.tier,
        price: tier.price,
        currency: "USD",
        capacity,
      });

      ticketClasses.push({
        id,
        eventId: event.id,
        name: `${tier.tier} Pass`,
        type: tier.type,
        price: tier.price,
        currency: "USD",
        salesStartAt: addDays(event.startAt, -30),
        salesEndAt: addHours(event.endAt, -1),
        capacity,
        perOrderLimit: tier.tier === "VIP" ? 4 : 8,
        hidden: tier.hidden,
        releaseStrategy: tier.releaseStrategy,
        unlockCode: tier.unlockCode,
        dynamicPricingConfig:
          tier.tier === "VIP"
            ? {
                enabled: true,
                bands: [
                  { threshold: 0.5, multiplier: 1.1 },
                  { threshold: 0.8, multiplier: 1.25 },
                ],
              }
            : undefined,
        bulkPricingConfig:
          tier.tier === "PAID"
            ? {
                enabled: true,
                discounts: [
                  { minQuantity: 3, percentOff: 8 },
                  { minQuantity: 5, percentOff: 12 },
                ],
              }
            : undefined,
        createdAt: addDays(event.startAt, -40),
        updatedAt: addDays(event.startAt, -8),
      });
    }
  }

  return {
    profiles,
    ticketClasses,
  };
}
