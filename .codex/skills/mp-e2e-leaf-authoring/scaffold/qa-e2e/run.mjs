#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const cli = path.join(
  repoRoot,
  "packages",
  "miniprogram-e2e",
  "src",
  "cli",
  "mp-e2e.mjs"
);
const artifact = path.join(repoRoot, "dist");
const suite = path.join(repoRoot, "qa", "e2e", "suite.manifest.json");
const adapter = path.join(
  repoRoot,
  "qa",
  "e2e",
  "adapter",
  "babolat-adapter.mjs"
);

const command = process.argv[2] || "run";
const extras = process.argv.slice(3);
if (command === "verify-base" || command === "verify-migration") {
  const verifier = path.join(repoRoot, "qa", "e2e", "verify-base.mjs");
  const verify = spawn(process.execPath, [verifier], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  verify.on("close", (code) => {
    process.exitCode = code || 0;
  });
} else {
  const args =
    command === "doctor"
      ? ["doctor", "--adapter", adapter, ...extras]
      : [
          "run",
          "--artifact",
          artifact,
          "--suite",
          suite,
          "--adapter",
          adapter,
          ...extras,
        ];
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  child.on("close", (code) => {
    process.exitCode = code || 0;
  });
}
