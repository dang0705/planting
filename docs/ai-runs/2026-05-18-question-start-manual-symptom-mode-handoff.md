# 2026-05-18 无图症状模式直接问诊入口 handoff

## 任务目标

为无图症状模式直接问诊入口补齐文档与后续发布交接信息，确保 API、前端入口、证据语义、验证状态和 release_ops 后续验收点可追溯。

## 本轮已同步文档

- `docs/code-logics/02_诊断HTTP接口_请求响应与路由.md`
  - 新增 `POST /diagnosis/question/start` 路由说明。
  - 明确该接口不调用 `/diagnosis/start`，不走 SSE / 视觉模型，后续答案仍走 `/diagnosis/answer`。
- `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md`
  - 新增无图症状模式进入 runtime 的说明。
  - 明确 `sourceType=manual_symptom_mode` 是用户选择症状证据，不是视觉证据。
- `docs/code-logics/07_结果格式化_公开响应_前端接入契约.md`
  - 明确 `/diagnosis/question/start` 仍返回同一 presenter 公开结构。
  - 不新增视觉模型、SSE 或 `/diagnosis/start` 私有字段。
- `docs/code-logics/08_会话持久化_历史_运行时快照.md`
  - 明确会话与快照应保留 `manual_symptom_mode` 来源。
  - 不得伪造视觉批次、SSE 状态或视觉模型结果。
- `docs/ai-rules/frontend-automation-id-policy.md`
  - 新增正式无图症状模式快捷入口 id：`3ef72261--diagnose-dev-symptom-class-quick-select`。
  - QA 模板补充 `/diagnosis/question/start`、无 AIStreamDialog / SSE、后续 `/diagnosis/answer` 与 `manual_symptom_mode` 断言。

## API 与入口契约

- API：`POST /diagnosis/question/start`
- 前端入口：`id="3ef72261--diagnose-dev-symptom-class-quick-select"`
- 入口性质：正式无图症状模式直接诊断入口。
- 链路边界：
  - 不调用 `/diagnosis/start`。
  - 不走 `/stream/diagnose` / SSE。
  - 不调用视觉模型。
  - 后续答案仍走 `/diagnosis/answer`。

## `manual_symptom_mode` 语义

`sourceType=manual_symptom_mode` 表示用户主动选择的症状证据。它属于正式观察证据来源，但不是视觉证据，不应进入视觉候选、视觉聚合、池外视觉异常或视觉批次链路。

会话、运行时快照、result / review detail 应能复盘该来源，并能证明本 session 是无图症状入口创建，而不是 `/diagnosis/start` 或视觉/SSE 链路创建。

## 已记录验证结果

以下为上游实现/QA 阶段已记录结果，docs_keeper 本轮未重新执行：

- `npm test`：通过。
- `node --check` / JSON parse：通过。
- `lint`：0 errors。
- `build:h5`：通过。

## 发布验收状态

- 2026-05-18 已部署 `diagnose-http`。
- CloudBase 函数详情显示 `Status=Active`、`AvailableStatus=Available`、`Runtime=Nodejs18.15`，代码修改时间已更新到 2026-05-18 16:09:29。
- 真实 HTTP smoke 已覆盖：
  - `POST /diagnosis/question/start`：HTTP 200，返回 `diag_1779091921207_asyucgy5`、`stage=followup`、`status=active`、`roundId=round_1`、`latestVisualCallBatchId=null`、首轮问题数 1。
  - `POST /diagnosis/answer`：HTTP 200，同一 session 进入 `round_2`，继续 `stage=followup`，问题数 1。
  - `GET /diagnosis/review/detail`：HTTP 200，同一 session `latestVisualCallBatchId=null`、`imageCount=0`、`followUpCount=2`。
- SQL 证据：
  - `cloud1_dev.diagnosis_sessions` 中该 session `latest_visual_call_batch_id IS NULL`、`session_status=awaiting_follow_up`、`current_round_id=round_2`、`reviewSourceType=manual_symptom_mode`、`visualInputVersion=manual_symptom_mode_v1`。
  - `cloud1_dev.diagnosis_symptom_observations` 中 `uniform_yellowing` 的 `evidence_source=manual_symptom_mode`、`confidence=0.8200`。
  - `cloud1_dev.diagnosis_follow_ups` 中首题已回答，下一题 pending。
- CloudBase 函数日志：
  - 2026-05-18 16:12:00 / 16:12:03 / 16:12:54 的 `diagnose-http` 请求 `RetCode=0`。

## 后续 release_ops 需要验证

当前无阻塞发布项。后续若继续做小程序端自动化，可复用本 session：

1. 在微信开发者工具中点击子选项 `diagnose-dev-symptom-class-option-{classKey}`，不要点击容器本身。
2. 确认无图场景不出现 AIStreamDialog，不发起 `/diagnosis/start` 或 `/stream/diagnose`。
3. 确认页面直接进入 `pages/diagnose/follow-up`，并且后续提交仍走 `/diagnosis/answer`。

## Subagent 线程复用表

| 角色 | 本轮状态 | 线程复用要求 |
|---|---|---|
| `docs_keeper` | 已复用当前线程完成文档同步与 handoff | 后续同类文档同步继续复用本线程 |
| `release_ops` | 待后续派发 | 线上部署、CloudBase smoke、requestId 日志验证使用同一 release_ops 线程 |
| `qa_reviewer` | 上游已记录本地验证结果，docs_keeper 未复跑 | 若继续前端/接口验收，复用同会话 qa_reviewer 线程 |
