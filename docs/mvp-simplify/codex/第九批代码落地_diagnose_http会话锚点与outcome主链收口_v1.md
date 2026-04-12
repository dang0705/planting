# 第九批代码落地：diagnose-http 会话锚点与 outcome 主链收口 v1

## 1. 本批目标

本批只做诊断主链最小收口，不动前端页面壳：

1. 让 `diagnosis_sessions` 真正承接新版会话锚点字段。
2. 让 `diagnose-http` 明确产出：
   - `route_primary_action`
   - `outcome_type`
   - `session_status`
   - `current_plant_identity_id`
   - `current_identity_resolution_status`
3. 在不打断旧前端主要消费结构的前提下，把这些新状态一并透出。

---

## 2. 实际改动

### 2.1 `result-formatter` 不再只会产出问题性结论

文件：

- `cloudfunctions/diagnose-http/domain/result-formatter.js`

本批新增：

- `problematic / uncertain` 两类 outcome 输出收口
- `followUpRequired -> ask_first`
- `final uncertain -> uncertain_prepare`
- `final problematic -> standard_flow`

当前第一版执行口径是：

- `problematic` 正式写通
- `uncertain` 正式写通
- `non_problematic` 先保留为正式枚举口，不在当前代码里自由生成

这符合之前的简化裁决：

- outcome 三类必须保留
- 第一版宁可更保守地进入 `uncertain`
- 非问题性结论不允许自由发挥

---

### 2.2 `diagnosis-engine` 正式带出 route / outcome / identity 状态

文件：

- `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

本批新增：

- `resolveIdentityResolutionStatus()`
- `buildUncertainRoundResult()`

并做了两处关键收口：

1. 当候选问题先验为空时，不再返回模糊的 `failed` 壳结果，而是返回正式 `uncertain` 输出。
2. 每轮结果都会附带：
   - `plantIdentityId`
   - `identityResolutionStatus`
   - `latestVisualCallBatchId`
   - `currentRoundIndex`
   - `currentRoundId`
   - `routePrimaryAction`
   - `outcomeType`
   - `stopReason`
   - `sessionStatus`

同时保留旧兼容返回：

- `legacyDiagnosis`
- `rankings`
- `observedSymptoms`
- `followUps`

---

### 2.3 `session-service` 正式把新版会话字段写入 `diagnosis_sessions`

文件：

- `cloudfunctions/diagnose-http/services/session-service.js`

本批把 `upsertDiagnosisSession()` 从旧兼容写法扩成新版轻量会话写法，开始写入：

- `session_id`
- `current_plant_identity_id`
- `current_identity_resolution_status`
- `current_route_primary_action`
- `current_round_id`
- `current_round_index`
- `latest_visual_call_batch_id`
- `outcome_type`
- `outcome_payload_json`
- `stop_reason`
- `session_status`
- `runtime_snapshot_json`
- `ended_at`

同时做了几项兼容处理：

- follow-up 轮不再把 `image_url` 和 `user_description` 用空值覆盖掉
- `final_problem_key` 只有在 `problematic` 且本轮已结束时才正式写入
- `uncertain` 会把 `final_problem_cn` 写成最终输出展示名，便于历史列表和结果页兜底显示

本批还同步扩展了：

- `buildSnapshotPayload()`
- `getSessionState()`
- `listDiagnosisHistory()`
- `getResultById()`

让新状态可读回。

---

### 2.4 `app.js` 继续维持旧接口，但开始对外透出新状态

文件：

- `cloudfunctions/diagnose-http/app.js`

本批没有改路由和请求协议，只补充了输出字段：

- `routePrimaryAction`
- `outcomeType`
- `identityResolutionStatus`
- `stopReason`

并把 legacy 成功响应里的 `fullText` 优先指向：

1. `diagnosisText`
2. `finalResult.summary`
3. `topProblem.summary`

这样在 `uncertain` 输出场景下，不会再优先回退到“更像某问题”的旧摘要。

---

### 2.5 prior repository 补了宿主身份状态

文件：

- `cloudfunctions/diagnose-http/repositories/prior-repository.js`

本批补充：

- `identityResolutionStatus`

这样宿主先验入口不只返回 `plantIdentityId`，也能明确当前是：

- `matched`
- `unresolved`

---

## 3. 本批后的运行语义

### 3.1 诊断会话的最小正式状态

当前 `diagnose-http` 会话层已经能表达：

- 当前宿主身份是谁
- 当前身份是否已稳定
- 当前主动作是继续问、进入标准流程，还是进入不确定预备
- 当前会话是否仍在等追问，还是已经完成
- 当前最终 outcome 是 `problematic` 还是 `uncertain`

---

### 3.2 第一版 outcome 执行口径

当前代码实际执行的是：

- `problematic`：正常问题性收敛
- `uncertain`：证据不足、冲突过高、或候选问题先验缺失时的保守收口

当前**没有**开放：

- 任意非问题性结论自由生成

这符合最终执行口径要求。

---

## 4. 本批验证

### 4.1 本地静态校验

已通过：

- `node --check cloudfunctions/diagnose-http/domain/result-formatter.js`
- `node --check cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
- `node --check cloudfunctions/diagnose-http/services/session-service.js`
- `node --check cloudfunctions/diagnose-http/app.js`
- `node --check cloudfunctions/diagnose-http/repositories/prior-repository.js`

---

### 4.2 CloudBase 当前环境只读核对（执行前）

本轮额外做了只读 SQL：

- `SHOW COLUMNS FROM diagnosis_sessions`

核对结果：

- 当前唯一 CloudBase 环境是 `cloud1-2grufevs395a9d5e`（别名 `cloud1`）
- 当前环境里的 `diagnosis_sessions` **仍是旧 schema**
- 缺失本批代码已开始依赖的新列，例如：
  - `session_id`
  - `current_plant_identity_id`
  - `current_identity_resolution_status`
  - `current_route_primary_action`
  - `outcome_type`
  - `session_status`
  - `runtime_snapshot_json`

这说明：

# 当前代码已经按新基线推进，但当前云端环境还没有同步迁移到新版诊断 schema。

---

## 5. 当前结论

本批从代码上完成了：

- `diagnose-http` 从旧问题排名壳，向新版轻量会话中枢正式迈出第一步
- `route -> outcome -> session_status` 已经进代码主链
- `problematic / uncertain` 两类 outcome 已能被正式表示

但本批**没有**完成：

- 当前唯一 CloudBase 环境的 `diagnosis_sessions` 正式迁移
- 新版诊断 schema 的线上/云端写入验收
- `diagnose-http` 云函数部署

---

## 6. 下一步建议

下一步不应该直接部署 `diagnose-http`，而应该先做：

1. 对当前 `cloud1` 环境执行 `diagnosis_sessions` 新列迁移
2. 补齐 `diagnose-http` 当前代码依赖的新表 / 新列
3. 做一次最小实写验收：
   - start diagnosis
   - follow-up answer
   - final problematic
   - final uncertain

完成这三步后，再进入云函数部署与前端联调。

附：

- 已补迁移脚本草案：
  - `docs/mvp-simplify/codex/第九批_cloud1诊断session迁移脚本_v1.sql`
- 后续已实际执行迁移，结果见：
  - `docs/mvp-simplify/codex/第十批代码落地_cloud1诊断session迁移执行_v1.md`
