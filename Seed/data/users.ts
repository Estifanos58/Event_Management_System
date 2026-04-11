import type { Prisma } from "@prisma/client";
import { subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import type { SeedUserProfile } from "./types";

type UserSeedResult = {
  profiles: SeedUserProfile[];
  users: Prisma.UserCreateManyInput[];
  superAdminId: string;
  adminIds: string[];
  organizerIds: string[];
  staffIds: string[];
  attendeeIds: string[];
};

const ADMIN_COUNT = 3;
const ORGANIZER_COUNT = 5;
const ATTENDEE_COUNT = 4;

const GROUP_EMAIL_PREFIX: Record<SeedUserProfile["group"], string> = {
  SUPER_ADMIN: "admin",
  ORGANIZER: "organizer",
  STAFF: "staff",
  ATTENDEE: "attendee",
};

const GROUP_PASSWORD_PREFIX: Record<SeedUserProfile["group"], string> = {
  SUPER_ADMIN: "Admin",
  ORGANIZER: "Organizer",
  STAFF: "Staff",
  ATTENDEE: "Attendee",
};

function buildProfile(
  index: number,
  sequence: number,
  name: string,
  group: SeedUserProfile["group"],
): SeedUserProfile {
  const emailPrefix = GROUP_EMAIL_PREFIX[group];

  return {
    id: ids.user(index),
    name,
    email: `${emailPrefix}.${sequence}@event-demo.local`,
    password: `${GROUP_PASSWORD_PREFIX[group]}#2026-${sequence}`,
    group,
  };
}

export function buildUsers(now: Date): UserSeedResult {
  const profiles: SeedUserProfile[] = [];
  let nextIndex = 1;

  for (let adminSequence = 1; adminSequence <= ADMIN_COUNT; adminSequence += 1) {
    profiles.push(
      buildProfile(
        nextIndex,
        adminSequence,
        adminSequence === 1 ? "Platform Super Admin" : `Platform Admin ${adminSequence}`,
        "SUPER_ADMIN",
      ),
    );
    nextIndex += 1;
  }

  for (let organizerSequence = 1; organizerSequence <= ORGANIZER_COUNT; organizerSequence += 1) {
    profiles.push(
      buildProfile(nextIndex, organizerSequence, `Organizer ${organizerSequence}`, "ORGANIZER"),
    );
    nextIndex += 1;
  }

  for (let attendeeSequence = 1; attendeeSequence <= ATTENDEE_COUNT; attendeeSequence += 1) {
    profiles.push(
      buildProfile(nextIndex, attendeeSequence, `Attendee ${attendeeSequence}`, "ATTENDEE"),
    );
    nextIndex += 1;
  }

  const users: Prisma.UserCreateManyInput[] = profiles.map((profile, offset) => ({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    emailVerified: profile.group !== "ATTENDEE" || offset % 2 === 0,
    image: `https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=60&sig=${offset + 1}`,
    createdAt: subDays(now, 140 - offset * 2),
    updatedAt: subDays(now, 16 - (offset % 6)),
  }));

  return {
    profiles,
    users,
    superAdminId: ids.user(1),
    adminIds: profiles.filter((profile) => profile.group === "SUPER_ADMIN").map((profile) => profile.id),
    organizerIds: profiles.filter((profile) => profile.group === "ORGANIZER").map((profile) => profile.id),
    staffIds: profiles.filter((profile) => profile.group === "STAFF").map((profile) => profile.id),
    attendeeIds: profiles.filter((profile) => profile.group === "ATTENDEE").map((profile) => profile.id),
  };
}
