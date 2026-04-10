const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const seedNow = new Date("2026-04-09T10:00:00.000Z");

export function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * HOUR_MS);
}

export function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * DAY_MS);
}

export function subHours(base: Date, hours: number) {
  return addHours(base, -hours);
}

export function subDays(base: Date, days: number) {
  return addDays(base, -days);
}

export function eventWindow(startOffsetDays: number, durationHours: number) {
  const startAt = addDays(seedNow, startOffsetDays);
  const endAt = addHours(startAt, durationHours);

  return {
    startAt,
    endAt,
  };
}

export function toIsoDate(date: Date) {
  return date.toISOString();
}
