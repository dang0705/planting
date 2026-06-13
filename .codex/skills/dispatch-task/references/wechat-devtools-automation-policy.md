# 端上 automator 自动化职责分配

## 定位

本文件定义微信小程序端上 `miniprogram-automator` / `9420` 自动化在 main agent、implementer、QA 之间的职责边界，避免同一轮任务中重复跑三次自动化导致 token 和时间消耗失控。

微信开发者工具仍是运行载体；项目默认测试模式只有一个：`dist/dev/mp-weixin -> 9420 automator -> miniprogram-automator -> page / wx.request evidence`。不得写成其他工具层优先或 fallback 路径。

## 单一责任原则

同一个验收目标不得由 main agent、implementer、QA 重复完整执行。

默认分工：

| 角色 | 是否直接执行端上 automator | 责任 |
|---|---|---|
| main agent | 默认不执行 | 制定 Test Contract，指定 automation_owner，消费证据，判断 completion |
| implementer | 只做最小自测 | 提交 QA 前确认页面可打开、主交互可用、无明显运行时报错 |
| qa_reviewer | 负责正式验收 | 按 Test Contract 执行端上自动化、UI/Figma 验收和失败归因 |

## main agent 边界

main agent 不应直接执行端上 automator 自动化，除非没有可用 QA 线程、用户明确要求，或只读取已有证据。

main agent 应输出：

```text
Automation Ownership:
- automation_required: yes / no
- owner: implementer_self_check / qa_reviewer / none
- implementer_self_check_scope:
- qa_required_scope:
- duplicate_automation_forbidden: true
```

## implementer 自测

当 implementer packet 包含 Figma Design Facts Lite、Figma Drilldown Request 或 UI implementation required 时，implementer 必须做最小 UI / 交互自测。

范围限制：

1. 目标页面能打开。
2. 主组件能渲染。
3. 一条关键交互路径可用。
4. 无明显 runtime error。
5. 不执行完整 Test Contract。
6. 不执行完整 QA Visual Baseline 对齐。
7. 不替代 QA。

如果 QA 已经在同一轮完成正式自动化，implementer 不应重复跑相同自动化。

## QA 自动化

QA 是正式自动化验收 owner。

以下情况 QA 必须执行端上 `miniprogram-automator` / `9420` 验证：

1. 验收标准要求小程序实际交互。
2. 需要点选、输入、按钮状态、控件状态、class、marker、selected state。
3. 用户路径或端上 UI 行为是 required acceptance item。
4. UI/Figma 对齐需要真实截图或端上状态。
5. request changes 明确要求端上行为。

判断依据是验收标准和 Test Contract，不是是否存在 UI diff。

以下任务即使没有 UI diff，也必须要求 QA 执行小程序运行时验证：

1. `/diagnosis/question/start`。
2. `/diagnosis/answer`。
3. question package / fixed question package / package answer submit。
4. 诊断小程序请求路径、诊断页面入口、端上 `wx.request` 链路。
5. CloudBase SQL repository / schema / seed。

合格证据必须来自小程序运行时的 `wx.request` 或真实端上交互。Node 直接 HTTP、curl、云函数本地 invoke 只能作为后端 smoke，不能替代端上 QA。

QA Contract 必须包含 concrete `endpoint`、`page`、`projectPath`、`payload`、`assertions`、`evidence_source`；缺少任一核心字段时，QA 应退回 `contract_blocker`。

本项目端上 automator 的 `projectPath` 必须固定为：

```text
/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
```

`dist/build/mp-weixin` 不得作为端上自动化项目路径；若 Test Contract 写成该路径，QA 必须退回 `contract_blocker`，不得按该路径继续验收。

QA 端上自动化前置链必须固定为：

```text
projectPath 校验为 /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
9420 automator 监听
原始 WebSocket 可握手
miniprogram-automator currentPage / page_data / selector 或 evaluate(wx.request)
真实交互 / 运行时接口断言
```

`9222` CDP、`/json/version`、截图存在或工具 status success 只能作为辅助环境信息，不能作为 automator ready 或端上通过证据。

QA 不得为了“干净基线”默认执行全量清缓存、`pkill`、完整重启、清登录态或清项目授权态。除非用户明确授权，否则必须保护 DevTools 登录态、项目授权态和扫码状态，避免触发重新扫码。确需清理时必须记录原因，并优先使用最小范围的编译缓存清理。

QA 默认路径是复用现有 IDE / `9420` 会话并做原始 WebSocket / automator 验证；只有用户明确同意重启，或已证明无可复用会话且任务必须拉起时，才允许 open / CLI auto / 必要重启，并记录副作用。

诊断流自动化必须先按 `docs/ai-rules/frontend-automation-id-policy.md` 第三点“诊断流 id 映射”定位，例如 `diagnose-entry-button-{plant.id}`。不得依赖中文文案、坐标或页面层级作为首选定位方式。

如果本轮代码未部署到云端，QA 必须通过 local functions gateway 让小程序运行时命中新代码。若 `9420` / `miniprogram-automator` 无法执行 required item，只能输出 blocker / not_verified，不得标记 complete。

## miniprogram-automator 验收

端上验证证据必须来自真实小程序运行时，而不是 Node 直接请求后端：

1. 若依赖不存在，先安装项目 dev dependency：`npm install --save-dev miniprogram-automator@0.12.1 --legacy-peer-deps`。
2. 优先连接已开启 automation 的 DevTools WebSocket：`ws://127.0.0.1:9420`。
3. 若连接失败，只有在用户明确同意或已证明无可复用会话且任务必须拉起时，才允许用 WeChat DevTools CLI 对固定路径 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin` 启动 automation，并记录副作用。
4. 接口验收必须在 `miniProgram.evaluate` 中调用小程序环境的 `wx.request`，并记录 `projectPath`、automation port、request path、HTTP status、业务 code、关键响应字段和断言结果。
5. UI / 交互验收必须记录 page path、操作链、selector 或截图引用。
6. 只有 `miniprogram-automator` 无法启动、无法连接或无法执行 required item，才允许把该验收项标为 `devtools_automator_blocker`。

## 会话失败归因

当 QA 线程出现连接层异常时，先判定是否为 `QA tool/session blocker`，而非产品功能 blocker。判断规则如下：

1. 若 main 线程在同一轮次、同一 `projectPath`、同一 `pagePath`、同一操作链路下获取到可验收证据（截图、selector、日志、`wx.request` 结果）：
   - QA 可在该证据上对对应验收项做 pass/fail 判定；不得因自身连接不通把该项整体 block。
   - 可在 `checks.automator` 记录 `QA tool/session blocker`，但不应影响已由 main 证据充分覆盖的项的 completion 通过。
2. 当 main 线程也无对应端上证据，或缺少 Test Contract 所需的 required evidence 项时：
   - 该项继续阻塞对应验收项，阻塞原因保持 `QA tool/session blocker`。
3. QA 结果中必须写明：
   - `evidence_source=main_agent_automator`（或等价中文字段）
   - `projectPath/pagePath`
   - `operation chain`
   - 证据引用：截图、selector、日志或运行时请求结果。

## SQL schema truth gate

当自动化验收涉及 CloudBase SQL repository / schema / seed 时：

1. 优先使用 live `INFORMATION_SCHEMA` 或 CloudBase MCP 验证真实 schema。
2. 若 auth 不可用，必须至少结合 checked-in schema spec 与 runtime endpoint smoke / 小程序运行时 `wx.request`，证明链路没有 `Unknown column`。
3. live schema 未验证必须作为 gap 记录。
4. 不能用 Node repository unit tests 替代小程序运行时请求或 live schema gate。

## 输出预算

自动化输出不得粘贴完整 DevTools dump。只记录操作步骤摘要、关键断言、通过 / 失败状态、证据路径或截图引用、失败归因。
