import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { listMyNotifications } from "@/domains/notifications/service";

const STATUS_OPTIONS = ["PENDING", "SENT", "FAILED", "DEAD_LETTER", "CANCELLED"] as const;
const TYPE_OPTIONS = [
  "ORDER_CONFIRMATION",
  "EVENT_REMINDER",
  "EVENT_UPDATE",
  "ORGANIZER_ANNOUNCEMENT",
  "WELCOME",
  "ORGANIZATION_CREATED",
  "TICKET_TRANSFER_REQUESTED",
  "TICKET_TRANSFER_UPDATED",
  "TICKET_TRANSFER_RECEIVED",
  "REFUND_COMPLETED",
  "USER_RESTRICTED",
  "STAFF_ASSIGNED",
  "CHECKIN_ACCEPTED",
  "WAITLIST_PROMOTED",
  "PAYMENT_FAILED",
  "EVENT_STATUS_CHANGED",
] as const;

type NotificationsPageProps = {
  searchParams: Promise<{
    status?: string;
    type?: string;
    take?: string;
  }>;
};

function toDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const params = await searchParams;

  const status = STATUS_OPTIONS.includes(params.status as (typeof STATUS_OPTIONS)[number])
    ? params.status
    : undefined;
  const type = TYPE_OPTIONS.includes(params.type as (typeof TYPE_OPTIONS)[number])
    ? params.type
    : undefined;
  const take = params.take?.trim() || "20";

  const notifications = await listMyNotifications({
    status,
    type,
    take,
  }).catch(() => null);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Notifications</h1>
        <p className="mt-2 text-sm text-gray-500">
          Review recent deliveries by type, status, and channel.
        </p>
      </header>

      <main className="space-y-6">
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filter Deliveries</CardTitle>
              <CardDescription>Refine by status, type, and result window size.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-[1fr_1fr_120px_auto]" method="get">
                <label className="text-sm font-medium text-gray-900">
                  Status
                  <Select className="mt-1" name="status" defaultValue={status ?? ""}>
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="text-sm font-medium text-gray-900">
                  Type
                  <Select className="mt-1" name="type" defaultValue={type ?? ""}>
                    <option value="">All types</option>
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="text-sm font-medium text-gray-900">
                  Limit
                  <Input
                    className="mt-1"
                    min={1}
                    max={100}
                    name="take"
                    type="number"
                    defaultValue={take}
                  />
                </label>

                <div className="flex items-end">
                  <Button type="submit" className="w-full md:w-auto">
                    Apply
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        <section>
          {!notifications ? (
            <Card>
              <CardContent className="py-8 text-sm text-gray-500">
                Notifications are temporarily unavailable.
              </CardContent>
            </Card>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-gray-500">
                No notifications match the current filters.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card key={notification.id}>
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-gray-500">
                          {notification.status} / {notification.channel}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {notification.subject ?? notification.type}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">{notification.content}</p>

                        {notification.failureReason ? (
                          <p className="mt-2 text-xs font-medium text-red-600">
                            Failure reason: {notification.failureReason}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>
                          Attempts: {notification.attemptCount} / {notification.maxAttempts}
                        </p>
                        <p className="mt-1">
                          Recipient: {notification.recipientAddress ?? "n/a"}
                        </p>
                        <p>Scheduled: {toDateTime(notification.scheduledFor)}</p>
                        <p className="mt-1">Created: {toDateTime(notification.createdAt)}</p>
                        {notification.sentAt ? (
                          <p className="mt-1">Sent: {toDateTime(notification.sentAt)}</p>
                        ) : null}
                        {notification.failedAt ? (
                          <p className="mt-1">Failed: {toDateTime(notification.failedAt)}</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
