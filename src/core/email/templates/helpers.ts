type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

export function asArray<T>(value: unknown, mapItem: (entry: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const mapped: T[] = [];

  for (const item of value) {
    const transformed = mapItem(item);
    if (transformed !== undefined) {
      mapped.push(transformed);
    }
  }

  return mapped;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatCurrency(amount: number | undefined, currency: string | undefined) {
  if (amount === undefined) {
    return "-";
  }

  const safeCurrency = currency && currency.length >= 3 ? currency.toUpperCase() : "USD";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${safeCurrency}`;
  }
}

export function formatDateTime(value: string | Date | undefined, timezone?: string) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function titleCaseWords(value: string | undefined) {
  if (!value) {
    return "-";
  }

  return value
    .toLowerCase()
    .split(/[\s_\-]+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => `${entry.slice(0, 1).toUpperCase()}${entry.slice(1)}`)
    .join(" ");
}
