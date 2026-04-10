import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type ObservabilityTenantScope = {
  type: string;
  id: string;
};

export type ObservabilityContext = {
  correlationId: string;
  traceId: string;
  spanId?: string;
  actorId?: string;
  tenantScope?: ObservabilityTenantScope;
  route?: string;
  method?: string;
};

const contextStorage = new AsyncLocalStorage<ObservabilityContext>();

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function generateCorrelationId() {
  return randomUUID();
}

export function generateTraceId() {
  return randomUUID().replace(/-/g, "");
}

export function generateSpanId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function getObservabilityContext() {
  return contextStorage.getStore() ?? null;
}

export function annotateObservabilityContext(
  patch: Partial<ObservabilityContext>,
) {
  const context = getObservabilityContext();

  if (!context) {
    return;
  }

  if (patch.actorId !== undefined) {
    context.actorId = patch.actorId;
  }

  if (patch.tenantScope !== undefined) {
    context.tenantScope = patch.tenantScope;
  }

  if (patch.spanId !== undefined) {
    context.spanId = patch.spanId;
  }

  if (patch.route !== undefined) {
    context.route = patch.route;
  }

  if (patch.method !== undefined) {
    context.method = patch.method;
  }
}

export function withObservabilityContext<T>(
  patch: Partial<ObservabilityContext>,
  callback: () => Promise<T>,
) {
  const parent = getObservabilityContext();
  const correlationId =
    normalizeOptionalText(patch.correlationId) ??
    parent?.correlationId ??
    generateCorrelationId();
  const traceId =
    normalizeOptionalText(patch.traceId) ??
    parent?.traceId ??
    generateTraceId();

  const nextContext: ObservabilityContext = {
    correlationId,
    traceId,
    spanId: normalizeOptionalText(patch.spanId) ?? parent?.spanId,
    actorId: normalizeOptionalText(patch.actorId) ?? parent?.actorId,
    tenantScope: patch.tenantScope ?? parent?.tenantScope,
    route: patch.route ?? parent?.route,
    method: patch.method ?? parent?.method,
  };

  return contextStorage.run(nextContext, callback);
}

export function createRequestObservabilityContext(request: Request) {
  const correlationId =
    normalizeOptionalText(request.headers.get("x-correlation-id")) ??
    generateCorrelationId();
  const traceId =
    normalizeOptionalText(request.headers.get("x-trace-id")) ?? correlationId;

  let route = "";

  try {
    route = new URL(request.url).pathname;
  } catch {
    route = "unknown";
  }

  return {
    correlationId,
    traceId,
    route,
    method: request.method,
  } satisfies ObservabilityContext;
}

export function applyObservabilityHeaders(response: Response) {
  const context = getObservabilityContext();

  if (!context) {
    return response;
  }

  response.headers.set("x-correlation-id", context.correlationId);
  response.headers.set("x-trace-id", context.traceId);

  return response;
}

export function getTraceMetadataFromContext() {
  const context = getObservabilityContext();

  if (!context) {
    return undefined;
  }

  return {
    correlationId: context.correlationId,
    traceId: context.traceId,
    spanId: context.spanId,
    actorId: context.actorId,
    tenantScope: context.tenantScope,
  };
}

export function extractTraceContextFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) {
    return null;
  }

  const observability = metadata["observability"];

  if (!isRecord(observability)) {
    return null;
  }

  const correlationId = normalizeOptionalText(
    typeof observability.correlationId === "string"
      ? observability.correlationId
      : undefined,
  );
  const traceId = normalizeOptionalText(
    typeof observability.traceId === "string"
      ? observability.traceId
      : undefined,
  );
  const actorId = normalizeOptionalText(
    typeof observability.actorId === "string"
      ? observability.actorId
      : undefined,
  );

  let tenantScope: ObservabilityTenantScope | undefined;

  if (isRecord(observability.tenantScope)) {
    const type = normalizeOptionalText(
      typeof observability.tenantScope.type === "string"
        ? observability.tenantScope.type
        : undefined,
    );
    const id = normalizeOptionalText(
      typeof observability.tenantScope.id === "string"
        ? observability.tenantScope.id
        : undefined,
    );

    if (type && id) {
      tenantScope = {
        type,
        id,
      };
    }
  }

  if (!correlationId && !traceId && !actorId && !tenantScope) {
    return null;
  }

  return {
    correlationId,
    traceId,
    actorId,
    tenantScope,
  };
}
