import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { normalizeHooksConfig } from "./load-config.mjs";
import {
  affectedPackages,
  detectRunner,
  fingerprintDirty,
  listCandidatePackages,
  porcelainPath,
} from "./ut-stop-gate.mjs";

function mkPkg(root, rel, { manager = "yarn", runner = "vitest" } = {}) {
  const dir = path.join(root, rel);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    packageManager: `${manager}@1.0.0`,
    scripts: { test: `${runner} run` },
    devDependencies: { [runner]: "1.0.0" },
  }));
  fs.writeFileSync(path.join(dir, "src/a.test.ts"), "test('a',()=>{})");
  fs.writeFileSync(path.join(dir, "src/a.ts"), "export const a=1\n");
  return dir;
}

describe("runner 配置", () => {
  test("testCommands 可显式覆盖自动 runner 推断", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ut-runner-"));
    const dir = path.join(root, "app");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: {} }));
    const r = detectRunner(dir, "npm run test:unit");
    assert.equal(r.command, "npm run test:unit");
    assert.equal(r.executable, "npm");
  });
});

describe("candidatePackages / monorepo 受影响包", () => {
  test("真正使用 config.candidatePackages，并可发现容器下 package", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ut-gate-"));
    const app = mkPkg(root, "app");
    const lib = mkPkg(root, "workspace/lib");
    mkPkg(root, "ignored/nope");
    const cfg = normalizeHooksConfig({ candidatePackages: ["app", "workspace"] });
    const found = listCandidatePackages(root, cfg);
    assert.ok(found.includes(app));
    assert.ok(found.includes(lib));
    assert.equal(found.some((x) => x.includes("ignored/nope")), false);
  });

  test("同一轮多个 dirty package 全部进入 affected，不再只挑最高分一个", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ut-gate-"));
    const app = mkPkg(root, "app");
    const lib = mkPkg(root, "packages/lib");
    const pkgs = [
      { cwd: app, runner: detectRunner(app) },
      { cwd: lib, runner: detectRunner(lib) },
    ];
    const affected = affectedPackages(root, pkgs, [" M app/src/a.ts", " M packages/lib/src/a.ts"]);
    assert.deepEqual(affected.map((x) => x.rel).sort(), ["app", "packages/lib"]);
  });
});

describe("内容指纹", () => {
  test("同一路径内容再次变化，fingerprint 必须变化", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ut-fp-"));
    fs.mkdirSync(path.join(root, "app/src"), { recursive: true });
    const file = path.join(root, "app/src/a.ts");
    fs.writeFileSync(file, "a");
    const a = fingerprintDirty(root, ["app/src/a.ts"]);
    fs.writeFileSync(file, "b");
    const b = fingerprintDirty(root, ["app/src/a.ts"]);
    assert.notEqual(a, b);
  });

  test("删除文件也有稳定但不同的指纹", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ut-fp-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const file = path.join(root, "src/a.ts");
    fs.writeFileSync(file, "a");
    const before = fingerprintDirty(root, ["src/a.ts"]);
    fs.rmSync(file);
    const after = fingerprintDirty(root, ["src/a.ts"]);
    assert.notEqual(before, after);
  });
});

describe("porcelainPath", () => {
  test("普通与 rename 都提取最终路径", () => {
    assert.equal(porcelainPath(" M app/src/a.ts"), "app/src/a.ts");
    assert.equal(porcelainPath("R  old.ts -> app/src/a.ts"), "app/src/a.ts");
  });
});
