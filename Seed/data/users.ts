import type { Prisma } from "@prisma/client";
import { subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import type { SeedUserProfile } from "./types";

type UserSeedResult = {
  profiles: SeedUserProfile[];
  users: Prisma.UserCreateManyInput[];
  superAdminId: string;
  organizerIds: string[];
  staffIds: string[];
  attendeeIds: string[];
};

function buildProfile(index: number, name: string, group: SeedUserProfile["group"]): SeedUserProfile {
  return {
    id: ids.user(index),
    name,
    email: `${group.toLowerCase()}.${index}@event-demo.local`,
    group,
  };
}

export function buildUsers(now: Date): UserSeedResult {
  const profiles: SeedUserProfile[] = [];

  profiles.push(buildProfile(1, "Platform Super Admin", "SUPER_ADMIN"));

  for (let index = 2; index <= 11; index += 1) {
    profiles.push(buildProfile(index, `Organizer ${index - 1}`, "ORGANIZER"));
  }

  for (let index = 12; index <= 21; index += 1) {
    profiles.push(buildProfile(index, `Staff ${index - 11}`, "STAFF"));
  }

  for (let index = 22; index <= 51; index += 1) {
    profiles.push(buildProfile(index, `Attendee ${index - 21}`, "ATTENDEE"));
  }

  const users: Prisma.UserCreateManyInput[] = profiles.map((profile, offset) => ({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    emailVerified: profile.group !== "ATTENDEE" || offset % 3 !== 0,
    image: `https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=60&sig=${offset + 1}`,
    createdAt: subDays(now, 140 - offset),
    updatedAt: subDays(now, 20 - (offset % 10)),
  }));

  return {
    profiles,
    users,
    superAdminId: ids.user(1),
    organizerIds: profiles.filter((profile) => profile.group === "ORGANIZER").map((profile) => profile.id),
    staffIds: profiles.filter((profile) => profile.group === "STAFF").map((profile) => profile.id),
    attendeeIds: profiles.filter((profile) => profile.group === "ATTENDEE").map((profile) => profile.id),
  };
}
