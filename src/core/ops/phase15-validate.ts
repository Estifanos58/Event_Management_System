import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPhase15ValidationReport,
  type Phase15ValidationInput,
} from "./phase15-validation";

function getFilePathArg() {
  const index = process.argv.findIndex((arg) => arg === "--file");

  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];
  return value?.trim() ? value : undefined;
}

function defaultProfilePath() {
  return fileURLToPath(new URL("./phase15-validation.baseline.json", import.meta.url));
}

function sectionStatus(passed: boolean) {
  return passed ? "PASS" : "FAIL";
}

async function main() {
  const inputPath = getFilePathArg();
  const resolvedPath = inputPath
    ? path.resolve(process.cwd(), inputPath)
    : defaultProfilePath();
  const raw = await readFile(resolvedPath, "utf8");
  const input = JSON.parse(raw) as Phase15ValidationInput;
  const report = buildPhase15ValidationReport(input);

  console.log(`Phase 15 validation profile: ${report.profileName}`);
  console.log(`Observed at: ${report.observedAt}`);
  console.log(`Profile source: ${resolvedPath}`);
  console.log("");

  for (const section of report.sections) {
    console.log(`[${sectionStatus(section.passed)}] ${section.section}`);

    for (const check of section.checks) {
      const checkState = sectionStatus(check.passed);
      console.log(
        `  - ${checkState} ${check.id}: ${check.requirement} | expected ${check.expected} | actual ${check.actual}`,
      );
    }

    console.log("");
  }

  if (report.passed) {
    console.log("Phase 15 validation passed.");
    return;
  }

  console.error("Phase 15 validation failed.");
  process.exitCode = 1;
}

void main().catch((error) => {
  console.error("Unable to complete Phase 15 validation run", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
