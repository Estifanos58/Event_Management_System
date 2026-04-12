import { ModerationAppealStatus, ModerationBanScope } from "@prisma/client";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { AdminReappealsPanel } from "@/components/admin/moderation/admin-reappeals-panel";
import { prisma } from "@/core/db/prisma";
import { requireDashboardSnapshot } from "@/app/(app)/_lib/access";

const PAGE_SIZE = 10;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export default async function OrganizerReappealsPage({ searchParams }: PageProps) {
  const snapshot = await requireDashboardSnapshot();
  const organizationContext = snapshot.contexts.find((context) => context.type === "ORGANIZATION");

  if (!organizationContext) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const skip = (page - 1) * PAGE_SIZE;

  const [appeals, total, openCount] = await Promise.all([
    prisma.moderationAppeal.findMany({
      where: {
        ban: {
          scope: ModerationBanScope.ORGANIZATION_USER,
          scopeOrganizationId: organizationContext.id,
        },
      },
      include: {
        requester: {
          select: {
            name: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            name: true,
          },
        },
        ban: {
          include: {
            subjectOrganization: {
              select: {
                displayName: true,
              },
            },
            scopeOrganization: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.moderationAppeal.count({
      where: {
        ban: {
          scope: ModerationBanScope.ORGANIZATION_USER,
          scopeOrganizationId: organizationContext.id,
        },
      },
    }),
    prisma.moderationAppeal.count({
      where: {
        status: ModerationAppealStatus.OPEN,
        ban: {
          scope: ModerationBanScope.ORGANIZATION_USER,
          scopeOrganizationId: organizationContext.id,
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const items = appeals.map((appeal) => ({
    id: appeal.id,
    banId: appeal.banId,
    requesterId: appeal.requesterId,
    requesterName: appeal.requester.name,
    requesterEmail: appeal.requester.email,
    status: appeal.status,
    message: appeal.message,
    reviewerNote: appeal.reviewerNote,
    reviewedBy: appeal.reviewedBy,
    reviewedByName: appeal.reviewer?.name ?? null,
    createdAt: appeal.createdAt.toISOString(),
    reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
    ban: {
      id: appeal.ban.id,
      scope: appeal.ban.scope,
      status: appeal.ban.status,
      reason: appeal.ban.reason,
      subjectUserId: appeal.ban.subjectUserId,
      subjectOrganizationId: appeal.ban.subjectOrganizationId,
      subjectOrganizationName: appeal.ban.subjectOrganization?.displayName ?? null,
      scopeOrganizationId: appeal.ban.scopeOrganizationId,
      scopeOrganizationName: appeal.ban.scopeOrganization?.displayName ?? null,
      sourceReportId: appeal.ban.sourceReportId,
      sourceRiskCaseId: appeal.ban.sourceRiskCaseId,
      createdBy: appeal.ban.createdBy,
      liftedBy: appeal.ban.liftedBy,
      liftedAt: appeal.ban.liftedAt?.toISOString() ?? null,
      createdAt: appeal.ban.createdAt.toISOString(),
    },
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organizer Appeal Reviews</CardTitle>
          <CardDescription>
            Review attendee reappeals for organizer-scoped bans before admin override.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Open appeals</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{openCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Total appeals</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{total}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appeal Queue</CardTitle>
          <CardDescription>
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminReappealsPanel items={items} />
        </CardContent>
      </Card>

      <PaginationControls
        className="mt-0 justify-start"
        linkClassName="h-9"
        previousHref={`/organizer/reappeals?page=${Math.max(1, page - 1)}`}
        nextHref={`/organizer/reappeals?page=${Math.min(totalPages, page + 1)}`}
      />
    </div>
  );
}
