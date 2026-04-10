import assert from "node:assert/strict";
import test from "node:test";
import { sortOfflineCheckInScansForSync } from "./sync";

function scan(clientScanId: string, scannedAt: string, gateId = "gate-a") {
  return {
    gateId,
    scannedAt: new Date(scannedAt),
    clientScanId,
    mode: "OFFLINE" as const,
  };
}

test("sortOfflineCheckInScansForSync orders by scannedAt then clientScanId", () => {
  const input = [
    scan("c-2", "2026-01-12T10:00:00.000Z"),
    scan("a-1", "2026-01-12T09:59:59.000Z"),
    scan("b-1", "2026-01-12T10:00:00.000Z"),
  ];

  const sorted = sortOfflineCheckInScansForSync(input);

  assert.deepEqual(
    sorted.map((item) => item.clientScanId),
    ["a-1", "b-1", "c-2"],
  );
});

test("sortOfflineCheckInScansForSync is deterministic across input orderings", () => {
  const base = [
    scan("scan-03", "2026-03-01T10:01:00.000Z", "gate-1"),
    scan("scan-01", "2026-03-01T10:00:00.000Z", "gate-2"),
    scan("scan-02", "2026-03-01T10:00:00.000Z", "gate-1"),
    scan("scan-04", "2026-03-01T10:02:00.000Z", "gate-2"),
  ];

  const orderA = sortOfflineCheckInScansForSync(base);
  const orderB = sortOfflineCheckInScansForSync([
    base[2],
    base[0],
    base[3],
    base[1],
  ]);

  assert.deepEqual(
    orderA.map((item) => item.clientScanId),
    orderB.map((item) => item.clientScanId),
  );
});