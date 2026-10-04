/** test-first / 用户授权台账的磁盘读写。读失败 → 空台账（偏严）。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appPackageAbs,
  loadHooksConfig,
  testFirstBypassRepoRel,
} from "../load-config.mjs";
import { createLedger, parsePatternList } from "./test-first.mjs";

export function repoRootFromHere() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../..");
}

function ledgerPath(repoRoot) {
  return path.join(repoRoot, ".cursor/hooks/state/test-first-ledger.json");
}

export function loadLedger(repoRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath(repoRoot), "utf8"));
    return parsed && typeof parsed.conversations === "object" ? parsed : createLedger();
  } catch { return createLedger(); }
}

export function saveLedger(repoRoot, ledger) {
  const file = ledgerPath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  fs.renameSync(tmp, file);
}

/** Test First 专用旁路清单；与 runner 的 test.exclude 完全分离。 */
export function loadTestFirstBypassPatterns(repoRoot) {
  const config = loadHooksConfig(repoRoot);
  try {
    return parsePatternList(
      fs.readFileSync(path.join(repoRoot, testFirstBypassRepoRel(config)), "utf8"),
      "bypass"
    );
  } catch { return []; }
}

export function appPackageFs(repoRoot) {
  const root = appPackageAbs(repoRoot, loadHooksConfig(repoRoot));
  return {
    fileExists: (rel) => fs.existsSync(path.join(root, rel)),
    readFile: (rel) => {
      try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; }
    },
  };
}

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
