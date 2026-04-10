import {
  InboundProviderEventStatus,
  IntegrationProviderType,
  type Prisma,
} from "@prisma/client";
import { addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrganizationProfile } from "./types";

export function buildInboundProviderEvents(input: {
  now: Date;
  organizations: SeedOrganizationProfile[];
  events: SeedEventProfile[];
}): Prisma.InboundProviderEventCreateManyInput[] {
  const inboundEvents: Prisma.InboundProviderEventCreateManyInput[] = [];

  for (let index = 1; index <= 15; index += 1) {
    const organization = pickCyclic(input.organizations, index - 1);
    const event = pickCyclic(input.events, index + 2);

    const status =
      index % 5 === 0
        ? InboundProviderEventStatus.FAILED
        : index % 3 === 0
          ? InboundProviderEventStatus.PROCESSED
          : InboundProviderEventStatus.RECEIVED;

    inboundEvents.push({
      id: ids.inboundProviderEvent(index),
      providerType:
        index % 2 === 0 ? IntegrationProviderType.PAYMENT : IntegrationProviderType.MESSAGING,
      provider: index % 2 === 0 ? "chapa" : "twilio",
      providerEventId: ids.providerEvent("inbound", index),
      eventType: index % 2 === 0 ? "payment.captured" : "notification.delivered",
      signature: `signature_${index}`,
      payload: {
        eventId: event.id,
        orgId: organization.id,
        message: "Synthetic provider payload for integration testing",
      },
      status,
      errorMessage:
        status === InboundProviderEventStatus.FAILED
          ? "Signature validation failed"
          : null,
      processedAt:
        status === InboundProviderEventStatus.PROCESSED
          ? addHours(subDays(input.now, 7), index)
          : null,
      orgId: organization.id,
      eventId: event.id,
      createdAt: addHours(subDays(input.now, 15), index),
      updatedAt: addHours(subDays(input.now, 14), index),
    });
  }

  return inboundEvents;
}
