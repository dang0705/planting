#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawnSync(process.execPath, [
  "--test",
  path.join(here, "load-config.test.mjs"),
  path.join(here, "matrix-gate/product-path.test.mjs"),
  path.join(here, "matrix-gate/test-first.test.mjs"),
  path.join(here, "ut-stop-gate.test.mjs"),
], { stdio: "inherit" });
process.exit(child.status ?? 1);
