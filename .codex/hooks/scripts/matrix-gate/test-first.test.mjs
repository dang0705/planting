/**
 * Test-first 顺序闸自测。
 * Expected 来源：AGENTS.md「TDD → Anti-shortcut」第 2 条（本轮代表性测试落盘前不得写产品）
 * + 用户要求：压住「先产品后测试」漂移；Shell 不得绕道；仅用户可豁免。
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { normalizeHooksConfig } from "../load-config.mjs";
import {
  GATE_APPROVAL_TOKEN,
  PRODUCT_APPROVAL_TOKEN,
  classifyShellCommand,
  consumeApproval,
  createLedger,
  decideProductWrite,
  decideShellCommand,
  finalizeApprovalWrite,
  finalizeTestWrite,
  hasAvailableApproval,
  hasWaiverToken,
  isRelatedTest,
  parseApprovalPaths,
  parsePatternList,
  isSkipListed,
  noteGeneration,
  parseSkipList,
  recordApprovalsFromPrompt,
  recordPendingTestWrite,
  recordRedTest,
  reserveApproval,
  recordTestWrite,
  recordWaiver,
} from "./test-first.mjs";

const CID = "conv-1";
const GEN_A = "gen-a";
const GEN_B = "gen-b";

/** 自包含的典型 monorepo 布局；测试不依赖宿主仓库真实文件。 */
const REPO_CFG = normalizeHooksConfig({
  appPackage: "src-taro",
  productRoots: ["src"],
  skipListFile: "test-exclude.json",
  testFirstBypassFile: "test-first-bypass.json",
  gateControlFiles: ["vitest.config.mts"],
  importAliases: { "@/": "src/" },
});

const PRODUCT = "src/editor/blocks/HeroBanner/HeroBannerItemView.tsx";
const SAME_DIR_TEST = "src/editor/blocks/HeroBanner/heroBannerVideo.helpers.test.ts";
const OTHER_DIR_TEST = "src/navigation/routeKeyOf.test.ts";

/** 可控磁盘：只有列入 files 的测试才算已落盘 */
function fakeFs(files) {
  return {
    fileExists: (rel) => Object.hasOwn(files, rel),
    readFile: (rel) => files[rel] ?? "",
  };
}

describe("decideProductWrite · 本轮无相关测试不得写产品", () => {
  test("happy: 本轮尚未写任何测试 → deny", () => {
    const ledger = createLedger();
    const result = decideProductWrite({
      ledger,
      conversationId: CID,
      generationId: GEN_A,
      productRel: PRODUCT,
      ...fakeFs({}),
    });
    assert.equal(result.permission, "deny");
  });

  test("happy: 本轮已落盘同目录测试 → allow", () => {
    const ledger = createLedger();
    recordTestWrite(ledger, CID, GEN_A, SAME_DIR_TEST);
    const result = decideProductWrite({
      ledger,
      conversationId: CID,
      generationId: GEN_A,
      productRel: PRODUCT,
      ...fakeFs({ [SAME_DIR_TEST]: "" }),
    });
    assert.equal(result.permission, "allow");
    assert.equal(result.relatedTest, SAME_DIR_TEST);
  });

  test("reverse: 上一轮写的测试不继承到本轮 → deny", () => {
    const ledger = createLedger();
    recordTestWrite(ledger, CID, GEN_A, SAME_DIR_TEST);
    const result = decideProductWrite({
      ledger,
      conversationId: CID,
      generationId: GEN_B,
      productRel: PRODUCT,
      ...fakeFs({ [SAME_DIR_TEST]: "" }),
    });
    assert.equal(result.permission, "deny");
  });

  test("reverse: 本轮只写了无关测试（异目录且未 import）→ deny", () => {
    const ledger = createLedger();
    recordTestWrite(ledger, CID, GEN_A, OTHER_DIR_TEST);
    const result = decideProductWrite({
      ledger,
      conversationId: CID,
      generationId: GEN_A,
      productRel: PRODUCT,
      ...fakeFs({ [OTHER_DIR_TEST]: 'import { ROUTES } from "@/routes";' }),
    });
    assert.equal(result.permission, "deny");
  });

  test("reverse: 台账有记录但文件未落盘（写入被拒）→ deny", () => {
    const ledger = createLedger();
    recordTestWrite(ledger, CID, GEN_A, SAME_DIR_TEST);
    const result = decideProductWrite({
      ledger,
      conversationId: CID,
      generationId: GEN_A,
      productRel: PRODUCT,
      ...fakeFs({}),
    });
    assert.equal(result.permission, "deny");
  });

  test("happy: 用户本轮豁免 → allow", () => {
    const ledger = createLedger();
    recordWaiver(ledger, CID, GEN_A);
    const result = decideProductWrite({
      ledger,
      conversationId: CID,
      generationId: GEN_A,
      productRel: PRODUCT,
      ...fakeFs({}),
    });
    assert.equal(result.permission, "allow");
  });

  test("reverse: 上一轮的豁免不继承 → deny", () => {
    const ledger = createLedger();
    recordWaiver(ledger, CID, GEN_A);
    const result = decideProductWrite({
      ledger,
      conversationId: CID,
      generationId: GEN_B,
      productRel: PRODUCT,
      ...fakeFs({}),
    });
    assert.equal(result.permission, "deny");
  });

  test("edge: 缺 conversation/generation 标识 → deny（无法证明顺序）", () => {
    const ledger = createLedger();
    const result = decideProductWrite({
      ledger,
      conversationId: "",
      generationId: "",
      productRel: PRODUCT,
      ...fakeFs({}),
    });
    assert.equal(result.permission, "deny");
  });
});

describe("Test First bypass · 与 runner exclude 分离", () => {
  const patterns = [
    "**/node_modules/**",
    "src/app.config.ts",
    "src/config/app.ts",
    "src/data",
  ];

  test("happy: 清单内的具体文件跳过顺序闸 → allow", () => {
    const result = decideProductWrite({
      ledger: createLedger(),
      conversationId: CID,
      generationId: GEN_A,
      productRel: "src/app.config.ts",
      bypassPatterns: patterns,
      ...fakeFs({}),
    });
    assert.equal(result.permission, "allow");
    assert.equal(result.reason, "test-first-bypass");
  });

  test("happy: 目录条目覆盖其下文件", () => {
    assert.equal(isSkipListed("src/data/index.ts", patterns), true);
    assert.equal(isSkipListed("src/data/mock/list.ts", patterns), true);
  });

  test("happy: glob 条目", () => {
    assert.equal(
      isSkipListed("src/vendor/node_modules/x/index.ts", patterns),
      true
    );
  });

  test("reverse: 清单外文件仍需本轮相关测试 → deny", () => {
    const result = decideProductWrite({
      ledger: createLedger(),
      conversationId: CID,
      generationId: GEN_A,
      productRel: "src/config/app.helpers.ts",
      bypassPatterns: patterns,
      ...fakeFs({}),
    });
    assert.equal(result.permission, "deny");
  });

  test("reverse: 目录前缀不误伤同名前缀的兄弟目录", () => {
    assert.equal(isSkipListed("src/database/index.ts", patterns), false);
  });

  test("happy: parsePatternList 读取独立 bypass 数组", () => {
    assert.deepEqual(
      parsePatternList('{"bypass":["src/app.config.ts","src/data"]}', "bypass"),
      ["src/app.config.ts", "src/data"]
    );
  });

  test("reverse: runner exclude 只可解析，不等于 Test First bypass", () => {
    const exclude = parseSkipList('{"exclude":["src/app.config.ts"]}');
    assert.deepEqual(exclude, ["src/app.config.ts"]);
    const result = decideProductWrite({
      ledger: createLedger(), conversationId: CID, generationId: GEN_A,
      productRel: "src/app.config.ts", bypassPatterns: [], ...fakeFs({}),
    });
    assert.equal(result.permission, "deny");
  });

  test("edge: bypass 清单损坏 / 缺字段 → 空清单（偏严，不放行）", () => {
    assert.deepEqual(parsePatternList("not json", "bypass"), []);
    assert.deepEqual(parsePatternList('{"bypass":"src"}', "bypass"), []);
    assert.deepEqual(parsePatternList('{"bypass":["src/a.ts",1,null]}', "bypass"), ["src/a.ts"]);
  });
});

describe("isRelatedTest · 同目录或 import 到产品模块", () => {
  test("happy: 同目录", () => {
    assert.equal(isRelatedTest(SAME_DIR_TEST, PRODUCT, ""), true);
  });

  test("happy: __tests__ 子目录测父目录产品", () => {
    assert.equal(
      isRelatedTest(
        "src/domains/ec/pages/__tests__/Cart.page.test.tsx",
        "src/domains/ec/pages/Cart.tsx",
        ""
      ),
      true
    );
  });

  test("happy: 异目录但相对路径 import 产品", () => {
    assert.equal(
      isRelatedTest(
        "src/navigation/routeKeyOf.test.ts",
        "src/routes/index.ts",
        'import { ROUTES } from "../routes";'
      ),
      true
    );
  });

  test("happy: 异目录但 @/ 别名 import 产品文件", () => {
    assert.equal(
      isRelatedTest(
        "test/integration/cart.test.ts",
        "src/domains/ec/mappers/cart.mapper.ts",
        'import { mapCart } from "@/domains/ec/mappers/cart.mapper";'
      ),
      true
    );
  });

  test("happy: import 目录名解析到 index", () => {
    assert.equal(
      isRelatedTest(
        "src/pages/editor/BottomBar.test.tsx",
        "src/components/CustomTabBar/index.tsx",
        'import CustomTabBar from "@/components/CustomTabBar";'
      ),
      true
    );
  });

  test("reverse: vi.mock 同名字符串以外的无关 import → false", () => {
    assert.equal(
      isRelatedTest(
        "src/navigation/routeKeyOf.test.ts",
        "src/editor/blocks/HeroBanner/HeroBannerItemView.tsx",
        'import { ROUTES } from "@/routes";\nimport x from "./flows";'
      ),
      false
    );
  });
});

describe("ledger · 每轮重置", () => {
  test("happy: 新 generation 清空上一轮记录", () => {
    const ledger = createLedger();
    recordTestWrite(ledger, CID, GEN_A, SAME_DIR_TEST);
    recordWaiver(ledger, CID, GEN_A);
    noteGeneration(ledger, CID, GEN_B);
    assert.deepEqual(ledger.conversations[CID], {
      generationId: GEN_B, tests: [], redTests: [], pendingTests: {}, waived: false,
      productApprovals: [], gateApprovals: [], pendingApprovals: {},
    });
  });

  test("edge: 同一测试重复记录只保留一条", () => {
    const ledger = createLedger();
    recordTestWrite(ledger, CID, GEN_A, SAME_DIR_TEST);
    recordTestWrite(ledger, CID, GEN_A, SAME_DIR_TEST);
    assert.deepEqual(ledger.conversations[CID].tests, [SAME_DIR_TEST]);
  });
});

describe("hasWaiverToken · 仅用户消息里的显式口令", () => {
  test("happy: 含口令", () => {
    assert.equal(hasWaiverToken("这轮只是删文件 #skip-test-first"), true);
  });

  test("reverse: 不含口令或只提到相近词", () => {
    assert.equal(hasWaiverToken("先改产品再补测"), false);
    assert.equal(hasWaiverToken("#skip-test"), false);
  });
});

describe("classifyShellCommand / decideShellCommand · Shell 不得绕道改产品", () => {
  test("reverse: python heredoc 改产品文件 → deny", () => {
    const cmd = `python3 <<'PY'\nfrom pathlib import Path\np = Path('src/components/CustomTabBar/index.tsx')\np.write_text('x')\nPY`;
    assert.equal(classifyShellCommand(cmd).writesProduct, true);
    const result = decideShellCommand({
      ledger: createLedger(),
      conversationId: CID,
      generationId: GEN_A,
      command: cmd,
    });
    assert.equal(result.permission, "deny");
  });

  test("reverse: git checkout 覆盖产品文件 → deny", () => {
    const cmd =
      "git checkout -- src/editor/blocks/ProductSeriesBlock/ProductSeriesBlockView.tsx";
    assert.equal(classifyShellCommand(cmd).writesProduct, true);
  });

  test("reverse: mv 产品目录 → deny", () => {
    assert.equal(
      classifyShellCommand("mv src/pages/event/list src/subpackages/event/list")
        .writesProduct,
      true
    );
  });


  test("reverse: rm/mv 产品根目录本身 → deny", () => {
    assert.equal(classifyShellCommand("rm -rf src").writesProduct, true);
    assert.equal(classifyShellCommand("mv src /tmp/src-bak").writesProduct, true);
    assert.equal(
      classifyShellCommand("rm -rf src-taro/src", REPO_CFG).writesProduct,
      true
    );
  });

  test("reverse: sed -i 带 appPackage 前缀路径 → deny", () => {
    assert.equal(
      classifyShellCommand(
        "sed -i '' 's/a/b/' src-taro/src/app.config.ts",
        REPO_CFG
      ).writesProduct,
      true
    );
  });

  test("happy: 跑测试（只读）→ allow", () => {
    const cmd =
      "yarn vitest run src/components/CustomTabBar/CustomTabBar.test.tsx 2>&1 | tail -20";
    assert.equal(classifyShellCommand(cmd).writesProduct, false);
    assert.equal(
      decideShellCommand({
        ledger: createLedger(),
        conversationId: CID,
        generationId: GEN_A,
        command: cmd,
      }).permission,
      "allow"
    );
  });

  test("happy: git diff / rg 读产品路径 → allow", () => {
    assert.equal(
      classifyShellCommand("git diff src/routes/index.ts").writesProduct,
      false
    );
    assert.equal(
      classifyShellCommand("rg -n foo src/editor > /dev/null").writesProduct,
      false
    );
  });

  test("happy: 只改测试文件 → allow", () => {
    assert.equal(
      classifyShellCommand(
        "cp /tmp/a.test.ts src/navigation/legacy.test.ts"
      ).writesProduct,
      false
    );
  });

  // 回归：真实会话中被误拦的只读命令
  test("happy: node -e 只读引用产品路径 → allow", () => {
    const cmd = `node -e "const p=require('path');console.log(p.posix.matchesGlob('src/app.config.ts','src/app.config.ts'))" 2>&1`;
    assert.equal(classifyShellCommand(cmd).writesProduct, false);
  });

  // 回归：真实会话中被误拦的冒烟命令（rm 只删 /tmp，src/ 下只有测试文件）
  test("happy: rm 临时目录 + 跑测试文件 → allow", () => {
    const cmd = [
      "H=.codex/hooks/scripts/matrix-gate",
      `echo "[skip] $(node $H/codex-pre-tool-use.mjs < /tmp/tf-smoke/skip.json)"`,
      "rm -rf /tmp/tf-smoke",
      "cd src-taro && yarn matrix:gate 2>&1 | grep -E \"^ℹ (tests|pass|fail)\"",
      "yarn vitest run src/utils/constants.staticPages.test.ts src/components/CustomTabBar/CustomTabBar.test.tsx 2>&1 | grep -E \"Test Files|Tests |Error\"",
    ].join("\n");
    const result = classifyShellCommand(cmd);
    assert.deepEqual(result.paths, []);
    assert.equal(result.writesProduct, false);
  });

  // 回归：真实会话误拦原样命令——echo 文本提到 test-exclude.json，rm 只删 /tmp，二者不在同一子命令
  test("happy: 动词与闸门路径分处不同子命令 → allow", () => {
    const cmd = [
      "H=.codex/hooks/scripts/matrix-gate",
      `P='JSON.parse(require("fs").readFileSync(0)).permission'`,
      `echo "[skip-listed app.config.ts, no test] $(node $H/codex-pre-tool-use.mjs < /tmp/tf-smoke/skip.json | node -pe "$P")"`,
      `echo "[edit test-exclude.json]             $(node $H/codex-pre-tool-use.mjs < /tmp/tf-smoke/exclude-edit.json | node -pe "$P")"`,
      "rm -rf /tmp/tf-smoke",
      "cd src-taro && yarn matrix:gate 2>&1 | grep -E \"^ℹ (tests|pass|fail)\"",
    ].join("\n");
    const result = classifyShellCommand(cmd);
    assert.equal(result.writesGateControl, false);
    assert.equal(result.writesProduct, false);
  });

  test("reverse: 同一子命令内动词+产品路径，前面有 cd 串联 → deny", () => {
    assert.equal(
      classifyShellCommand("cd src-taro && sed -i '' 's/a/b/' src/app.ts")
        .writesProduct,
      true
    );
    assert.equal(
      classifyShellCommand("echo x > src/app.config.ts").writesProduct,
      true
    );
  });

  // 回归：真实会话误拦——echo 标签文字里「提到」sed -i 与 test-exclude.json，并未执行
  test("happy: 引号内只是提到写命令 → allow", () => {
    const cmd = `echo "[shell sed -i test-exclude.json]      $(node $H/codex-pre-tool-use.mjs < /tmp/tf-smoke/shell-exclude-write.json | node -pe "$P")"`;
    const result = classifyShellCommand(cmd);
    assert.equal(result.writesGateControl, false);
    assert.equal(result.writesProduct, false);
  });

  test("reverse: 写动词在外、目标路径加引号 → deny", () => {
    assert.equal(
      classifyShellCommand(`sed -i '' 's/a/b/' "src/app.ts"`).writesProduct,
      true
    );
  });

  test("reverse: bash -c / eval 包装的写命令 → deny", () => {
    assert.equal(
      classifyShellCommand(`bash -c "sed -i '' 's/a/b/' src/app.ts"`)
        .writesProduct,
      true
    );
    assert.equal(
      classifyShellCommand(`eval "rm src/config/app.helpers.ts"`).writesProduct,
      true
    );
  });

  test("reverse: 引号内的 | 不拆段（sed 表达式含 |）→ deny", () => {
    assert.equal(
      classifyShellCommand("sed -i '' 's/a|b/c/' src/app.ts").writesProduct,
      true
    );
  });

  test("reverse: 跨行 heredoc 脚本体仍与解释器同段 → deny", () => {
    const cmd = [
      "cd src-taro",
      "python3 <<'PY'",
      "from pathlib import Path",
      "Path('src/routes/index.ts').write_text('x')",
      "PY",
      "echo done",
    ].join("\n");
    assert.equal(classifyShellCommand(cmd).writesProduct, true);
  });

  test("happy: python 只读加载产品 JSON → allow", () => {
    assert.equal(
      classifyShellCommand(
        `python3 -c "import json;print(json.load(open('src/routes/routes.json')))"`
      ).writesProduct,
      false
    );
  });

  test("reverse: node -e 用 fs 写产品文件 → deny", () => {
    assert.equal(
      classifyShellCommand(
        `node -e "require('fs').writeFileSync('src/app.config.ts','x')"`
      ).writesProduct,
      true
    );
  });

  test("reverse: python open(...,'w') 写产品文件 → deny", () => {
    assert.equal(
      classifyShellCommand(
        `python3 -c "open('src/config/app.ts','w').write('x')"`
      ).writesProduct,
      true
    );
  });

  test("reverse: Shell 改跳过清单或 vitest 配置 → deny", () => {
    for (const cmd of [
      "sed -i '' 's/a/b/' src-taro/test-exclude.json",
      "cp /tmp/x.json test-exclude.json",
      "sed -i '' 's/a/b/' vitest.config.mts",
    ]) {
      assert.equal(
        classifyShellCommand(cmd, REPO_CFG).writesGateControl,
        true,
        cmd
      );
      assert.equal(
        decideShellCommand({
          ledger: createLedger(),
          conversationId: CID,
          generationId: GEN_A,
          command: cmd,
          config: REPO_CFG,
        }).permission,
        "deny",
        cmd
      );
    }
  });

  test("happy: 只读查看跳过清单 → allow", () => {
    assert.equal(
      classifyShellCommand("cat src-taro/test-exclude.json", REPO_CFG)
        .writesGateControl,
      false
    );
  });

  test("reverse: 用户本轮 #skip-test-first 也不能让 Shell 改产品 → deny", () => {
    const ledger = createLedger();
    recordWaiver(ledger, CID, GEN_A);
    assert.equal(
      decideShellCommand({
        ledger,
        conversationId: CID,
        generationId: GEN_A,
        command: "mv src/pages/players src/subpackages/players",
      }).permission,
      "deny"
    );
  });
});

describe("P0 · 成功落盘后才形成 Test First evidence", () => {
  const product = "src/foo.ts";
  const testRel = "src/foo.test.ts";
  const view = (content) => ({
    fileExists: (rel) => rel === testRel,
    readFile: (rel) => rel === testRel ? content : "",
  });

  test("reverse: preToolUse pending 本身不能解锁产品", () => {
    const ledger = createLedger();
    recordPendingTestWrite(ledger, CID, GEN_A, "tool-1", testRel, true, "old");
    assert.equal(decideProductWrite({ ledger, conversationId: CID, generationId: GEN_A, productRel: product, ...view("old") }).permission, "deny");
  });

  test("reverse: 成功调用但内容 no-op 仍不能解锁", () => {
    const ledger = createLedger();
    recordPendingTestWrite(ledger, CID, GEN_A, "tool-1", testRel, true, "same");
    assert.equal(finalizeTestWrite(ledger, CID, GEN_A, "tool-1", testRel, true, "same"), false);
    assert.equal(decideProductWrite({ ledger, conversationId: CID, generationId: GEN_A, productRel: product, ...view("same") }).permission, "deny");
  });

  test("happy: 内容真实变化后才解锁", () => {
    const ledger = createLedger();
    recordPendingTestWrite(ledger, CID, GEN_A, "tool-1", testRel, true, "old");
    assert.equal(finalizeTestWrite(ledger, CID, GEN_A, "tool-1", testRel, true, "new"), true);
    const r = decideProductWrite({ ledger, conversationId: CID, generationId: GEN_A, productRel: product, ...view("new") });
    assert.equal(r.permission, "allow");
    assert.equal(r.reason, "related-test-write");
  });
});

describe("P1 · 已有代表性测试 RED 可作为顺序证据", () => {
  test("happy: 已有测试跑出 RED，不要求无意义 touch 测试", () => {
    const ledger = createLedger();
    const testRel = "src/foo.test.ts";
    recordRedTest(ledger, CID, GEN_A, testRel);
    const r = decideProductWrite({
      ledger, conversationId: CID, generationId: GEN_A, productRel: "src/foo.ts",
      ...fakeFs({ [testRel]: "test('expected',()=>{})" }),
    });
    assert.equal(r.permission, "allow");
    assert.equal(r.reason, "existing-test-red");
  });

  test("reverse: RED 测试与产品无关时不能解锁", () => {
    const ledger = createLedger();
    recordRedTest(ledger, CID, GEN_A, OTHER_DIR_TEST);
    assert.equal(decideProductWrite({
      ledger, conversationId: CID, generationId: GEN_A, productRel: PRODUCT,
      ...fakeFs({ [OTHER_DIR_TEST]: 'import x from "./unrelated"' }),
    }).permission, "deny");
  });

  test("happy: 产品授权握手的新 generation 可显式继承 Test First evidence", () => {
    const ledger = createLedger();
    recordTestWrite(ledger, CID, GEN_A, SAME_DIR_TEST);
    noteGeneration(ledger, CID, GEN_B, { carryTestEvidence: true });
    assert.equal(decideProductWrite({
      ledger, conversationId: CID, generationId: GEN_B, productRel: PRODUCT,
      ...fakeFs({ [SAME_DIR_TEST]: "" }),
    }).permission, "allow");
  });

  test("happy: tddEnforcement=false 是仓库级明确关闭顺序闸", () => {
    const r = decideProductWrite({
      ledger: createLedger(), conversationId: CID, generationId: GEN_A, productRel: PRODUCT,
      tddEnforcement: false, ...fakeFs({}),
    });
    assert.equal(r.permission, "allow");
    assert.equal(r.reason, "tdd-enforcement-disabled");
  });
});

describe("P0 · 一次性精确写入授权", () => {
  test("产品与闸门 token 分离，并保留精确路径", () => {
    const prompt = `${PRODUCT_APPROVAL_TOKEN} src/foo.ts
${GATE_APPROVAL_TOKEN} \`.codex/hooks.json\``;
    assert.deepEqual(parseApprovalPaths(prompt, PRODUCT_APPROVAL_TOKEN), ["src/foo.ts"]);
    assert.deepEqual(parseApprovalPaths(prompt, GATE_APPROVAL_TOKEN), [".codex/hooks.json"]);
  });

  test("一次授权只允许一个成功工具调用；成功后被消费", () => {
    const ledger = createLedger();
    recordApprovalsFromPrompt(ledger, CID, GEN_A, `${PRODUCT_APPROVAL_TOKEN} src/foo.ts`);
    assert.equal(hasAvailableApproval(ledger, CID, GEN_A, "product", "src/foo.ts"), true);
    assert.equal(reserveApproval(ledger, CID, GEN_A, "tool-1", "product", "src/foo.ts"), true);
    assert.equal(hasAvailableApproval(ledger, CID, GEN_A, "product", "src/foo.ts"), false);
    assert.equal(consumeApproval(ledger, CID, GEN_A, "tool-1"), true);
    assert.equal(hasAvailableApproval(ledger, CID, GEN_A, "product", "src/foo.ts"), false);
  });

  test("reverse: 授权 A 路径不能写 B 路径", () => {
    const ledger = createLedger();
    recordApprovalsFromPrompt(ledger, CID, GEN_A, `${PRODUCT_APPROVAL_TOKEN} src/a.ts`);
    assert.equal(hasAvailableApproval(ledger, CID, GEN_A, "product", "src/b.ts"), false);
  });

  test("Codex: no-op / 失败式无变化不会消费授权", () => {
    const ledger = createLedger();
    recordApprovalsFromPrompt(ledger, CID, GEN_A, `${PRODUCT_APPROVAL_TOKEN} src/a.ts`);
    assert.equal(reserveApproval(ledger, CID, GEN_A, "tool-1", "product", "src/a.ts", true, "before"), true);
    assert.equal(finalizeApprovalWrite(ledger, CID, GEN_A, "tool-1", true, "before"), false);
    assert.equal(hasAvailableApproval(ledger, CID, GEN_A, "product", "src/a.ts"), true);
  });

  test("Codex: 文件真实变化后才消费一次授权", () => {
    const ledger = createLedger();
    recordApprovalsFromPrompt(ledger, CID, GEN_A, `${PRODUCT_APPROVAL_TOKEN} src/a.ts`);
    assert.equal(reserveApproval(ledger, CID, GEN_A, "tool-1", "product", "src/a.ts", true, "before"), true);
    assert.equal(finalizeApprovalWrite(ledger, CID, GEN_A, "tool-1", true, "after"), true);
    assert.equal(hasAvailableApproval(ledger, CID, GEN_A, "product", "src/a.ts"), false);
  });
});

describe("P0 · Shell 不得直接伪造 Hook 台账事件", () => {
  test("reverse: 直接执行 codex-user-prompt-submit / codex-post-tool-use → deny", () => {
    for (const cmd of [
      "node .codex/hooks/scripts/matrix-gate/codex-user-prompt-submit.mjs",
      "node .codex/hooks/scripts/matrix-gate/codex-post-tool-use.mjs",
      "./.codex/hooks/scripts/matrix-gate/codex-pre-tool-use.mjs",
    ]) {
      const r = decideShellCommand({ command: cmd, config: REPO_CFG });
      assert.equal(r.permission, "deny", cmd);
      assert.equal(r.reason, "shell-gate-mutator-exec", cmd);
    }
  });

  test("reverse: node -e import ledger-store 也 deny", () => {
    const cmd = `node -e "import('./.codex/hooks/scripts/matrix-gate/ledger-store.mjs').then(()=>{})"`;
    assert.equal(decideShellCommand({ command: cmd, config: REPO_CFG }).permission, "deny");
  });

  test("happy: cat 只读查看 Hook 源码仍 allow，自测入口也 allow", () => {
    assert.equal(decideShellCommand({ command: "cat .codex/hooks/scripts/matrix-gate/codex-user-prompt-submit.mjs", config: REPO_CFG }).permission, "allow");
    assert.equal(decideShellCommand({ command: "node .codex/hooks/scripts/check-test-matrix-gate.mjs", config: REPO_CFG }).permission, "allow");
  });
});
