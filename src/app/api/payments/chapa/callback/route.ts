import { env } from "@/core/env";
import { runApiWithObservability } from "@/core/observability/http";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { processChapaCallback } from "@/domains/ticketing/service";

function extractCallbackPayloadFromUrl(url: URL) {
  return {
    trx_ref: url.searchParams.get("trx_ref") ?? undefined,
    tx_ref: url.searchParams.get("tx_ref") ?? undefined,
    ref_id: url.searchParams.get("ref_id") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    reference: url.searchParams.get("reference") ?? undefined,
  };
}

function extractCallbackPayloadFromBody(rawBody: string) {
  const trimmed = rawBody.trim();

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const params = new URLSearchParams(trimmed);

    return {
      trx_ref: params.get("trx_ref") ?? undefined,
      tx_ref: params.get("tx_ref") ?? undefined,
      ref_id: params.get("ref_id") ?? undefined,
      status: params.get("status") ?? undefined,
      reference: params.get("reference") ?? undefined,
    };
  }
}

async function handleCallback(request: Request) {
  const rateLimitResponse = await enforceApiRateLimit(request, {
    namespace: "payment_chapa_callback",
    maxRequests: env.SECURITY_RATE_LIMIT_MAX_REQUESTS,
    windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
    keyParts: ["PAYMENT", "CHAPA", "CALLBACK"],
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const url = new URL(request.url);
  const queryPayload = extractCallbackPayloadFromUrl(url);

  let bodyPayload: Record<string, unknown> = {};

  if (request.method === "POST") {
    const rawBody = await request.text();
    bodyPayload = extractCallbackPayloadFromBody(rawBody);
  }

  const callbackPayload = {
    ...bodyPayload,
    ...queryPayload,
  };

  const result = await processChapaCallback(callbackPayload);

  return Response.json({
    result,
  });
}

export async function GET(request: Request) {
  return runApiWithObservability(request, "payments.chapa.callback.get", async () => {
    try {
      return await handleCallback(request);
    } catch (error) {
      return toTicketingErrorResponse(error);
    }
  });
}

export async function POST(request: Request) {
  return runApiWithObservability(request, "payments.chapa.callback.post", async () => {
    try {
      return await handleCallback(request);
    } catch (error) {
      return toTicketingErrorResponse(error);
    }
  });
}
