import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

type DeletionRequestRow = {
  id: string;
  status: string;
  reason: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  user: {
    name: string;
    email: string;
  };
};

type PolicyAcceptanceRow = {
  id: string;
  documentType: string;
  documentVersion: string;
  scopeType: string;
  scopeId: string;
  acceptedAt: Date;
  user: {
    name: string;
    email: string;
  };
};

type ExportJobRow = {
  id: string;
  type: string;
  status: string;
  requestedReason: string | null;
  createdAt: Date;
  completedAt: Date | null;
  requester: {
    name: string;
    email: string;
  };
  organization: {
    displayName: string;
  };
  event: {
    title: string;
  } | null;
};

export default async function AdminCompliancePage() {
  const [deletionByStatus, exportByStatus, deletions, acceptances, exports] = await Promise.all([
    prisma.dataDeletionRequest.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.dataExportJob.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.dataDeletionRequest.findMany({
      orderBy: {
        requestedAt: "desc",
      },
      take: 120,
      select: {
        id: true,
        status: true,
        reason: true,
        requestedAt: true,
        processedAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }) as Promise<DeletionRequestRow[]>,
    prisma.policyAcceptance.findMany({
      orderBy: {
        acceptedAt: "desc",
      },
      take: 120,
      select: {
        id: true,
        documentType: true,
        documentVersion: true,
        scopeType: true,
        scopeId: true,
        acceptedAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }) as Promise<PolicyAcceptanceRow[]>,
    prisma.dataExportJob.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 120,
      select: {
        id: true,
        type: true,
        status: true,
        requestedReason: true,
        createdAt: true,
        completedAt: true,
        requester: {
          select: {
            name: true,
            email: true,
          },
        },
        organization: {
          select: {
            displayName: true,
          },
        },
        event: {
          select: {
            title: true,
          },
        },
      },
    }) as Promise<ExportJobRow[]>,
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Compliance Operations</CardTitle>
          <CardDescription>
            Data privacy requests, policy acceptance evidence, and export workflow tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Deletion requests</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{deletions.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Policy acceptances</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{acceptances.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Export jobs</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{exports.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Queued exports</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {exportByStatus.find((row) => row.status === "QUEUED")?._count._all ?? 0}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Deletion Requests</CardTitle>
            <CardDescription>Recent user deletion requests and processing state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {deletionByStatus.map((status) => (
              <p key={status.status} className="text-xs text-gray-500">
                <span className="font-medium text-gray-900">{status.status}:</span>{" "}
                {status._count._all}
              </p>
            ))}

            <div className="max-h-105 space-y-2 overflow-y-auto pr-1">
              {deletions.map((request) => (
                <article key={request.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">{request.status}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {request.user.name || request.user.email} · {request.requestedAt.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{request.reason ?? "No reason provided"}</p>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Policy Acceptances</CardTitle>
            <CardDescription>Document/version acceptance evidence trail.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-130 space-y-2 overflow-y-auto pr-1">
              {acceptances.map((acceptance) => (
                <article key={acceptance.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {acceptance.documentType} · v{acceptance.documentVersion}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {acceptance.user.name || acceptance.user.email}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {acceptance.scopeType}:{acceptance.scopeId}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{acceptance.acceptedAt.toLocaleString()}</p>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Export Jobs</CardTitle>
            <CardDescription>Export request lifecycle by status and context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {exportByStatus.map((status) => (
              <p key={status.status} className="text-xs text-gray-500">
                <span className="font-medium text-gray-900">{status.status}:</span>{" "}
                {status._count._all}
              </p>
            ))}

            <div className="max-h-105 space-y-2 overflow-y-auto pr-1">
              {exports.map((job) => (
                <article key={job.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {job.type} · {job.status}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {job.organization.displayName} · Event: {job.event?.title ?? "org-wide"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Requested by {job.requester.name || job.requester.email} on {job.createdAt.toLocaleString()}
                  </p>
                  {job.requestedReason ? (
                    <p className="mt-1 text-xs text-gray-500">Reason: {job.requestedReason}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
