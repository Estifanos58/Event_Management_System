import Link from "next/link";
import type { DiscoverySort } from "@/domains/discovery/types";
import { listDiscoverableEvents } from "@/domains/discovery/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

const SORT_OPTIONS: Array<{ value: DiscoverySort; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
  { value: "popularity", label: "Popularity" },
  { value: "rating", label: "Rating" },
  { value: "price", label: "Price" },
];

type AttendeeEventsPageProps = {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    page?: string;
  }>;
};

function toValidSort(rawValue: string | undefined): DiscoverySort {
  if (!rawValue) {
    return "relevance";
  }

  const option = SORT_OPTIONS.find((item) => item.value === rawValue);
  return option?.value ?? "relevance";
}

export default async function AttendeeEventsPage({ searchParams }: AttendeeEventsPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const sort = toValidSort(params.sort);
  const page = params.page?.trim() || "1";

  const result = await listDiscoverableEvents({
    q,
    sort,
    page,
    pageSize: "12",
  }).catch(() => null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendee Events</CardTitle>
          <CardDescription>
            Browse discoverable events, then jump into detail or checkout routes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" method="get">
            <label className="text-sm font-medium text-gray-900">
              Search
              <Input
                className="mt-1"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search title, organizer, or keyword"
              />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Sort
              <Select className="mt-1" name="sort" defaultValue={sort}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!result ? (
        <Card>
          <CardContent className="py-8 text-sm text-gray-500">
            Unable to load events right now. Retry in a moment.
          </CardContent>
        </Card>
      ) : result.items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-gray-500">
            No events matched your current query.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            {result.items.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.coverImageUrl ?? FALLBACK_EVENT_COVER}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent" />
                </div>
                <div className="p-5">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-500">
                  {item.venueMode} - {item.organizer.region}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-gray-900">{item.title}</h2>
                <p className="mt-2 text-sm text-gray-500">
                  {item.description ?? "No description available."}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>Rating: {item.ratingAverage.toFixed(1)}</span>
                  <span>Popularity: {item.popularityScore.toFixed(2)}</span>
                  <span>{item.soldOut ? "Sold out" : "Tickets available"}</span>
                </div>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <Link href={`/attendee/events/${item.id}`} className="font-medium text-orange-500">
                    View details
                  </Link>
                  <Link href={`/attendee/checkout/${item.id}`} className="font-medium text-orange-500">
                    Checkout
                  </Link>
                </div>
                </div>
              </article>
            ))}
          </section>

          <Card>
            <CardContent className="flex items-center justify-between py-4 text-sm text-gray-500">
              <p>
                Showing {result.items.length} of {result.total} events.
              </p>
              <p>Page {result.page}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
