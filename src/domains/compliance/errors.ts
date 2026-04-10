import { ZodError } from "zod";
import { toErrorResponse } from "@/domains/identity/guards";

export type ComplianceDomainErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "EVENT_NOT_FOUND"
  | "EXPORT_JOB_NOT_FOUND"
  | "EXPORT_JOB_EXPIRED"
  | "DELETION_ALREADY_REQUESTED"
  | "INTERNAL_SERVER_ERROR";

export class ComplianceDomainError extends Error {
  status: number;
  code: ComplianceDomainErrorCode;

  constructor(status: number, code: ComplianceDomainErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toComplianceErrorResponse(error: unknown): Response {
  if (error instanceof ComplianceDomainError) {
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
        error: error.issues[0]?.message ?? "Invalid compliance payload.",
        code: "BAD_REQUEST",
      },
      {
        status: 400,
      },
    );
  }

  return toErrorResponse(error);
}
