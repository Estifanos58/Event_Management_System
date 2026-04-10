import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDiscoverableEventDetail } from "@/domains/discovery/service";
import { getActiveReservationForUser, getMyEventTickets } from "@/domains/ticketing/service";

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

type AttendeeEventDetailPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default async function AttendeeEventDetailPage({ params }: AttendeeEventDetailPageProps) {
  const { eventId } = await params;
  const detail = await getDiscoverableEventDetail(eventId);

  if (!detail) {
    notFound();
  }

  const [reservation, myTickets] = await Promise.all([
    getActiveReservationForUser(eventId).catch(() => null),
    getMyEventTickets(eventId).catch(() => []),
  ]);

  const heroImage = detail.coverImageUrl ?? detail.galleryImages[0] ?? FALLBACK_EVENT_COVER;

  const ticketClassById = new Map(detail.ticketClasses.map((ticketClass) => [ticketClass.id, ticketClass]));

  return (
    <div className="space-y-6">
      <section className="relative h-[320px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroImage} alt={detail.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-200">
            {detail.venueMode} / {detail.organizer.region}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{detail.title}</h1>
          <p className="mt-2 text-sm text-white/85">{detail.organizer.name}</p>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Event Overview</CardTitle>
          <CardDescription>
            {detail.organizer.name} - {detail.timezone} - {formatDateTime(detail.startAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-500">
          <p>{detail.description ?? "No description provided."}</p>
          <div className="flex flex-wrap gap-3">
            <span className="rounded-lg border border-gray-200 px-3 py-1">
              Availability: {detail.availability.displayLabel}
            </span>
            <span className="rounded-lg border border-gray-200 px-3 py-1">
              Reputation: {detail.reputation.eventReputationScore.toFixed(2)}
            </span>
            <span className="rounded-lg border border-gray-200 px-3 py-1">
              Rating: {detail.feedbackSummary.ratingAverage.toFixed(1)} ({detail.feedbackSummary.ratingCount})
            </span>
          </div>
          <div className="flex items-center gap-4 pt-2">
            <Link href={`/attendee/checkout/${detail.id}`} className="font-medium text-orange-500">
              Start checkout
            </Link>
            <Link href="/attendee/events" className="font-medium text-orange-500">
              Back to events
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event Gallery</CardTitle>
          <CardDescription>Additional visuals provided by the organizer.</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.galleryImages.length === 0 ? (
            <p className="text-sm text-gray-500">No gallery images were added for this event.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {detail.galleryImages.map((imageUrl, index) => (
                <div key={`${imageUrl}:${index}`} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={`${detail.title} gallery ${index + 1}`}
                    className="aspect-video h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ticket Classes</CardTitle>
            <CardDescription>Pricing and sales windows currently configured for this event.</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.ticketClasses.length === 0 ? (
              <p className="text-sm text-gray-500">No ticket classes available yet.</p>
            ) : (
              <ul className="space-y-3">
                {detail.ticketClasses.map((ticketClass) => (
                  <li key={ticketClass.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <p className="font-medium text-gray-900">
                      {ticketClass.name} ({ticketClass.type})
                    </p>
                    <p className="mt-1 text-gray-500">
                      {ticketClass.price.toFixed(2)} {ticketClass.currency} - capacity {ticketClass.capacity}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Sales window: {formatDateTime(ticketClass.salesStartAt)} to {formatDateTime(ticketClass.salesEndAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Reservation</CardTitle>
              <CardDescription>Current hold state for your account in this event.</CardDescription>
            </CardHeader>
            <CardContent>
              {!reservation ? (
                <p className="text-sm text-gray-500">No active reservation found.</p>
              ) : (
                <div className="space-y-2 text-sm text-gray-500">
                  <p>
                    Reservation ID: <span className="font-medium text-gray-900">{reservation.id}</span>
                  </p>
                  <p>Expires at: {reservation.expiresAt.toLocaleString()}</p>
                  <ul className="space-y-2 pt-1">
                    {reservation.items.map((item) => {
                      const ticketClass = ticketClassById.get(item.ticketClassId);

                      return (
                        <li key={`${item.ticketClassId}:${item.quantity}`} className="rounded-lg border border-gray-200 px-3 py-2">
                          {ticketClass?.name ?? item.ticketClassId} x{item.quantity}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Tickets for This Event</CardTitle>
              <CardDescription>Tickets where you are owner or attendee.</CardDescription>
            </CardHeader>
            <CardContent>
              {myTickets.length === 0 ? (
                <p className="text-sm text-gray-500">No tickets found for this event.</p>
              ) : (
                <ul className="space-y-2 text-sm text-gray-500">
                  {myTickets.map((ticket) => (
                    <li key={ticket.id} className="rounded-lg border border-gray-200 px-3 py-2">
                      <p className="font-medium text-gray-900">
                        {ticket.ticketClass.name} - {ticket.status}
                      </p>
                      <div className="mt-1 flex items-center gap-3">
                        <span>Order {ticket.order.id}</span>
                        <Link href={`/attendee/tickets/${ticket.id}`} className="font-medium text-orange-500">
                          Open ticket
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
