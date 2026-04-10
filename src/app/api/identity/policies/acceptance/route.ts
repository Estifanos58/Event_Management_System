import {
  acceptPolicyDocument,
  listMyPolicyAcceptances,
} from "@/domains/compliance/service";
import { toComplianceErrorResponse } from "@/domains/compliance/errors";
import type { AcceptPolicyInput } from "@/domains/compliance/types";

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.headers.get("x-real-ip") ?? undefined;
}

export async function GET() {
  try {
    const acceptances = await listMyPolicyAcceptances();

    return Response.json({
      acceptances,
    });
  } catch (error) {
    return toComplianceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = {
      ...body,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    } as AcceptPolicyInput;

    const acceptance = await acceptPolicyDocument(payload);

    return Response.json(
      {
        acceptance,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toComplianceErrorResponse(error);
  }
}
