import Link from "next/link";
import {
  Search,
  Calendar,
  MapPin,
  ArrowRight,
  BriefcaseBusiness,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDiscoverableEvents } from "@/domains/discovery/service";

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

export const dynamic = "force-dynamic";

function formatEventSchedule(startAtIso: string) {
  const startAt = new Date(startAtIso);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(startAt);
}

function formatEventLocation(input: {
  venueMode: "PHYSICAL" | "VIRTUAL" | "HYBRID";
  venueName: string | null;
  venueAddress: string | null;
  region: string;
}) {
  if (input.venueMode === "VIRTUAL") {
    return `Virtual · ${input.region}`;
  }

  if (input.venueName && input.venueAddress) {
    return `${input.venueName} · ${input.venueAddress}`;
  }

  if (input.venueName) {
    return input.venueName;
  }

  if (input.venueAddress) {
    return input.venueAddress;
  }

  return input.region;
}

export default async function HomePage() {
  const categories = ["All", "Tech", "Music", "Design", "Business", "Health", "Sports", "Arts"];
  const featuredEvents = await listDiscoverableEvents({
    page: "1",
    pageSize: "3",
    sort: "popularity",
  })
    .then((result) => result.items)
    .catch(() => []);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="relative overflow-hidden bg-linear-to-br from-orange-500 to-red-500 px-6 py-24 text-white sm:py-28">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-black/10 blur-3xl" />
        <div className="relative mx-auto max-w-5xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Discover Events That Matter
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/90">
            Explore unforgettable experiences, connect with communities, and create your next memory.
          </p>

          <form
            action="/discover"
            method="get"
            className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 rounded-2xl bg-white p-3 shadow-xl sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                name="q"
                placeholder="Search events, venues, or organizers..."
                className="border-none bg-transparent pl-11 shadow-none focus-visible:ring-0"
              />
            </div>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
              Browse events
            </Button>
            <Link
              href="/register"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-200"
            >
              Create event <ArrowRight className="h-4 w-4" />
            </Link>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-14 px-6 py-12">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">Browse by category</h2>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
              >
                {category}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Featured Events</h2>
            <Link href="/discover" className="text-sm font-semibold text-orange-500 hover:text-orange-600">
              View all
            </Link>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {featuredEvents.length === 0 ? (
              <Card className="xl:col-span-3">
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    No featured events are available right now. Check back soon.
                  </p>
                </CardContent>
              </Card>
            ) : (
              featuredEvents.map((event) => (
                <Card key={event.id} className="overflow-hidden">
                  <div className="aspect-16/10 overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={event.coverImageUrl ?? FALLBACK_EVENT_COVER}
                      alt={event.title}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  </div>
                  <CardContent className="space-y-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-orange-500">
                      <Calendar className="h-4 w-4" /> {formatEventSchedule(event.startAt)}
                    </p>
                    <h3 className="text-lg font-bold text-gray-900">{event.title}</h3>
                    <p className="line-clamp-3 text-sm text-gray-500">
                      {event.description ?? "No description available yet."}
                    </p>
                    <p className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin className="h-4 w-4" />
                      {formatEventLocation({
                        venueMode: event.venueMode,
                        venueName: event.venueName,
                        venueAddress: event.venueAddress,
                        region: event.organizer.region,
                      })}
                    </p>
                    <Link
                      href={`/discover/${event.id}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-orange-500 hover:text-orange-600"
                    >
                      View event <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-orange-500" /> For Attendees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Discover events faster, reserve instantly, and manage all tickets in one clean workspace.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BriefcaseBusiness className="h-5 w-5 text-orange-500" /> For Organizers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Launch events, track performance, and manage operations with a product-first organizer hub.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-2xl bg-linear-to-r from-orange-500 to-red-500 p-10 text-center text-white shadow-sm">
          <h2 className="text-3xl font-extrabold tracking-tight">Create your event</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/90">
            Turn your next idea into a live experience with a platform built for speed, scale, and delight.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-orange-600 transition-colors hover:bg-gray-100"
            >
              Start organizing
            </Link>
            <Link
              href="/discover"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white/15 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/25"
            >
              Explore events
            </Link>
          </div>
        </section>
      </main>
    </main>
  );
}
