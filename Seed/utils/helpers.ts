export function pickCyclic<T>(items: T[], index: number): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty collection.");
  }

  return items[index % items.length];
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("Chunk size must be greater than zero.");
  }

  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toUpperSnake(input: string) {
  return input
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}
