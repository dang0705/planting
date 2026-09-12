---
name: mp-e2e-leaf-authoring
description: >-
  MANDATORY for all compiled mini-program E2E automator testing.
  USE WHEN viewing, creating, editing, reviewing, running, or debugging ANY of:
  1) Test leaves and scripts matching {e2eRoot}/leaves/**/*.mjs, qa-e2e/**, qa/e2e/**;
  2) Leaf files named *.leaf.mjs, catalog-leaf*.mjs, native-script-leaf.mjs, live-runtime-proof.mjs;
  3) Manifest and config files: suite.manifest.json, .mp-e2e.json, mp-e2e.contract.json;
  4) E2E runtime files: run.mjs, verify-base.mjs, init-e2e-dir.mjs, babolat-adapter.mjs;
  5) Running or writing E2E tests with: miniprogram-e2e, miniprogram-automator, automator 9420, wechatide;
  6) Prompts mentioning: e2e, 端到端, 小程序自动化, miniprogram-automator, automator, 真机测试, 真实页栈, 9420, 端上验收, 目录初始化, /mp-e2e-leaf-authoring, @mp-e2e-leaf-authoring.
  DO NOT USE for *.test.ts(x) or non-E2E unit/component/integration tests (use test-matrix-authoring instead).
---

# Babolat Mini Program E2E Leaf Authoring

写叶子前先解析布局，不要在对话或文档里写死 `src-taro/qa/e2e`。

**分层只认仓库根 `AGENTS.md` → Test layering。** 本文件只写 e2e 叶子怎么写。选到 mapper / jsdom / mock `Taro.*` → 停，改走 `test-matrix-authoring`。不要用 Vitest 或 Node `fetch` 冒充端上验收。

连接、9420、sidecar、探活由 adapter session 负责；不要新开 Jest / `automator.launch`。

微信端上通道的通用约束见本机 `miniprogram-automator-runtime`。本仓 `projectPath` 用布局里的 `artifact`（Taro 产物 `dist/`），不是 `dist/dev/mp-weixin`。探索性点选可用 `wechatide-skill/skills/automator`，验收叶子仍写回本套件。

官方 SDK：<https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/>

细则：[wechat-gotchas.md](wechat-gotchas.md)、[examples.md](examples.md)。

## 怎么触发（不要当成运行时 argv）

Cursor **不会**把 `/mp-e2e-leaf-authoring src-taro` 自动拆成 skill 的正式参数。能生效的只有：

| 说法 | 实际会发生什么 |
| --- | --- |
| `/mp-e2e-leaf-authoring` 或 `/mp-e2e-leaf-authoring <目录>` | 走 `.cursor/commands/mp-e2e-leaf-authoring.md`，agent 必须跑 init 脚本；`<目录>` 靠 agent 从消息里读，不是 CLI 注入 |
| `@mp-e2e-leaf-authoring` / 手动附加本 skill | 正文进上下文；用户再说「目录初始化」或给目录时再跑脚本 |
| 只写「写一条 e2e」且 skill 被描述命中 | 先 `read-e2e-layout`；没有 `.mp-e2e.json` 再 init |

自然语言能生效的前提是：**这条 skill/command 已经在本轮上下文里，并且 agent 真的执行了脚本**。没有附加、没有 slash command、模型也没按 description 拉起 skill 时，说一句不会自己改路径。

## 目录初始化 `<目录>`

路径由本 skill 决定，不由调用方口授。

1. `<目录>` 省略时 = 当前 git 根（没有 git 再用 cwd）。
2. 先读 `<目录>/.mp-e2e.json`。已存在且未要求重算则直接用。
3. 执行（即使已有 `.mp-e2e.json` 也要跑：补齐缺失的基座文件，不只建空目录）：

```bash
node .cursor/skills/mp-e2e-leaf-authoring/scripts/init-e2e-dir.mjs [<目录>]
```

脚本只从 `scaffold/qa-e2e/` 写入 `{e2eRoot}`（run / adapter / contract / 平台叶子 / native-script）。不拷 CLI 包、不拷 uni-app 夹具、不改 `package.json`。已有文件默认跳过；覆盖加 `--force`。

重算布局加 `--force`。读已有布局：

```bash
node .cursor/skills/mp-e2e-leaf-authoring/scripts/read-e2e-layout.mjs
```

4. **决定规则**（相对 `<目录>`，先命中先用）：
   - 已有 `qa/e2e` 套件 → `e2eRoot=qa/e2e`，`packageRoot=.`
   - 已有 `src-taro/qa/e2e` 套件 → `e2eRoot=src-taro/qa/e2e`，`packageRoot=src-taro`
   - `<目录>/package.json` 是 Taro 包 → `e2eRoot=qa/e2e`
   - `<目录>/src-taro/package.json` 是 Taro 包 → `e2eRoot=src-taro/qa/e2e`
   - 否则新建 `qa/e2e`
5. 之后只使用 JSON 字段：`e2eRoot`、`leaves`、`suite`、`adapter`、`artifact`、`packageRoot`、`cli`。叶子写到 `{e2eRoot}/leaves/`。
6. 未初始化就写叶子 → 先跑本节，不要猜路径。

## 何时用哪种叶子

| 场景 | 写法 |
| --- | --- |
| 新业务流（默认） | `defineLeaf` 默认导出，逻辑写在叶子里 |
| 已有独立 Node 场景脚本 | `native-script-leaf.mjs` + `config.script` |
| 只想确认底座 | 不要改 `platform.live_runtime_proof` |

## 落盘清单

1. `{e2eRoot}/leaves/<name>.mjs`：`id` 必须匹配 `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`
2. 在 `{e2eRoot}/suite.manifest.json` 登记同一 `id` 与相对 `module`
3. 默认 `dataMode: live_real`；只有显式诊断夹具才用 `fixture_diagnostic` 并声明 `fixtures`
4. `cd {packageRoot} && yarn e2e:doctor`，再 `yarn e2e:run -- --leaf <id>`

叶子超过 300 行就拆 helper，不要把选择器字典堆进 SKILL。

## 叶子里能用 / 不能用

**能用**（session 已 `ready`）：

- `session.miniProgram`：`currentPage`、`pageStack`、`reLaunch` / `navigateTo` / `redirectTo` / `switchTab` / `navigateBack`
- `page.waitFor`、`$` / `$$`、`data`、`screenshotPage(session.miniProgram, path)`
- `session.runtimeHttpClient.request` 或 `evaluate` 发 **小程序内** `wx.request`
- 证据写到 `evidenceDir`

**不能用**：

- `automator.launch` / `miniProgram.close()` / `cli quit`（会动日常 DevTools）
- Node `fetch` / `curl` 当端上验收
- 用 `setData` 或直达 `reLaunch` 目标页冒充「从入口走进去」
- `page.waitFor` 条件函数永远返回 `true`
- 中文文案、截图坐标当首选定位

## 微信侧硬规则（写叶子必守）

1. **等真实条件，少 sleep**  
   `waitFor(selector)` → `waitFor(async () => 条件)` → 很短的毫秒兜底。见官方 `page.waitFor`。

2. **自定义组件要进作用域**  
   官方：`page.$` / `page.$$` **选不到组件内部**。先 `page.$(host)`，再 `host.$('#stable-id')`。本仓还有 Taro 作用域 id（`xxxx--stable-id`），exact 失败再用 `[id*="stable-id"]`。NutUI / 业务组件同样处理。

3. **跳转后换 page 句柄**  
   `navigate*` / `tap` 之后必须 `page = await miniProgram.currentPage()`，旧 `page` 不能继续 `$`。

4. **路由 API 配对**  
   tab 页只用 `switchTab`；非 tab 用 `navigateTo` / `redirectTo`。验收完整入口流：只 `reLaunch` **入口页**，再真实 `tap`，用 `currentPage().path` 断言。路径必须以 `/` 开头。

5. **先滚进视口再点**  
   普通页：`offset()` + `miniProgram.pageScrollTo`。`scroll-view`：`scrollTo`，再断言 `scrollTop`。超一屏列表要有滚动证据。

6. **读值分清 API**  
   原生 input/textarea：`value()` 或 `property('value')`。组件实例：`element.data()`。`attribute` 只给标签字符串。

7. **`evaluate` / `mockWxMethod` 回调必须是保守 ES5**  
   `function () {}`，禁止箭头、解构、可选链、`const`/`let`。参数分开传，不要闭包外层变量。`mockWxMethod` 结束要 `restoreWxMethod`。接口证据必须是运行时 `wx.request`，不是 Node HTTP。

8. **截图失败不改写交互链**  
   用 `screenshotPage`；模拟器截图超时不能改成直达路由。截图只证明渲染，不代替 tap / path 断言。

9. **失败要分类**  
   环境（无 9420、RPC 超时）不要包装成产品失败。叶子抛错时带稳定 `code`；产品断言失败用 `status: 'failed'` 或抛 `mp_e2e_product_leaf_failed`。

## 选择器优先级

1. 稳定 `id`（业务里显式加上，编译后允许 scoped 匹配）
2. 语义 class / 角色，且不随 Tailwind 工具类漂移
3. 最后才是文案或结构层级

不要用 `page.$('nut-button')` 这类 npm 组件标签当唯一手段；官方选择器也不保证能选 npm 自定义组件名。

## 断言与返回值

```js
return {
  status: 'passed',
  assertions: [{ name: 'home_opened', passed: true, evidence: { path } }]
}
```

`status` 不是 `passed` 时 runner 记业务失败。每个 assertion 的 `name` 用英文蛇形，证据只放 path / id / 数量 / 截图路径，不要塞整页 data。
