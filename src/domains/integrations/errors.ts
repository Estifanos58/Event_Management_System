import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type IntegrationDomainErrorCode =
  | "BAD_REQUEST"
  | "EVENT_NOT_FOUND"
  | "WEBHOOK_ENDPOINT_NOT_FOUND"
  | "OUTBOX_EVENT_NOT_FOUND"
  | "INBOUND_EVENT_NOT_FOUND"
  | "INVALID_SIGNATURE"
  | "INVALID_WEBHOOK_TIMESTAMP"
  | "WEBHOOK_REPLAY_DETECTED"
  | "PROVIDER_EVENT_ID_MISSING"
  | "INTEGRATION_PROVIDER_NOT_SUPPORTED"
  | "UNPROCESSABLE_INTEGRATION";

export class IntegrationDomainError extends Error {
  status: number;
  code: IntegrationDomainErrorCode;

  constructor(status: number, code: IntegrationDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toIntegrationErrorResponse(error: unknown): Response {
  if (error instanceof IntegrationDomainError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
      },
      {
        status: error.status,
      },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: error.issues[0]?.message ?? "Invalid integration payload.",
        code: "BAD_REQUEST",
      },
      {
        status: 400,
      },
    );
  }

  return toErrorResponse(error);
}
