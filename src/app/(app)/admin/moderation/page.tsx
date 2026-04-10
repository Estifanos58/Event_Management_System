import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

type AbuseReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  category: string;
  status: string;
  createdAt: Date;
  reporter: {
    name: string;
    email: string;
  };
  event: {
    title: string;
  } | null;
};

type RiskCaseRow = {
  id: string;
  scopeType: string;
  scopeId: string;
  source: string;
  severity: string;
  status: string;
  createdAt: Date;
  event: {
    title: string;
  } | null;
};

export default async function AdminModerationPage() {
  const [abuseReports, riskCases, openAbuseCount, openRiskCount] = await Promise.all([
    prisma.abuseReport.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 120,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        category: true,
        status: true,
        createdAt: true,
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
    }) as Promise<AbuseReportRow[]>,
    prisma.riskCase.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 120,
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
    }) as Promise<RiskCaseRow[]>,
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
  ]);

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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Abuse Reports</CardTitle>
            <CardDescription>Latest abuse submissions across platform targets.</CardDescription>
          </CardHeader>
          <CardContent>
            {abuseReports.length === 0 ? (
              <p className="text-sm text-gray-500">No abuse reports found.</p>
            ) : (
              <div className="max-h-135 space-y-2 overflow-y-auto pr-1">
                {abuseReports.map((report) => (
                  <article
                    key={report.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{report.category}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {report.status} · {report.targetType}:{report.targetId}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Reporter: {report.reporter.name || report.reporter.email}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Event: {report.event?.title ?? "n/a"} · {report.createdAt.toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Cases</CardTitle>
            <CardDescription>
              Active and historical risk cases with severity indicators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {riskCases.length === 0 ? (
              <p className="text-sm text-gray-500">No risk cases found.</p>
            ) : (
              <div className="max-h-135 space-y-2 overflow-y-auto pr-1">
                {riskCases.map((riskCase) => (
                  <article
                    key={riskCase.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {riskCase.source} · {riskCase.severity}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {riskCase.status} · {riskCase.scopeType}:{riskCase.scopeId}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Event: {riskCase.event?.title ?? "n/a"} · {riskCase.createdAt.toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
