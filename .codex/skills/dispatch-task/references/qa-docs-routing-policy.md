# QA and Docs Routing Policy

本文件只在需要判断 QA 或 docs_keeper 是否必选时读取。

它不替代 Agent Assignment Core，也不替代 QA evidence / docs result 模板。

## docs_keeper 分配硬门禁

main agent 必须显式输出：`docs_keeper_required`、`docs_keeper_reason`、`docs_keeper_assigned`、`docs_sync_scope`。

以下任一条件成立，`docs_keeper_required` 必须为 `yes`：

1. 修改诊断契约、问诊题包、route / outcome 公开契约、停止 / 输出资格、API 响应结构、schema、配置或 workflow 规则。
2. BRV Recall Packet、task facts、ClickUp checklist、代码注释或活文档明确要求同步 docs / new-rules / source index / BRV source verification。
3. 删除、替换或降级旧概念，且旧概念存在于 active docs、`docs/new-rules/`、`.brv/source-verification.json` 或 active `.brv/context-tree/`。
4. 任务结果需要记录“当前入口在哪里、删除了哪些旧逻辑、扩展点如何预留”等长期可复用事实。

`docs_keeper_required=yes` 但未分配 `docs_keeper` 时，Gate 不通过，必须停止或补派。若判断为 `no`，必须给出理由；不得仅因 task facts 未显式写“更新文档”而判定不需要。


## qa_reviewer 分配硬门禁

以下任一条件成立，`qa_reviewer_required` 必须为 `yes`：存在可验证验收标准；涉及 UI / Figma / 小程序端上交互；涉及 API / 状态流 / 诊断链路 / 问诊流程；存在 request changes / bug / regression；Completion Gate 需要独立证据。

QA 只做测试执行、smoke、e2e、UI/Figma、小程序自动化与失败归因；QA 不审代码 diff，不替代 main agent code review。
