/** 产品源码判定。布局由 hooks config.json 注入；所有受管 package 共用同一套规则。 */
import path from "node:path";
import { DEFAULT_HOOKS_CONFIG, gateControlRepoRels, loadHooksConfig } from "../load-config.mjs";
import { listManagedPackages, localPathInPackage, owningManagedPackage, toPosixPath } from "../package-layout.mjs";

export function toPosix(rel) { return toPosixPath(rel); }

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

export function toRepoRel(filePath, repoRoot) {
  const root = path.resolve(repoRoot);
  const raw = String(filePath || "");
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  return toPosix(path.relative(root, abs));
}

/** 兼容旧 API：只计算 appPackage 内局部路径。 */
export function toAppRel(filePath, repoRoot, config) {
  const cfg = config || loadHooksConfig(repoRoot);
  const repoRel = toRepoRel(filePath, repoRoot);
  return localPathInPackage(repoRel, cfg.appPackage) ?? repoRel;
}

export function resolveManagedFile(filePath, repoRoot, config = null) {
  const cfg = config || loadHooksConfig(repoRoot);
  const repoRel = toRepoRel(filePath, repoRoot);
  const packages = listManagedPackages(repoRoot, cfg);
  const owner = owningManagedPackage(repoRel, packages);
  if (!owner) return { repoRel, packageRel: null, localRel: null, kind: "other" };
  const localRel = localPathInPackage(repoRel, owner.rel);
  return {
    repoRel,
    packageRel: owner.rel,
    localRel,
    kind: classifyAppRel(localRel, cfg),
  };
}

export function isGateControlPath(filePath, repoRoot, config) {
  const cfg = config || loadHooksConfig(repoRoot);
  const rel = toRepoRel(filePath, repoRoot);
  if (rel === ".codex/hooks.json" || rel.startsWith(".codex/hooks/")) return true;
  const packages = listManagedPackages(repoRoot, cfg).map((p) => p.rel);
  return gateControlRepoRels(cfg, packages).includes(rel);
}

export function decideWritePermission(filePath, repoRoot) {
  if (!filePath) return { permission: "allow", kind: "empty" };
  const config = loadHooksConfig(repoRoot);
  if (isGateControlPath(filePath, repoRoot, config)) {
    return { permission: "protected", kind: "gate-control", file: toRepoRel(filePath, repoRoot) };
  }
  const resolved = resolveManagedFile(filePath, repoRoot, config);
  if (resolved.kind === "product") {
    return {
      permission: "protected",
      kind: "product",
      file: resolved.repoRel,
      packageRel: resolved.packageRel,
      localRel: resolved.localRel,
    };
  }
  if (resolved.kind === "test") {
    return {
      permission: "allow",
      kind: "test",
      file: resolved.repoRel,
      packageRel: resolved.packageRel,
      localRel: resolved.localRel,
    };
  }
  return {
    permission: "allow",
    kind: resolved.kind,
    file: resolved.repoRel,
    packageRel: resolved.packageRel,
    localRel: resolved.localRel,
  };
}

export function extractToolPath(payload) {
  const input = payload?.tool_input || payload?.arguments || payload || {};
  return input.path || input.file_path || input.target_notebook || input.target_file || "";
}
