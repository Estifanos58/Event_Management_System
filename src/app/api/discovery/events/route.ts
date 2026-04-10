import { toDiscoveryErrorResponse } from "@/domains/discovery/errors";
import { listDiscoverableEvents } from "@/domains/discovery/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const result = await listDiscoverableEvents({
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      location: url.searchParams.get("location") ?? undefined,
      organizer: url.searchParams.get("organizer") ?? undefined,
      eventType: url.searchParams.get("eventType") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      minPrice: url.searchParams.get("minPrice") ?? undefined,
      maxPrice: url.searchParams.get("maxPrice") ?? undefined,
      minRating: url.searchParams.get("minRating") ?? undefined,
      availability: url.searchParams.get("availability") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return Response.json({
      result,
    });
  } catch (error) {
    return toDiscoveryErrorResponse(error);
  }
}
