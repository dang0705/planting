/** 产品源码判定。布局由 hooks config.json 注入。 */
import path from "node:path";
import { DEFAULT_HOOKS_CONFIG, gateControlRepoRels, loadHooksConfig } from "../load-config.mjs";

export function toPosix(rel) { return String(rel || "").replace(/\\/g, "/").replace(/^\.\//, ""); }

function isCodePath(posix, config) {
  const lower = posix.toLowerCase();
  return config.codeExtensions.some((ext) => lower.endsWith(ext));
}
function isTestPath(posix) {
  return /\.(test|spec)\./.test(posix) || /(^|\/)(__tests__|__mocks__)(\/|$)/.test(posix) || /(^|\/)test\//.test(posix);
}
export function classifyAppRel(rel, config = DEFAULT_HOOKS_CONFIG) {
  const p = toPosix(rel);
  if (!p || !isCodePath(p, config)) return "other";
  if (isTestPath(p)) return "test";
  if (config.productRoots.some((root) => p.startsWith(root))) return "product";
  if (p.startsWith("test/")) return "test";
  return "other";
}

export function toAppRel(filePath, repoRoot, config) {
  const cfg = config || loadHooksConfig(repoRoot);
  const abs = path.resolve(String(filePath || ""));
  const root = path.resolve(repoRoot);
  const appRoot = cfg.appPackage === "." ? root : path.join(root, cfg.appPackage);
  const posixAbs = toPosix(abs); const posixApp = toPosix(appRoot);
  if (posixAbs === posixApp || posixAbs.startsWith(`${posixApp}/`)) return toPosix(path.relative(appRoot, abs));
  const asRepo = toPosix(path.relative(root, abs));
  const prefix = cfg.appPackage === "." ? "" : `${cfg.appPackage}/`;
  if (prefix && asRepo.startsWith(prefix)) return asRepo.slice(prefix.length);
  if (cfg.productRoots.some((r) => asRepo.startsWith(r)) || asRepo.startsWith("test/")) return asRepo;
  return toPosix(filePath);
}

export function toRepoRel(filePath, repoRoot) {
  const abs = path.resolve(String(filePath || ""));
  return toPosix(path.relative(path.resolve(repoRoot), abs));
}

export function isGateControlPath(filePath, repoRoot, config) {
  const cfg = config || loadHooksConfig(repoRoot);
  const rel = toRepoRel(filePath, repoRoot);
  if (rel === ".cursor/hooks.json" || rel.startsWith(".cursor/hooks/")) return true;
  return gateControlRepoRels(cfg).includes(rel);
}

export function decideWritePermission(filePath, repoRoot) {
  if (!filePath) return { permission: "allow", kind: "empty" };
  const config = loadHooksConfig(repoRoot);
  if (isGateControlPath(filePath, repoRoot, config)) {
    return { permission: "protected", kind: "gate-control", file: toRepoRel(filePath, repoRoot) };
  }
  const rel = toAppRel(filePath, repoRoot, config);
  const kind = classifyAppRel(rel, config);
  if (kind === "product") return { permission: "protected", kind: "product", file: rel };
  return { permission: "allow", kind, file: rel };
}

export function extractToolPath(payload) {
  const input = payload?.tool_input || payload?.arguments || payload || {};
  return input.path || input.file_path || input.target_notebook || input.target_file || "";
}
