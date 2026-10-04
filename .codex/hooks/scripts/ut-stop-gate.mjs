#!/usr/bin/env node
/**
 * Codex Stop hook：基于 turn-start baseline 找出本轮真实变化，对所有受影响 package 执行全量 UT。
 * 不依赖最终 git dirty 状态：本轮中途 commit 也不能洗掉回归义务。
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHooksConfig } from "./load-config.mjs";
import { listManagedPackages } from "./package-layout.mjs";
import {
  buildRelevantManifest,
  diffManifest,
  fingerprintManifestPaths,
  isRelevantLocalPath,
  readTurnBaseline,
} from "./turn-baseline.mjs";

const MAX_FOLLOWUP_LOOP = 2;
const STATE_REL = path.join(".codex", "hooks", "state", "ut-stop-gate.json");
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".codex", "vendor", "__pycache__", ".turbo", ".next", "build"]);
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|vue)$|_test\.py$|^test_.*\.py$/i;
const RUNNER_DEPS = ["vitest", "jest", "@jest/core", "mocha", "ava", "@playwright/test"];

function reply(obj) { process.stdout.write(`${JSON.stringify(obj)}\n`); }
function log(msg) { process.stderr.write(`[ut-stop-gate] ${msg}\n`); }
function readStdin() { try { return fs.readFileSync(0, "utf8"); } catch { return ""; } }
export function repoRootFromHere() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../..");
}
function readJson(filePath) { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; } }
function writeState(root, state) {
  const file = path.join(root, STATE_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function listCandidatePackages(root, config = loadHooksConfig(root)) {
  return listManagedPackages(root, config).map((p) => p.abs);
}

function packageManager(pkgDir, pkg) {
  const declared = String(pkg?.packageManager || "").split("@")[0];
  if (["yarn", "pnpm", "npm", "bun"].includes(declared)) return declared;
  if (fs.existsSync(path.join(pkgDir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(pkgDir, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(pkgDir, "bun.lockb")) || fs.existsSync(path.join(pkgDir, "bun.lock"))) return "bun";
  if (fs.existsSync(path.join(pkgDir, "package-lock.json"))) return "npm";
  return "yarn";
}

export function detectRunner(pkgDir, configuredCommand = "") {
  const pkg = readJson(path.join(pkgDir, "package.json"));
  if (!pkg) return null;
  if (typeof configuredCommand === "string" && configuredCommand.trim()) {
    const command = configuredCommand.trim();
    return { runners: ["configured"], command, manager: command.split(/\s+/)[0], executable: command.split(/\s+/)[0], hasTestScript: true };
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const runners = RUNNER_DEPS.filter((name) => Boolean(deps[name]));
  if (!runners.length) return null;
  const scripts = pkg.scripts || {};
  const manager = packageManager(pkgDir, pkg);
  let command;
  if (typeof scripts.test === "string" && scripts.test.trim()) command = `${manager} test`;
  else if (runners.includes("vitest")) command = manager === "npm" ? "npx vitest run" : manager === "bun" ? "bunx vitest run" : `${manager} vitest run`;
  else if (runners.includes("jest") || runners.includes("@jest/core")) command = manager === "npm" ? "npx jest --ci --watchAll=false" : manager === "bun" ? "bunx jest --ci --watchAll=false" : `${manager} jest --ci --watchAll=false`;
  else command = `${manager} test`;
  return { runners, command, manager, executable: manager === "npm" && !scripts.test ? "npx" : manager, hasTestScript: Boolean(scripts.test) };
}

export function walkHasTestFile(dir, depth = 0) {
  if (depth > 8) return false;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".github") continue;
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isFile() && TEST_FILE_RE.test(ent.name)) return true;
    if (ent.isDirectory() && walkHasTestFile(full, depth + 1)) return true;
  }
  return false;
}

export function listTestPackages(root, config = loadHooksConfig(root)) {
  return listCandidatePackages(root, config)
    .map((cwd) => {
      const rel = (path.relative(root, cwd) || ".").replace(/\\/g, "/");
      return { cwd, runner: detectRunner(cwd, config.testCommands?.[rel] || "") };
    })
    .filter((x) => x.runner && walkHasTestFile(x.cwd))
    .sort((a, b) => a.cwd.length - b.cwd.length);
}

export function gitPorcelain(root) {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) return null;
  return (r.stdout || "").split("\n").map((line) => line.trimEnd()).filter(Boolean);
}

export function porcelainPath(line) {
  const raw = String(line || "").slice(3).trim();
  if (!raw) return "";
  const target = raw.includes(" -> ") ? raw.split(" -> ").pop() : raw;
  return target.replace(/^"|"$/g, "").replace(/\\/g, "/");
}

function isUnder(rel, pkgRel) { return pkgRel === "." || rel === pkgRel || rel.startsWith(`${pkgRel}/`); }
function localPath(rel, pkgRel) { return pkgRel === "." ? rel : rel === pkgRel ? "" : rel.slice(pkgRel.length + 1); }

export function affectedPackagesFromPaths(root, testPackages, changedPaths, config = loadHooksConfig(root)) {
  const packageMeta = testPackages.map((p) => ({ ...p, rel: (path.relative(root, p.cwd) || ".").replace(/\\/g, "/") }));
  const byPackage = new Map(packageMeta.map((p) => [p.rel, []]));
  for (const changed of changedPaths || []) {
    const owners = packageMeta.filter((p) => isUnder(changed, p.rel)).sort((a, b) => b.rel.length - a.rel.length);
    if (!owners.length) continue;
    const owner = owners[0];
    const local = localPath(changed, owner.rel);
    if (isRelevantLocalPath(local, config)) byPackage.get(owner.rel).push(changed);
  }
  return packageMeta.map((p) => ({ ...p, dirty: [...new Set(byPackage.get(p.rel))] })).filter((p) => p.dirty.length > 0);
}

export function affectedPackages(root, testPackages, porcelainLines, config = loadHooksConfig(root)) {
  return affectedPackagesFromPaths(root, testPackages, (porcelainLines || []).map(porcelainPath).filter(Boolean), config);
}

export function fingerprintDirty(root, paths) {
  const manifest = {};
  for (const rel of paths || []) {
    const abs = path.join(root, rel);
    try {
      const stat = fs.statSync(abs);
      manifest[rel] = stat.isFile() ? `${stat.mode}:${stat.size}:${fs.readFileSync(abs).toString("base64")}` : `<non-file:${stat.mode}>`;
    } catch { manifest[rel] = "<missing>"; }
  }
  return fingerprintManifestPaths(manifest, paths);
}

function fingerprintPackageManifest(manifest, pkgRel) {
  const prefix = pkgRel === "." ? "" : `${pkgRel}/`;
  const paths = Object.keys(manifest || {}).filter((rel) => pkgRel === "." || rel === pkgRel || rel.startsWith(prefix));
  return fingerprintManifestPaths(manifest || {}, paths.length ? paths : [`<empty:${pkgRel}>`]);
}

function toolMissing(cmd) {
  const r = spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status !== 0;
}
function runUt(cwd, command) {
  const env = { ...process.env, SKIP_LIVE: process.env.UT_STOP_GATE_SKIP_LIVE === "0" ? "false" : "true", CI: "true" };
  log(`running in ${cwd}: ${command} (SKIP_LIVE=${env.SKIP_LIVE})`);
  const r = spawnSync("sh", ["-c", command], { cwd, encoding: "utf8", env, timeout: 540_000 });
  if (r.stdout) process.stderr.write(r.stdout.slice(-4000));
  if (r.stderr) process.stderr.write(r.stderr.slice(-4000));
  return { ok: r.status === 0, status: r.status, signal: r.signal, error: r.error ? String(r.error.message || r.error) : null };
}

export function main() {
  const root = repoRootFromHere();
  process.chdir(root);
  const raw = readStdin().trim();
  if (!raw) { log("skip: empty stdin"); reply({}); return; }
  let payload;
  try { payload = JSON.parse(raw); } catch { log("skip: invalid JSON stdin"); reply({}); return; }
  if (payload.hook_event_name && payload.hook_event_name !== "Stop") { log(`skip: hook_event_name=${payload.hook_event_name}`); reply({}); return; }
  if (toolMissing("git")) { log("skip: missing git on PATH"); reply({}); return; }

  const config = loadHooksConfig(root);
  const testPackages = listTestPackages(root, config);
  if (!testPackages.length) { log("skip: no package with test runner dependency + test files"); reply({}); return; }

  const sessionId = String(payload.session_id || "unknown-session");
  const turnId = String(payload.turn_id || "unknown-turn");
  const baseline = readTurnBaseline(root, sessionId, turnId);
  const currentManifest = buildRelevantManifest(root, config);
  let changedPaths = [];
  const usingBaseline = Boolean(baseline && currentManifest);
  if (usingBaseline) {
    changedPaths = diffManifest(baseline.manifest, currentManifest);
    log(`baseline diff: ${changedPaths.length} relevant path(s)`);
  } else {
    const porcelain = gitPorcelain(root);
    if (porcelain === null) { log("skip: baseline unavailable and git status failed"); reply({}); return; }
    changedPaths = porcelain.map(porcelainPath).filter(Boolean);
    log("fallback: turn baseline unavailable; using git status --porcelain");
  }

  const affected = affectedPackagesFromPaths(root, testPackages, changedPaths, config);
  const prev = readJson(path.join(root, STATE_REL));
  const next = {
    version: 4,
    packages: { ...(prev?.packages || {}) },
    stopAttempts: { ...(prev?.stopAttempts || {}) },
  };
  const affectedByRel = new Map(affected.map((p) => [p.rel, p]));
  // Stop continuation 可能触发新的 UserPromptSubmit/baseline；上一轮失败包仍必须重跑。
  for (const pkg of testPackages) {
    const rel = (path.relative(root, pkg.cwd) || ".").replace(/\\/g, "/");
    if (next.packages?.[rel]?.ok === false && !affectedByRel.has(rel)) affectedByRel.set(rel, { ...pkg, rel, dirty: [] });
  }
  if (!affectedByRel.size) { log("skip: no relevant turn changes and no pending failed package"); reply({}); return; }

  const toRun = [];
  for (const pkg of affectedByRel.values()) {
    const fp = usingBaseline
      ? (pkg.dirty.length ? fingerprintManifestPaths(currentManifest, pkg.dirty) : fingerprintPackageManifest(currentManifest, pkg.rel))
      : fingerprintDirty(root, pkg.dirty);
    const old = next.packages[pkg.rel];
    if (old?.ok && old?.fingerprint === fp) { log(`skip package ${pkg.rel}: same content fingerprint already green`); continue; }
    if (toolMissing(pkg.runner.executable || pkg.runner.manager)) { log(`skip package ${pkg.rel}: missing ${pkg.runner.executable || pkg.runner.manager} toolchain`); continue; }
    toRun.push({ ...pkg, fingerprint: fp });
  }
  if (!toRun.length) { reply({}); return; }

  if (process.env.UT_STOP_GATE_DRY_RUN === "1") {
    for (const pkg of toRun) log(`dry-run: would run ${pkg.runner.command} in ${pkg.rel}; changed=${pkg.dirty.length}; fp=${pkg.fingerprint.slice(0, 12)}`);
    reply({});
    return;
  }

  const failures = [];
  for (const pkg of toRun) {
    const result = runUt(pkg.cwd, pkg.runner.command);
    next.packages[pkg.rel] = {
      ok: result.ok, fingerprint: pkg.fingerprint, cwd: pkg.rel, command: pkg.runner.command,
      status: result.status, error: result.error, at: new Date().toISOString(),
    };
    if (!result.ok) failures.push({ pkg, result });
  }

  if (!failures.length) {
    delete next.stopAttempts[sessionId];
    writeState(root, next);
    log(`pass: ${toRun.length} package(s)`);
    reply({});
    return;
  }

  const failureFingerprint = crypto.createHash("sha256")
    .update(failures.map(({ pkg }) => `${pkg.rel}:${pkg.fingerprint}`).sort().join("\n"))
    .digest("hex");
  const oldAttempt = next.stopAttempts[sessionId];
  const count = oldAttempt?.fingerprint === failureFingerprint ? Number(oldAttempt.count || 0) + 1 : 1;
  next.stopAttempts[sessionId] = { fingerprint: failureFingerprint, count, turnId, at: new Date().toISOString() };
  writeState(root, next);

  const summary = failures.map(({ pkg, result }) => `${pkg.rel}: ${result.error || `exit=${result.status}${result.signal ? ` signal=${result.signal}` : ""}`}`).join("; ");
  log(`fail attempt=${count}: ${summary}`);
  const reason = [
    "Stop gate：全量 UT 未通过，不得宣称本回合收工。",
    `失败包：${summary}。`,
    "请就地修复失败用例后再次结束回合；同一路径再次变化会因内容指纹自动重跑。",
    "不要改 Expected 吞失败；不要拆 .codex/hooks 或伪造台账绕过闸门。",
  ].join(" ");

  if (count <= MAX_FOLLOWUP_LOOP) {
    reply({ decision: "block", reason });
    return;
  }

  reply({
    continue: false,
    stopReason: `Stop gate 连续 ${count} 次检测到同一失败指纹，已达到 continuation 上限；UT 仍失败。`,
    systemMessage: reason,
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { main(); } catch (error) { log(`error: ${error?.stack || error}`); reply({}); }
}
