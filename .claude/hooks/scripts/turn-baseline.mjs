/**
 * 回合起点文件清单（turn baseline）。
 * 不依赖最终 git dirty 状态：即使本轮中途 commit，最终内容与回合起点不同仍会被 Stop 发现。
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { classifyAppRel } from "./matrix-gate/product-path.mjs";
import { listManagedPackages, localPathInPackage, owningManagedPackage, toPosixPath } from "./package-layout.mjs";

export const TURN_BASELINE_REL = path.join(".claude", "hooks", "state", "turn-baselines.json");

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

export function isRelevantLocalPath(localRel, config) {
  const rel = toPosixPath(localRel);
  if (!rel) return false;
  if (rel === "package.json") return true;
  if ([config.skipListFile, config.testFirstBypassFile, ...(config.gateControlFiles || [])].includes(rel)) return true;
  const kind = classifyAppRel(rel, config);
  if (kind === "product" || kind === "test") return true;
  // 非标准 tests/ 目录下的 fixture/helper 也应驱动包级 UT。
  if (/(^|\/)(?:test|tests|__tests__)(\/|$)/i.test(rel)) return true;
  return false;
}

export function listGitVisibleFiles(repoRoot) {
  const r = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot, encoding: "utf8",
  });
  if (r.status !== 0) return null;
  return (r.stdout || "").split("\0").filter(Boolean).map(toPosixPath);
}

function hashPath(abs) {
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return `symlink:${fs.readlinkSync(abs)}`;
    if (!st.isFile()) return `other:${st.mode}`;
    const hash = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
    return `file:${st.mode}:${st.size}:${hash}`;
  } catch {
    return "<missing>";
  }
}

export function buildRelevantManifest(repoRoot, config) {
  const packages = listManagedPackages(repoRoot, config);
  const files = listGitVisibleFiles(repoRoot);
  if (files === null) return null;
  const manifest = {};
  for (const repoRel of files) {
    const owner = owningManagedPackage(repoRel, packages);
    if (!owner) continue;
    const local = localPathInPackage(repoRel, owner.rel);
    if (!isRelevantLocalPath(local, config)) continue;
    manifest[repoRel] = hashPath(path.join(repoRoot, repoRel));
  }
  return manifest;
}

export function diffManifest(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => before?.[key] !== after?.[key]).sort();
}

export function fingerprintManifestPaths(manifest, paths) {
  const h = crypto.createHash("sha256");
  for (const rel of [...new Set(paths || [])].sort()) {
    h.update(`path:${rel}\0${manifest?.[rel] ?? "<absent>"}\0`);
  }
  return h.digest("hex");
}

export function captureTurnBaseline(repoRoot, conversationId, generationId, config) {
  if (!conversationId || !generationId) return false;
  const manifest = buildRelevantManifest(repoRoot, config);
  if (manifest === null) return false;
  const file = path.join(repoRoot, TURN_BASELINE_REL);
  const state = readJson(file) || { version: 1, conversations: {} };
  state.version = 1;
  state.conversations ??= {};
  state.conversations[conversationId] = {
    generationId,
    manifest,
    capturedAt: new Date().toISOString(),
  };
  // 只保留最近少量会话，避免长期膨胀。
  const entries = Object.entries(state.conversations);
  if (entries.length > 20) {
    entries.sort((a, b) => String(b[1]?.capturedAt || "").localeCompare(String(a[1]?.capturedAt || "")));
    state.conversations = Object.fromEntries(entries.slice(0, 20));
  }
  writeJsonAtomic(file, state);
  return true;
}

export function readTurnBaseline(repoRoot, conversationId, generationId) {
  if (!conversationId || !generationId) return null;
  const state = readJson(path.join(repoRoot, TURN_BASELINE_REL));
  const entry = state?.conversations?.[conversationId];
  return entry?.generationId === generationId && entry?.manifest && typeof entry.manifest === "object" ? entry : null;
}
