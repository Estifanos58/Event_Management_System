import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type TicketingDomainErrorCode =
  | "BAD_REQUEST"
  | "EVENT_NOT_FOUND"
  | "TICKET_CLASS_NOT_FOUND"
  | "RESERVATION_NOT_FOUND"
  | "WAITLIST_ENTRY_NOT_FOUND"
  | "TICKET_NOT_FOUND"
  | "TRANSFER_NOT_FOUND"
  | "INVENTORY_UNAVAILABLE"
  | "DUPLICATE_PURCHASE"
  | "INVALID_STATE"
  | "UNPROCESSABLE_TICKETING"
  | "UNAUTHORIZED_WEBHOOK";

export class TicketingDomainError extends Error {
  status: number;
  code: TicketingDomainErrorCode;

  constructor(status: number, code: TicketingDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toTicketingErrorResponse(error: unknown): Response {
  if (error instanceof TicketingDomainError) {
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
