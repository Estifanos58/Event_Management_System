import { toDiscoveryErrorResponse } from "@/domains/discovery/errors";
import { getDiscoverySuggestions } from "@/domains/discovery/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await getDiscoverySuggestions({
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    return Response.json({
      result,
    });
  } catch (error) {
    return toDiscoveryErrorResponse(error);
  }
}
