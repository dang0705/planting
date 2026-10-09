> **已被 `long-term-care-contract.md`（2026-10-09 冻结）替代。** 本草案仅保留为决策历史，不作为实现依据。

# 长期植物养护合同草案（待用户确认与主代理裁决，未冻结）

状态：**草案**。本文件只做摸底与方案，不含产品代码、测试或 DDL。依据：route-registry 中 6 个 care 路由；`004_care_diagnosis.sql`、`017`、`018`；`v2-data-dictionary.md` §6；`docs/backend-v2/contracts/` 中 `watering-decision-model.md`、`care-capability-output.md`、`care-manual-soil-observation.md`、`care-environment-foundation.md`；`models/care/` 中 MVP 浇水、`watering-advice-http-contract.md`、`irrigation-application-contract.md`；CLAUDE.md 第 4 节「诊断只产生建议；只有用户确认后的 care 用例才可写成养护事件或提醒」；配置目录。

一句话流程（给前端同学的类比）：**建议**像「购物车里的推荐商品」，可以有很多条、会过期；用户点了「确认」才变成**计划**（像「待办清单」）；用户真的做了才记成**事实**（像「已完成的订单」）。只有「事实」会改变浇水进度的起点。

---

## (a) 接口草案

通用规则（6 个接口都适用）：
- 归属：登录主体 `user_id` + 路径或请求里的 `userPlantRef`；由 user-plant 的归属读取确认「这棵植物是我的且未删除」，不是我的一律 404 `USER_PLANT_NOT_FOUND`（不泄露存在性）。
- 写接口必须带 `Idempotency-Key`，走共享 `http_idempotency_records`：同键同体重放首次结果，同键异体 409 `IDEMPOTENCY_CONFLICT`，处理中 503。
- 所有时间为带 Z 的 UTC；客户端提交的「发生时间」不得晚于服务器当前时刻。
- 响应不含内部主键、`user_id`、平台标识、策略摘要、输入快照。
- 补充错误（registry 现有条目缺）：`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`、`SERVICE_UNAVAILABLE` 需登记；归档植物写入的错误见 (d) T3。

### 1. `POST /api/v2/care/watering-advice`（`target.kind = 'user_plant'`）

- 权限：仅登录用户；游客 → 400（现有阶段性限制改为：游客 + user_plant → 400）。
- 请求：沿用 `WateringAdviceRequest`，但对长期植物：
  - `catalogTaxonRef`：**不填**，由植物档案提供（见 (d) U1/T1）；填了 → 400。
  - `pot`：**不填**，取档案 `measuredPot`；档案缺 → 结果缺证据 `pot`。
  - `lastWatering`：**不填**，取最近一条已确认浇水事实；没有 → 只能依赖盆土观察。
  - `location`、`window`、`lightReading`、`substrateMaterials`、`indoorClimate`、`soil`：本阶段仍由请求提供（见 (d) U2）。
- 响应：`{ data: { resultRef: 'cres_…', proposalRef: 'cpr_…' | null, result } }`；`result` 与临时案例完全同形（`care-capability-result/v1`）。`proposalRef` 仅在结果为 `ready` 且行动可被用户确认时出现。
- 写入（同一事务）：长期计算结果（新表，见 (b)）+ `care_proposals`（status `proposed`，`valid_until` = 结果 `validUntil` 或检查窗口最晚端）+ 幂等记录；**不写**事实、计划、提醒。
- 错误：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`（替代 `NOT_FOUND`）、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`；无策略 → 200 `temporarily_unavailable`（同临时案例）。

### 2. `POST /api/v2/user-plants/{userPlantRef}/care/facts`（「我刚浇过水」）

- 请求 `CreateCareFactRequest`：`{ factType: 'watering', occurredAt, amountMl?: number | null }`。本阶段只开放 `watering`（其余 `fertilizing / repotting / location_change / observation` 见 (d) U4）。
- 响应 `CareFactResponse`：`{ data: { factRef: 'cft_…', factType, occurredAt, amountMl } }`。
- 写入：`care_facts` 一行（`source_command_ref` = 服务端生成的命令引用，唯一约束防重复）+ 幂等记录。事实不可修改；记错了靠「更正事实」（后续合同）。
- 规则：`occurredAt` 不得晚于现在、不得早于植物创建时间；回填上限见 (d) U3。
- 错误：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`。

### 3. `GET /api/v2/user-plants/{userPlantRef}/care/summary`

- 响应 `CareSummaryResponse`（只读，不触发计算、不调用天气）：
  ```text
  { lastWatering: { factRef, occurredAt, amountMl } | null,
    latestWateringAdvice: { resultRef, generatedAt, status, action, checkWindow, proposal: { proposalRef, status } | null } | null,
    nextPlan: { planRef, planType, scheduledAt, status } | null,
    profileReadiness: { hasMeasuredPot: boolean, hasCatalogTaxon: boolean } }
  ```
- 不写任何表。归档植物可读。

### 4. `GET /api/v2/user-plants/{userPlantRef}/care/plans`

- 查询：`status=planned|completed|cancelled|expired`（可选，默认 `planned`）、`limit`（上限见 T5）、`cursor`（不透明分页）。
- 响应：`{ data: { items: [{ planRef, planType, scheduledAt, status, sourceProposalRef, completedFactRef | null }], nextCursor | null } }`。
- 只读。

### 5. `POST …/care/proposals/{proposalRef}/confirmations`

- 请求 `ConfirmCareProposalRequest`（三选一，严格互斥）：
  - `{ decision: 'schedule_check', scheduledAt }`：确认建议、安排一次「检查盆土」计划；`scheduledAt` 须落在建议的检查窗口内（或用户自选，见 U5）。
  - `{ decision: 'record_watering', occurredAt, amountMl? }`：用户说「按建议浇了」，直接写浇水事实。
  - `{ decision: 'dismiss' }`：不采纳。
- 响应 `CareConfirmationResponse`：`{ data: { proposalRef, proposalStatus: 'confirmed' | 'dismissed', planRef | null, factRef | null } }`。
- 写入（同一事务、条件写）：`care_proposals.status`（proposed → confirmed/dismissed，只能一次）；`schedule_check` → 新 `care_plans`（`uq_care_plan_proposal` 保证一个建议最多一个计划）；`record_watering` → 新 `care_facts`；`reminder_jobs` 本阶段**不写**（提醒窗口未冻结，见 (e)）。
- 规则：建议已过期 → 409（新错误类型或复用，见 T3）；已确认/已忽略 → 同键重放原结果，新键 409。
- 错误：现有四项 + `SERVICE_UNAVAILABLE` + 建议状态冲突（见 T3）。

### 6. `POST …/care/plans/{planRef}/completions`

- 请求 `CompleteCarePlanRequest`：`{ version, outcome: 'done' | 'skipped', observation?: { soil: { state, scope } } , watering?: { occurredAt, amountMl? } }`。`check_soil` 计划完成时可附带当时观察；若用户当时也浇了水，附 `watering` 同事务写事实。
- 响应 `CarePlanResponse`：`{ data: { planRef, status: 'completed' | 'cancelled', version, factRef | null } }`。
- 写入（同一事务、按 `version` 乐观并发）：`care_plans` 状态 + 版本；可选 `care_facts`；可选 `care_environment_observations`（盆土）。版本不符 → 409 `USER_PLANT_VERSION_CONFLICT` 类（见 T3）。

---

## (b) 现有表能否直接用

| 表 | 可用性 | 说明 |
|---|---|---|
| `care_facts` | 可直接用 | 有归属复合外键、`source_command_ref` 唯一、按时间索引；缺「不可修改」触发器（建议迁移补，见下） |
| `care_proposals` | 基本可用 | `result_json` 只存公开结果，**没有输入清单/算法版本/摘要**，无法按 `watering-decision-model` §9 回放；自带 `idempotency_key` 唯一键，与共享幂等表重复（见 T2） |
| `care_plans` | 可直接用 | `proposal_internal_id` 必填且唯一：计划必须来自建议，一个建议一个计划；有 `version` 乐观锁 |
| `reminder_jobs` | 表在，但本阶段不用 | `care.reminder.delivery_window` pending |
| `care_environment_observations` | 可用 | 手工盆土观察已有窄合同；但 `validUntil=null` 规定它不能进入当前盆土判断（见 U6） |
| `care_environment_snapshots` / `care_environment_derivations` / `care_decision_derivations` | 本阶段不用 | 需要 `care.environment.derivation_algorithm_release` 等 pending 发布；MVP 浇水是单一组合算法，不产出这些分层派生 |
| `user_plant_profiles` | 可用（盆器） | `pot_profile_json` 已有 `measuredPot`；**没有基质材料** |
| `user_plant_care_contexts` | 表在、无写入路径 | 位置/光照/通风 JSON 均无冻结 Schema，也无登记的写接口 |
| 长期浇水计算结果 | **缺** | 临时案例有 `temporary_care_results`（内联输入清单、算法清单、派生、各自摘要、不可改）；长期植物没有对等表 |
| 植物 → Tropicals 目录引用 | **缺** | `user_plants.confirmed_identity_internal_id` 指向 `plant_identities`，与 Tropicals `catalogTaxonRef` 不是同一事物（plant-catalog-search 合同明确不得等值） |

迁移草案（只描述）：
- **025 `care_capability_results`**（长期计算结果，只追加）：`result_ref`、`user_internal_id`、`user_plant_internal_id`（复合外键）、`capability_type`、`contract_version`、`details_schema_version`、`input_manifest_json/sha256`、`algorithm_release_manifest_json/sha256`、`derivations_json/sha256`、`result_json/sha256`、`generated_at_ms`、`valid_until_ms`、`_openid`、`created_at_ms=updated_at_ms`；触发器拒绝 UPDATE。`care_proposals` 增加可空 `capability_result_internal_id`（复合外键到同一植物的结果）。与 `temporary_care_results` 同形，便于复用记录锁定与摘要零件。
- **026 用户植物目录引用**：`user_plants` 增加可空 `catalog_taxon_ref VARCHAR(512)`（或独立表 `user_plant_catalog_bindings`，带设置时间与来源），由 user-plant 域写入（见 U1/T1）。
- **027 不可变保护**：`care_facts` 拒绝 UPDATE/DELETE 的触发器（事实只追加；更正为新事实）。
- 基质材料：若选 U2 的「记在植物上」，需在 `measured-pot-profile` 之外新增 `substrate-profile/v1` Schema，存 `user_plant_profiles` 新列或独立表——属 user-plant 域合同变更。

---

## (c) 与已实现部分的衔接

1. **复用 MVP 浇水模型**：`buildWateringAdvice` / `assessMvpWatering` 不改；长期植物只换「输入从哪来」：
   - 盆器：档案 `measuredPot` → `pot`（字段一一对应：`actualInnerPotConfirmed`、`drainageAvailable`、三项尺寸）。
   - 上次浇水：`care_facts` 中最近一条 `watering` 的 `occurred_at_ms` → `lastConfirmedWateringAt`（合同 §7：只有实际浇水事实重置进度）。
   - 植物基线：植物绑定的 `catalogTaxonRef`（026）→ 现有 Tropicals 基线读取（硬规则 v1）。
   - 盆土：本次请求的观察（与临时案例同样 `reliable:true`），同时追加一条 `care_environment_observations`（`source_kind=user_context`）作为历史。
   - 位置/窗户/Lux/基质/室内温湿度：本阶段请求提供（U2）。
2. **存储**：长期结果写 025 表（输入清单、算法清单含「无发布」、派生、结果及摘要），可回放；`care_proposals` 引用它。
3. **建议 → 确认 → 计划/事实**（CLAUDE.md §4 硬规则 `care.recommendation.write_fact_directly=false`）：
   ```text
   浇水建议（proposal: proposed）
     ├─ 用户「安排检查」→ proposal confirmed + care_plan(check_soil, planned)
     │      └─ 完成计划（可附盆土观察 / 浇水）→ plan completed (+ care_fact watering)
     ├─ 用户「我按建议浇了」→ proposal confirmed + care_fact(watering)
     └─ 用户「不采纳」→ proposal dismissed
   直接「我刚浇过水」（不经建议）→ care_fact(watering)
   ```
   计划、建议、提醒都**不**重置浇水进度，只有事实会。
4. **临时案例认领后**：认领只补归属（已实现），不把临时结果搬进 025 或改写成事实；认领后的下一次长期浇水建议才开始用长期输入。

---

## (d) 需要确认的决定

### 需要用户确认（每条附推荐）

- **U1 怎么知道这棵植物是什么品种？** 长期植物现在只记了「产品身份」，没记浇水知识用的 Tropicals 品种。推荐：用户在植物详情里选一次品种（复用现有品种搜索），之后浇水建议自动使用；没选时浇水建议提示「请先选择品种」。
- **U2 位置、窗户朝向、Lux 读数、土的材料每次都要填吗？** 推荐：第一版仍随每次「问浇水」一起提交（前端可以记住上次填的并自动带上），服务端只把盆器和上次浇水从档案里取；下一版再把位置/窗户/基质存进植物档案，做成「改了才需要重填」。
- **U3 「我浇过水了」最多能补记多久以前的？** 推荐：最多 7 天以前；更早的不接受（太久远的记录会让进度不准）。
- **U4 事实类型第一版开放哪些？** 推荐：只开放「浇水」；施肥、换盆、搬位置等等对应能力上线再开。
- **U5 安排检查的时间能不能自己选？** 推荐：默认用建议给出的最早检查时间，用户可以改，但只能在建议的检查窗口内（窗口没有最晚端时，最多往后 7 天）。
- **U6 手动记录的「盆土干/湿」能管多久？** 现在规定手动观察不参与判断。推荐：手动观察和照片判断一样，24 小时内有效（沿用已确认的 24 小时），超过就需要重新看一眼土。
- **U7 建议多久失效？** 推荐：一条浇水建议在它的检查窗口结束时失效；没有结束时间的，24 小时后失效，需要重新问。
- **U8 归档的植物还能记浇水、问建议吗？** 推荐：不能写，只能看历史；恢复后再继续。
- **U9 提醒（到点推送）这一版要不要？** 推荐：这一版只做「计划」列表，不做主动推送；推送等提醒时间窗口定了再做。

### 需要主代理裁决（技术）

- **T1 目录引用存哪**：`user_plants.catalog_taxon_ref` 列，还是独立绑定表（带设置时间、来源、可审计更换）。推荐独立表 `user_plant_catalog_bindings`（只追加，最新一条生效），并新增一个 user-plant 写接口（未登记）。
- **T2 `care_proposals.idempotency_key` 与共享幂等表重复**：推荐保留共享 `http_idempotency_records` 为唯一幂等事实，`care_proposals.idempotency_key` 写入「请求幂等键摘要 + 操作」以满足唯一键，不另做重放逻辑；或迁移去掉该唯一键（需删除证据门槛）。
- **T3 错误类型**：需新增或复用——建议状态冲突（已确认/已过期）、计划版本冲突、归档植物写入。推荐新增 `CARE_PROPOSAL_NOT_CONFIRMABLE`(409)、复用 `USER_PLANT_VERSION_CONFLICT` 语义为通用版本冲突或新增 `CARE_PLAN_VERSION_CONFLICT`(409)、新增 `USER_PLANT_ARCHIVED`(409)。
- **T4 长期结果存储**：025 新表 vs 给 `care_proposals` 加列。推荐新表（只追加、可回放，与临时结果同形）。
- **T5 列表分页上限**：`care/plans` 的 `limit` 上限是硬规则还是配置；推荐硬规则 50、默认 20。
- **T6 user_plant 浇水建议的写入事务**：结果 + 建议 + 幂等同事务；外部读取（策略、基线、Open-Meteo、档案、最近事实）在事务前完成，事务内再按归属锁植物行并核对档案版本未变（变了 → 503 重试）。
- **T7 care 读 user-plant 档案的边界**：care 不直接读 `user_plant_profiles` SQL；由 user-plant 提供只读端口（同临时案例归属端口模式）。
- **T8 `watering-advice` 路由 security**：现为 `guest_or_authenticated`；user_plant target 在用例内强制登录主体，路由不拆分。

---

## (e) 配置目录相关变量

| 变量 | 状态 | 对本阶段的影响 |
|---|---|---|
| `care.watering.algorithm_version` = care-watering-mvp/v1 | confirmed | 可用 |
| `care.output.contract_version` = care-capability-result/v1 | confirmed | 可用 |
| `care.soil_evidence.ttl_hours` = 24 | confirmed | 现指视觉证据；若采纳 U6 需扩展到手动观察（合同变更） |
| `care.watering.baseline_policy_version` = v1 | hard_rule | 可用 |
| `care.recommendation.write_fact_directly` = false | hard_rule | 确认流程的依据 |
| `care.lighting.open_meteo_request_window_days` | hard_rule | 可用 |
| `care.watering.recheck_window_hours` | **pending** | 阻断「v2 浇水建议」复查窗口；MVP 浇水用模型检查窗口，不依赖它（需主代理确认这一理解） |
| `care.reminder.delivery_window` | **pending** | 阻断主动提醒：本阶段不写 `reminder_jobs`（U9） |
| `care.environment.derivation_algorithm_release` | **pending** | 阻断分层派生表写入（本阶段不用） |
| `care.environment.factor_freshness_policy_release` | **pending** | 阻断原子证据过期判定；影响 U6（手动盆土观察能否参与判断） |
| `care.weather.current_freshness_minutes` / `forecast_freshness_minutes` | **pending** | 阻断依赖和风天气的结论；MVP 浇水用 Open-Meteo 辐射，不受影响 |
| `care.growth_activity.algorithm_release` | **pending** | 阻断季节性基线选择（MVP 不用） |
| `care.watering.personal_calibration_policy_release` | **pending** | 阻断个体校准（MVP 固定中性值，不阻断） |
| `care.indoor_environment.algorithm_release` | **pending** | 阻断无实测时的室内估算（MVP 用策略兜底区间，不阻断） |
| `care.reference_profile.release` | **pending** | 阻断植物级 Reference Profile 个性化（MVP 不用） |
| `care.fertilizing / lighting / ventilation.algorithm_version` 及阈值 | **pending** | 阻断三类能力；本阶段只做浇水 |
| `user-plant.profile.minimum_completeness` | confirmed | 档案完整度（`profileReadiness` 可参考） |

需新增登记（若采纳推荐）：浇水事实回填上限（U3，7 天）、检查计划最晚顺延（U5，7 天）、无结束时间建议的失效时长（U7，24 小时）、计划列表分页上限（T5）。
