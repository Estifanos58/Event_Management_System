import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { prisma } from "@/core/db/prisma";

type AdminAuditPageProps = {
  searchParams: Promise<{
    q?: string;
    action?: string;
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

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const actionFilter = params.action?.trim() ?? "ALL";

  const records = (await prisma.auditEvent.findMany({
    where: {
      ...(actionFilter !== "ALL" ? { action: actionFilter } : {}),
      ...(q.length > 0
        ? {
            OR: [
              {
                action: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                scopeId: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                targetType: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                targetId: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 250,
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
          <CardTitle>Entries ({records.length})</CardTitle>
          <CardDescription>Showing up to 250 most recent matching audit entries.</CardDescription>
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
        </CardContent>
      </Card>
    </div>
  );
}
