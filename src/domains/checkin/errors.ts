import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type CheckInDomainErrorCode =
  | "BAD_REQUEST"
  | "EVENT_NOT_FOUND"
  | "GATE_NOT_FOUND"
  | "TICKET_NOT_FOUND"
  | "INVALID_STATE"
  | "UNPROCESSABLE_CHECKIN";

export class CheckInDomainError extends Error {
  status: number;
  code: CheckInDomainErrorCode;

  constructor(status: number, code: CheckInDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toCheckInErrorResponse(error: unknown): Response {
  if (error instanceof CheckInDomainError) {
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
        error: error.issues[0]?.message ?? "Invalid request payload.",
        code: "BAD_REQUEST",
      },
      {
        status: 400,
      },
    );
  }

  return toErrorResponse(error);
}
