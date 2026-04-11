import { ScopeType, type Prisma } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { addDays, addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrganizationProfile, SeedUserProfile } from "./types";

type AuthSeedResult = {
  sessions: Prisma.SessionCreateManyInput[];
  accounts: Prisma.AccountCreateManyInput[];
  verifications: Prisma.VerificationCreateManyInput[];
};

export async function buildAuthData(input: {
  now: Date;
  users: SeedUserProfile[];
  organizations: SeedOrganizationProfile[];
  events: SeedEventProfile[];
}): Promise<AuthSeedResult> {
  const sessions: Prisma.SessionCreateManyInput[] = [];
  const verifications: Prisma.VerificationCreateManyInput[] = [];

  input.users.forEach((user, index) => {
    const organization = pickCyclic(input.organizations, index);
    const sessionIndex = index + 1;

    const activeContextType =
      user.group === "SUPER_ADMIN"
        ? ScopeType.PLATFORM
        : user.group === "ATTENDEE"
          ? ScopeType.PERSONAL
          : ScopeType.ORGANIZATION;

    const activeContextId =
      activeContextType === ScopeType.PLATFORM
        ? "platform_main"
        : activeContextType === ScopeType.PERSONAL
          ? user.id
          : organization.id;

    sessions.push({
      id: ids.session(sessionIndex),
      userId: user.id,
      expiresAt: addDays(input.now, 15 + sessionIndex),
      token: `session_token_${user.id}_${sessionIndex}`,
      ipAddress: `192.168.0.${sessionIndex}`,
      userAgent: "Seed Browser Agent",
      activeContextType,
      activeContextId,
      createdAt: subDays(input.now, 8 - Math.floor(sessionIndex / 3)),
      updatedAt: addHours(subDays(input.now, 2), sessionIndex),
    });
  });

  const accounts = await Promise.all(
    input.users.map(async (user, index) => {
      const accountIndex = index + 1;

      return {
        id: ids.account(accountIndex),
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: "openid profile email",
        password: await hashPassword(user.password),
        createdAt: subDays(input.now, 60 - accountIndex),
        updatedAt: subDays(input.now, 6 - (accountIndex % 4)),
      } satisfies Prisma.AccountCreateManyInput;
    }),
  );

  input.users.forEach((user, index) => {
    const verificationIndex = index + 1;

    verifications.push({
      id: ids.verification(verificationIndex),
      identifier: user.email,
      value: `verification_code_${verificationIndex}`,
      expiresAt: addHours(input.now, 2 + verificationIndex),
      createdAt: subDays(input.now, 4),
      updatedAt: subDays(input.now, 4),
    });
  });

  return {
    sessions,
    accounts,
    verifications,
  };
}
