#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const suite = JSON.parse(
  await readFile(path.join(repoRoot, "qa/e2e/suite.manifest.json"), "utf8")
);
const contract = JSON.parse(
  await readFile(
    path.join(repoRoot, "qa/e2e/contract/mp-e2e.contract.json"),
    "utf8"
  )
);
const runSource = await readFile(path.join(repoRoot, "qa/e2e/run.mjs"), "utf8");
const failures = [];

if (suite.id !== "babolat-formal-asset-suite") {
  failures.push({
    kind: "suite_id",
    expected: "babolat-formal-asset-suite",
    actual: suite.id,
  });
}
if (contract.adapter?.id !== "babolat") {
  failures.push({
    kind: "adapter_id",
    expected: "babolat",
    actual: contract.adapter?.id || null,
  });
}
if (!runSource.includes("path.join(repoRoot, 'dist')")) {
  failures.push({ kind: "artifact_path", expected: "src-taro/dist" });
}
if (!runSource.includes("babolat-adapter.mjs")) {
  failures.push({
    kind: "adapter_entry",
    expected: "adapter/babolat-adapter.mjs",
  });
}

const expected = ["platform.live_runtime_proof"];
const ids = suite.leaves.map((leaf) => leaf.id);
if (ids.join(",") !== expected.join(",")) {
  failures.push({ kind: "base_leaves", expected, actual: ids });
}

const requiredFiles = [
  "packages/miniprogram-e2e/src/cli/mp-e2e.mjs",
  "qa/e2e/adapter/babolat-adapter.mjs",
  "qa/e2e/adapter/babolat-live-verifier.mjs",
  "scripts/qa/resolve-e2e-runtime.mjs",
];
for (const relative of requiredFiles) {
  try {
    await access(path.join(repoRoot, relative));
  } catch {
    failures.push({ kind: "missing_file", path: relative });
  }
}

const summary = {
  status: failures.length ? "failed" : "passed",
  suiteId: suite.id,
  adapterId: contract.adapter?.id || null,
  leafCount: suite.leaves.length,
  failures,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
