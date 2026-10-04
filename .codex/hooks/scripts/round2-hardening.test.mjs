import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { clearHooksConfigCache, normalizeHooksConfig } from "./load-config.mjs";
import { buildRelevantManifest, diffManifest } from "./turn-baseline.mjs";
import { decideWritePermission } from "./matrix-gate/product-path.mjs";
import { decideShellCommand, scriptContentMayWriteProduct } from "./matrix-gate/test-first.mjs";

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}`);
}

function monorepoFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "round2-mono-"));
  fs.mkdirSync(path.join(root, ".codex/hooks/scripts"), { recursive: true });
  for (const rel of ["src-taro", "packages/lib"]) {
    fs.mkdirSync(path.join(root, rel, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, rel, "package.json"), JSON.stringify({ devDependencies: { vitest: "1" } }));
    fs.writeFileSync(path.join(root, rel, "src/a.ts"), "export const a=1\n");
    fs.writeFileSync(path.join(root, rel, "src/a.test.ts"), "test('a',()=>{})\n");
  }
  fs.writeFileSync(path.join(root, ".codex/hooks/scripts/config.json"), JSON.stringify({
    appPackage: "src-taro", productRoots: ["src"], candidatePackages: ["src-taro", "packages"],
    codeExtensions: [".ts", ".tsx", ".js", ".jsx", ".vue"],
  }));
  clearHooksConfigCache();
  return root;
}

describe("Round2 · 所有受管 package 共用产品写入硬闸", () => {
  test("packages/lib/src 不再绕过 appPackage 单中心", () => {
    const root = monorepoFixture();
    const r = decideWritePermission(path.join(root, "packages/lib/src/a.ts"), root);
    assert.equal(r.permission, "protected");
    assert.equal(r.kind, "product");
    assert.equal(r.file, "packages/lib/src/a.ts");
    assert.equal(r.packageRel, "packages/lib");
    assert.equal(r.localRel, "src/a.ts");
  });

  test("子包测试仍是 test，不误判 product", () => {
    const root = monorepoFixture();
    const r = decideWritePermission(path.join(root, "packages/lib/src/a.test.ts"), root);
    assert.equal(r.permission, "allow");
    assert.equal(r.kind, "test");
    assert.equal(r.file, "packages/lib/src/a.test.ts");
  });
});

describe("Round2 · Shell 间接旁路", () => {
  const cfg = { ...normalizeHooksConfig({ appPackage: "src-taro", productRoots: ["src"] }), managedPackageRels: ["src-taro", "packages/lib"] };

  test("git apply / patch 落盘形式拒绝；只读检查形式允许", () => {
    assert.equal(decideShellCommand({ command: "git apply /tmp/change.patch", config: cfg }).reason, "shell-opaque-patch");
    assert.equal(decideShellCommand({ command: "patch -p1 < /tmp/change.patch", config: cfg }).reason, "shell-opaque-patch");
    assert.equal(decideShellCommand({ command: "git apply --check /tmp/change.patch", config: cfg }).permission, "allow");
    assert.equal(decideShellCommand({ command: "patch --dry-run -p1 < /tmp/change.patch", config: cfg }).permission, "allow");
  });

  test("git stash 变更形式拒绝；list/show 只读形式允许", () => {
    const r = decideShellCommand({ command: "git stash push -u", config: cfg });
    assert.equal(r.permission, "deny");
    assert.equal(r.reason, "shell-audit-state-hide");
    assert.equal(decideShellCommand({ command: "git stash list", config: cfg }).permission, "allow");
    assert.equal(decideShellCommand({ command: "git stash show stash@{0}", config: cfg }).permission, "allow");
  });

  test("解释器脚本内容含写 API + 子包产品路径 → 风险成立", () => {
    assert.equal(scriptContentMayWriteProduct(`from pathlib import Path\nPath('packages/lib/src/a.ts').write_text('x')`, cfg), true);
    assert.equal(scriptContentMayWriteProduct(`const fs=require('fs'); fs.writeFileSync('src-taro/src/a.ts','x')`, cfg), true);
    assert.equal(scriptContentMayWriteProduct(`from pathlib import Path\nprint(Path('packages/lib/src/a.ts').read_text())`, cfg), false);
  });
});

describe("Round2 · Stop 使用 turn-start baseline，而非最终 dirty 状态", () => {
  test("产品修改被 commit 后 git status clean，manifest diff 仍能发现", () => {
    const root = monorepoFixture();
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "T"]);
    git(root, ["add", "."]);
    git(root, ["commit", "-qm", "base"]);
    const cfg = normalizeHooksConfig({ appPackage: "src-taro", productRoots: ["src"], candidatePackages: ["src-taro", "packages"] });
    const before = buildRelevantManifest(root, cfg);
    fs.writeFileSync(path.join(root, "packages/lib/src/a.ts"), "export const a=2\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-qm", "agent-change"]);
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    assert.equal(status.stdout.trim(), "");
    const after = buildRelevantManifest(root, cfg);
    assert.deepEqual(diffManifest(before, after), ["packages/lib/src/a.ts"]);
  });
});
