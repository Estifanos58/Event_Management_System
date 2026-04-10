import { env } from "@/core/env";
import { runApiWithObservability } from "@/core/observability/http";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import {
  ingestInboundProviderCallback,
  markInboundProviderEventFailed,
  markInboundProviderEventProcessed,
} from "@/domains/integrations/service";
import { assertWebhookReplayProtection } from "@/core/security/webhook-replay";
import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { processChapaWebhook } from "@/domains/ticketing/service";

export async function POST(request: Request) {
  return runApiWithObservability(request, "payments.chapa.webhook", async () => {
    try {
      const rateLimitResponse = await enforceApiRateLimit(request, {
        namespace: "webhook_chapa",
        maxRequests: env.SECURITY_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
        keyParts: ["PAYMENT", "CHAPA"],
      });

      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const signature =
        request.headers.get("x-chapa-signature") ??
        request.headers.get("x-webhook-signature");
      const rawBody = await request.text();

      await assertWebhookReplayProtection({
        providerType: "PAYMENT",
        provider: "CHAPA",
        headers: request.headers,
        rawBody: rawBody || "{}",
        signature: signature ?? undefined,
      });

      const body = rawBody ? ((JSON.parse(rawBody) as unknown) ?? {}) : {};

      const ingestResult = await ingestInboundProviderCallback({
        providerType: "PAYMENT",
        provider: "CHAPA",
        signature: signature ?? undefined,
        rawBody: rawBody || "{}",
        payload: body,
      });

      if (!ingestResult.shouldProcess) {
        return Response.json({
          result: {
            idempotent: true,
            inboundEventId: ingestResult.inboundEventId,
            providerEventId: ingestResult.providerEventId,
          },
        });
      }

      let result;

      try {
        result = await processChapaWebhook(signature, body, {
          skipSignatureVerification: true,
        });
      } catch (error) {
        await markInboundProviderEventFailed(
          ingestResult.inboundEventId,
          error instanceof Error ? error.message : "Unknown callback processing error.",
        );

        throw error;
      }

      await markInboundProviderEventProcessed(ingestResult.inboundEventId, {
        paymentAttemptId: result.paymentAttemptId,
        orderId: result.orderId,
        status: result.status,
      });

      return Response.json({
        result,
      });
    } catch (error) {
      const integrationResponse = toIntegrationErrorResponse(error);

      if (integrationResponse.status !== 500) {
        return integrationResponse;
      }

      return toTicketingErrorResponse(error);
    }
  });
}
