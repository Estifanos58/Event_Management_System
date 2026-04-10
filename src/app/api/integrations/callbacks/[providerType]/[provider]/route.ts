import {
  IntegrationDomainError,
  toIntegrationErrorResponse,
} from "@/domains/integrations/errors";
import { env } from "@/core/env";
import { runApiWithObservability } from "@/core/observability/http";
import { assertWebhookReplayProtection } from "@/core/security/webhook-replay";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import {
  ingestInboundProviderCallback,
  markInboundProviderEventProcessed,
} from "@/domains/integrations/service";

const PROVIDER_TYPE_VALUES = [
  "PAYMENT",
  "MESSAGING",
  "MAPS",
  "STREAMING",
] as const;

type InboundProviderType = (typeof PROVIDER_TYPE_VALUES)[number];

function normalizeProviderType(rawValue: string) {
  const normalized = rawValue.trim().toUpperCase();

  if (!(PROVIDER_TYPE_VALUES as readonly string[]).includes(normalized)) {
    throw new IntegrationDomainError(
      422,
      "INTEGRATION_PROVIDER_NOT_SUPPORTED",
      `Unsupported provider type: ${rawValue}`,
    );
  }

  return normalized as InboundProviderType;
}

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ providerType: string; provider: string }> },
) {
  return runApiWithObservability(
    request,
    "integrations.provider_callback.received",
    async () => {
      try {
        const { providerType, provider } = await params;

        const rateLimitResponse = await enforceApiRateLimit(request, {
          namespace: "webhook_provider_callback",
          maxRequests: env.SECURITY_RATE_LIMIT_MAX_REQUESTS,
          windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
          keyParts: [providerType, provider],
        });

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        const signature =
          request.headers.get("x-provider-signature") ??
          request.headers.get("x-webhook-signature") ??
          request.headers.get("x-signature");
        const rawBody = await request.text();

        await assertWebhookReplayProtection({
          providerType,
          provider,
          headers: request.headers,
          rawBody: rawBody || "{}",
          signature: signature ?? undefined,
        });

        const payload = rawBody
          ? ((JSON.parse(rawBody) as unknown) ?? {})
          : ({} as unknown);

        const ingestResult = await ingestInboundProviderCallback({
          providerType: normalizeProviderType(providerType),
          provider,
          signature: signature ?? undefined,
          rawBody: rawBody || "{}",
          payload,
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

        await markInboundProviderEventProcessed(ingestResult.inboundEventId, {
          providerType: ingestResult.providerType,
          provider: ingestResult.provider,
        });

        return Response.json(
          {
            result: {
              idempotent: false,
              inboundEventId: ingestResult.inboundEventId,
              providerEventId: ingestResult.providerEventId,
            },
          },
          {
            status: 202,
          },
        );
      } catch (error) {
        return toIntegrationErrorResponse(error);
      }
    },
  );
}
