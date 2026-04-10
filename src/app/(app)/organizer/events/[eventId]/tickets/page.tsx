import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createEventTicketClassFormAction } from "@/domains/events/actions";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventTicketsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

function toDateTimeLocal(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

export default async function OrganizerEventTicketsPage({
  params,
}: OrganizerEventTicketsPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event ticket class management is unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const formAction = createEventTicketClassFormAction;
  const defaultCurrency = event.ticketClasses[0]?.currency ?? "ETB";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ticket Classes</CardTitle>
          <CardDescription>
            Configure inventory, release strategy, and pricing windows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event.ticketClasses.length === 0 ? (
            <p className="text-sm text-gray-500">No ticket classes are configured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Price</th>
                    <th className="py-2 pr-4">Sales window</th>
                    <th className="py-2 pr-4">Capacity</th>
                    <th className="py-2">Release strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {event.ticketClasses.map((ticketClass) => (
                    <tr key={ticketClass.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900">{ticketClass.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {ticketClass.hidden ? "Hidden" : "Visible"}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{ticketClass.type}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        {ticketClass.price} {ticketClass.currency}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{ticketClass.salesStartAt.toLocaleString()}</p>
                        <p className="mt-1 text-xs">to {ticketClass.salesEndAt.toLocaleString()}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        <p>{ticketClass.capacity}</p>
                        <p className="mt-1 text-xs">Per-order limit: {ticketClass.perOrderLimit}</p>
                      </td>
                      <td className="py-3 text-gray-500">{ticketClass.releaseStrategy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {snapshot.canManageEvent ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Ticket Class</CardTitle>
            <CardDescription>
              Add a ticket class with release behavior and optional pricing configs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-4 lg:grid-cols-2">
              <input type="hidden" name="eventId" value={event.id} />

              <label className="text-sm font-medium text-gray-900 lg:col-span-2">
                Name
                <Input className="mt-1" name="name" required placeholder="General Admission" />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Type
                <Select className="mt-1" name="type" defaultValue="PAID">
                  <option value="FREE">FREE</option>
                  <option value="PAID">PAID</option>
                  <option value="VIP">VIP</option>
                </Select>
              </label>

              <label className="text-sm font-medium text-gray-900">
                Price
                <Input className="mt-1" name="price" type="number" min={0} step="0.01" defaultValue={0} />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Currency
                <Input
                  className="mt-1"
                  name="currency"
                  minLength={3}
                  maxLength={3}
                  defaultValue={defaultCurrency}
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Release strategy
                <Select className="mt-1" name="releaseStrategy" defaultValue="STANDARD">
                  <option value="STANDARD">STANDARD</option>
                  <option value="EARLY_BIRD">EARLY_BIRD</option>
                  <option value="PHASED">PHASED</option>
                  <option value="DYNAMIC">DYNAMIC</option>
                </Select>
              </label>

              <label className="text-sm font-medium text-gray-900">
                Sales start
                <Input
                  className="mt-1"
                  name="salesStartAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(event.startAt)}
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Sales end
                <Input
                  className="mt-1"
                  name="salesEndAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(event.endAt)}
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Capacity
                <Input className="mt-1" name="capacity" type="number" min={1} defaultValue={100} required />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Per-order limit
                <Input
                  className="mt-1"
                  name="perOrderLimit"
                  type="number"
                  min={1}
                  defaultValue={4}
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-900">
                Unlock code
                <Input className="mt-1" name="unlockCode" placeholder="Optional" />
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                <input name="hidden" type="checkbox" className="h-4 w-4" />
                Hidden from public listing
              </label>

              <label className="text-sm font-medium text-gray-900 lg:col-span-2">
                Dynamic pricing config (JSON)
                <Textarea
                  className="mt-1"
                  name="dynamicPricingConfig"
                  rows={4}
                  placeholder='{"rule":"volume","steps":[...]}'
                />
              </label>

              <label className="text-sm font-medium text-gray-900 lg:col-span-2">
                Bulk pricing config (JSON)
                <Textarea
                  className="mt-1"
                  name="bulkPricingConfig"
                  rows={4}
                  placeholder='{"threshold":5,"discountPercent":10}'
                />
              </label>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
                >
                  Create ticket class
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
