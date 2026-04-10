import {
  DataDeletionRequestStatus,
  DataExportStatus,
  PolicyDocumentType,
  ScopeType,
  type Prisma,
} from "@prisma/client";
import { addDays, addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrganizationProfile, SeedUserProfile } from "./types";

type ComplianceSeedResult = {
  policyAcceptances: Prisma.PolicyAcceptanceCreateManyInput[];
  dataDeletionRequests: Prisma.DataDeletionRequestCreateManyInput[];
  dataExportJobs: Prisma.DataExportJobCreateManyInput[];
};

export function buildComplianceData(input: {
  now: Date;
  users: SeedUserProfile[];
  organizations: SeedOrganizationProfile[];
  events: SeedEventProfile[];
}): ComplianceSeedResult {
  const policyAcceptances: Prisma.PolicyAcceptanceCreateManyInput[] = [];

  let policyIndex = 1;

  for (const user of input.users) {
    const acceptedAt = subDays(input.now, 60 - (policyIndex % 20));

    policyAcceptances.push({
      id: ids.policyAcceptance(policyIndex),
      userId: user.id,
      documentType: PolicyDocumentType.TERMS_OF_SERVICE,
      documentVersion: "2026.1",
      scopeType: ScopeType.PERSONAL,
      scopeId: user.id,
      acceptedAt,
      ipAddress: `10.1.${policyIndex % 8}.${20 + (policyIndex % 50)}`,
      userAgent: "Mozilla/5.0 SeedAgent",
      createdAt: acceptedAt,
    });

    policyIndex += 1;

    policyAcceptances.push({
      id: ids.policyAcceptance(policyIndex),
      userId: user.id,
      documentType: PolicyDocumentType.PRIVACY_POLICY,
      documentVersion: "2026.1",
      scopeType: ScopeType.PERSONAL,
      scopeId: user.id,
      acceptedAt: addHours(acceptedAt, 1),
      ipAddress: `10.2.${policyIndex % 8}.${20 + (policyIndex % 50)}`,
      userAgent: "Mozilla/5.0 SeedAgent",
      createdAt: addHours(acceptedAt, 1),
    });

    policyIndex += 1;

    if (policyIndex % 4 === 0) {
      policyAcceptances.push({
        id: ids.policyAcceptance(policyIndex),
        userId: user.id,
        documentType: PolicyDocumentType.MARKETING_COMMUNICATIONS,
        documentVersion: "2026.1",
        scopeType: ScopeType.PERSONAL,
        scopeId: user.id,
        acceptedAt: addHours(acceptedAt, 2),
        ipAddress: `10.3.${policyIndex % 8}.${20 + (policyIndex % 50)}`,
        userAgent: "Mozilla/5.0 SeedAgent",
        createdAt: addHours(acceptedAt, 2),
      });

      policyIndex += 1;
    }
  }

  const dataDeletionRequests: Prisma.DataDeletionRequestCreateManyInput[] = [];

  for (let index = 1; index <= 10; index += 1) {
    const user = pickCyclic(input.users, index * 2);

    dataDeletionRequests.push({
      id: ids.dataDeletion(index),
      userId: user.id,
      status:
        index <= 3
          ? DataDeletionRequestStatus.REQUESTED
          : index <= 6
            ? DataDeletionRequestStatus.PROCESSING
            : index <= 9
              ? DataDeletionRequestStatus.COMPLETED
              : DataDeletionRequestStatus.REJECTED,
      reason: "User requested account lifecycle cleanup as part of privacy controls.",
      requestedAt: subDays(input.now, 20 - index),
      processedAt: index > 3 ? subDays(input.now, 12 - index) : null,
      processorNote: index === 10 ? "Rejected due to unresolved legal hold." : "Processed via privacy workflow.",
      metadata: {
        ticketIdsRemoved: index * 2,
      },
    });
  }

  const dataExportJobs: Prisma.DataExportJobCreateManyInput[] = [];

  for (let index = 1; index <= 12; index += 1) {
    const organization = pickCyclic(input.organizations, index - 1);
    const event = pickCyclic(input.events, index);
    const requester = pickCyclic(input.users, index + 5);

    const status =
      index <= 4
        ? DataExportStatus.QUEUED
        : index <= 7
          ? DataExportStatus.RUNNING
          : index <= 10
            ? DataExportStatus.COMPLETED
            : DataExportStatus.EXPIRED;

    dataExportJobs.push({
      id: ids.dataExport(index),
      orgId: organization.id,
      eventId: index % 2 === 0 ? event.id : null,
      requestedBy: requester.id,
      type: index % 2 === 0 ? "EVENT_ANALYTICS" : "USER_DATA",
      status,
      requestedReason: "Compliance-ready reporting for finance and legal stakeholders.",
      completedAt: status === DataExportStatus.COMPLETED ? subDays(input.now, 2) : null,
      expiresAt: addDays(input.now, 15 + index),
      createdAt: subDays(input.now, 16 - index),
    });
  }

  return {
    policyAcceptances,
    dataDeletionRequests,
    dataExportJobs,
  };
}
