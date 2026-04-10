import { Prisma, ScopeType } from "@prisma/client";
import { prisma } from "@/core/db/prisma";

const SENSITIVE_AUDIT_FIELD_PATTERN =
  /(password|secret|token|signature|authorization|cookie|email|phone|card|cvv|ssn)/i;
const REDACTED_VALUE = "[REDACTED]";
const MAX_AUDIT_DEPTH = 6;

type AuditPayload = {
  actorId?: string | null;
  actorType?: string;
  action: string;
  scopeType: ScopeType;
  scopeId: string;
  targetType: string;
  targetId: string;
  reason?: string;
  oldValue?: unknown;
  newValue?: unknown;
};

type AuthorizationDecision = "allow" | "deny";

type AuthorizationAuditPayload = {
  actorId: string;
  action: string;
  scopeType: ScopeType;
  scopeId: string;
  targetType: string;
  targetId: string;
  permission: string;
  decision: AuthorizationDecision;
  reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeAuditValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > MAX_AUDIT_DEPTH) {
    return "[TRUNCATED]";
  }

  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value.length > 4_000 ? `${value.slice(0, 4_000)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAuditValue(entry, depth + 1));
  }

  if (isRecord(value)) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, rawEntry] of Object.entries(value)) {
      if (rawEntry === undefined) {
        continue;
      }

      if (SENSITIVE_AUDIT_FIELD_PATTERN.test(key)) {
        sanitized[key] = REDACTED_VALUE;
        continue;
      }

      sanitized[key] = sanitizeAuditValue(rawEntry, depth + 1);
    }

    return sanitized;
  }

  return String(value);
}

function toJsonValue(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  const sanitized = sanitizeAuditValue(value);
  return sanitized === null
    ? Prisma.JsonNull
    : (sanitized as Prisma.InputJsonValue);
}

export async function writeAuditEvent(payload: AuditPayload) {
  return prisma.auditEvent.create({
    data: {
      actorId: payload.actorId ?? null,
      actorType: payload.actorType ?? (payload.actorId ? "USER" : "SYSTEM"),
      action: payload.action,
      scopeType: payload.scopeType,
      scopeId: payload.scopeId,
      targetType: payload.targetType,
      targetId: payload.targetId,
      reason: payload.reason,
      oldValue: toJsonValue(payload.oldValue),
      newValue: toJsonValue(payload.newValue),
    },
  });
}

export async function recordAuthorizationDecision(
  payload: AuthorizationAuditPayload,
) {
  return writeAuditEvent({
    actorId: payload.actorId,
    action: `authorization.${payload.decision}`,
    scopeType: payload.scopeType,
    scopeId: payload.scopeId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    reason: payload.reason,
    newValue: {
      permission: payload.permission,
      decision: payload.decision,
      action: payload.action,
    },
  });
}
