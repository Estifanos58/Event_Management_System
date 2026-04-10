import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type EventDomainErrorCode =
  | "BAD_REQUEST"
  | "EVENT_NOT_FOUND"
  | "GATE_NOT_FOUND"
  | "STAFF_NOT_FOUND"
  | "INVALID_CONTEXT"
  | "INVALID_TRANSITION"
  | "UNPROCESSABLE_EVENT";

export class EventDomainError extends Error {
  status: number;
  code: EventDomainErrorCode;

  constructor(status: number, code: EventDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toEventErrorResponse(error: unknown): Response {
  if (error instanceof EventDomainError) {
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
