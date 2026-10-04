/**
 * Hooks 布局配置：业务路径从 config.json 注入，脚本保持通用。
 * 缺文件 / 坏 JSON → 退回 DEFAULT。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_HOOKS_CONFIG = Object.freeze({
  appPackage: ".",
  productRoots: ["src/"],
  skipListFile: "test-exclude.json",
  testFirstBypassFile: "test-first-bypass.json",
  gateControlFiles: ["vitest.config.mts"],
  importAliases: { "@/": "src/" },
  candidatePackages: ["packages", "apps"],
  codeExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"],
  tddEnforcement: true,
  testCommands: {},
});

function toPosix(rel) {
  return String(rel || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeProductRoots(list) {
  const roots = (Array.isArray(list) ? list : DEFAULT_HOOKS_CONFIG.productRoots)
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => {
      const p = toPosix(item).replace(/^\/+/, "");
      return p.endsWith("/") ? p : `${p}/`;
    });
  return roots.length ? roots : [...DEFAULT_HOOKS_CONFIG.productRoots];
}

function normalizeAliases(raw) {
  const src = raw && typeof raw === "object" ? raw : DEFAULT_HOOKS_CONFIG.importAliases;
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    const k = key.endsWith("/") ? key : `${key}/`;
    const v = toPosix(value);
    out[k] = v.endsWith("/") ? v : `${v}/`;
  }
  return Object.keys(out).length ? out : { ...DEFAULT_HOOKS_CONFIG.importAliases };
}

function normalizeCodeExtensions(list) {
  const source = Array.isArray(list) ? list : DEFAULT_HOOKS_CONFIG.codeExtensions;
  const out = source
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim().toLowerCase())
    .map((item) => (item.startsWith(".") ? item : `.${item}`));
  return out.length ? [...new Set(out)] : [...DEFAULT_HOOKS_CONFIG.codeExtensions];
}


function normalizeStringMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || typeof value !== "string" || !value.trim()) continue;
    out[toPosix(key).replace(/\/+$/, "") || "."] = value.trim();
  }
  return out;
}

/** 合并并规范化配置对象 */
export function normalizeHooksConfig(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const appPackage =
    typeof input.appPackage === "string" && input.appPackage.trim()
      ? toPosix(input.appPackage).replace(/\/+$/, "") || "."
      : DEFAULT_HOOKS_CONFIG.appPackage;
  const skipListFile =
    typeof input.skipListFile === "string" && input.skipListFile.trim()
      ? toPosix(input.skipListFile).replace(/^\/+/, "")
      : DEFAULT_HOOKS_CONFIG.skipListFile;
  const testFirstBypassFile =
    typeof input.testFirstBypassFile === "string" && input.testFirstBypassFile.trim()
      ? toPosix(input.testFirstBypassFile).replace(/^\/+/, "")
      : DEFAULT_HOOKS_CONFIG.testFirstBypassFile;
  const gateControlFiles = (
    Array.isArray(input.gateControlFiles)
      ? input.gateControlFiles
      : DEFAULT_HOOKS_CONFIG.gateControlFiles
  )
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => toPosix(item).replace(/^\/+/, ""));
  const candidatePackages = (
    Array.isArray(input.candidatePackages)
      ? input.candidatePackages
      : DEFAULT_HOOKS_CONFIG.candidatePackages
  )
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => toPosix(item).replace(/\/+$/, ""));

  return {
    appPackage,
    productRoots: normalizeProductRoots(input.productRoots),
    skipListFile,
    testFirstBypassFile,
    gateControlFiles:
      gateControlFiles.length > 0 ? gateControlFiles : [...DEFAULT_HOOKS_CONFIG.gateControlFiles],
    importAliases: normalizeAliases(input.importAliases),
    candidatePackages:
      candidatePackages.length > 0 ? candidatePackages : [...DEFAULT_HOOKS_CONFIG.candidatePackages],
    codeExtensions: normalizeCodeExtensions(input.codeExtensions),
    tddEnforcement:
      typeof input.tddEnforcement === "boolean"
        ? input.tddEnforcement
        : DEFAULT_HOOKS_CONFIG.tddEnforcement,
    testCommands: normalizeStringMap(input.testCommands),
  };
}

const cacheByRoot = new Map();
export function clearHooksConfigCache() { cacheByRoot.clear(); }

export function hooksConfigPath(repoRoot) {
  return path.join(repoRoot, ".codex/hooks/scripts/config.json");
}

export function loadHooksConfig(repoRoot) {
  const root = path.resolve(repoRoot || ".");
  if (cacheByRoot.has(root)) return cacheByRoot.get(root);
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(hooksConfigPath(root), "utf8")); } catch { raw = null; }
  const config = normalizeHooksConfig(raw);
  cacheByRoot.set(root, config);
  return config;
}

export function appPackageAbs(repoRoot, config) {
  const cfg = config || loadHooksConfig(repoRoot);
  return cfg.appPackage === "." ? path.resolve(repoRoot) : path.join(path.resolve(repoRoot), cfg.appPackage);
}

export function skipListRepoRel(config) {
  const cfg = config || DEFAULT_HOOKS_CONFIG;
  return cfg.appPackage === "." ? cfg.skipListFile : `${cfg.appPackage}/${cfg.skipListFile}`;
}

export function testFirstBypassRepoRel(config, packageRel = null) {
  const cfg = config || DEFAULT_HOOKS_CONFIG;
  const pkg = (packageRel ?? cfg.appPackage) || ".";
  return pkg === "." ? cfg.testFirstBypassFile : `${pkg}/${cfg.testFirstBypassFile}`;
}

export function gateControlRepoRels(config, packageRels = null) {
  const cfg = config || DEFAULT_HOOKS_CONFIG;
  const packages = Array.isArray(packageRels) && packageRels.length ? packageRels : [cfg.appPackage];
  const files = [cfg.skipListFile, cfg.testFirstBypassFile, ...cfg.gateControlFiles];
  return [...new Set(packages.flatMap((pkg) => {
    const prefix = !pkg || pkg === "." ? "" : `${pkg}/`;
    return files.map((f) => `${prefix}${f}`);
  }))];
}

export function gateControlBasenames(config) {
  const cfg = config || DEFAULT_HOOKS_CONFIG;
  return [...new Set([cfg.skipListFile, cfg.testFirstBypassFile, ...cfg.gateControlFiles])];
}

export function repoRootFromScripts() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../..");
}
