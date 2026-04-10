"use server";

import { redirect } from "next/navigation";
import type { EventDuplicateMode } from "@/domains/events/types";
import {
  assignEventStaff,
  createEventDraft,
  createEventGate,
  createEventSession,
  createEventTicketClass,
  duplicateEventAsDraft,
  parseEventDuplicateMode,
  setEventTicketSalesPaused,
  transitionEventStatus,
  updateEventExperience,
  updateEventBasics,
} from "@/domains/events/service";

export type EventActionState = {
  error?: string;
  success?: string;
};

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function getStrings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function actionError(error: unknown): EventActionState {
  if (error instanceof Error) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Unexpected event action failure.",
  };
}

type EventStatefulAction = (
  _state: EventActionState | undefined,
  formData: FormData,
) => Promise<EventActionState | undefined>;

async function runEventFormAction(
  action: EventStatefulAction,
  formData: FormData,
): Promise<void> {
  const result = await action(undefined, formData);

  if (result?.error) {
    throw new Error(result.error);
  }
}

export async function createEventDraftAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  try {
    const seedSessionTitle = getString(formData, "seedSessionTitle");
    const seedSessionCapacity = getString(formData, "seedSessionCapacity");
    const publishAtValue = getString(formData, "publishAt");
    const totalCapacityValue = getString(formData, "totalCapacity");

    const event = await createEventDraft({
      title: getString(formData, "title"),
      description: getString(formData, "description"),
      coverImageUrl: getString(formData, "coverImageUrl") || undefined,
      galleryImages: getString(formData, "galleryImages") || undefined,
      visibility: getString(formData, "visibility") as
        | "PUBLIC"
        | "UNLISTED"
        | "PRIVATE",
      venueMode: getString(formData, "venueMode") as
        | "PHYSICAL"
        | "VIRTUAL"
        | "HYBRID",
      registrationType: getString(formData, "registrationType") as
        | "OPEN"
        | "APPROVAL_REQUIRED"
        | "APPLICATION_BASED",
      venueName: getString(formData, "venueName"),
      venueAddress: getString(formData, "venueAddress"),
      virtualMeetingUrl: getString(formData, "virtualMeetingUrl"),
      totalCapacity: totalCapacityValue ? Number(totalCapacityValue) : undefined,
      waitlistEnabled: getBoolean(formData, "waitlistEnabled"),
      timezone: getString(formData, "timezone"),
      startAt: new Date(getString(formData, "startAt")),
      endAt: new Date(getString(formData, "endAt")),
      publishAt: publishAtValue ? new Date(publishAtValue) : undefined,
      seedSession: seedSessionTitle
        ? {
            title: seedSessionTitle,
            room: getString(formData, "seedSessionRoom"),
            capacity: Number(seedSessionCapacity),
            waitlistEnabled: getBoolean(formData, "seedSessionWaitlist"),
          }
        : undefined,
    });

    redirect(`/organizer/events/${event.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateEventBasicsAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    const publishAtValue = getString(formData, "publishAt");
    const totalCapacityValue = getString(formData, "totalCapacity");

    await updateEventBasics(eventId, {
      title: getString(formData, "title"),
      description: getString(formData, "description"),
      coverImageUrl: getString(formData, "coverImageUrl") || undefined,
      galleryImages: getString(formData, "galleryImages") || undefined,
      visibility: getString(formData, "visibility") as
        | "PUBLIC"
        | "UNLISTED"
        | "PRIVATE",
      venueMode: getString(formData, "venueMode") as
        | "PHYSICAL"
        | "VIRTUAL"
        | "HYBRID",
      registrationType: getString(formData, "registrationType") as
        | "OPEN"
        | "APPROVAL_REQUIRED"
        | "APPLICATION_BASED",
      venueName: getString(formData, "venueName"),
      venueAddress: getString(formData, "venueAddress"),
      virtualMeetingUrl: getString(formData, "virtualMeetingUrl"),
      totalCapacity: totalCapacityValue ? Number(totalCapacityValue) : undefined,
      waitlistEnabled: getBoolean(formData, "waitlistEnabled"),
      timezone: getString(formData, "timezone"),
      startAt: new Date(getString(formData, "startAt")),
      endAt: new Date(getString(formData, "endAt")),
      publishAt: publishAtValue ? new Date(publishAtValue) : undefined,
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function transitionEventStatusAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    await transitionEventStatus(eventId, {
      nextStatus: getString(formData, "nextStatus") as
        | "DRAFT"
        | "IN_REVIEW"
        | "APPROVED"
        | "PUBLISHED"
        | "LIVE"
        | "COMPLETED"
        | "ARCHIVED"
        | "CANCELLED"
        | "POSTPONED",
      reason: getString(formData, "reason"),
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function duplicateEventAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    const mode = parseEventDuplicateMode({
      mode: getString(formData, "mode") as EventDuplicateMode,
    });

    const duplicated = await duplicateEventAsDraft(eventId, mode);
    redirect(`/organizer/events/${duplicated.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function createEventSessionAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    await createEventSession(eventId, {
      title: getString(formData, "title"),
      startAt: new Date(getString(formData, "startAt")),
      endAt: new Date(getString(formData, "endAt")),
      room: getString(formData, "room"),
      capacity: Number(getString(formData, "capacity")),
      waitlistEnabled: getBoolean(formData, "waitlistEnabled"),
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function createEventGateAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    await createEventGate(eventId, {
      name: getString(formData, "name"),
      code: getString(formData, "code"),
      allowedTicketClassIds: getStrings(formData, "allowedTicketClassIds"),
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function assignEventStaffAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    await assignEventStaff(eventId, {
      staffEmail: getString(formData, "staffEmail"),
      gateId: getString(formData, "gateId") || undefined,
      assignmentRole: getString(formData, "assignmentRole") || undefined,
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function createEventTicketClassAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    const type = getString(formData, "type") as "FREE" | "PAID" | "VIP";
    const priceRaw = getString(formData, "price");

    await createEventTicketClass(eventId, {
      name: getString(formData, "name"),
      type,
      price: priceRaw ? Number(priceRaw) : type === "FREE" ? 0 : Number.NaN,
      currency: getString(formData, "currency"),
      salesStartAt: new Date(getString(formData, "salesStartAt")),
      salesEndAt: new Date(getString(formData, "salesEndAt")),
      capacity: Number(getString(formData, "capacity")),
      perOrderLimit: Number(getString(formData, "perOrderLimit")),
      hidden: getBoolean(formData, "hidden"),
      releaseStrategy: getString(formData, "releaseStrategy") as
        | "STANDARD"
        | "EARLY_BIRD"
        | "PHASED"
        | "DYNAMIC",
      unlockCode: getString(formData, "unlockCode") || undefined,
      dynamicPricingConfig: getString(formData, "dynamicPricingConfig") || undefined,
      bulkPricingConfig: getString(formData, "bulkPricingConfig") || undefined,
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateEventExperienceAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    const reminderLeadHoursRaw = getString(formData, "reminderLeadHours");

    await updateEventExperience(eventId, {
      slug: getString(formData, "slug") || undefined,
      brandingTheme: getString(formData, "brandingTheme") || undefined,
      brandingLogoUrl: getString(formData, "brandingLogoUrl") || undefined,
      brandingPrimaryColor: getString(formData, "brandingPrimaryColor") || undefined,
      brandingAccentColor: getString(formData, "brandingAccentColor") || undefined,
      registrationFormConfig:
        getString(formData, "registrationFormConfig") || undefined,
      confirmationEmailTemplate:
        getString(formData, "confirmationEmailTemplate") || undefined,
      reminderEmailTemplate: getString(formData, "reminderEmailTemplate") || undefined,
      reminderLeadHours: reminderLeadHoursRaw
        ? Number(reminderLeadHoursRaw)
        : undefined,
      organizerAnnouncementTemplate:
        getString(formData, "organizerAnnouncementTemplate") || undefined,
      shareMessage: getString(formData, "shareMessage") || undefined,
      referralEnabled: getBoolean(formData, "referralEnabled"),
      referralDefaultCode: getString(formData, "referralDefaultCode") || undefined,
      campaignTrackingEnabled: getBoolean(formData, "campaignTrackingEnabled"),
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function setEventTicketSalesPausedAction(
  _state: EventActionState | undefined,
  formData: FormData,
): Promise<EventActionState | undefined> {
  const eventId = getString(formData, "eventId");

  if (!eventId) {
    return {
      error: "Event id is required.",
    };
  }

  try {
    await setEventTicketSalesPaused(eventId, {
      paused: getString(formData, "paused") === "true",
      reason: getString(formData, "reason") || undefined,
    });

    redirect(`/organizer/events/${eventId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateEventBasicsFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(updateEventBasicsAction, formData);
}

export async function transitionEventStatusFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(transitionEventStatusAction, formData);
}

export async function duplicateEventFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(duplicateEventAction, formData);
}

export async function createEventSessionFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(createEventSessionAction, formData);
}

export async function createEventGateFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(createEventGateAction, formData);
}

export async function assignEventStaffFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(assignEventStaffAction, formData);
}

export async function createEventTicketClassFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(createEventTicketClassAction, formData);
}

export async function updateEventExperienceFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(updateEventExperienceAction, formData);
}

export async function setEventTicketSalesPausedFormAction(formData: FormData): Promise<void> {
  await runEventFormAction(setEventTicketSalesPausedAction, formData);
}
