import Link from "next/link";
import { Calendar, MapPin, ArrowRight, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDiscoverySuggestions, listDiscoverableEvents } from "@/domains/discovery/service";
import type { DiscoverySort } from "@/domains/discovery/types";

const SORT_OPTIONS: Array<{ value: DiscoverySort; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
  { value: "popularity", label: "Popularity" },
  { value: "rating", label: "Rating" },
  { value: "price", label: "Price" },
];

const EVENT_TYPE_OPTIONS = [
  { value: "PHYSICAL", label: "Physical" },
  { value: "VIRTUAL", label: "Virtual" },
  { value: "HYBRID", label: "Hybrid" },
] as const;

const AVAILABILITY_OPTIONS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "SOLD_OUT", label: "Sold out" },
] as const;

const PAGE_SIZE_OPTIONS = ["12", "24", "36", "50"] as const;

const FALLBACK_EVENT_COVER =
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=70";

type DiscoverPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    location?: string;
    organizer?: string;
    eventType?: string;
    dateFrom?: string;
    dateTo?: string;
    minPrice?: string;
    maxPrice?: string;
    minRating?: string;
    availability?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function normalizeTextParam(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeDateParam(value: string | undefined) {
  const normalized = normalizeTextParam(value);

  if (!normalized) {
    return undefined;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function normalizeNumberParam(value: string | undefined) {
  const normalized = normalizeTextParam(value);

  if (!normalized) {
    return undefined;
  }

  return Number.isFinite(Number(normalized)) ? normalized : undefined;
}

function normalizeIntegerParam(value: string | undefined, fallback: string) {
  const normalized = normalizeTextParam(value);

  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return String(parsed);
}

function normalizeSort(value: string | undefined): DiscoverySort {
  const option = SORT_OPTIONS.find((item) => item.value === value);
  return option?.value ?? "relevance";
}

function normalizeEventType(value: string | undefined) {
  const option = EVENT_TYPE_OPTIONS.find((item) => item.value === value);
  return option?.value;
}

function normalizeAvailability(value: string | undefined) {
  const option = AVAILABILITY_OPTIONS.find((item) => item.value === value);
  return option?.value;
}

function normalizePageSize(value: string | undefined) {
  if (!value) {
    return "12";
  }

  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
    ? value
    : "12";
}

function buildDiscoverHref(
  params: Record<string, string | undefined>,
  updates: Record<string, string | undefined>,
) {
  const merged = {
    ...params,
    ...updates,
  };
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(merged)) {
    if (!value) {
      continue;
    }

    if (key === "page" && value === "1") {
      continue;
    }

    if (key === "sort" && value === "relevance") {
      continue;
    }

    if (key === "pageSize" && value === "12") {
      continue;
    }

    search.set(key, value);
  }

  const query = search.toString();
  return query.length > 0 ? `/discover?${query}` : "/discover";
}

function formatEventDate(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateIso));
}

function formatPrice(amount: number | null, currency: string | null) {
  if (amount === null) {
    return "Price unavailable";
  }

  if (amount <= 0) {
    return "Free";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const params = await searchParams;

  const q = normalizeTextParam(params.q);
  const category = normalizeTextParam(params.category);
  const location = normalizeTextParam(params.location);
  const organizer = normalizeTextParam(params.organizer);
  const eventType = normalizeEventType(params.eventType);
  const dateFrom = normalizeDateParam(params.dateFrom);
  const dateTo = normalizeDateParam(params.dateTo);
  const minPrice = normalizeNumberParam(params.minPrice);
  const maxPrice = normalizeNumberParam(params.maxPrice);
  const minRating = normalizeNumberParam(params.minRating);
  const availability = normalizeAvailability(params.availability);
  const sort = normalizeSort(params.sort);
  const page = normalizeIntegerParam(params.page, "1");
  const pageSize = normalizePageSize(params.pageSize);

  const currentParams = {
    q,
    category,
    location,
    organizer,
    eventType,
    dateFrom,
    dateTo,
    minPrice,
    maxPrice,
    minRating,
    availability,
    sort,
    page,
    pageSize,
  };

  const [result, suggestionsResult] = await Promise.all([
    listDiscoverableEvents({
      q,
      category,
      location,
      organizer,
      eventType,
      dateFrom,
      dateTo,
      minPrice,
      maxPrice,
      minRating,
      availability,
      sort,
      page,
      pageSize,
    }).catch(() => null),
    q
      ? getDiscoverySuggestions({
          q,
          limit: "8",
        }).catch(() => ({
          suggestions: [],
          normalizedTerms: [],
        }))
      : Promise.resolve({
          suggestions: [],
          normalizedTerms: [],
        }),
  ]);

  const items = result?.items ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const previousPageHref = buildDiscoverHref(currentParams, {
    page: String(Math.max(1, Number(page) - 1)),
  });
  const nextPageHref = buildDiscoverHref(currentParams, {
    page: String(Math.min(totalPages, Number(page) + 1)),
  });

  const activeFilters = [
    q ? `Query: ${q}` : null,
    category ? `Category term: ${category}` : null,
    location ? `Location: ${location}` : null,
    organizer ? `Organizer: ${organizer}` : null,
    eventType ? `Type: ${eventType}` : null,
    dateFrom ? `From: ${dateFrom}` : null,
    dateTo ? `To: ${dateTo}` : null,
    minPrice ? `Min price: ${minPrice}` : null,
    maxPrice ? `Max price: ${maxPrice}` : null,
    minRating ? `Min rating: ${minRating}` : null,
    availability ? `Availability: ${availability}` : null,
    sort !== "relevance" ? `Sort: ${sort}` : null,
  ].filter((value): value is string => Boolean(value));

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

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-orange-500" /> Search and Filters
              </CardTitle>
              <CardDescription>
                Search with all discovery filters available in the backend.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form method="get" className="space-y-3">
                <input type="hidden" name="page" value="1" />

                <label className="text-sm font-medium text-gray-900">
                  Search query
                  <Input
                    className="mt-1"
                    name="q"
                    defaultValue={q}
                    placeholder="Event title, venue, or keywords"
                  />
                </label>

                <label className="text-sm font-medium text-gray-900">
                  Category term
                  <Input
                    className="mt-1"
                    name="category"
                    defaultValue={category}
                    placeholder="music, conference, festival"
                  />
                </label>

                <label className="text-sm font-medium text-gray-900">
                  Location
                  <Input
                    className="mt-1"
                    name="location"
                    defaultValue={location}
                    placeholder="City, venue, or region"
                  />
                </label>

                <label className="text-sm font-medium text-gray-900">
                  Organizer
                  <Input
                    className="mt-1"
                    name="organizer"
                    defaultValue={organizer}
                    placeholder="Organizer name"
                  />
                </label>

                <label className="text-sm font-medium text-gray-900">
                  Event type
                  <Select className="mt-1" name="eventType" defaultValue={eventType ?? ""}>
                    <option value="">Any</option>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm font-medium text-gray-900">
                    Date from
                    <Input className="mt-1" type="date" name="dateFrom" defaultValue={dateFrom} />
                  </label>
                  <label className="text-sm font-medium text-gray-900">
                    Date to
                    <Input className="mt-1" type="date" name="dateTo" defaultValue={dateTo} />
                  </label>
                </div>

                <label className="text-sm font-medium text-gray-900">
                  Availability
                  <Select className="mt-1" name="availability" defaultValue={availability ?? ""}>
                    <option value="">Any</option>
                    {AVAILABILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm font-medium text-gray-900">
                    Min price
                    <Input
                      className="mt-1"
                      type="number"
                      min="0"
                      step="0.01"
                      name="minPrice"
                      defaultValue={minPrice}
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-900">
                    Max price
                    <Input
                      className="mt-1"
                      type="number"
                      min="0"
                      step="0.01"
                      name="maxPrice"
                      defaultValue={maxPrice}
                    />
                  </label>
                </div>

                <label className="text-sm font-medium text-gray-900">
                  Minimum rating
                  <Select className="mt-1" name="minRating" defaultValue={minRating ?? ""}>
                    <option value="">Any</option>
                    <option value="1">1+</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                    <option value="5">5</option>
                  </Select>
                </label>

                <div className="grid grid-cols-2 gap-2">
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
                  <label className="text-sm font-medium text-gray-900">
                    Page size
                    <Select className="mt-1" name="pageSize" defaultValue={pageSize}>
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                  >
                    Apply
                  </button>
                  <Link
                    href="/discover"
                    className="inline-flex h-10 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Clear
                  </Link>
                </div>
              </form>

              {suggestionsResult.suggestions.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestionsResult.suggestions.map((suggestion) => (
                    <Link
                      key={suggestion}
                      href={buildDiscoverHref(currentParams, {
                        q: suggestion,
                        page: "1",
                      })}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      {suggestion}
                    </Link>
                  ))}
                </div>
              ) : null}

              {activeFilters.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeFilters.map((filter) => (
                    <span
                      key={filter}
                      className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700"
                    >
                      {filter}
                    </span>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <div className="text-sm text-gray-500">
            {result
              ? `Showing ${items.length} of ${result.total} discoverable events`
              : "Discovery results are temporarily unavailable."}
          </div>

          <section className="grid gap-6 md:grid-cols-2">
            {!result ? (
              <Card className="md:col-span-2">
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    Unable to load discover events right now. Please try again shortly.
                  </p>
                </CardContent>
              </Card>
            ) : items.length === 0 ? (
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
                          <Calendar className="h-3.5 w-3.5" /> {formatEventDate(item.startAt)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                          <MapPin className="h-3.5 w-3.5" /> {item.organizer.region}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                          {item.soldOut
                            ? "Sold out"
                            : item.remainingTickets === null
                              ? "Tickets available"
                              : `${item.remainingTickets} left`}
                        </span>
                      </div>
                      <p className="line-clamp-3 text-sm text-gray-500">
                        {item.description ?? "No description yet."}
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatPrice(item.minPrice, item.currency)}
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

          {result && result.total > result.pageSize ? (
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">
                Page {result.page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={previousPageHref}
                  aria-disabled={result.page <= 1}
                  className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition-colors ${
                    result.page <= 1
                      ? "pointer-events-none cursor-not-allowed border-gray-100 text-gray-300"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Previous
                </Link>
                <Link
                  href={nextPageHref}
                  aria-disabled={result.page >= totalPages}
                  className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition-colors ${
                    result.page >= totalPages
                      ? "pointer-events-none cursor-not-allowed border-gray-100 text-gray-300"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Next
                </Link>
              </div>
            </div>
          ) : null}

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
      </section>
    </div>
  );
}
