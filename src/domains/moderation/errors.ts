import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type ModerationDomainErrorCode =
  | "BAD_REQUEST"
  | "EVENT_NOT_FOUND"
  | "ABUSE_REPORT_NOT_FOUND"
  | "RISK_CASE_NOT_FOUND"
  | "BAN_NOT_FOUND"
  | "APPEAL_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION"
  | "BAN_ALREADY_LIFTED"
  | "APPEAL_ALREADY_REVIEWED"
  | "BAN_ACTIVE"
  | "DUPLICATE_REPORT"
  | "UNPROCESSABLE_MODERATION";

export class ModerationDomainError extends Error {
  status: number;
  code: ModerationDomainErrorCode;

  constructor(status: number, code: ModerationDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toModerationErrorResponse(error: unknown): Response {
  if (error instanceof ModerationDomainError) {
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
        error: error.issues[0]?.message ?? "Invalid moderation payload.",
        code: "BAD_REQUEST",
      },
      {
        status: 400,
      },
    );
  }

  return toErrorResponse(error);
}
