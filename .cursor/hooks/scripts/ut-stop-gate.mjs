#!/usr/bin/env node
/**
 * stop hook：completed 后，对“所有受本轮脏文件影响且具备 UT runner 的包”执行全量 UT。
 * 指纹由 dirty path + 当前内容 hash 构成；同一路径再次修改会产生新指纹并重跑。
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHooksConfig } from "./load-config.mjs";

const MAX_FOLLOWUP_LOOP = 2;
const STATE_REL = path.join(".cursor", "hooks", "state", "ut-stop-gate.json");
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".cursor", "vendor", "__pycache__", ".turbo", ".next", "build"]);
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|vue)$|_test\.py$|^test_.*\.py$/i;
const RUNNER_DEPS = ["vitest", "jest", "@jest/core", "mocha", "ava", "@playwright/test"];
const LOCAL_RELEVANT_RE = /(^|\/)(src|test|tests|__tests__)(\/|$)|(^|\/)(vitest|jest|playwright)\.config\.|(^|\/)package\.json$/i;

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

/** candidatePackages 可指具体包，也可指 packages/apps 这类一层工作区容器。 */
export function listCandidatePackages(root, config = loadHooksConfig(root)) {
  const out = [];
  const addIfPackage = (dir) => {
    if (fs.existsSync(path.join(dir, "package.json"))) out.push(path.resolve(dir));
  };
  addIfPackage(root);
  for (const rel of config.candidatePackages) {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) continue;
    addIfPackage(target);
    let entries = [];
    try { entries = fs.readdirSync(target, { withFileTypes: true }); } catch {}
    for (const ent of entries) {
      if (!ent.isDirectory() || SKIP_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
      addIfPackage(path.join(target, ent.name));
    }
  }
  return [...new Set(out)];
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
    return {
      runners: ["configured"],
      command,
      manager: command.split(/\s+/)[0],
      executable: command.split(/\s+/)[0],
      hasTestScript: true,
    };
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const runners = RUNNER_DEPS.filter((name) => Boolean(deps[name]));
  if (!runners.length) return null;
  const scripts = pkg.scripts || {};
  const manager = packageManager(pkgDir, pkg);
  let command;
  if (typeof scripts.test === "string" && scripts.test.trim()) {
    command = `${manager} test`;
  } else if (runners.includes("vitest")) {
    command = manager === "npm" ? "npx vitest run" : manager === "bun" ? "bunx vitest run" : `${manager} vitest run`;
  } else if (runners.includes("jest") || runners.includes("@jest/core")) {
    command = manager === "npm" ? "npx jest --ci --watchAll=false" : manager === "bun" ? "bunx jest --ci --watchAll=false" : `${manager} jest --ci --watchAll=false`;
  } else {
    command = `${manager} test`;
  }
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

function isUnder(rel, pkgRel) {
  return pkgRel === "." || rel === pkgRel || rel.startsWith(`${pkgRel}/`);
}
function localPath(rel, pkgRel) {
  return pkgRel === "." ? rel : rel === pkgRel ? "" : rel.slice(pkgRel.length + 1);
}

/** 给每个 dirty path 只分配到最深的 testable package，避免根包与子包重复跑。 */
export function affectedPackages(root, testPackages, porcelainLines) {
  const allDirty = (porcelainLines || []).map(porcelainPath).filter(Boolean);
  const packageMeta = testPackages.map((p) => ({
    ...p,
    rel: (path.relative(root, p.cwd) || ".").replace(/\\/g, "/"),
  }));
  const byPackage = new Map(packageMeta.map((p) => [p.rel, []]));

  for (const dirty of allDirty) {
    const owners = packageMeta.filter((p) => isUnder(dirty, p.rel)).sort((a, b) => b.rel.length - a.rel.length);
    if (!owners.length) continue;
    const owner = owners[0];
    const local = localPath(dirty, owner.rel);
    if (LOCAL_RELEVANT_RE.test(local)) byPackage.get(owner.rel).push(dirty);
  }
  return packageMeta
    .map((p) => ({ ...p, dirty: [...new Set(byPackage.get(p.rel))] }))
    .filter((p) => p.dirty.length > 0);
}

export function fingerprintDirty(root, paths) {
  const hash = crypto.createHash("sha256");
  for (const rel of [...paths].sort()) {
    hash.update(`path:${rel}\0`);
    const abs = path.join(root, rel);
    try {
      const stat = fs.statSync(abs);
      hash.update(`mode:${stat.mode};size:${stat.size}\0`);
      if (stat.isFile()) hash.update(fs.readFileSync(abs));
      else hash.update("<non-file>");
    } catch {
      hash.update("<missing>");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
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
  const status = payload.status;
  const loopCount = Number(payload.loop_count || 0);
  if (status !== "completed") { log(`skip: status=${status}`); reply({}); return; }
  if (loopCount >= MAX_FOLLOWUP_LOOP) { log(`skip: loop_count=${loopCount} >= ${MAX_FOLLOWUP_LOOP}`); reply({}); return; }
  if (toolMissing("git")) { log("skip: missing git on PATH"); reply({}); return; }

  const config = loadHooksConfig(root);
  const testPackages = listTestPackages(root, config);
  if (!testPackages.length) { log("skip: no package with test runner dependency + test files"); reply({}); return; }
  const porcelain = gitPorcelain(root);
  if (porcelain === null) { log("skip: git status failed"); reply({}); return; }
  const affected = affectedPackages(root, testPackages, porcelain);
  if (!affected.length) { log("skip: no relevant dirty files for any UT package"); reply({}); return; }

  const prev = readJson(path.join(root, STATE_REL));
  const next = { version: 2, packages: { ...(prev?.packages || {}) } };
  const toRun = [];
  for (const pkg of affected) {
    const fp = fingerprintDirty(root, pkg.dirty);
    const old = next.packages[pkg.rel];
    if (old?.ok && old?.fingerprint === fp) {
      log(`skip package ${pkg.rel}: same content fingerprint already green`);
      continue;
    }
    if (toolMissing(pkg.runner.executable || pkg.runner.manager)) {
      log(`skip package ${pkg.rel}: missing ${pkg.runner.executable || pkg.runner.manager} toolchain`);
      continue;
    }
    toRun.push({ ...pkg, fingerprint: fp });
  }
  if (!toRun.length) { reply({}); return; }

  if (process.env.UT_STOP_GATE_DRY_RUN === "1") {
    for (const pkg of toRun) log(`dry-run: would run ${pkg.runner.command} in ${pkg.rel}; dirty=${pkg.dirty.length}; fp=${pkg.fingerprint.slice(0, 12)}`);
    reply({});
    return;
  }

  const failures = [];
  for (const pkg of toRun) {
    const result = runUt(pkg.cwd, pkg.runner.command);
    next.packages[pkg.rel] = {
      ok: result.ok,
      fingerprint: pkg.fingerprint,
      cwd: pkg.rel,
      command: pkg.runner.command,
      status: result.status,
      error: result.error,
      at: new Date().toISOString(),
    };
    if (!result.ok) failures.push({ pkg, result });
  }
  writeState(root, next);

  if (!failures.length) { log(`pass: ${toRun.length} package(s)`); reply({}); return; }
  const summary = failures.map(({ pkg, result }) => `${pkg.rel}: ${result.error || `exit=${result.status}${result.signal ? ` signal=${result.signal}` : ""}`}`).join("; ");
  log(`fail: ${summary}`);
  reply({
    followup_message: [
      "Stop gate: 全量 UT 未通过，不得宣称本回合收工。",
      `失败包：${summary}。`,
      "请就地修复失败用例，修好后再次结束回合；同一文件再次变化会因内容指纹自动重跑。",
      "不要改 Expected 吞失败；不要拆 .cursor/hooks 绕过本闸。",
    ].join(" "),
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { main(); } catch (error) { log(`error: ${error?.stack || error}`); reply({}); }
}
