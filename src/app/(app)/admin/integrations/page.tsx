import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";

const INTEGRATION_EVENTS_PAGE_SIZE = 25;

type AdminIntegrationsPageProps = {
  searchParams: Promise<{
    page?: string;
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

function createPageHref(page: number) {
  return `/admin/integrations?page=${page}`;
}

export default async function AdminIntegrationsPage({ searchParams }: AdminIntegrationsPageProps) {
  const params = await searchParams;
  const requestedPage = parsePage(params.page);
  const totalInboundEvents = await prisma.inboundProviderEvent.count();
  const totalPages = Math.max(1, Math.ceil(totalInboundEvents / INTEGRATION_EVENTS_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const [byProviderType, byStatus, latestInbound] = await Promise.all([
    prisma.inboundProviderEvent.groupBy({
      by: ["providerType"],
      _count: {
        _all: true,
      },
    }),
    prisma.inboundProviderEvent.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.inboundProviderEvent.findMany({
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * INTEGRATION_EVENTS_PAGE_SIZE,
      take: INTEGRATION_EVENTS_PAGE_SIZE,
      select: {
        id: true,
        providerType: true,
        provider: true,
        providerEventId: true,
        eventType: true,
        status: true,
        errorMessage: true,
        processedAt: true,
        createdAt: true,
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
    }),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integration Inbound Health</CardTitle>
          <CardDescription>
            Provider event ingestion state, processing reliability, and failure visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {byProviderType.map((entry) => (
            <div key={entry.providerType} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">{entry.providerType}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{entry._count._all}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Processing Status Distribution</CardTitle>
          <CardDescription>Inbound provider events grouped by current processing state.</CardDescription>
        </CardHeader>
        <CardContent>
          {byStatus.length === 0 ? (
            <p className="text-sm text-gray-500">No inbound events found.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {byStatus.map((status) => (
                <article key={status.status} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-widest text-gray-500">{status.status}</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{status._count._all}</p>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Provider Events</CardTitle>
          <CardDescription>
            Page {page} of {totalPages} · {totalInboundEvents} inbound events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {latestInbound.length === 0 ? (
            <p className="text-sm text-gray-500">No inbound events recorded.</p>
          ) : (
            <div className="max-h-155 space-y-2 overflow-y-auto pr-1">
              {latestInbound.map((inbound) => (
                <article key={inbound.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {inbound.providerType} · {inbound.provider}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {inbound.status} · {inbound.eventType ?? "unknown_event"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Org: {inbound.organization?.displayName ?? "unmapped"} · Event:{" "}
                    {inbound.event?.title ?? "unmapped"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Provider Event ID: {inbound.providerEventId}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Processed: {inbound.processedAt ? inbound.processedAt.toLocaleString() : "pending"}
                  </p>
                  {inbound.errorMessage ? (
                    <p className="mt-1 text-xs text-gray-500">Error: {inbound.errorMessage}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}

          <PaginationControls
            summary={`Showing ${latestInbound.length} inbound events on this page`}
            previousHref={createPageHref(Math.max(1, page - 1))}
            nextHref={createPageHref(Math.min(totalPages, page + 1))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
