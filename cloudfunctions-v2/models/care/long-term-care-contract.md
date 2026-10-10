# 长期植物养护合同 `long-term-care/v1`（2026-10-09 冻结）

裁决来源：用户 2026-10-09 裁决 U1–U9（U6、U9 按用户修改版）；主代理 2026-10-09 裁决 T1–T8（全部采纳草案推荐）。草案见 `long-term-care-contract-draft.md`（已被本文替代）。硬规则：CLAUDE.md 第 4 节「诊断只产生建议；只有用户确认后的 care 用例才可写成养护事件或提醒」、配置目录 `care.recommendation.write_fact_directly=false`。

一句话：**建议**可以很多、会过期；用户「确认」后才成为**计划**（待办）；用户真的做了才记为**事实**。只有浇水事实会改变浇水进度的起点。本阶段不做服务端推送提醒，计划只给「加入手机日历」所需字段。

## 路径前缀（用户 2026-10-09 裁决：网关前缀冲突）

CloudBase 网关只按路径前缀路由到函数，`/api/v2/user-plants` 归 user-plant 函数。§3–§7 五个接口改由 care 函数独占的 `/api/v2/care` 前缀承载：`/api/v2/care/user-plants/{userPlantRef}/{summary|facts|plans|proposals/{proposalRef}/confirmations|plans/{planRef}/completions}`。浇水建议、盆土评估路径不变；§1 品种绑定 PUT 属 user-plant 域，路径不变。

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
- 请求：沿用 `WateringAdviceRequest`；对长期植物 `catalogTaxonRef`、`pot`、`lastWatering` **不得提交**（提交 → 400）。`cityCode` **也不得提交**（2026-10-10 用户裁决，提交 → 400）：服务端用环境档案 `location.cityRef` 对应城市目录的中心坐标取室外辐射；档案无城市或城市不在目录时不取辐射，结果为 `insufficient_evidence` 时缺失码追加 `plant_location`（详见 watering-advice-http-contract.md「长期植物的坐标」）。`window`、`lightReading`、`substrateMaterials`、`primarySubstrateMaterial`（2026-10-10 增补）、`indoorClimate`、`soil` 仍由请求提供（U2；前端可记住上次输入）。
- 服务端取：品种 = 最新绑定（无绑定 → 结果 `insufficient_evidence`，缺 `plant_baseline`）；盆器 = 档案 `measuredPot`（无 → 缺证据）；上次浇水 = 最近一条 `watering` 事实。
- 盆土证据有效期（U6，`care-watering-mvp/v2`，临时案例同规则）见 §8。
- 响应：`{ data: { resultRef: 'cres_…', proposalRef: 'cpr_…' | null, result } }`；`proposalRef` 仅在 `result.status='ready'` 且行动可确认（`water_allowed`、`check_later`、`check_now`、`priority_check`）时出现。
- 写入（同一事务）：`care_capability_results`（只追加，含输入清单、算法清单、派生、结果及摘要）+ `care_proposals`（`proposed`）+ 幂等记录。不写事实、计划。
- 建议有效期（U7）：= 检查窗口最晚端；无最晚端 → 生成时刻 + 24 小时（`care.watering.open_window_proposal_valid_hours`）。
  - U7 实现说明（主代理 2026-10-09 裁决 Q1）：最晚端**不晚于**建议生成时刻（如「可以浇水」时窗口为 [现在, 现在]）按「无最晚端」处理，有效期 = 生成时刻 + 24 小时；否则建议一生成即过期、无法确认。
- 错误：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`USER_PLANT_ARCHIVED`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`、`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`；临时案例沿用 `NOT_FOUND`。

## 3. 记录浇水 `POST /api/v2/care/user-plants/{userPlantRef}/facts`（U3、U4）

- 请求：`{ factType: 'watering', occurredAt, amountMl?: number | null }`；本阶段只接受 `watering`。`amountMl` 为 0～10000 的整数或 null。
- 规则：`occurredAt` ≤ 现在，≥ 现在 − 7 天（`care.facts.watering_backfill_max_days`），≥ 植物创建时刻。
- 响应：`{ data: { factRef: 'cft_…', factType: 'watering', occurredAt, amountMl } }`。
- 写入：`care_facts` 一行（`source_command_ref` 服务端生成）+ 幂等记录；事实不可修改（027 触发器）。
- 错误：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`USER_PLANT_ARCHIVED`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`。

## 4. 养护摘要 `GET /api/v2/care/user-plants/{userPlantRef}/summary`

```text
{ data: { lastWatering: { factRef, occurredAt, amountMl } | null,
          latestWateringAdvice: { resultRef, generatedAt, status, action, checkWindow,
                                  proposal: { proposalRef, status, validUntil } | null } | null,
          nextPlan: { planRef, planType, scheduledAt, status, calendar } | null,
          profileReadiness: { hasMeasuredPot, hasCatalogBinding } } }
```
只读，不计算、不调用外部服务；归档植物可读。
`profileReadiness` 两项与档案完整度同一判定（`user-plant-profile-completeness.md` §4，2026-10-10 用户审定）：`hasMeasuredPot` 要求已存实测盆器
且至少一项尺寸 + 排水状态非空（原为“有记录即可”，口径收紧）；`hasCatalogBinding` 为存在品种绑定。

## 5. 计划列表 `GET /api/v2/care/user-plants/{userPlantRef}/plans`（T5）

- 查询：`status`（`planned|completed|cancelled|expired`，默认 `planned`）、`limit`（默认 20，上限 50，硬规则 `care.plans.page_size`）、`cursor`（不透明）。
- 响应：`{ data: { items: [{ planRef, planType, scheduledAt, status, sourceProposalRef, completedFactRef | null, calendar }], nextCursor | null } }`。

## 6. 确认建议 `POST /api/v2/care/user-plants/{userPlantRef}/proposals/{proposalRef}/confirmations`（U5）

- 请求（严格三选一）：
  - `{ decision: 'schedule_check', scheduledAt? }`：缺省 = max(检查窗口最早端, 服务端当前时刻)（无最早端 → 现在；主代理 2026-10-09 裁决 Q5，避免缺省落在过去）；用户可改，但须在窗口内；窗口无最晚端时最多比最早端（或现在）晚 7 天（`care.plans.check_max_postpone_days`）。
    - 自选范围实现说明（主代理 2026-10-09 裁决，与 Q1 一致）：下界一律为 max(窗口最早端, 当前时刻)；窗口最晚端**不晚于**建议生成时刻时按「无最晚端」处理，允许范围 = [max(最早端, 当前时刻), 最早端 + 7 天]（无最早端时以当前时刻代替最早端）。
  - `{ decision: 'record_watering', occurredAt, amountMl? }`：同 §3 规则写浇水事实。
  - `{ decision: 'dismiss' }`。
- 响应：`{ data: { proposalRef, proposalStatus: 'confirmed' | 'dismissed', plan: { planRef, planType, scheduledAt, status, calendar } | null, factRef | null } }`。
- 写入（同一事务、条件写一次）：`care_proposals.status` proposed → confirmed/dismissed；`schedule_check` → `care_plans`（`plan_type='check_soil'`，一个建议至多一个计划）；`record_watering` → `care_facts`。**不写** `reminder_jobs`（U9）。
- 错误：通用 + `CARE_PROPOSAL_NOT_CONFIRMABLE`（409：已确认/已忽略/已过期/他用）、`USER_PLANT_ARCHIVED`。

## 7. 完成计划 `POST /api/v2/care/user-plants/{userPlantRef}/plans/{planRef}/completions`

- 请求：`{ version, outcome: 'done' | 'skipped', soil?: { state, scope }, watering?: { occurredAt, amountMl? } }`。`skipped` 不得带 `soil`/`watering`。
- 响应：`{ data: { planRef, status: 'completed' | 'cancelled', version, factRef | null, calendar } }`。
- 写入（同一事务、按 `version` 条件写）：`care_plans` 状态 + `version+1`；`watering` → `care_facts`；`soil` → `care_environment_observations`（`soil_surface`、`user_context`）。
- 盆土观察固定字段（主代理 2026-10-09 裁决 Q2）：`factor_type='soil_surface'`、`source_scope='pot'`、`source_kind='user_context'`、`source_ref`=计划引用、`unit_code='category'`、`confidence_band='low'`、`contract_version='long-term-care/v1'`、`normalized_value_json={state,scope}`、观察时刻 = 服务端当前时刻。用户手动观察，MVP 统一低置信。
- 错误：通用 + `CARE_PLAN_VERSION_CONFLICT`（409：版本不符，或计划为 completed/cancelled）、`CARE_PLAN_EXPIRED`（409：计划已过期，见 §12）、`USER_PLANT_ARCHIVED`。

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

计划过期（§12，主代理 2026-10-09 配置裁决）：`care.plans.expiry_grace_hours`=72、`care.plans.expiry_scan`={每小时、每批 500、时长上限=函数超时的一半}；同日裁定两项均为 hard_rule（代码常量 + 目录一致性测试 + 本合同共同保证，不走策略 release；MVP 极少变更，将来需调整再升级为策略）。

新增（用户 2026-10-09 裁决）：`care.facts.watering_backfill_max_days`=7、`care.plans.check_max_postpone_days`=7、`care.watering.open_window_proposal_valid_hours`=24、`care.plans.page_size`={default:20,max:50}（hard_rule）；`care-watering-mvp/v2` 正文字段 `soilEvidenceFallbackHours`=24、`soilEvidenceMaxHours`=72。`care.watering.recheck_window_hours` 维持 pending、不阻断（MVP 模型自算窗口）。

**用户 2026-10-10 第三轮裁定（取代上两段的「hard_rule / 不走策略 release」表述）**：计划过期宽限、浇水补记天数、检查推迟上限、建议有效期与计划分页迁入策略发布 `care/long_term_rules`（正文 `care-long-term-rules/v1`，取值不变：72 / 7 / 7 / 24 / {20, 50}；绝对边界见目录 `care.long_term_rules.absolute_bounds`）。请求与每次扫描运行各锁定一份快照；策略不可用时对应接口返回 `503 SERVICE_UNAVAILABLE`、过期扫描本次 `not_started`，不回退源码默认值。扫描每批（V2_CARE_PLAN_EXPIRY_BATCH_SIZE，100–2000）与时长占比（V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT，20–80）为部署环境变量；cron 为触发器部署配置。§12 中「72 小时」均指策略 v1 取值。

## 附：U6 湿/微湿有效期公式裁决（主代理 2026-10-09）

「最早可能进入下一状态」按字面会退化为 0（读数可能正好在状态下界）。裁决采用：有效期 =（该状态 remainingFraction 上界 − 下界）× 植物基线最短干燥天数，即按最快干燥速度走完整个状态区间的时长；再受 `care.watering.soil_evidence_max_hours`=72 封顶，推算不出时用 `care.watering.soil_evidence_fallback_hours`=24。理由：室内盆栽主要风险是浇水过多导致烂根，「湿」判断偏长更保守；检查窗口仍由干燥回放独立给出。

## 12. 计划过期（用户 2026-10-09 裁决：定时任务写入过期；主代理 2026-10-09 配置裁决）

一句话：用户确认的「检查盆土」计划如果到点后 72 小时还没完成/跳过，就由每小时一次的定时任务把它标成 `expired`（已过期）；过期计划只读，不能再完成。打个前端比方：像购物车里的限时优惠券，过了有效期由后台批量置灰，前端再点「使用」会收到明确的「已过期」错误，而不是笼统的「数据冲突」。

### 12.1 判定规则

- 可过期状态：只有 `planned`（待完成）。`completed`、`cancelled`、`expired` 永不被扫描改写。
- 判定：`当前时刻 > scheduledAt + 72 小时` 严格大于；恰好等于 72 小时不过期。72 小时 = `care.plans.expiry_grace_hours`（与 `care-watering-mvp/v2` 的 `soilEvidenceMaxHours`=72 对齐：盆土证据最长有效期，过了这个时长「检查一次盆土」已失去意义，应重新获取建议）。
- 等价 SQL 条件：`status = 'planned' AND scheduled_at_ms < 当前时刻 − 72h`（以本次运行开始时刻为准，单次运行内所有批次使用同一截止时刻）。
- 标记内容：`status='expired'`、`version = version + 1`、`updated_at_ms = 写入时刻`；`plan_payload_json`（日历、`completedFactRef`=null）不变。不写事实、观察、提醒，不改来源建议状态。

### 12.2 并发安全（与用户「完成/跳过」竞争）

- 扫描写入是一条带条件的单表更新：`UPDATE care_plans SET status='expired', version=version+1, updated_at_ms=? WHERE status='planned' AND scheduled_at_ms < ? ORDER BY scheduled_at_ms, id LIMIT ?`。条件里的 `status='planned'` 就是并发闸门：InnoDB 对每一行先加行锁再按**最新已提交**值复核条件。
- 用户先完成：§7 用例已对计划行 `FOR UPDATE` 并写成 `completed/cancelled`；扫描语句等锁后复核条件不再满足 → 跳过该行，**不得**覆盖为过期。
- 扫描先过期：用户的 §7 事务对计划行加锁后读到 `expired` → 返回 409 `CARE_PLAN_EXPIRED`，不写事实、观察，不改计划。
- 扫描不读后写、不在应用内持有行快照，因此不需要比对版本号；版本号 +1 让持有旧 `version` 的客户端在后续写入时也会失败。

### 12.3 过期后再完成：409 `CARE_PLAN_EXPIRED`

- `POST …/plans/{planRef}/completions`：计划状态为 `expired` → 409 `CARE_PLAN_EXPIRED`（中文消息：「计划已过期，请重新获取浇水建议」），无论 `version` 是否匹配、`outcome` 是 `done` 还是 `skipped`。判定先于版本比对。
- 计划仍为 `planned` 但已超过 72 小时、扫描尚未运行（最长滞后约 1 个扫描周期）：以存储状态为唯一事实，仍可完成。不在请求路径上做「读时过期」，避免同一规则两处实现。
- 同一 `Idempotency-Key` 的首次结果重放优先（共享幂等表，T2）：过期前已成功的完成请求重放仍返回首次 200。
- `CARE_PLAN_VERSION_CONFLICT` 语义收窄为：版本不符，或计划为 `completed/cancelled`。
- `completeCarePlan` 错误集合 = 通用 + `CARE_PLAN_VERSION_CONFLICT` + `CARE_PLAN_EXPIRED`。

### 12.4 可见行为

- 计划列表（§5）：`status=expired` 返回已过期计划，`status` 字段为 `expired`、`completedFactRef` 为 null、`calendar` 原样保留（前端可提示「已过期，可从日历删除」）；默认 `status=planned` 不再包含已过期计划。
- 养护摘要（§4）`nextPlan` 只取 `planned`，已过期计划不出现。
- 无单计划详情接口；本节不新增接口。

### 12.5 扫描运行（`care.plans.expiry_scan`）

- 频率：每小时一次（CloudBase 7 段 cron `0 0 * * * * *`）。
- 分批：每批最多 500 行，每批一个独立短事务；某批影响行数 < 500 视为已清空，结束本次运行。
- 时长上限：本次运行开始时刻 + 函数超时的一半；到达上限不再开启新批次（已开启的批次跑完），剩余留给下一次运行。函数超时取运行时上下文提供的值；取不到 → 本次不执行（`not_started`），不猜默认值。
- 重复运行幂等：已过期行不再满足条件，重复运行只会处理新到期的计划。
- 失败恢复：某批数据库失败 → 该批整体回滚，已提交的批次保留，本次运行停止并记为 `failed`；下一次运行自动补上（条件写天然可重放）。提交结果未知同样停止，由下一次运行收敛。

### 12.6 审计与日志

- 每次运行写一条结构化日志 `care_plan_expiry_run`：`outcome`（`drained` | `deadline_reached` | `failed` | `not_started`）、`expiredCount`、`batchCount`、`cutoffAt`、`durationMs`。批次失败另写 `care_plan_expiry_batch_failed`，只含错误类名。
- 日志与返回值**不得**包含任何用户/植物/计划的内部主键、公开引用、平台主体标识（OpenID 等）、SQL 文本、连接配置或数据库错误原文。
- 单行审计以计划行自身 `status`、`version`、`updated_at_ms` 为准，不另建审计表（本阶段）。

### 12.7 部署形态

- CloudBase 定时触发器只能挂在**普通（事件型）云函数**上，HTTP 云函数仅由 HTTP 请求触发（CloudBase 文档《函数类型》对比表；cloudbase skill `cloud-functions`「Triggered by SDK calls or timers? → Event Function」）。因此新增 care 域事件函数入口 `care-plan-expiry`（`exports.main(event, context)`），复用 care Repository 与共享数据库连接，不暴露 HTTP 网关、不新建万能函数。
- 索引：`028_care_plan_expiry_scan_index.sql` 为 `care_plans(status, scheduled_at_ms, id)` 建扫描索引（既有 `idx_care_plan_due` 以用户列开头，不能支撑全局扫描）。

## 13. 时间线事件（2026-10-10 用户裁决）

- 记录浇水事实（§3、确认建议记录浇水 §6、完成计划附浇水 §7）与完成计划（`outcome=done`）时，在**同一事务**向 `care_outbox` 追加 pending 事件
  `care.watering_fact_recorded.v1` / `care.plan_completed.v1`；事件载荷只含公开引用、发生时间与浇水量，不含内部主键、`user_id` 以外的身份或备注。
- 事件由 care 事件函数 `care-outbox-dispatch` 派发给 user-plant 时间线投影；规则见 `docs/backend-v2/contracts/user-plant-timeline.md` §5
  与配置目录 `care.outbox_dispatch`（hard_rule：每分钟、租约 30 秒、每批 100、最多 5 次后死信）。
- 事务失败时事件与事实一起回滚；跳过计划（`cancelled`）不产生事件。
