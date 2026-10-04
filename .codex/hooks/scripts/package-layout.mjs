/**
 * 受管 package 发现：appPackage + candidatePackages（具体包或一层 workspace 容器）。
 * 产品写入闸与 Stop gate 共用同一份包边界，避免单 appPackage 与 monorepo 语义漂移。
 */
import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".codex", "vendor", "__pycache__", ".turbo", ".next", "build"]);

export function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function hasPackageJson(dir) {
  return fs.existsSync(path.join(dir, "package.json"));
}

export function listManagedPackages(repoRoot, config) {
  const root = path.resolve(repoRoot);
  const byRel = new Map();
  const add = (rel, force = false) => {
    const normalized = toPosixPath(rel).replace(/\/+$/, "") || ".";
    const abs = normalized === "." ? root : path.join(root, normalized);
    if (!force && !hasPackageJson(abs)) return;
    byRel.set(normalized, { rel: normalized, abs: path.resolve(abs) });
  };

  // appPackage 是显式治理入口：即使 package.json 暂时不存在，也必须保持保护。
  add(config.appPackage || ".", true);
  // 兼容根 workspace package；Stop 旧行为也会识别根 package。
  if (hasPackageJson(root)) add(".");

  for (const candidate of config.candidatePackages || []) {
    const rel = toPosixPath(candidate).replace(/\/+$/, "") || ".";
    const target = rel === "." ? root : path.join(root, rel);
    if (!fs.existsSync(target)) continue;
    add(rel);
    let entries = [];
    try { entries = fs.readdirSync(target, { withFileTypes: true }); } catch {}
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".") || SKIP_DIRS.has(ent.name)) continue;
      add(rel === "." ? ent.name : `${rel}/${ent.name}`);
    }
  }

  return [...byRel.values()].sort((a, b) => b.rel.length - a.rel.length || a.rel.localeCompare(b.rel));
}

export function owningManagedPackage(repoRel, packages) {
  const rel = toPosixPath(repoRel);
  for (const pkg of packages || []) {
    if (pkg.rel === ".") return pkg;
    if (rel === pkg.rel || rel.startsWith(`${pkg.rel}/`)) return pkg;
  }
  return null;
}

export function localPathInPackage(repoRel, packageRel) {
  const rel = toPosixPath(repoRel);
  const pkg = toPosixPath(packageRel).replace(/\/+$/, "") || ".";
  if (pkg === ".") return rel;
  if (rel === pkg) return "";
  return rel.startsWith(`${pkg}/`) ? rel.slice(pkg.length + 1) : null;
}
