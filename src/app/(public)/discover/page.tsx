import Link from "next/link";
import { Calendar, MapPin, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listDiscoverableEvents } from "@/domains/discovery/service";

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

export default async function DiscoverPage() {
  const result = await listDiscoverableEvents({
    page: "1",
    pageSize: "12",
    sort: "relevance",
  }).catch(() => null);

  const items = result?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-500">Discovery</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
          Discover Events That Matter
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-500">
          Explore curated events by region, format, and organizer to find your next experience.
        </p>
      </header>

      <main>
        <section className="grid gap-6 md:grid-cols-2">
          {items.length === 0 ? (
            <Card className="md:col-span-2">
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-500">No discoverable events are currently available.</p>
              </CardContent>
            </Card>
          ) : (
            items.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="relative aspect-video w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.coverImageUrl ?? FALLBACK_EVENT_COVER}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent" />
                </div>
                <CardHeader>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                  <CardDescription>
                    {item.venueMode} / {item.organizer.region}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-gray-500">
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-orange-600">
                        <Calendar className="h-3.5 w-3.5" /> Live discovery
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                        <MapPin className="h-3.5 w-3.5" /> {item.organizer.region}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm text-gray-500">
                      {item.description ?? "No description yet."}
                    </p>
                    <Link
                      href={`/discover/${item.id}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                    >
                      View event <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </main>

      <section className="rounded-2xl bg-linear-to-r from-orange-500 to-red-500 p-8 text-white shadow-sm">
        <h2 className="text-2xl font-extrabold tracking-tight">Want to host your own event?</h2>
        <p className="mt-2 text-sm text-white/90">
          Launch your event in minutes and reach attendees across your region.
        </p>
        <div className="mt-4">
          <Link
            href="/register"
            className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-orange-600 transition-colors hover:bg-gray-100"
          >
            Create your organizer account
          </Link>
        </div>
      </section>
    </div>
  );
}
