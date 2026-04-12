import Link from "next/link";
import { ModerationAppealStatus } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { AdminReappealsPanel } from "@/components/admin/moderation/admin-reappeals-panel";
import { prisma } from "@/core/db/prisma";
import { listModerationAppeals } from "@/domains/moderation/service";

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

function parseStatus(value: string | string[] | undefined): ModerationAppealStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (value === ModerationAppealStatus.OPEN) {
    return ModerationAppealStatus.OPEN;
  }

  if (value === ModerationAppealStatus.APPROVED) {
    return ModerationAppealStatus.APPROVED;
  }

  if (value === ModerationAppealStatus.REJECTED) {
    return ModerationAppealStatus.REJECTED;
  }

  return undefined;
}

function createPageHref(page: number, status?: ModerationAppealStatus) {
  const statusSegment = status ? `&status=${status}` : "";
  return `/admin/reappeals?page=${page}${statusSegment}`;
}

export default async function AdminReappealsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const status = parseStatus(params.status);

  const [pagedAppeals, openCount, approvedCount, rejectedCount] = await Promise.all([
    listModerationAppeals({
      status,
      page,
      pageSize: PAGE_SIZE,
    }),
    prisma.moderationAppeal.count({
      where: {
        status: ModerationAppealStatus.OPEN,
      },
    }),
    prisma.moderationAppeal.count({
      where: {
        status: ModerationAppealStatus.APPROVED,
      },
    }),
    prisma.moderationAppeal.count({
      where: {
        status: ModerationAppealStatus.REJECTED,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(pagedAppeals.total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Moderation Reappeals</CardTitle>
          <CardDescription>
            Review user and organizer reappeals and decide whether restrictions should remain.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Open</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{openCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Approved</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{approvedCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Rejected</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{rejectedCount}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href={createPageHref(1)}
          className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          All
        </Link>
        <Link
          href={createPageHref(1, ModerationAppealStatus.OPEN)}
          className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Open
        </Link>
        <Link
          href={createPageHref(1, ModerationAppealStatus.APPROVED)}
          className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Approved
        </Link>
        <Link
          href={createPageHref(1, ModerationAppealStatus.REJECTED)}
          className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Rejected
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appeal Queue</CardTitle>
          <CardDescription>
            Page {pagedAppeals.page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminReappealsPanel items={pagedAppeals.items} />
        </CardContent>
      </Card>

      <PaginationControls
        className="mt-0 justify-start"
        linkClassName="h-9"
        previousHref={createPageHref(Math.max(1, page - 1), status)}
        nextHref={createPageHref(Math.min(totalPages, page + 1), status)}
      />
    </div>
  );
}
