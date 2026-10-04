import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  DEFAULT_HOOKS_CONFIG,
  appPackageAbs,
  clearHooksConfigCache,
  gateControlBasenames,
  gateControlRepoRels,
  hooksConfigPath,
  loadHooksConfig,
  normalizeHooksConfig,
  skipListRepoRel,
  testFirstBypassRepoRel,
} from "./load-config.mjs";

describe("normalizeHooksConfig", () => {
  test("缺字段退回 DEFAULT", () => {
    const cfg = normalizeHooksConfig(null);
    assert.equal(cfg.appPackage, DEFAULT_HOOKS_CONFIG.appPackage);
    assert.deepEqual(cfg.productRoots, DEFAULT_HOOKS_CONFIG.productRoots);
    assert.equal(cfg.tddEnforcement, true);
    assert.ok(cfg.codeExtensions.includes(".vue"));
  });

  test("productRoots 补尾斜杠；空数组回退", () => {
    assert.deepEqual(normalizeHooksConfig({ productRoots: ["lib"] }).productRoots, ["lib/"]);
    assert.deepEqual(normalizeHooksConfig({ productRoots: [] }).productRoots, DEFAULT_HOOKS_CONFIG.productRoots);
  });

  test("importAliases 键值补尾斜杠", () => {
    assert.deepEqual(normalizeHooksConfig({ importAliases: { "@": "src" } }).importAliases, { "@/": "src/" });
  });

  test("代码扩展统一补点并去重", () => {
    assert.deepEqual(normalizeHooksConfig({ codeExtensions: ["ts", ".vue", "ts"] }).codeExtensions, [".ts", ".vue"]);
  });

  test("candidatePackages 与 testCommands 都来自配置", () => {
    const cfg = normalizeHooksConfig({ candidatePackages: ["app", "packages"], testCommands: { app: "npm test -- --runInBand" } });
    assert.deepEqual(cfg.candidatePackages, ["app", "packages"]);
    assert.equal(cfg.testCommands.app, "npm test -- --runInBand");
  });
});

describe("loadHooksConfig / gate control paths", () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-config-"));
    fs.mkdirSync(path.join(root, ".codex/hooks/scripts"), { recursive: true });
    fs.writeFileSync(hooksConfigPath(root), JSON.stringify({
      appPackage: "app",
      productRoots: ["src"],
      skipListFile: "runner-exclude.json",
      testFirstBypassFile: "tf-bypass.json",
      gateControlFiles: ["vitest.config.mts", "custom-gate.json"],
      candidatePackages: ["app", "packages"],
      tddEnforcement: false,
      testCommands: { app: "npm test" },
    }));
    clearHooksConfigCache();
    return root;
  }

  test("真实 config 能覆盖 readiness / packages / commands", () => {
    const root = fixture();
    const cfg = loadHooksConfig(root);
    assert.equal(cfg.appPackage, "app");
    assert.deepEqual(cfg.productRoots, ["src/"]);
    assert.deepEqual(cfg.candidatePackages, ["app", "packages"]);
    assert.equal(cfg.tddEnforcement, false);
    assert.equal(cfg.testCommands.app, "npm test");
    assert.equal(appPackageAbs(root, cfg), path.join(root, "app"));
  });

  test("runner exclude 与 Test First bypass 是两个独立路径", () => {
    const root = fixture();
    const cfg = loadHooksConfig(root);
    assert.equal(skipListRepoRel(cfg), "app/runner-exclude.json");
    assert.equal(testFirstBypassRepoRel(cfg), "app/tf-bypass.json");
    assert.notEqual(skipListRepoRel(cfg), testFirstBypassRepoRel(cfg));
  });

  test("所有可影响闸门的配置都进入 gateControlRepoRels", () => {
    const root = fixture();
    const cfg = loadHooksConfig(root);
    assert.deepEqual(gateControlRepoRels(cfg), [
      "app/runner-exclude.json",
      "app/tf-bypass.json",
      "app/vitest.config.mts",
      "app/custom-gate.json",
    ]);
    assert.deepEqual(gateControlBasenames(cfg), [
      "runner-exclude.json",
      "tf-bypass.json",
      "vitest.config.mts",
      "custom-gate.json",
    ]);
  });

  test("坏 JSON 偏严回退 DEFAULT，而不是半解析", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-config-bad-"));
    fs.mkdirSync(path.join(root, ".codex/hooks/scripts"), { recursive: true });
    fs.writeFileSync(hooksConfigPath(root), "{bad-json");
    clearHooksConfigCache();
    const cfg = loadHooksConfig(root);
    assert.deepEqual(cfg.productRoots, DEFAULT_HOOKS_CONFIG.productRoots);
    assert.equal(cfg.tddEnforcement, true);
  });
});
