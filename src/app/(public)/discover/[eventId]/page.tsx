import Link from "next/link";
import { notFound } from "next/navigation";
import { getDiscoverableEventDetail } from "@/domains/discovery/service";

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

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
          <p className="mt-2 text-sm text-white/85">{detail.organizer.name}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="mt-2 text-sm text-gray-500">
          {detail.organizer.name} · {detail.timezone}
        </p>
        <p className="mt-4 text-sm text-gray-500">{detail.description ?? "No description provided."}</p>
        <div className="mt-4">
          <Link href="/discover" className="text-sm font-medium text-orange-500">
            Back to discover
          </Link>
        </div>
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
        <ul className="mt-3 space-y-2 text-sm text-gray-500">
          {detail.ticketClasses.length === 0 ? (
            <li>No ticket classes available.</li>
          ) : (
            detail.ticketClasses.map((ticketClass) => (
              <li key={ticketClass.id}>
                {ticketClass.name} ({ticketClass.type})
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
