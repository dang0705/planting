# WeChat DevTools 自动化职责分配

## 定位

本文件定义微信开发者工具 MCP 自动化在 main agent、implementer、QA 之间的职责边界，避免同一轮任务中重复跑三次自动化导致 token 和时间消耗失控。

## 单一责任原则

同一个验收目标不得由 main agent、implementer、QA 重复完整执行。

默认分工：

| 角色 | 是否直接执行 WeChat DevTools MCP | 责任 |
|---|---|---|
| main agent | 默认不执行 | 制定 Test Contract，指定 automation_owner，消费证据，判断 completion |
| implementer | 只做最小自测 | 提交 QA 前确认页面可打开、主交互可用、无明显运行时报错 |
| qa_reviewer | 负责正式验收 | 按 Test Contract 执行端上自动化、UI/Figma 验收和失败归因 |

## main agent 边界

main agent 不应直接执行 WeChat DevTools 自动化，除非没有可用 QA 线程、用户明确要求，或只读取已有证据。

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

以下情况 QA 必须执行 WeChat DevTools MCP 或端上验证：

1. 验收标准要求小程序实际交互。
2. 需要点选、输入、按钮状态、控件状态、class、marker、selected state。
3. 用户路径或端上 UI 行为是 required acceptance item。
4. UI/Figma 对齐需要真实截图或端上状态。
5. request changes 明确要求端上行为。

判断依据是验收标准和 Test Contract，不是是否存在 UI diff。

## 跨 agent MCP 会话失效处理

当 QA 线程出现 WeChat MCP 会话层异常（如 `Transport closed`）时，先判定是否为 `QA tool/session blocker`，而非产品功能 blocker。判断规则如下：

1. 若 main 线程在同一轮次、同一 `projectPath`、同一 `pagePath`、同一操作链路（例如 `mp_ensureConnection` → `mp_callWx` → `mp_navigate` → `page_getElement` → `element_tap` → `mp_screenshot`）下获取到可验收证据（截图、selector、日志）：
   - QA 可在该证据上对对应验收项做 pass/fail 判定；不得因自身 transport 不通把该项整体 block。
   - 可在 `checks.wechat_devtools` 记录 `QA tool/session blocker`，但不应影响已由 main 证据充分覆盖的项的 completion 通过。
2. 当 main 线程也无对应端上证据，或缺少 Test Contract 所需的 required evidence 项时：
   - 该项继续阻塞对应验收项，阻塞原因保持 `QA tool/session blocker`。
3. QA 结果中必须写明：
   - `evidence_source=main_agent_wechat_mcp`（或等价中文字段）
   - `projectPath/pagePath`
   - `operation chain`（至少按主操作链路说明）
   - 证据引用：截图、selector、日志。

该规则适用于主线程与 QA 线程的连接能力不一致场景。

## 输出预算

自动化输出不得粘贴完整 DevTools dump。只记录操作步骤摘要、关键断言、通过 / 失败状态、证据路径或截图引用、失败归因。
