import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select } from "@/components/ui/select";
import { prisma } from "@/core/db/prisma";

const PAGE_SIZE = 40;

type AdminAuditPageProps = {
  searchParams: Promise<{
    q?: string;
    action?: string;
    page?: string;
  }>;
};

type AuditRow = {
  id: string;
  actorType: string;
  action: string;
  scopeType: string;
  scopeId: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: Date;
  actor: {
    name: string;
    email: string;
  } | null;
};

function parsePage(value: string | undefined) {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function createPageHref(input: { page: number; q: string; actionFilter: string }) {
  const qSegment = input.q.length > 0 ? `&q=${encodeURIComponent(input.q)}` : "";
  const actionSegment =
    input.actionFilter !== "ALL" ? `&action=${encodeURIComponent(input.actionFilter)}` : "";
  return `/admin/audit?page=${input.page}${qSegment}${actionSegment}`;
}

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const actionFilter = params.action?.trim() ?? "ALL";
  const requestedPage = parsePage(params.page);

  const whereClause = {
    ...(actionFilter !== "ALL" ? { action: actionFilter } : {}),
    ...(q.length > 0
      ? {
          OR: [
            {
              action: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              scopeId: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              targetType: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              targetId: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const totalRecords = await prisma.auditEvent.count({
    where: whereClause,
  });
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const records = (await prisma.auditEvent.findMany({
    where: whereClause,
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      actorType: true,
      action: true,
      scopeType: true,
      scopeId: true,
      targetType: true,
      targetId: true,
      reason: true,
      createdAt: true,
      actor: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })) as AuditRow[];

  const actionOptions = [
    "ALL",
    "context.activate",
    "event.create",
    "event.update",
    "event.publish",
    "checkin.scan",
    "checkin.scan.manual",
    "ops.alert.triggered",
    "webhook.endpoint.created",
    "webhook.replay.requested",
    "moderation.report.created",
    "moderation.case.created",
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>
            Trace privileged operations, actor attribution, and scope transitions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 lg:grid-cols-[1fr_260px_auto]">
            <input type="hidden" name="page" value="1" />
            <label className="text-sm font-medium text-gray-900">
              Search action, scope, or target
              <Input className="mt-1" name="q" defaultValue={q} placeholder="Search audit events" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Action
              <Select className="mt-1" name="action" defaultValue={actionFilter}>
                {actionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-100"
              >
                Apply
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries ({totalRecords})</CardTitle>
          <CardDescription>
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-gray-500">No audit records matched the current filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Actor</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Scope</th>
                    <th className="py-2">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4 text-gray-500">{record.createdAt.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{record.actor?.name || record.actor?.email || record.actorType}</p>
                        <p className="mt-1 text-xs">{record.actor?.email ?? "system actor"}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{record.action}</p>
                        {record.reason ? <p className="mt-1 text-xs">Reason: {record.reason}</p> : null}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        {record.scopeType}:{record.scopeId}
                      </td>
                      <td className="py-3 text-gray-500">
                        {record.targetType}:{record.targetId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <PaginationControls
            summary={`Showing ${records.length} records on this page`}
            previousHref={createPageHref({
              page: Math.max(1, page - 1),
              q,
              actionFilter,
            })}
            nextHref={createPageHref({
              page: Math.min(totalPages, page + 1),
              q,
              actionFilter,
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
