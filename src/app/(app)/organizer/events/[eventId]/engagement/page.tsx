import { revalidatePath } from "next/cache";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getEventDetailSnapshot } from "@/domains/events/service";
import {
  listEventNotificationDeliveries,
  sendOrganizerAnnouncement,
} from "@/domains/notifications/service";

type DeliveryItem = {
  id: string;
  type: string;
  channel: string;
  status: string;
  recipientAddress?: string;
  createdAt: string;
};

const DELIVERY_PAGE_SIZE = 20;

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

function createDeliveryPageHref(eventId: string, page: number) {
  return `/organizer/events/${eventId}/engagement?page=${page}`;
}

async function sendAnnouncementFormAction(formData: FormData) {
  "use server";

  const eventId = formData.get("eventId");

  if (typeof eventId !== "string" || !eventId) {
    return;
  }

  const channels = formData
    .getAll("channels")
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  try {
    await sendOrganizerAnnouncement(eventId, {
      subject: (formData.get("subject") as string | null) ?? undefined,
      content: (formData.get("content") as string | null) ?? undefined,
      audienceType: (formData.get("audienceType") as string | null) ?? undefined,
      ticketClassId: (formData.get("ticketClassId") as string | null) ?? undefined,
      channels: channels.length > 0 ? channels : undefined,
    });
  } catch {
    // Keep the workspace usable even if announcement validation fails.
  }

  revalidatePath(`/organizer/events/${eventId}/engagement`);
}

type OrganizerEventEngagementPageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrganizerEventEngagementPage({
  params,
  searchParams,
}: OrganizerEventEngagementPageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const page = parsePage(query.page);
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event engagement console is unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const deliveriesResult = await listEventNotificationDeliveries(eventId, {
    page,
    pageSize: DELIVERY_PAGE_SIZE,
  })
    .then((result) => ({
      deliveries: result.items as DeliveryItem[],
      total: result.total,
      resolvedPage: result.page,
      resolvedPageSize: result.pageSize,
      error: null as string | null,
    }))
    .catch((error: unknown) => ({
      deliveries: [] as DeliveryItem[],
      total: 0,
      resolvedPage: 1,
      resolvedPageSize: DELIVERY_PAGE_SIZE,
      error: error instanceof Error ? error.message : "Failed to load deliveries.",
    }));

  const deliveries = deliveriesResult.deliveries;
  const deliveriesPage = deliveriesResult.resolvedPage;
  const deliveriesPageSize = deliveriesResult.resolvedPageSize;
  const deliveriesTotal = deliveriesResult.total;
  const totalDeliveryPages = Math.max(1, Math.ceil(deliveriesTotal / deliveriesPageSize));
  const deliveriesError = deliveriesResult.error;

  const queuedDeliveries = deliveries.filter(
    (delivery) => delivery.status === "QUEUED",
  ).length;
  const sentDeliveries = deliveries.filter(
    (delivery) => delivery.status === "SENT",
  ).length;
  const failedDeliveries = deliveries.filter(
    (delivery) =>
      delivery.status === "FAILED" ||
      delivery.status === "DEAD_LETTER",
  ).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Audience Communication</CardTitle>
          <CardDescription>
            Send organizer announcements with explicit audience targeting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendAnnouncementFormAction} className="grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="eventId" value={eventId} />

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Subject
              <Input className="mt-1" name="subject" placeholder="Important update" />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Message
              <Textarea
                className="mt-1"
                name="content"
                rows={5}
                required
                placeholder="Share the latest event update with your attendees"
              />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Audience
              <Select className="mt-1" name="audienceType" defaultValue="ALL_ATTENDEES">
                <option value="ALL_ATTENDEES">ALL_ATTENDEES</option>
                <option value="CHECKED_IN_ATTENDEES">CHECKED_IN_ATTENDEES</option>
                <option value="NOT_CHECKED_IN_ATTENDEES">NOT_CHECKED_IN_ATTENDEES</option>
                <option value="TICKET_CLASS_BUYERS">TICKET_CLASS_BUYERS</option>
              </Select>
            </label>

            <label className="text-sm font-medium text-gray-900">
              Ticket class (optional)
              <Select className="mt-1" name="ticketClassId" defaultValue="">
                <option value="">Not scoped</option>
                {snapshot.event.ticketClasses.map((ticketClass) => (
                  <option key={ticketClass.id} value={ticketClass.id}>
                    {ticketClass.name}
                  </option>
                ))}
              </Select>
            </label>

            <fieldset className="lg:col-span-2 rounded-xl border border-gray-200 p-4">
              <legend className="px-1 text-sm font-medium text-gray-900">Channels</legend>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-900">
                <label className="inline-flex items-center gap-2">
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    name="channels"
                    value="EMAIL"
                    defaultChecked
                  />
                  EMAIL
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    name="channels"
                    value="IN_APP"
                    defaultChecked
                  />
                  IN_APP
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    name="channels"
                    value="PUSH"
                  />
                  PUSH
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    name="channels"
                    value="SMS"
                  />
                  SMS
                </label>
              </div>
            </fieldset>

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Send announcement
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Snapshot</CardTitle>
          <CardDescription>
            Recent outbound notification statuses for this event.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Queued</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{queuedDeliveries}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Sent</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{sentDeliveries}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Failed / dead-letter</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{failedDeliveries}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
          <CardDescription>
            Latest notification attempts across all channels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveriesError ? (
            <p className="text-sm text-red-600">{deliveriesError}</p>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-gray-500">No deliveries have been generated for this event yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Channel</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Recipient</th>
                      <th className="py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((delivery) => (
                      <tr key={delivery.id} className="border-b border-gray-200/60 align-top">
                        <td className="py-3 pr-4 text-gray-500">{delivery.type}</td>
                        <td className="py-3 pr-4 text-gray-500">{delivery.channel}</td>
                        <td className="py-3 pr-4 text-gray-500">{delivery.status}</td>
                        <td className="py-3 pr-4 text-gray-500">{delivery.recipientAddress ?? "-"}</td>
                        <td className="py-3 text-gray-500">
                          {new Date(delivery.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <PaginationControls
                summary={`Page ${deliveriesPage} of ${totalDeliveryPages} - ${deliveriesTotal} deliveries`}
                previousHref={createDeliveryPageHref(eventId, Math.max(1, deliveriesPage - 1))}
                nextHref={createDeliveryPageHref(
                  eventId,
                  Math.min(totalDeliveryPages, deliveriesPage + 1),
                )}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
