import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";

const ENDPOINT_PAGE_SIZE = 20;
const DEAD_LETTER_PAGE_SIZE = 20;

type EndpointRow = {
  id: string;
  name: string;
  url: string;
  status: string;
  lastRotatedAt: Date | null;
  createdAt: Date;
  organization: {
    displayName: string;
  };
  event: {
    title: string;
  } | null;
  _count: {
    deliveries: number;
  };
};

type DeadLetterRow = {
  id: string;
  eventType: string;
  attemptCount: number;
  lastError: string | null;
  updatedAt: Date;
  organization: {
    displayName: string;
  };
};

type AdminWebhooksPageProps = {
  searchParams: Promise<{
    endpointPage?: string;
    deadLetterPage?: string;
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

function createPageHref(input: { endpointPage: number; deadLetterPage: number }) {
  return `/admin/webhooks?endpointPage=${input.endpointPage}&deadLetterPage=${input.deadLetterPage}`;
}

export default async function AdminWebhooksPage({ searchParams }: AdminWebhooksPageProps) {
  const params = await searchParams;
  const requestedEndpointPage = parsePage(params.endpointPage);
  const requestedDeadLetterPage = parsePage(params.deadLetterPage);

  const [totalEndpoints, totalDeadLetters] = await Promise.all([
    prisma.webhookEndpoint.count(),
    prisma.webhookOutboxEvent.count({
      where: {
        status: "DEAD_LETTER",
      },
    }),
  ]);

  const endpointTotalPages = Math.max(1, Math.ceil(totalEndpoints / ENDPOINT_PAGE_SIZE));
  const deadLetterTotalPages = Math.max(1, Math.ceil(totalDeadLetters / DEAD_LETTER_PAGE_SIZE));
  const endpointPage = Math.min(requestedEndpointPage, endpointTotalPages);
  const deadLetterPage = Math.min(requestedDeadLetterPage, deadLetterTotalPages);

  const [endpoints, outboxByStatus, deliveryStats, deadLetters] = await Promise.all([
    prisma.webhookEndpoint.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      skip: (endpointPage - 1) * ENDPOINT_PAGE_SIZE,
      take: ENDPOINT_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        url: true,
        status: true,
        lastRotatedAt: true,
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
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    }) as Promise<EndpointRow[]>,
    prisma.webhookOutboxEvent.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.webhookDeliveryAttempt.aggregate({
      _count: {
        _all: true,
      },
      _avg: {
        responseTimeMs: true,
      },
    }),
    prisma.webhookOutboxEvent.findMany({
      where: {
        status: "DEAD_LETTER",
      },
      orderBy: {
        updatedAt: "desc",
      },
      skip: (deadLetterPage - 1) * DEAD_LETTER_PAGE_SIZE,
      take: DEAD_LETTER_PAGE_SIZE,
      select: {
        id: true,
        eventType: true,
        attemptCount: true,
        lastError: true,
        updatedAt: true,
        organization: {
          select: {
            displayName: true,
          },
        },
      },
    }) as Promise<DeadLetterRow[]>,
  ]);

  const outboxMap = new Map(outboxByStatus.map((row) => [row.status, row._count._all]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Webhook Operations</CardTitle>
          <CardDescription>
            Endpoint lifecycle, delivery behavior, and dead-letter queue visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Endpoints</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{endpoints.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Pending outbox</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{outboxMap.get("PENDING") ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Delivered outbox</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{outboxMap.get("DELIVERED") ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Dead letters</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{outboxMap.get("DEAD_LETTER") ?? 0}</p>
            <p className="mt-1 text-xs text-gray-500">
              Avg response: {Math.round(deliveryStats._avg.responseTimeMs ?? 0)} ms
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Endpoint Inventory</CardTitle>
            <CardDescription>
              Page {endpointPage} of {endpointTotalPages} · {totalEndpoints} endpoints
            </CardDescription>
          </CardHeader>
          <CardContent>
            {endpoints.length === 0 ? (
              <p className="text-sm text-gray-500">No webhook endpoints configured.</p>
            ) : (
              <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                {endpoints.map((endpoint) => (
                  <article
                    key={endpoint.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{endpoint.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{endpoint.status} · {endpoint.url}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {endpoint.organization.displayName} · Event: {endpoint.event?.title ?? "all"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Deliveries: {endpoint._count.deliveries} · Rotated:{" "}
                      {endpoint.lastRotatedAt ? endpoint.lastRotatedAt.toLocaleString() : "never"}
                    </p>
                  </article>
                ))}
              </div>
            )}

            <PaginationControls
              summary={`Showing ${endpoints.length} endpoints on this page`}
              previousHref={createPageHref({
                endpointPage: Math.max(1, endpointPage - 1),
                deadLetterPage,
              })}
              nextHref={createPageHref({
                endpointPage: Math.min(endpointTotalPages, endpointPage + 1),
                deadLetterPage,
              })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dead-letter Queue</CardTitle>
            <CardDescription>
              Page {deadLetterPage} of {deadLetterTotalPages} · {totalDeadLetters} dead-letter events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deadLetters.length === 0 ? (
              <p className="text-sm text-gray-500">No dead-letter events found.</p>
            ) : (
              <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                {deadLetters.map((deadLetter) => (
                  <article
                    key={deadLetter.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{deadLetter.eventType}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {deadLetter.organization.displayName} · Attempts: {deadLetter.attemptCount}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{deadLetter.lastError ?? "No error payload"}</p>
                    <p className="mt-1 text-xs text-gray-500">Updated: {deadLetter.updatedAt.toLocaleString()}</p>
                  </article>
                ))}
              </div>
            )}

            <PaginationControls
              summary={`Showing ${deadLetters.length} dead-letter events on this page`}
              previousHref={createPageHref({
                endpointPage,
                deadLetterPage: Math.max(1, deadLetterPage - 1),
              })}
              nextHref={createPageHref({
                endpointPage,
                deadLetterPage: Math.min(deadLetterTotalPages, deadLetterPage + 1),
              })}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
