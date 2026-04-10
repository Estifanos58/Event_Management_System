import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, Clock3, MapPin, ShieldCheck, Star, Wifi } from "lucide-react";
import { getDiscoverableEventDetail } from "@/domains/discovery/service";

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

function formatDateTime(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateIso));
}

function formatMoney(amount: number, currency: string) {
  if (amount <= 0) {
    return "Free";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default async function DiscoverEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const detail = await getDiscoverableEventDetail(eventId);

  if (!detail) {
    notFound();
  }

  const heroImage = detail.coverImageUrl ?? detail.galleryImages[0] ?? FALLBACK_EVENT_COVER;

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
          <p className="mt-2 text-sm text-white/85">
            {detail.organizer.name} · {formatDateTime(detail.startAt)}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Event Overview</h2>
          <p className="mt-3 text-sm text-gray-500">{detail.description ?? "No description provided."}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                <Calendar className="h-4 w-4" /> Starts
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{formatDateTime(detail.startAt)}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                <Clock3 className="h-4 w-4" /> Ends
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{formatDateTime(detail.endAt)}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                <MapPin className="h-4 w-4" /> Location
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {detail.venueMode === "VIRTUAL"
                  ? "Virtual event"
                  : detail.venueName ?? detail.venueAddress ?? "Venue details to be announced"}
              </p>
              {detail.venueAddress ? (
                <p className="mt-1 text-xs text-gray-500">{detail.venueAddress}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                <Wifi className="h-4 w-4" /> Timezone
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{detail.timezone}</p>
              {detail.virtualMeetingUrl ? (
                <a
                  href={detail.virtualMeetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-xs font-semibold text-orange-500 hover:text-orange-600"
                >
                  Virtual access details
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/attendee/checkout/${detail.id}`}
              className="inline-flex h-10 items-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Reserve tickets
            </Link>
            <Link href="/discover" className="text-sm font-medium text-orange-500 hover:text-orange-600">
              Back to discover
            </Link>
          </div>
        </article>

        <aside className="space-y-4">
          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
              Availability
            </h3>
            <p className="mt-2 text-lg font-semibold text-gray-900">{detail.availability.displayLabel}</p>
            <ul className="mt-3 space-y-1 text-sm text-gray-500">
              <li>Capacity: {detail.availability.totalCapacity ?? "Unbounded"}</li>
              <li>Sold tickets: {detail.availability.soldTickets}</li>
              <li>Active holds: {detail.availability.activeHolds}</li>
              <li>
                Remaining: {detail.availability.remainingTickets ?? "Not tracked"}
              </li>
            </ul>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
              Reputation
            </h3>
            <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Star className="h-5 w-5 text-orange-500" />
              {detail.feedbackSummary.ratingAverage.toFixed(1)} / 5
            </p>
            <ul className="mt-3 space-y-1 text-sm text-gray-500">
              <li>Ratings: {detail.feedbackSummary.ratingCount}</li>
              <li>Event score: {detail.reputation.eventReputationScore.toFixed(2)}</li>
              <li>Organizer score: {detail.reputation.organizerReputationScore.toFixed(2)}</li>
              <li>Attendance rate: {detail.reputation.attendanceRate.toFixed(1)}%</li>
            </ul>
          </article>
        </aside>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Event Sessions</h2>
        {detail.sessions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No sessions have been scheduled for this event yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {detail.sessions.map((session) => (
              <article key={session.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">{session.title}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatDateTime(session.startAt)} - {formatDateTime(session.endAt)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Room: {session.room ?? "Main stage / TBA"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Event Gallery</h2>
        {detail.galleryImages.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No gallery images provided for this event.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Ticket Classes</h2>
        <ul className="mt-3 space-y-3 text-sm text-gray-500">
          {detail.ticketClasses.length === 0 ? (
            <li>No ticket classes available.</li>
          ) : (
            detail.ticketClasses.map((ticketClass) => (
              <li key={ticketClass.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">
                    {ticketClass.name} ({ticketClass.type})
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatMoney(ticketClass.price, ticketClass.currency)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-gray-500">Capacity: {ticketClass.capacity}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Sales window: {formatDateTime(ticketClass.salesStartAt)} - {formatDateTime(ticketClass.salesEndAt)}
                </p>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4">
          <Link
            href={`/attendee/checkout/${detail.id}`}
            className="inline-flex h-10 items-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            Continue to checkout
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Attendee Feedback</h2>
        <p className="mt-2 text-sm text-gray-500">
          {detail.feedbackSummary.ratingCount === 0
            ? "No feedback has been submitted for this event yet."
            : `${detail.feedbackSummary.ratingCount} ratings with an average of ${detail.feedbackSummary.ratingAverage.toFixed(1)}.`}
        </p>

        {detail.feedbackSummary.tagFrequency.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.feedbackSummary.tagFrequency.map((tag) => (
              <span
                key={tag.tag}
                className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700"
              >
                {tag.tag} ({tag.count})
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ShieldCheck className="h-4 w-4 text-orange-500" /> Feedback Eligibility
          </p>
          <p className="mt-1 text-xs text-gray-500">{detail.feedbackEligibility.reason}</p>
          <p className="mt-1 text-xs text-gray-500">
            Status: {detail.feedbackEligibility.eligible ? "Eligible" : "Not eligible"}
            {detail.feedbackEligibility.alreadySubmitted ? " · Already submitted" : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
