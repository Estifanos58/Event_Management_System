import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";

const DELETION_PAGE_SIZE = 20;
const ACCEPTANCE_PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 20;

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

type AdminCompliancePageProps = {
  searchParams: Promise<{
    deletionPage?: string;
    acceptancePage?: string;
    exportPage?: string;
  }>;
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

function createPageHref(input: {
  deletionPage: number;
  acceptancePage: number;
  exportPage: number;
}) {
  return `/admin/compliance?deletionPage=${input.deletionPage}&acceptancePage=${input.acceptancePage}&exportPage=${input.exportPage}`;
}

export default async function AdminCompliancePage({ searchParams }: AdminCompliancePageProps) {
  const params = await searchParams;
  const requestedDeletionPage = parsePage(params.deletionPage);
  const requestedAcceptancePage = parsePage(params.acceptancePage);
  const requestedExportPage = parsePage(params.exportPage);

  const [deletionByStatus, exportByStatus, deletionTotal, acceptanceTotal, exportTotal] = await Promise.all([
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
    prisma.dataDeletionRequest.count(),
    prisma.policyAcceptance.count(),
    prisma.dataExportJob.count(),
  ]);

  const deletionTotalPages = Math.max(1, Math.ceil(deletionTotal / DELETION_PAGE_SIZE));
  const acceptanceTotalPages = Math.max(1, Math.ceil(acceptanceTotal / ACCEPTANCE_PAGE_SIZE));
  const exportTotalPages = Math.max(1, Math.ceil(exportTotal / EXPORT_PAGE_SIZE));

  const deletionPage = Math.min(requestedDeletionPage, deletionTotalPages);
  const acceptancePage = Math.min(requestedAcceptancePage, acceptanceTotalPages);
  const exportPage = Math.min(requestedExportPage, exportTotalPages);

  const [deletions, acceptances, exports] = await Promise.all([
    prisma.dataDeletionRequest.findMany({
      orderBy: {
        requestedAt: "desc",
      },
      skip: (deletionPage - 1) * DELETION_PAGE_SIZE,
      take: DELETION_PAGE_SIZE,
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
      skip: (acceptancePage - 1) * ACCEPTANCE_PAGE_SIZE,
      take: ACCEPTANCE_PAGE_SIZE,
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
      skip: (exportPage - 1) * EXPORT_PAGE_SIZE,
      take: EXPORT_PAGE_SIZE,
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
            <p className="text-xs text-gray-500">
              Page {deletionPage} of {deletionTotalPages} · {deletionTotal} requests
            </p>
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

            <PaginationControls
              summary={`Showing ${deletions.length} deletion requests on this page`}
              previousHref={createPageHref({
                deletionPage: Math.max(1, deletionPage - 1),
                acceptancePage,
                exportPage,
              })}
              nextHref={createPageHref({
                deletionPage: Math.min(deletionTotalPages, deletionPage + 1),
                acceptancePage,
                exportPage,
              })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Policy Acceptances</CardTitle>
            <CardDescription>Document/version acceptance evidence trail.</CardDescription>
            <p className="text-xs text-gray-500">
              Page {acceptancePage} of {acceptanceTotalPages} · {acceptanceTotal} acceptances
            </p>
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

            <PaginationControls
              summary={`Showing ${acceptances.length} policy acceptances on this page`}
              previousHref={createPageHref({
                deletionPage,
                acceptancePage: Math.max(1, acceptancePage - 1),
                exportPage,
              })}
              nextHref={createPageHref({
                deletionPage,
                acceptancePage: Math.min(acceptanceTotalPages, acceptancePage + 1),
                exportPage,
              })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Export Jobs</CardTitle>
            <CardDescription>Export request lifecycle by status and context.</CardDescription>
            <p className="text-xs text-gray-500">
              Page {exportPage} of {exportTotalPages} · {exportTotal} export jobs
            </p>
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

            <PaginationControls
              summary={`Showing ${exports.length} export jobs on this page`}
              previousHref={createPageHref({
                deletionPage,
                acceptancePage,
                exportPage: Math.max(1, exportPage - 1),
              })}
              nextHref={createPageHref({
                deletionPage,
                acceptancePage,
                exportPage: Math.min(exportTotalPages, exportPage + 1),
              })}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
