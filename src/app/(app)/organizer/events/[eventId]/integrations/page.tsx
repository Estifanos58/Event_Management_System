import { revalidatePath } from "next/cache";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getEventDetailSnapshot } from "@/domains/events/service";
import {
  createWebhookEndpoint,
  listInboundProviderEvents,
  listSupportedWebhookEventTopics,
  listWebhookDeadLetters,
  listWebhookEndpoints,
  listWebhookOutboxEvents,
  publishWebhookEvent,
  replayWebhookEvents,
} from "@/domains/integrations/service";

function parseDelimitedList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function safeJsonParse(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

async function createWebhookEndpointFormAction(formData: FormData) {
  "use server";

  const eventId = formData.get("eventId");

  if (typeof eventId !== "string" || !eventId) {
    return;
  }

  try {
    await createWebhookEndpoint(eventId, {
      name: formData.get("name"),
      url: formData.get("url"),
      status: formData.get("status"),
      eventTypes: parseDelimitedList(formData.get("eventTypes")),
    });
  } catch {
    // Keep the page usable when endpoint creation validation fails.
  }

  revalidatePath(`/organizer/events/${eventId}/integrations`);
}

async function publishWebhookEventFormAction(formData: FormData) {
  "use server";

  const eventId = formData.get("eventId");

  if (typeof eventId !== "string" || !eventId) {
    return;
  }

  try {
    await publishWebhookEvent(eventId, {
      eventType: formData.get("eventType"),
      payload: safeJsonParse(formData.get("payload")) ?? {},
      metadata: safeJsonParse(formData.get("metadata")),
      idempotencyKey: formData.get("idempotencyKey"),
      maxAttempts: formData.get("maxAttempts"),
    });
  } catch {
    // Keep the page usable when webhook publish validation fails.
  }

  revalidatePath(`/organizer/events/${eventId}/integrations`);
}

async function replayWebhookEventsFormAction(formData: FormData) {
  "use server";

  const eventId = formData.get("eventId");
  const from = formData.get("from");
  const to = formData.get("to");

  if (typeof eventId !== "string" || !eventId) {
    return;
  }

  if (typeof from !== "string" || typeof to !== "string" || !from || !to) {
    return;
  }

  try {
    await replayWebhookEvents(eventId, {
      from: new Date(from),
      to: new Date(to),
      eventTypes: parseDelimitedList(formData.get("eventTypes")),
      maxEvents: formData.get("maxEvents"),
    });
  } catch {
    // Keep the page usable when replay validation fails.
  }

  revalidatePath(`/organizer/events/${eventId}/integrations`);
}

type OrganizerEventIntegrationsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerEventIntegrationsPage({
  params,
}: OrganizerEventIntegrationsPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event integrations workspace is unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const supportedEventTypes = listSupportedWebhookEventTopics();

  const [endpointsResult, outboxEvents, deadLetters, inboundEvents] = await Promise.all([
    listWebhookEndpoints(eventId)
      .then((endpoints) => ({
        endpoints,
        error: null as string | null,
      }))
      .catch((error: unknown) => ({
        endpoints: [],
        error: error instanceof Error ? error.message : "Failed to load endpoints.",
      })),
    listWebhookOutboxEvents(eventId, {
      take: 30,
    }).catch(() => []),
    listWebhookDeadLetters(eventId, 20).catch(() => []),
    listInboundProviderEvents(eventId, {
      take: 30,
    }).catch(() => []),
  ]);

  const endpoints = endpointsResult.endpoints;
  const integrationsError = endpointsResult.error;

  return (
    <div className="space-y-6">
      {integrationsError ? (
        <Card>
          <CardContent className="py-6 text-sm text-red-600">{integrationsError}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Webhook Endpoint Management</CardTitle>
          <CardDescription>
            Register endpoint destinations for event-scoped outbound webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createWebhookEndpointFormAction} className="grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="eventId" value={eventId} />

            <label className="text-sm font-medium text-gray-900">
              Endpoint name
              <Input className="mt-1" name="name" required placeholder="Primary listener" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              URL
              <Input className="mt-1" name="url" type="url" required placeholder="https://example.com/webhook" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Status
              <Select className="mt-1" name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
                <option value="DISABLED">DISABLED</option>
              </Select>
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Event types (comma or newline separated topics)
              <Textarea
                className="mt-1"
                name="eventTypes"
                rows={3}
                defaultValue={supportedEventTypes.join("\n")}
              />
            </label>

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Create endpoint
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">URL</th>
                  <th className="py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={endpoint.id} className="border-b border-gray-200/60 align-top">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{endpoint.name}</p>
                      <p className="mt-1 text-xs text-gray-500">Key: {endpoint.activeSigningKeyId}</p>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{endpoint.status}</td>
                    <td className="py-3 pr-4 text-gray-500">{endpoint.url}</td>
                    <td className="py-3 text-gray-500">
                      {new Date(endpoint.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {endpoints.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-gray-500" colSpan={4}>
                      No webhook endpoints configured.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Outbox</CardTitle>
          <CardDescription>
            Publish test events and monitor delivery pipeline state.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={publishWebhookEventFormAction} className="grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="eventId" value={eventId} />

            <label className="text-sm font-medium text-gray-900">
              Event type
              <Select className="mt-1" name="eventType" defaultValue={supportedEventTypes[0]}>
                {supportedEventTypes.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventType}
                  </option>
                ))}
              </Select>
            </label>

            <label className="text-sm font-medium text-gray-900">
              Idempotency key (optional)
              <Input className="mt-1" name="idempotencyKey" placeholder="evt:manual:test" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Max attempts
              <Input className="mt-1" name="maxAttempts" type="number" min={1} max={12} defaultValue={8} />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Payload (JSON)
              <Textarea
                className="mt-1"
                name="payload"
                rows={4}
                defaultValue='{"source":"organizer-dashboard"}'
              />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Metadata (JSON)
              <Textarea className="mt-1" name="metadata" rows={3} placeholder='{"trace":"manual"}' />
            </label>

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Publish webhook event
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {outboxEvents.map((outboxEvent) => (
                  <tr key={outboxEvent.id} className="border-b border-gray-200/60 align-top">
                    <td className="py-3 pr-4 text-gray-500">{outboxEvent.eventType}</td>
                    <td className="py-3 pr-4 text-gray-500">{outboxEvent.status}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {outboxEvent.attemptCount} / {outboxEvent.maxAttempts}
                    </td>
                    <td className="py-3 text-gray-500">
                      {new Date(outboxEvent.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {outboxEvents.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-gray-500" colSpan={4}>
                      No webhook outbox events yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Replay and Dead-Letter Operations</CardTitle>
          <CardDescription>
            Replay a time window and inspect dead-letter queue events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={replayWebhookEventsFormAction} className="grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="eventId" value={eventId} />

            <label className="text-sm font-medium text-gray-900">
              From
              <Input className="mt-1" type="datetime-local" name="from" required />
            </label>

            <label className="text-sm font-medium text-gray-900">
              To
              <Input className="mt-1" type="datetime-local" name="to" required />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Max events
              <Input className="mt-1" name="maxEvents" type="number" min={1} max={200} defaultValue={50} />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Filter event types (optional)
              <Textarea
                className="mt-1"
                name="eventTypes"
                rows={2}
                placeholder="order.completed, ticket.transferred"
              />
            </label>

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-100"
              >
                Replay matching events
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                  <th className="py-2 pr-4">Dead-letter type</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2 pr-4">Last error</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {deadLetters.map((deadLetter) => (
                  <tr key={deadLetter.id} className="border-b border-gray-200/60 align-top">
                    <td className="py-3 pr-4 text-gray-500">{deadLetter.eventType}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {deadLetter.attemptCount} / {deadLetter.maxAttempts}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{deadLetter.lastError ?? "-"}</td>
                    <td className="py-3 text-gray-500">
                      {new Date(deadLetter.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {deadLetters.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-gray-500" colSpan={4}>
                      No dead-letter events at the moment.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbound Provider Events</CardTitle>
          <CardDescription>
            Recent callbacks from external providers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {inboundEvents.map((event) => (
                  <tr key={event.id} className="border-b border-gray-200/60 align-top">
                    <td className="py-3 pr-4 text-gray-500">{event.provider}</td>
                    <td className="py-3 pr-4 text-gray-500">{event.providerType}</td>
                    <td className="py-3 pr-4 text-gray-500">{event.status}</td>
                    <td className="py-3 text-gray-500">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {inboundEvents.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-gray-500" colSpan={4}>
                      No inbound provider callbacks logged.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
