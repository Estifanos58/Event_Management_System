import { toModerationErrorResponse } from "@/domains/moderation/errors";
import { reviewModerationAppeal } from "@/domains/moderation/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appealId: string }> },
) {
  try {
    const { appealId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await reviewModerationAppeal(appealId, body);

    return Response.json({ result });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
