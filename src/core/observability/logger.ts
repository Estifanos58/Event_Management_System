import { env } from "@/core/env";
import { getObservabilityContext } from "@/core/observability/context";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_LOG_FIELD_PATTERN =
  /(password|secret|token|signature|authorization|cookie|email|phone|card|cvv|ssn)/i;

const REDACTED_VALUE = "[REDACTED]";
const MAX_DEPTH = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return "[TRUNCATED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry, depth + 1));
  }

  if (isRecord(value)) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, rawValue] of Object.entries(value)) {
      if (SENSITIVE_LOG_FIELD_PATTERN.test(key)) {
        sanitized[key] = REDACTED_VALUE;
        continue;
      }

      sanitized[key] = sanitizeLogValue(rawValue, depth + 1);
    }

    return sanitized;
  }

  return String(value);
}

function currentLogLevel() {
  const fromEnv = env.OPS_LOG_LEVEL;

  if (fromEnv === "debug" || fromEnv === "info" || fromEnv === "warn" || fromEnv === "error") {
    return fromEnv;
  }

  return env.NODE_ENV === "development" ? "debug" : "info";
}

function shouldWrite(level: LogLevel) {
  return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[currentLogLevel()];
}

export function logStructured(
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
) {
  if (!shouldWrite(level)) {
    return;
  }

  const context = getObservabilityContext();

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId: context?.correlationId,
    traceId: context?.traceId,
    spanId: context?.spanId,
    actorId: context?.actorId,
    tenantScope: context?.tenantScope,
    route: context?.route,
    method: context?.method,
    fields: sanitizeLogValue(fields ?? {}),
  };

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  if (level === "debug") {
    console.debug(serialized);
    return;
  }

  console.log(serialized);
}

export function logDebug(message: string, fields?: Record<string, unknown>) {
  logStructured("debug", message, fields);
}

export function logInfo(message: string, fields?: Record<string, unknown>) {
  logStructured("info", message, fields);
}

export function logWarn(message: string, fields?: Record<string, unknown>) {
  logStructured("warn", message, fields);
}

export function logError(message: string, fields?: Record<string, unknown>) {
  logStructured("error", message, fields);
}
