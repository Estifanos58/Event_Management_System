import { redis } from "@/core/redis/client";

type MetricTagValue = string | number | boolean | undefined;
export type MetricTags = Record<string, MetricTagValue>;

type CounterRecord = {
  name: string;
  tags: Record<string, string>;
  value: number;
};

type GaugeRecord = {
  name: string;
  tags: Record<string, string>;
  value: number;
};

const COUNTER_HASH_KEY = "obs:metrics:counters";
const GAUGE_HASH_KEY = "obs:metrics:gauges";

const durationStore = new Map<string, number[]>();
const counterStore = new Map<string, number>();
const gaugeStore = new Map<string, number>();

const MAX_DURATION_SAMPLES = 500;

let redisConnectPromise: Promise<void> | null = null;

function normalizeTags(tags?: MetricTags) {
  const normalized: Record<string, string> = {};

  if (!tags) {
    return normalized;
  }

  const keys = Object.keys(tags).sort((left, right) => left.localeCompare(right));

  for (const key of keys) {
    const value = tags[key];

    if (value === undefined) {
      continue;
    }

    normalized[key] = String(value);
  }

  return normalized;
}

function buildMetricField(name: string, tags?: MetricTags) {
  const normalizedTags = normalizeTags(tags);
  const encodedTags = Object.entries(normalizedTags)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return encodedTags ? `${name}|${encodedTags}` : name;
}

function parseMetricField(field: string) {
  const [name, encodedTags] = field.split("|", 2);
  const tags: Record<string, string> = {};

  if (encodedTags) {
    for (const pair of encodedTags.split("&")) {
      const [key, value] = pair.split("=", 2);

      if (!key || value === undefined) {
        continue;
      }

      tags[key] = value;
    }
  }

  return {
    name,
    tags,
  };
}

async function ensureRedisConnected() {
  if (redis.status === "ready" || redis.status === "connecting") {
    return;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redis.connect().catch(() => {
      // Ignore and allow memory-only fallback.
    });
  }

  await redisConnectPromise;
}

function writeMemoryCounter(field: string, value: number) {
  counterStore.set(field, (counterStore.get(field) ?? 0) + value);
}

function writeMemoryGauge(field: string, value: number) {
  gaugeStore.set(field, value);
}

function writeMemoryDuration(field: string, value: number) {
  const existing = durationStore.get(field) ?? [];
  existing.push(value);

  if (existing.length > MAX_DURATION_SAMPLES) {
    existing.shift();
  }

  durationStore.set(field, existing);
}

export async function incrementCounter(
  name: string,
  value = 1,
  tags?: MetricTags,
) {
  const field = buildMetricField(name, tags);
  writeMemoryCounter(field, value);

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      await redis.hincrbyfloat(COUNTER_HASH_KEY, field, value);
    }
  } catch {
    // Memory fallback is already updated.
  }
}

export async function setGauge(name: string, value: number, tags?: MetricTags) {
  const field = buildMetricField(name, tags);
  writeMemoryGauge(field, value);

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      await redis.hset(GAUGE_HASH_KEY, field, value);
    }
  } catch {
    // Memory fallback is already updated.
  }
}

export async function recordDurationSample(
  name: string,
  durationMs: number,
  tags?: MetricTags,
) {
  const field = buildMetricField(name, tags);
  writeMemoryDuration(field, durationMs);

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      const key = `obs:metrics:durations:${field}`;
      await redis.lpush(key, String(durationMs));
      await redis.ltrim(key, 0, MAX_DURATION_SAMPLES - 1);
      await redis.expire(key, 24 * 60 * 60);
    }
  } catch {
    // Memory fallback is already updated.
  }
}

export async function getCounterValue(name: string, tags?: MetricTags) {
  const field = buildMetricField(name, tags);

  if (counterStore.has(field)) {
    return counterStore.get(field) ?? 0;
  }

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      const value = await redis.hget(COUNTER_HASH_KEY, field);
      const parsed = Number(value ?? 0);
      counterStore.set(field, parsed);
      return parsed;
    }
  } catch {
    return 0;
  }

  return 0;
}

export async function getGaugeValue(name: string, tags?: MetricTags) {
  const field = buildMetricField(name, tags);

  if (gaugeStore.has(field)) {
    return gaugeStore.get(field) ?? 0;
  }

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      const value = await redis.hget(GAUGE_HASH_KEY, field);
      const parsed = Number(value ?? 0);
      gaugeStore.set(field, parsed);
      return parsed;
    }
  } catch {
    return 0;
  }

  return 0;
}

export async function getDurationSamples(name: string, tags?: MetricTags) {
  const field = buildMetricField(name, tags);

  if (durationStore.has(field)) {
    return [...(durationStore.get(field) ?? [])];
  }

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      const key = `obs:metrics:durations:${field}`;
      const values = await redis.lrange(key, 0, MAX_DURATION_SAMPLES - 1);
      const parsed = values
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry));

      durationStore.set(field, parsed);
      return [...parsed];
    }
  } catch {
    return [];
  }

  return [];
}

export function calculatePercentile(values: number[], percentile: number) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
  const safeRank = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[safeRank];
}

async function readMetricHash(
  hashKey: string,
  memoryStore: Map<string, number>,
): Promise<Array<CounterRecord | GaugeRecord>> {
  const records = new Map<string, number>();

  for (const [field, value] of memoryStore.entries()) {
    records.set(field, value);
  }

  try {
    await ensureRedisConnected();

    if (redis.status === "ready") {
      const remote = await redis.hgetall(hashKey);

      for (const [field, value] of Object.entries(remote)) {
        const parsed = Number(value);

        if (!Number.isFinite(parsed)) {
          continue;
        }

        records.set(field, parsed);
      }
    }
  } catch {
    // Use memory data only.
  }

  return Array.from(records.entries()).map(([field, value]) => {
    const parsed = parseMetricField(field);

    return {
      name: parsed.name,
      tags: parsed.tags,
      value,
    };
  });
}

export async function getMetricsSnapshot() {
  const [counters, gauges] = await Promise.all([
    readMetricHash(COUNTER_HASH_KEY, counterStore),
    readMetricHash(GAUGE_HASH_KEY, gaugeStore),
  ]);

  const durations: Array<{
    name: string;
    tags: Record<string, string>;
    sampleCount: number;
    p50Ms: number;
    p95Ms: number;
  }> = [];

  for (const [field, values] of durationStore.entries()) {
    const parsed = parseMetricField(field);

    durations.push({
      name: parsed.name,
      tags: parsed.tags,
      sampleCount: values.length,
      p50Ms: calculatePercentile(values, 50),
      p95Ms: calculatePercentile(values, 95),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    counters: counters.sort((left, right) => left.name.localeCompare(right.name)),
    gauges: gauges.sort((left, right) => left.name.localeCompare(right.name)),
    durations: durations.sort((left, right) => left.name.localeCompare(right.name)),
  };
}
