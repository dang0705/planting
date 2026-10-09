# 长期植物养护合同 `long-term-care/v1`（2026-10-09 冻结）

裁决来源：用户 2026-10-09 裁决 U1–U9（U6、U9 按用户修改版）；主代理 2026-10-09 裁决 T1–T8（全部采纳草案推荐）。草案见 `long-term-care-contract-draft.md`（已被本文替代）。硬规则：CLAUDE.md 第 4 节「诊断只产生建议；只有用户确认后的 care 用例才可写成养护事件或提醒」、配置目录 `care.recommendation.write_fact_directly=false`。

一句话：**建议**可以很多、会过期；用户「确认」后才成为**计划**（待办）；用户真的做了才记为**事实**。只有浇水事实会改变浇水进度的起点。本阶段不做服务端推送提醒，计划只给「加入手机日历」所需字段。

## 0. 通用规则

- 归属：登录主体 `user_id` + `userPlantRef`；由 user-plant 只读归属端口确认「是我的、未删除」（T7）；否则 404 `USER_PLANT_NOT_FOUND`，不泄露存在性。
- 归档植物（U8）：只读。所有写接口与长期浇水建议 → 409 `USER_PLANT_ARCHIVED`（T3）。
- 写接口必须带 `Idempotency-Key`；唯一幂等事实为共享 `http_idempotency_records`（T2）。同键同体重放首次结果；同键异体 409 `IDEMPOTENCY_CONFLICT`；处理中 503。
- 时间：带 Z 的 UTC；客户端提交的发生时间不得晚于服务器当前时刻。
- 响应不含内部主键、`user_id`、平台标识、策略摘要、输入快照。
- 外部读取（策略、基线、Open-Meteo、档案、最近事实、品种绑定）在事务前完成；事务内按归属锁植物行并核对档案版本未变，变了 → 503（客户端同键重试）（T6）。复核范围（主代理 2026-10-09 裁决 Q4，宽于字面）：浇水建议复核档案版本、最新品种绑定、最近浇水事实；确认建议复核档案版本与最新品种绑定（日历标题依赖）。**该并发 503 路径未经端到端验证**（需制造并发，现只有代码审阅）。
- 公共错误补登：`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`、`SERVICE_UNAVAILABLE`。

## 1. 品种绑定（U1、T1）

`PUT /api/v2/user-plants/{userPlantRef}/catalog-binding`（新登记，owner `user-plant`，authenticated，`required_header`）

- 请求：`{ catalogTaxonRef }`（1～512 字符；须在 Tropicals 目录中存在，否则 404 `NOT_FOUND`）。
- 响应：`{ data: { catalogTaxonRef, boundAt } }`。
- 写入：`user_plant_catalog_bindings` 只追加一行（最新一条生效）；同值重复绑定也追加（同键重放除外）。
- 错误：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`USER_PLANT_ARCHIVED`、`NOT_FOUND`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`。

## 2. 长期浇水建议 `POST /api/v2/care/watering-advice`（`target.kind='user_plant'`）

- 仅登录用户；游客传 user_plant → 400；用例内强制登录主体（T8）。
- 请求：沿用 `WateringAdviceRequest`；对长期植物 `catalogTaxonRef`、`pot`、`lastWatering` **不得提交**（提交 → 400）。`location`、`window`、`lightReading`、`substrateMaterials`、`indoorClimate`、`soil` 仍由请求提供（U2；前端可记住上次输入）。
- 服务端取：品种 = 最新绑定（无绑定 → 结果 `insufficient_evidence`，缺 `plant_baseline`）；盆器 = 档案 `measuredPot`（无 → 缺证据）；上次浇水 = 最近一条 `watering` 事实。
- 盆土证据有效期（U6，`care-watering-mvp/v2`，临时案例同规则）见 §8。
- 响应：`{ data: { resultRef: 'cres_…', proposalRef: 'cpr_…' | null, result } }`；`proposalRef` 仅在 `result.status='ready'` 且行动可确认（`water_allowed`、`check_later`、`check_now`、`priority_check`）时出现。
- 写入（同一事务）：`care_capability_results`（只追加，含输入清单、算法清单、派生、结果及摘要）+ `care_proposals`（`proposed`）+ 幂等记录。不写事实、计划。
- 建议有效期（U7）：= 检查窗口最晚端；无最晚端 → 生成时刻 + 24 小时（`care.watering.open_window_proposal_valid_hours`）。
  - U7 实现说明（主代理 2026-10-09 裁决 Q1）：最晚端**不晚于**建议生成时刻（如「可以浇水」时窗口为 [现在, 现在]）按「无最晚端」处理，有效期 = 生成时刻 + 24 小时；否则建议一生成即过期、无法确认。
- 错误：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`USER_PLANT_ARCHIVED`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`、`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`；临时案例沿用 `NOT_FOUND`。

## 3. 记录浇水 `POST /api/v2/user-plants/{userPlantRef}/care/facts`（U3、U4）

- 请求：`{ factType: 'watering', occurredAt, amountMl?: number | null }`；本阶段只接受 `watering`。`amountMl` 为 0～10000 的整数或 null。
- 规则：`occurredAt` ≤ 现在，≥ 现在 − 7 天（`care.facts.watering_backfill_max_days`），≥ 植物创建时刻。
- 响应：`{ data: { factRef: 'cft_…', factType: 'watering', occurredAt, amountMl } }`。
- 写入：`care_facts` 一行（`source_command_ref` 服务端生成）+ 幂等记录；事实不可修改（027 触发器）。
- 错误：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`USER_PLANT_ARCHIVED`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`。

## 4. 养护摘要 `GET …/care/summary`

```text
{ data: { lastWatering: { factRef, occurredAt, amountMl } | null,
          latestWateringAdvice: { resultRef, generatedAt, status, action, checkWindow,
                                  proposal: { proposalRef, status, validUntil } | null } | null,
          nextPlan: { planRef, planType, scheduledAt, status, calendar } | null,
          profileReadiness: { hasMeasuredPot, hasCatalogBinding } } }
```
只读，不计算、不调用外部服务；归档植物可读。

## 5. 计划列表 `GET …/care/plans`（T5）

- 查询：`status`（`planned|completed|cancelled|expired`，默认 `planned`）、`limit`（默认 20，上限 50，硬规则 `care.plans.page_size`）、`cursor`（不透明）。
- 响应：`{ data: { items: [{ planRef, planType, scheduledAt, status, sourceProposalRef, completedFactRef | null, calendar }], nextCursor | null } }`。

## 6. 确认建议 `POST …/care/proposals/{proposalRef}/confirmations`（U5）

- 请求（严格三选一）：
  - `{ decision: 'schedule_check', scheduledAt? }`：缺省 = max(检查窗口最早端, 服务端当前时刻)（无最早端 → 现在；主代理 2026-10-09 裁决 Q5，避免缺省落在过去）；用户可改，但须在窗口内；窗口无最晚端时最多比最早端（或现在）晚 7 天（`care.plans.check_max_postpone_days`）。
    - 自选范围实现说明（主代理 2026-10-09 裁决，与 Q1 一致）：下界一律为 max(窗口最早端, 当前时刻)；窗口最晚端**不晚于**建议生成时刻时按「无最晚端」处理，允许范围 = [max(最早端, 当前时刻), 最早端 + 7 天]（无最早端时以当前时刻代替最早端）。
  - `{ decision: 'record_watering', occurredAt, amountMl? }`：同 §3 规则写浇水事实。
  - `{ decision: 'dismiss' }`。
- 响应：`{ data: { proposalRef, proposalStatus: 'confirmed' | 'dismissed', plan: { planRef, planType, scheduledAt, status, calendar } | null, factRef | null } }`。
- 写入（同一事务、条件写一次）：`care_proposals.status` proposed → confirmed/dismissed；`schedule_check` → `care_plans`（`plan_type='check_soil'`，一个建议至多一个计划）；`record_watering` → `care_facts`。**不写** `reminder_jobs`（U9）。
- 错误：通用 + `CARE_PROPOSAL_NOT_CONFIRMABLE`（409：已确认/已忽略/已过期/他用）、`USER_PLANT_ARCHIVED`。

## 7. 完成计划 `POST …/care/plans/{planRef}/completions`

- 请求：`{ version, outcome: 'done' | 'skipped', soil?: { state, scope }, watering?: { occurredAt, amountMl? } }`。`skipped` 不得带 `soil`/`watering`。
- 响应：`{ data: { planRef, status: 'completed' | 'cancelled', version, factRef | null, calendar } }`。
- 写入（同一事务、按 `version` 条件写）：`care_plans` 状态 + `version+1`；`watering` → `care_facts`；`soil` → `care_environment_observations`（`soil_surface`、`user_context`）。
- 盆土观察固定字段（主代理 2026-10-09 裁决 Q2）：`factor_type='soil_surface'`、`source_scope='pot'`、`source_kind='user_context'`、`source_ref`=计划引用、`unit_code='category'`、`confidence_band='low'`、`contract_version='long-term-care/v1'`、`normalized_value_json={state,scope}`、观察时刻 = 服务端当前时刻。用户手动观察，MVP 统一低置信。
- 错误：通用 + `CARE_PLAN_VERSION_CONFLICT`（409：版本不符或计划非 planned）、`USER_PLANT_ARCHIVED`。

## 8. 盆土证据有效期（U6，`care-watering-mvp/v2`；长期与临时案例同规则）

| 观察 | 有效到 |
|---|---|
| 湿、微湿 | 用现有干燥回放从观察时刻向后推，最早可能离开该状态的时刻：以最快干燥速率消耗该状态的剩余比例跨度（`(上界 − 下界) × 基线下端`）所需时间；推不出（缺光照/环境段）→ 观察 + `soilEvidenceFallbackHours`（24） |
| 干（含仅表土干） | 一直有效，直到出现晚于观察时刻的已确认浇水事实 |
| 不确定 | 不形成证据 |

两者统一封顶 `soilEvidenceMaxHours`（72）；超过封顶即过期（结果缺证据，提示重新观察）。v1 发布仍按旧固定 `soilEvidenceTtlHours`。「最早可能离开该状态」的跨度口径为本合同对用户裁决的落地解释（见交付报告待确认项）。

## 9. 日历字段（U9）

计划响应与摘要中的 `calendar = { title, startAt, endAt, notes }`：
- `title`：「检查{昵称或品种中文名或"植物"}盆土」，如「检查绿萝盆土」。
- `startAt` = `scheduledAt`；`endAt` = `scheduledAt` + 30 分钟。
- `notes`：固定中文提示「用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。」不含任何内部引用、链接或个人信息。
前端调用平台「添加到手机日历」能力；服务端不推送、不写提醒任务。

## 10. 存储（T4）

- 新 `care_capability_results`（025）：长期计算结果只追加，与 `temporary_care_results` 同形；`proposal_internal_id` 可空、唯一，指向同一植物的 `care_proposals`。
- 新 `user_plant_catalog_bindings`（026）：只追加。
- `care_facts` 不可修改（027 触发器拒绝 UPDATE；删除只由数据保留/删除流程执行，故不拦截 DELETE）。
- `care_proposals.idempotency_key` 写入 `SHA-256(Idempotency-Key)`（满足既有唯一键），重放以共享幂等表为准（T2）。
- 不写 `reminder_jobs`、分层派生表。

## 11. 配置

新增（用户 2026-10-09 裁决）：`care.facts.watering_backfill_max_days`=7、`care.plans.check_max_postpone_days`=7、`care.watering.open_window_proposal_valid_hours`=24、`care.plans.page_size`={default:20,max:50}（hard_rule）；`care-watering-mvp/v2` 正文字段 `soilEvidenceFallbackHours`=24、`soilEvidenceMaxHours`=72。`care.watering.recheck_window_hours` 维持 pending、不阻断（MVP 模型自算窗口）。

## 附：U6 湿/微湿有效期公式裁决（主代理 2026-10-09）

「最早可能进入下一状态」按字面会退化为 0（读数可能正好在状态下界）。裁决采用：有效期 =（该状态 remainingFraction 上界 − 下界）× 植物基线最短干燥天数，即按最快干燥速度走完整个状态区间的时长；再受 `care.watering.soil_evidence_max_hours`=72 封顶，推算不出时用 `care.watering.soil_evidence_fallback_hours`=24。理由：室内盆栽主要风险是浇水过多导致烂根，「湿」判断偏长更保守；检查窗口仍由干燥回放独立给出。
