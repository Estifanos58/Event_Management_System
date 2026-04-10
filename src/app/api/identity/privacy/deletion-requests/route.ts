import {
  listMyDataDeletionRequests,
  requestMyDataDeletion,
} from "@/domains/compliance/service";
import { toComplianceErrorResponse } from "@/domains/compliance/errors";

export async function GET() {
  try {
    const requests = await listMyDataDeletionRequests();

    return Response.json({
      requests,
    });
  } catch (error) {
    return toComplianceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const deletionRequest = await requestMyDataDeletion(body);

    return Response.json(
      {
        request: deletionRequest,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toComplianceErrorResponse(error);
  }
}
