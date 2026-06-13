# 2026-06-13 WeChat DevTools MCP 坑点记录

## 背景

本记录来自任务 `86exxzd5t` 的 QA recovery。尾号 `136` 的 `qa_reviewer` 线程结论为 `blocked / not_verified`：后端 smoke 已证明 `/diagnosis/question/start` 不再触发 `Unknown column package_topic`，但没有取得小程序运行时 `wx.request` 证据，因此不能判定端上验收通过。

## 1. 配置 / 项目路径

- 原始信号：`wechat_ide status` 返回 success，但 `status.data.project_path` 是 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`，Test Contract 要求 `/Users/jay/WebstormProjects/planting/dist/build/mp-weixin`。
- 易误判点：把 `status success` / `project_exists=true` 当成当前构建产物已被验证。
- 正确归因：MCP 可达不等于项目路径正确。
- 硬要求：每次端上 QA 必须比对 `status.data.project_path` 与 Test Contract `projectPath`；不一致时不得宣称该合同路径已验证。

## 2. 端口 / 进程

- 原始信号：CDP `9222` 监听且 `/json/version` 可响应，但 automation `9420` 不监听。
- 易误判点：把 CDP 调试端口当成 automator 就绪。
- 正确归因：`9222` 与 `9420` 是两条链路；只有 `9420` + WebSocket/page_data 才能说明自动化可用。
- 硬要求：端上 QA 通过条件必须包含 `9420` 监听与 automator 可操作证据；`9222` 只能作为辅助证据。

## 3. MCP status 假阳性

- 原始信号：`status` 返回 CLI、project、Node、appid 等正常。
- 易误判点：把环境诊断 success 当成端上运行时通过。
- 正确归因：status 只是前置检查，不能替代 `open/start/page_data/wx.request`。
- 硬要求：QA 证据链必须执行到 `is_login -> open/start -> automator ready -> 端上交互或 wx.request`。

## 4. automator / IDE 启动

- 原始信号：`wechat_ide open` for `dist/build` 失败：`SystemError (appServiceSDKScriptError) timeout`。
- 原始信号：`wechat_build compile` 失败：`#initialize-error: wait IDE port timeout`。
- 原始信号：`wechat_automator start` 失败：`CLI auto 执行失败 (rc=-1)` / timeout。
- 易误判点：把 IDE/automator 启动失败写成产品接口失败，或在 open 已有 startup error 后继续宣称通过。
- 正确归因：DevTools/IDE/automator 会话 blocker。
- 硬要求：`open` 出现 startup error、`wait IDE port timeout`、`CLI auto rc=-1` 时，必须先恢复 DevTools/automator，不得判产品通过。

## 5. bottom-layer miniprogram-automator

- 原始信号：`miniprogram-automator.launch({ projectPath: dist/build/mp-weixin, port: 9431 })` 失败：`Failed to launch wechat web devTools, please make sure http port is open`。
- 易误判点：以为底层 automator 能绕过所有 MCP/IDE 问题。
- 正确归因：fallback 仍依赖微信开发者工具 HTTP/automation 能力。
- 硬要求：MCP 不可用时必须尝试底层 automator；但只有 fallback 成功执行小程序运行时 `wx.request` 才算端上证据。launch/connect 失败必须保留 raw error。

## 6. QA Contract

- 原始信号：backend curl 到 local functions gateway 返回 200，`stage=question_package`，首题 `questionKey` 正确，`questionId` 不存在，无 `Unknown column package_topic`。
- 易误判点：把字段完全符合预期的 backend smoke 写成端上验收通过。
- 正确归因：这是 `backend_smoke_pass_only`，不能替代小程序运行时证据。
- 硬要求：涉及 `/diagnosis/question/start`、question package、SQL schema regression 时，合格证据必须来自小程序运行时 `wx.request` 或真实端上交互。

## 7. schema / live DB

- 原始信号：backend smoke 未出现 SQL `Unknown column package_topic`，但 CloudBase live schema / `INFORMATION_SCHEMA` 未验证。
- 易误判点：接口 smoke 没报错就宣称 schema 已完整验证。
- 正确归因：只能说明该请求路径未触发 schema error；live schema truth gate 仍是 gap。
- 硬要求：SQL repository/schema/seed 相关 QA 必须优先 live schema；不可用时必须记录 `live_schema_gap`。

## 8. subagent / 线程自身

- 原始信号：原 `qa_reviewer` 线程 `019ebfbe-bafc-7ae2-b025-8573f4c46a20` 返回 `{type:"invalid_request_error", message:"Instructions are required"}`。
- 易误判点：把 QA 线程启动/请求错误写成 MCP 或产品 blocker。
- 正确归因：这是 subagent 调用层 blocker，不是 WeChat DevTools、automator 或产品接口证据。
- 硬要求：保留 raw error；按同角色线程失效规则处理。替换 QA 线程存在不等于验收完成，仍必须重新取得 required runtime evidence。

## 9. 必须执行的总规则

1. `wechat_ide/status` 只能作为前置检查，不能作为验收证据。
2. 每次 QA 必须核对 MCP `project_path` 与 Test Contract `projectPath` 完全一致。
3. `9222` CDP 不等于 `9420` automator。
4. `open` 出现 `appServiceSDKScriptError timeout` 或 startup_errors 时，不得继续判业务通过。
5. `CLI auto rc=-1`、`wait IDE port timeout`、`Failed connecting ws://localhost:9420` 优先归类为 DevTools automation blocker。
6. bottom-layer `miniprogram-automator` 必须尝试，但失败要保留 raw launch/connect error。
7. backend curl 200 只能是 backend smoke，不能替代小程序运行时 `wx.request`。
8. live schema 未验证必须列 gap。
9. QA/subagent 线程报 `Instructions are required` 是 agent 调用层 blocker。
10. 出现 `INVALID_TOKEN` / `需要重新登录` 后，必须重新扫码登录；未登录时停止端上验收。
