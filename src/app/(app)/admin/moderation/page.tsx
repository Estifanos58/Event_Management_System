import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModerationQueuePanel } from "@/components/admin/moderation/moderation-queue-panel";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";

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

function toEvidenceUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function createPageHref(input: {
  reportPage: number;
  riskPage: number;
}) {
  return `/admin/moderation?reportPage=${input.reportPage}&riskPage=${input.riskPage}`;
}

export default async function AdminModerationPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const reportPage = parsePage(params.reportPage);
  const riskPage = parsePage(params.riskPage);

  const reportSkip = (reportPage - 1) * PAGE_SIZE;
  const riskSkip = (riskPage - 1) * PAGE_SIZE;

  const [
    abuseReports,
    riskCases,
    openAbuseCount,
    openRiskCount,
    totalAbuseReports,
    totalRiskCases,
  ] = await Promise.all([
    prisma.abuseReport.findMany({
      orderBy: {
        createdAt: "desc",
      },
      skip: reportSkip,
      take: PAGE_SIZE,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        category: true,
        status: true,
        description: true,
        evidenceUrls: true,
        createdAt: true,
        organizationId: true,
        reporter: {
          select: {
            name: true,
            email: true,
          },
        },
        event: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.riskCase.findMany({
      orderBy: {
        createdAt: "desc",
      },
      skip: riskSkip,
      take: PAGE_SIZE,
      select: {
        id: true,
        scopeType: true,
        scopeId: true,
        source: true,
        severity: true,
        status: true,
        createdAt: true,
        event: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.abuseReport.count({
      where: {
        status: {
          in: ["OPEN", "UNDER_REVIEW"],
        },
      },
    }),
    prisma.riskCase.count({
      where: {
        status: {
          in: ["OPEN", "INVESTIGATING"],
        },
      },
    }),
    prisma.abuseReport.count(),
    prisma.riskCase.count(),
  ]);

  const totalReportPages = Math.max(1, Math.ceil(totalAbuseReports / PAGE_SIZE));
  const totalRiskPages = Math.max(1, Math.ceil(totalRiskCases / PAGE_SIZE));

  const reportItems = abuseReports.map((report) => ({
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    category: report.category,
    status: report.status,
    description: report.description,
    evidenceUrls: toEvidenceUrls(report.evidenceUrls),
    createdAt: report.createdAt.toISOString(),
    organizationId: report.organizationId,
    reporter: report.reporter,
    event: report.event,
  }));

  const riskItems = riskCases.map((riskCase) => ({
    id: riskCase.id,
    scopeType: riskCase.scopeType,
    scopeId: riskCase.scopeId,
    source: riskCase.source,
    severity: riskCase.severity,
    status: riskCase.status,
    createdAt: riskCase.createdAt.toISOString(),
    event: riskCase.event,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Moderation and Risk Queue</CardTitle>
          <CardDescription>
            Abuse reports, trust signals, and risk case lifecycle monitoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Open abuse reports</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{openAbuseCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Open risk cases</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{openRiskCount}</p>
          </div>
        </CardContent>
      </Card>

      <ModerationQueuePanel abuseReports={reportItems} riskCases={riskItems} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Abuse report pages</p>
          <p className="mt-1 text-xs text-gray-500">
            Page {reportPage} of {totalReportPages}
          </p>
          <PaginationControls
            className="mt-3 justify-start"
            linkClassName="h-9"
            previousHref={createPageHref({
              reportPage: Math.max(1, reportPage - 1),
              riskPage,
            })}
            nextHref={createPageHref({
              reportPage: Math.min(totalReportPages, reportPage + 1),
              riskPage,
            })}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Risk case pages</p>
          <p className="mt-1 text-xs text-gray-500">
            Page {riskPage} of {totalRiskPages}
          </p>
          <PaginationControls
            className="mt-3 justify-start"
            linkClassName="h-9"
            previousHref={createPageHref({
              reportPage,
              riskPage: Math.max(1, riskPage - 1),
            })}
            nextHref={createPageHref({
              reportPage,
              riskPage: Math.min(totalRiskPages, riskPage + 1),
            })}
          />
        </div>
      </div>
    </div>
  );
}
