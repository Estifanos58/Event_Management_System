import type { OfflineCheckInSyncInput } from "./types";

export function sortOfflineCheckInScansForSync(
  scans: OfflineCheckInSyncInput["scans"],
) {
  return [...scans].sort((left, right) => {
    const timeDelta = left.scannedAt.getTime() - right.scannedAt.getTime();

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return left.clientScanId.localeCompare(right.clientScanId);
  });
}