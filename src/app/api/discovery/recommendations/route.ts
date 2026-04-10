import { toDiscoveryErrorResponse } from "@/domains/discovery/errors";
import { getDiscoveryRecommendations } from "@/domains/discovery/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await getDiscoveryRecommendations({
      limit: url.searchParams.get("limit") ?? undefined,
    });

    return Response.json({
      result,
    });
  } catch (error) {
    return toDiscoveryErrorResponse(error);
  }
}
