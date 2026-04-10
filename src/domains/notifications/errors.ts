import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type NotificationDomainErrorCode =
  | "BAD_REQUEST"
  | "EVENT_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "DELIVERY_NOT_FOUND"
  | "INVALID_AUDIENCE"
  | "NO_RECIPIENTS"
  | "UNPROCESSABLE_NOTIFICATION";

export class NotificationDomainError extends Error {
  status: number;
  code: NotificationDomainErrorCode;

  constructor(status: number, code: NotificationDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toNotificationErrorResponse(error: unknown): Response {
  if (error instanceof NotificationDomainError) {
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
        error: error.issues[0]?.message ?? "Invalid notification payload.",
        code: "BAD_REQUEST",
      },
      {
        status: 400,
      },
    );
  }

  return toErrorResponse(error);
}
