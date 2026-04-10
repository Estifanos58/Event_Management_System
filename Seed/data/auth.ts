import { ScopeType, type Prisma } from "@prisma/client";
import { addDays, addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrganizationProfile, SeedUserProfile } from "./types";

type AuthSeedResult = {
  sessions: Prisma.SessionCreateManyInput[];
  accounts: Prisma.AccountCreateManyInput[];
  verifications: Prisma.VerificationCreateManyInput[];
};

export function buildAuthData(input: {
  now: Date;
  users: SeedUserProfile[];
  organizations: SeedOrganizationProfile[];
  events: SeedEventProfile[];
}): AuthSeedResult {
  const sessions: Prisma.SessionCreateManyInput[] = [];
  const accounts: Prisma.AccountCreateManyInput[] = [];
  const verifications: Prisma.VerificationCreateManyInput[] = [];

  for (let index = 1; index <= 24; index += 1) {
    const user = pickCyclic(input.users, index - 1);
    const event = pickCyclic(input.events, index - 1);
    const organization = pickCyclic(input.organizations, index - 1);

    const activeContextType =
      user.group === "SUPER_ADMIN"
        ? ScopeType.PLATFORM
        : user.group === "ATTENDEE"
          ? ScopeType.PERSONAL
          : user.group === "STAFF"
            ? ScopeType.EVENT
            : ScopeType.ORGANIZATION;

    const activeContextId =
      activeContextType === ScopeType.PLATFORM
        ? "platform_main"
        : activeContextType === ScopeType.PERSONAL
          ? user.id
          : activeContextType === ScopeType.EVENT
            ? event.id
            : organization.id;

    sessions.push({
      id: ids.session(index),
      userId: user.id,
      expiresAt: addDays(input.now, 15 + index),
      token: `session_token_${index}`,
      ipAddress: `192.168.0.${index}`,
      userAgent: "Seed Browser Agent",
      activeContextType,
      activeContextId,
      createdAt: subDays(input.now, 8 - Math.floor(index / 4)),
      updatedAt: addHours(subDays(input.now, 2), index),
    });

    accounts.push({
      id: ids.account(index),
      userId: user.id,
      providerId: index % 2 === 0 ? "google" : "email",
      accountId: `${user.id}_account_${index}`,
      accessToken: `access_token_${index}`,
      refreshToken: `refresh_token_${index}`,
      idToken: `id_token_${index}`,
      accessTokenExpiresAt: addDays(input.now, 1),
      refreshTokenExpiresAt: addDays(input.now, 30),
      scope: "openid profile email",
      password: index % 2 === 0 ? null : `hashed_password_${index}`,
      createdAt: subDays(input.now, 60 - index),
      updatedAt: subDays(input.now, 6 - (index % 4)),
    });
  }

  for (let index = 1; index <= 12; index += 1) {
    const user = pickCyclic(input.users, index * 3);

    verifications.push({
      id: ids.verification(index),
      identifier: user.email,
      value: `verification_code_${index}`,
      expiresAt: addHours(input.now, 2 + index),
      createdAt: subDays(input.now, 4),
      updatedAt: subDays(input.now, 4),
    });
  }

  return {
    sessions,
    accounts,
    verifications,
  };
}
