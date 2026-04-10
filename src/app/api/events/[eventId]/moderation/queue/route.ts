import { toModerationErrorResponse } from "@/domains/moderation/errors";
import { getModerationQueue } from "@/domains/moderation/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const queue = await getModerationQueue(eventId);

    return Response.json({
      queue,
    });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
