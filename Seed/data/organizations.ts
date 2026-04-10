import { KycStatus, type Prisma } from "@prisma/client";
import { subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import type { SeedOrganizationProfile } from "./types";

type OrganizationSeedResult = {
  profiles: SeedOrganizationProfile[];
  organizations: Prisma.OrganizationCreateManyInput[];
};

const ORGANIZATION_BLUEPRINTS: Array<Pick<SeedOrganizationProfile, "legalName" | "displayName" | "region" | "defaultCurrency">> = [
  {
    legalName: "Aster Tech Events PLC",
    displayName: "Aster Tech Conferences",
    region: "Addis Ababa",
    defaultCurrency: "ETB",
  },
  {
    legalName: "Nile Beats Entertainment LLC",
    displayName: "Nile Beats Festival",
    region: "Cairo",
    defaultCurrency: "USD",
  },
  {
    legalName: "Campus Pulse Association",
    displayName: "Campus Pulse Club",
    region: "Nairobi",
    defaultCurrency: "KES",
  },
  {
    legalName: "Launchpad Community Group",
    displayName: "Launchpad Startups",
    region: "Kigali",
    defaultCurrency: "USD",
  },
  {
    legalName: "Summit Learning Network",
    displayName: "Summit Workshops",
    region: "Lagos",
    defaultCurrency: "NGN",
  },
  {
    legalName: "Pulse Arena Productions",
    displayName: "Pulse Arena Live",
    region: "Accra",
    defaultCurrency: "GHS",
  },
  {
    legalName: "Bridge Networking Partners",
    displayName: "Bridge Networking",
    region: "Johannesburg",
    defaultCurrency: "ZAR",
  },
  {
    legalName: "Atlas Developer Society",
    displayName: "Atlas Developer Guild",
    region: "Casablanca",
    defaultCurrency: "MAD",
  },
  {
    legalName: "Unity Digital Labs",
    displayName: "Unity Hybrid Events",
    region: "Dubai",
    defaultCurrency: "AED",
  },
  {
    legalName: "Riverfront Convention Center Ltd",
    displayName: "Riverfront Conventions",
    region: "Doha",
    defaultCurrency: "QAR",
  },
];

export function buildOrganizations(now: Date): OrganizationSeedResult {
  const profiles: SeedOrganizationProfile[] = ORGANIZATION_BLUEPRINTS.map((blueprint, index) => ({
    id: ids.org(index + 1),
    legalName: blueprint.legalName,
    displayName: blueprint.displayName,
    region: blueprint.region,
    defaultCurrency: blueprint.defaultCurrency,
  }));

  const organizations: Prisma.OrganizationCreateManyInput[] = profiles.map((profile, index) => ({
    id: profile.id,
    legalName: profile.legalName,
    displayName: profile.displayName,
    region: profile.region,
    defaultCurrency: profile.defaultCurrency,
    kycStatus: index < 7 ? KycStatus.VERIFIED : KycStatus.PENDING,
    createdAt: subDays(now, 200 - index * 4),
    updatedAt: subDays(now, 40 - index),
  }));

  return {
    profiles,
    organizations,
  };
}
