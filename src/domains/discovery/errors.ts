import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type DiscoveryDomainErrorCode =
  | "BAD_REQUEST"
  | "EVENT_NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "RATE_LIMITED"
  | "SPAM_DETECTED"
  | "SELF_REVIEW_FORBIDDEN"
  | "UNAUTHORIZED"
  | "UNPROCESSABLE_DISCOVERY";

export class DiscoveryDomainError extends Error {
  status: number;
  code: DiscoveryDomainErrorCode;

  constructor(status: number, code: DiscoveryDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toDiscoveryErrorResponse(error: unknown): Response {
  if (error instanceof DiscoveryDomainError) {
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
        error: error.issues[0]?.message ?? "Invalid discovery request payload.",
        code: "BAD_REQUEST",
      },
      {
        status: 400,
      },
    );
  }

  return toErrorResponse(error);
}
