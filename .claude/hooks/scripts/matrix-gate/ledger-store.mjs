/** test-first / 用户授权台账的磁盘读写。读失败 → 空台账（偏严）。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadHooksConfig,
  testFirstBypassRepoRel,
} from "../load-config.mjs";
import { createLedger, parsePatternList } from "./test-first.mjs";

export function repoRootFromHere() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../..");
}

function ledgerPath(repoRoot) {
  return path.join(repoRoot, ".claude/hooks/state/test-first-ledger.json");
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
export function loadTestFirstBypassPatterns(repoRoot, packageRel = null) {
  const config = loadHooksConfig(repoRoot);
  try {
    return parsePatternList(
      fs.readFileSync(path.join(repoRoot, testFirstBypassRepoRel(config, packageRel)), "utf8"),
      "bypass"
    );
  } catch { return []; }
}

/** repo 相对文件系统：ledger 证据统一使用 repo-relative path，天然支持 monorepo。 */
export function repoFs(repoRoot) {
  const root = path.resolve(repoRoot);
  return {
    fileExists: (rel) => fs.existsSync(path.join(root, rel)),
    readFile: (rel) => {
      try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; }
    },
  };
}

/** @deprecated 兼容旧测试/调用。 */
export const appPackageFs = repoFs;

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
