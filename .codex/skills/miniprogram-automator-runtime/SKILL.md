---
name: miniprogram-automator-runtime
description: '微信小程序端上自动化默认通道：使用 miniprogram-automator / 9420 获取 page_stack、page_data、真实交互和小程序运行时 wx.request 证据。'
---

# Mini Program Automator Runtime

本 skill 是小程序端上自动化的实施细节唯一来源。`dispatch-task/references/mini-program-runtime-qa.md`
只定义何时必须验收、证据字段和 Completion Gate；涉及真实入口、滚动、selector 作用域、截图和
automator API 的执行方法，以本文件为准。

## 1. 定位

本 skill 是本项目微信小程序端上自动化的默认通道。默认执行模式固定为：

```text
npm run dev:mp-weixin:local-functions:lan -> dist/dev/mp-weixin -> 9420 automator -> miniprogram-automator -> page / wx.request evidence
```

微信开发者工具仍是运行载体；项目规则不再使用额外自动化抽象层作为默认路径，也不再要求先走其他工具层、失败后再改用 automator。

如果本轮代码未部署到云端，端上验收必须先成功跑通完整 LAN 本地函数 flow：

```bash
npm run dev:mp-weixin:local-functions:lan
```

只有该命令完成本地 CloudBase 函数 gateway readiness、函数 health route readiness、合同要求的关键探针，并进入 `dist/dev/mp-weixin` watch 状态后，后续 `9420` / `miniprogram-automator` / `wx.request` 证据才可作为本轮端上验收。只启动 scoped gateway、只用 Node/curl 请求、只看 gateway health 或单函数 health，均只能作为排障证据，不得作为验收通过。

## 2. 适用触发

当任务需要以下任一端上证据时使用：

1. 小程序页面点选、输入、跳转、弹窗或组件状态。
2. Figma/UI 对齐的真实页面状态或截图。
3. 需要证明小程序运行时发出的 `wx.request`、本地函数代理或数据链路请求。
4. 需要区分工具/登录/配置 blocker 与产品行为 failure。

dispatch-task flow 中，真实 automator 脚本必须先通过
`.codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs qa-run` 选择
`test/e2e/automator/catalog.json` 中的精确叶子，并校验 automation id policy、脚本 hash、
execution id 与 qa-run execution record。直接执行 `node test/e2e/automator/...` 只能作为排障，不能作为端上验收通过证据；排障结果不能写入 automator_required 的 `runtime-qa-evidence.json`。

main 进入 live `qa-run` 时，还必须传入已观察到的 target `projectPath` 和只读 `wx.request` probe URL。qa-run 会在叶子脚本前保存 project/LAN/9420/WS/page data/截图/`wx.request` preflight；它会冻结脚本 hash、串行锁定 9420，并把每次 live execution 收口为 `passed`、`failed_environment`、`failed_product`、`failed_script` 或 `aborted`。实现者只能运行 deterministic dry-run，不能把 qa-run 的 live 路径当作实现阶段验证。

preflight 的 `connect`、`currentPage`、`page.data`、`screenshot`、每次 runtime `evaluate` 与 `disconnect` 都必须有独立 deadline，并将 step、code、timeout 与耗时写入 execution evidence；整个 capture 也必须有总 deadline。超时后的 `disconnect` 仍要在独立有界 deadline 内执行，不能因一个挂起 RPC 遗留 automator session。已证明为唯一 target 项目的前提下，只有截图或 transport timeout 才可触发一次 target-only recovery；其他 preflight failure 直接终态化。叶子脚本若输出结构化 JSON report，qa-run 必须保存 raw report artifact：断言/产品 failure 归 `failed_product`，transport/RPC/timeout 归 `failed_environment`，malformed report 归 `failed_script`。

已终态的失败记录若因旧分类规则归因错误，只能使用 `qa-reconcile --dispatch-run-id=<id> --execution-id=<id>` 从既有 `raw_report_ref` 重算失败类型。该动作必须保留 prior status/classification history，只更新 failure classification metadata；不得把记录变为 passed，也不得重置 frozen hash 或 live-attempt budget。

## 3. projectPath 合同

端上自动化使用的 `projectPath` 必须指向“本轮实际编译并准备验收的小程序工作区”下的 `dist/dev/mp-weixin`，不得脱离本轮代码来源单独指定其他目录。

默认规则：

```text
/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
```

Web/云端 external implementer 特例：

1. 当实现阶段由 Web/云端 external implementer 完成，且 acceptance 要求 `miniprogram-automator` 端上测试时，`projectPath` 不得继续指向主工作区。
2. 此时必须使用 handoff / QA Contract 中 `external_contract.remote_sync.planned_worktree_path` 对应的独立 worktree。
3. 实际 `projectPath` 必须是：

```text
<planned_worktree_path>/dist/dev/mp-weixin
```

4. `npm run dev:mp-weixin:local-functions:lan`、微信开发者工具加载目录、`9420`、`miniprogram-automator`、截图和 `wx.request` 证据必须全部命中这个 worktree，不得混用主工作区产物。

`dist/build/mp-weixin` 只用于构建、CI、上传、预览类检查，不得作为端上 automator `projectPath`。

## 4. 标准检查顺序

默认先复用当前活跃的微信开发者工具进程，不能先执行 `cli open`、`cli quit` 或无条件 `cli auto`。所有检查里的 `projectPath` 都指本轮 Contract 允许的有效路径。

必须先判定项目，再判定端口：

1. 先读取当前活跃 DevTools 进程的 PID、IDE 控制端口和当前加载项目路径，确认当前项目是否为本轮目标项目（以 Contract 的 expected `projectPath` 为准）。常规证据为同一 `9420` listener 祖先链的 `--project` / 已打开的 `project.config.json`。若二者均不可得，只能读取该 main 进程 `--user-data-dir` 下 `WeappLog/logs/*-<--app-session-id>.log`：同一 session 的近期 `AUTO` 必须精确为 port `9420` 和目标路径，且同 session 的近期 `FileUtils` 也必须精确为目标路径；记录 source、相对文件名和每条记录时间。session id、端口、路径不符或过期日志一律拒绝。项目路径仍未知时不得猜测，先阻断并保留原进程。
2. 当前项目是目标项目时：已监听 `9420` 就直接连接；未监听 `9420` 或监听其他端口，就复用同一 DevTools 进程，通过现有 IDE 控制通道切换/启用 `9420`。切换前后必须核对 PID 和项目路径未变，分别记录 `reused_existing_devtools_process` 或 `reused_process_reconfigured_port_9420`。
3. 当前项目不是目标项目时，保留原项目进程，另开目标项目 DevTools 进程，记录 `opened_new_devtools_process` 及原因。
4. 没有活跃 DevTools 进程时，才允许首次打开目标项目并启用 `9420`。

完成上述项目和端口判定后，才执行：

```bash
npm run dev:mp-weixin:local-functions:lan
lsof -nP -iTCP:9420 -sTCP:LISTEN
ps aux | rg -i 'wechatwebdevtools|9420|miniprogram-automator|automator'
ls -la <projectPath>/project.config.json
```

只有 `9420` 监听、原始 WebSocket 可握手，并且 `miniprogram-automator` 能连接当前项目，才算 automator ready。`9222` / CDP、截图存在、工具 status success 都只能作为环境信息，不能替代端上验收。

## 5. 受控拉起

默认禁止为了“干净基线”执行 `pkill`、完整重启、全量清缓存或清登录态。

`cli auto` 只有在已证明同一目标项目进程会被复用时才可使用；`--port` 是 IDE 控制端口，不是 automator `9420`。不得虚构或传入 `--auto-port`。若当前目标项目的截图 RPC 失效，只有先从 `9420` listener 的进程祖先链证明 main DevTools PID、真实 `--remote-port` 控制端口和唯一目标 projectPath，才可按 `close -> open -> auto` 对同一 `--project` 做一次受控恢复；唯一目标路径可使用上述严格同 session WeappLog 证明，不能使用任意历史日志。前后必须记录 main PID、9420 listener PID、控制端口、projectPath、身份证据 source / file / timestamp、每次 CLI 调用及截图 / `wx.request` 重试结果。未证明 runtime 已重启时必须以 `devtools_automator_blocker` 失败，不得把单独 `cli auto` 记为重启。

只有用户明确同意，或已经证明没有可复用目标项目进程且 required item 必须端上执行时，才允许用 CLI 拉起 automator：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project <projectPath> \
  --port <verifiedDevToolsControlPort> \
  --trust-project
```

新开进程必须记录原因、副作用、登录态 / 授权态风险和 raw error；复用进程改端口必须记录改动前后的 PID、项目路径、9420 listener、真实控制端口和控制通道证据。无法证明同一进程时不得把结果标记为 reused。

## 6. 原始 WebSocket 探活

```js
const WebSocket = require('ws')
const ws = new WebSocket('ws://127.0.0.1:9420')
ws.on('open', () => {
  console.log('WS_OPEN')
  ws.close()
})
ws.on('close', code => console.log('WS_CLOSE:' + code))
ws.on('error', err => {
  console.error(err.message)
  process.exit(1)
})
```

`WS_OPEN` 只证明 automator transport 可达；通过验收还必须继续执行 page / selector / `wx.request` 断言。

## 7. miniprogram-automator 连接

```js
const automator = require('miniprogram-automator')

;(async () => {
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  const currentPage = await miniProgram.currentPage()
  const systemInfo = await miniProgram.systemInfo()
  console.log({ path: currentPage?.path, systemInfo })
  await miniProgram.disconnect()
})()
```

可继续执行的端上动作包括：

1. `miniProgram.callWxMethod('setStorageSync', key, value)`
2. `miniProgram.reLaunch('/pages/...?...')`
3. `miniProgram.currentPage()`
4. `miniProgram.screenshot({ path })`
5. `page.$(selector)` / `page.$$(selector)`
6. `element.text()` / `element.attribute(name)` / `element.tap()`
7. `page.data(path?)` / `page.setData(data)` / `page.callMethod(method, ...args)`
8. `miniProgram.evaluate` 只用于在 runtime 内创建 `wx.request` 状态槽、启动请求、轮询槽和清理槽；不得依赖 App.callFunction await `Promise(resolve => wx.request(...))`，该调用可能直接返回 `null`。三个回调必须是保守 ES5 `function (...) {}`，slot/url 分开传参，禁止解构、展开、箭头、可选链、空值合并、`const` 与 `let`；轮询必须有界，并记录 statusCode / error / timeout / cleanup。

接口验收必须在小程序运行时用 `wx.request` 发起，Node 直接 HTTP、curl、local gateway smoke 只能作为后端 smoke。

本地函数代理、LAN direct HTTP 或 gateway health 的排障规则读取 `references/local-smoke-test-and-lan-direct-connection-policy.md`。这些 smoke 证据只能辅助归因，不能替代小程序运行时 `wx.request` 验收。

### 7.1 真实入口与滚动硬规则

1. acceptance 包含入口、跳转或完整用户流程时，必须从用户入口所在页面开始：只允许 `reLaunch` 入口页，随后定位入口、滚动到可操作位置、真实 `tap()`，并断言跳转后的 `currentPage().path`。直接 `reLaunch` 目标页只能用于页面内排障，不能作为入口或完整流程通过证据。
2. 元素存在但不在当前视口时，不得跳过点击、改用直达路由或 `setData` 推进状态。普通页面先读取 `element.offset()`，再用 `miniProgram.pageScrollTo()`；`scroll-view` 内元素使用对应 `ScrollViewElement.scrollTo(x, y)`，滚动后再 `tap()`。
3. 超过一屏的列表必须形成真实滚动证据：记录 `scrollView.size().height`、`scrollHeight()`，执行 `scrollTo()` 后断言 `property('scrollTop') > 0`。当前 fixture 未形成溢出时，应使用合同允许的真实查询或 fixture 产生超屏数据，不得以“当前看起来能显示”为由跳过滚动验收。
4. 完整流程至少记录 `入口页 -> 入口点击 -> 各步骤真实按钮 -> 结果/完成 -> 返回页`。若 acceptance 涉及缓存或二次访问，还必须从入口页再次点击进入，不能复用目标页直达。
5. `screenshot()` 超时、截图窗口未激活或视觉证据暂不可用，不授权跳过入口点击、滚动或按钮交互；交互链仍须继续执行。若合同要求截图，视觉证据单独保持未通过，不能用直达路由伪装完成。

## 8. 元素定位

如要精确定位需要模拟交互的元素，先读取 `docs/ai-rules/frontend-automation-id-policy.md` 第三点“元素 id 映射（按页面 / 模块 / 功能）”，并只读取本轮目标页面或模块对应子表。

优先使用稳定 id，例如：

```text
feature-action-button-{entityId}
```

UniApp 编译产物可能把稳定 id 渲染为 `xxxx--stable-id`。自动化 helper 必须先支持 exact stable id，再支持 scoped id 的 stable 部分匹配；动态 ID 例如 `feature-action-{entityId}` 必须提取 stable id 后再做 prefix/suffix 断言。

自定义组件内的稳定 id 必须先进入组件作用域定位，例如 `const component = await page.$('feature-panel')` 后再执行 `component.$('#stable-id')`。若编译后 id 已带作用域前缀，使用组件内的 `[id*="stable-id"]` 部分匹配；不得因为 `page.$('#stable-id')` 返回 `null` 就认定按钮不存在、跳过交互或改走目标页直达。

不得把中文文案、截图坐标或页面层级作为首选定位方式。

## 9. 失败归因

输出时必须显式区分：

```text
devtools_automator_blocker
devtools_auth_blocker
devtools_configuration_blocker
product_blocker
recovered
not_verified
```

常见归因：

1. `9420` 无监听、WebSocket 无法握手、CLI auto timeout：`devtools_automator_blocker`。
2. `INVALID_TOKEN` / `需要重新登录`：`devtools_auth_blocker`。
3. `projectPath` 不符合本轮 Contract 允许的工作区产物：
   - 普通本地任务应为主工作区 `dist/dev/mp-weixin`
   - Web/云端 external implementer + automator 验收应为 `<planned_worktree_path>/dist/dev/mp-weixin`
     以上任一不满足都归类为 `devtools_configuration_blocker`。
4. automator 已通且 Test Contract required item 失败：按实际断言归为 `product_blocker`。

## 10. 输出建议

```text
Mini Program Automator Runtime Result
- projectPath:
- automator_port_9420:
- wsEndpoint:
- launch_mode: reused / cli_auto / not_started
- pagePath:
- operation_chain:
- runtime_request:
- assertions:
- evidence:
- classification:
- next_action:
```

## 11. 本地 LAN smoke 证据规则

当验收使用本地 HTTP smoke 或 LAN direct HTTP 时，必须读取 `references/local-smoke-test-and-lan-direct-connection-policy.md`。缺少环境/终端头导致的会话未持久化，不得误判为产品 blocker。
