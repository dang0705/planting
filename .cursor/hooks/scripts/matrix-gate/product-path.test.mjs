import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { clearHooksConfigCache, normalizeHooksConfig } from "../load-config.mjs";
import { classifyAppRel, decideWritePermission, extractToolPath, isGateControlPath, toAppRel } from "./product-path.mjs";

const CFG = normalizeHooksConfig({ productRoots: ["src"], codeExtensions: ["ts", "tsx", "vue"] });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "product-path-"));
  fs.mkdirSync(path.join(root, ".cursor/hooks/scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "app/src"), { recursive: true });
  fs.writeFileSync(path.join(root, ".cursor/hooks/scripts/config.json"), JSON.stringify({
    appPackage: "app",
    productRoots: ["src"],
    skipListFile: "test-exclude.json",
    testFirstBypassFile: "test-first-bypass.json",
    gateControlFiles: ["vitest.config.mts"],
    codeExtensions: [".ts", ".tsx", ".vue"],
  }));
  clearHooksConfigCache();
  return root;
}

describe("classifyAppRel · 产品 / 测试 / 其他", () => {
  test("普通 TS / TSX / Vue 产品文件", () => {
    assert.equal(classifyAppRel("src/foo.ts", CFG), "product");
    assert.equal(classifyAppRel("src/components/Foo.tsx", CFG), "product");
    assert.equal(classifyAppRel("src/pages/Home.vue", CFG), "product");
  });

  test("*.test / *.spec 不算产品", () => {
    assert.equal(classifyAppRel("src/foo.test.ts", CFG), "test");
    assert.equal(classifyAppRel("src/foo.spec.tsx", CFG), "test");
  });

  test("__tests__ / __mocks__ / test 目录按测试处理", () => {
    assert.equal(classifyAppRel("src/foo/__tests__/x.ts", CFG), "test");
    assert.equal(classifyAppRel("src/__mocks__/api.ts", CFG), "test");
    assert.equal(classifyAppRel("test/integration/foo.ts", CFG), "test");
  });

  test("非代码扩展与 productRoots 外代码是 other", () => {
    assert.equal(classifyAppRel("src/readme.md", CFG), "other");
    assert.equal(classifyAppRel("scripts/build.ts", CFG), "other");
  });
});

describe("decideWritePermission · 产品与闸门走 protected", () => {
  test("多个产品路径均 protected，不依赖 ask", () => {
    const root = fixture();
    for (const rel of [
      "src/domains/ec/components/Checkout/CheckoutFooter/index.tsx",
      "src/domains/ec/pages/Cart.tsx",
      "src/domains/ec/pages/plp.helpers.ts",
      "src/domains/ec/mappers/product/catalog.mapper.ts",
      "src/components/pure-ui/PIPL.tsx",
      "src/pages/Home.vue",
    ]) {
      const r = decideWritePermission(path.join(root, "app", rel), root);
      assert.equal(r.permission, "protected", rel);
      assert.equal(r.kind, "product", rel);
    }
  });

  test("只改测试 → allow", () => {
    const root = fixture();
    assert.equal(decideWritePermission(path.join(root, "app/src/navigation/flows.edges.test.ts"), root).permission, "allow");
  });

  test(".cursor/hooks.json 与 hooks 目录自身都是 gate-control", () => {
    const root = fixture();
    for (const rel of [".cursor/hooks.json", ".cursor/hooks/scripts/config.json", ".cursor/hooks/scripts/matrix-gate/test-first.mjs"]) {
      const r = decideWritePermission(path.join(root, rel), root);
      assert.equal(r.permission, "protected", rel);
      assert.equal(r.kind, "gate-control", rel);
      assert.equal(r.file, rel);
    }
  });

  test("exclude / Test First bypass / runner config 都是 gate-control", () => {
    const root = fixture();
    for (const rel of ["app/test-exclude.json", "app/test-first-bypass.json", "app/vitest.config.mts"]) {
      const r = decideWritePermission(path.join(root, rel), root);
      assert.equal(r.permission, "protected", rel);
      assert.equal(r.kind, "gate-control", rel);
    }
  });

  test("没有允许产品白名单字段也能判定", () => {
    const root = fixture();
    const r = decideWritePermission(path.join(root, "app/src/navigation/flows.ts"), root);
    assert.equal(r.permission, "protected");
    assert.equal("allowedProductPaths" in r, false);
  });
});

describe("路径归一化", () => {
  test("toAppRel 支持绝对路径和 repo 内 appPackage 前缀", () => {
    const root = fixture();
    const abs = path.join(root, "app/src/foo.ts");
    const cfg = normalizeHooksConfig({ appPackage: "app", productRoots: ["src"] });
    assert.equal(toAppRel(abs, root, cfg), "src/foo.ts");
    assert.equal(toAppRel(path.join(root, "app/src/foo.test.ts"), root, cfg), "src/foo.test.ts");
  });

  test("isGateControlPath 精确覆盖 hooks 与配置文件", () => {
    const root = fixture();
    assert.equal(isGateControlPath(path.join(root, ".cursor/hooks.json"), root), true);
    assert.equal(isGateControlPath(path.join(root, "app/test-first-bypass.json"), root), true);
    assert.equal(isGateControlPath(path.join(root, "app/src/foo.ts"), root), false);
  });
});

describe("extractToolPath", () => {
  test("tool_input.path", () => {
    assert.equal(extractToolPath({ tool_input: { path: "/tmp/a.tsx" } }), "/tmp/a.tsx");
  });

  test("file_path / target_file 兼容", () => {
    assert.equal(extractToolPath({ tool_input: { file_path: "/tmp/b.ts" } }), "/tmp/b.ts");
    assert.equal(extractToolPath({ target_file: "/tmp/c.vue" }), "/tmp/c.vue");
  });
});
