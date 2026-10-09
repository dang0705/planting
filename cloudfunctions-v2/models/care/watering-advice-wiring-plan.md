# `POST /api/v2/care/watering-advice` 接线计划（E06，待主代理裁决后实施）

依据：`watering-advice-http-contract.md`（冻结）、`mvp-watering-policy-contract.md`、`mvp-watering-test-matrix.md`、`mvp-watering-policy-release.v1.json`、`user-plant/temporary-case-contract.md` §4。本文件只是计划，未写任何产品代码。

## (a) 请求链逐步零件

| 步骤 | 既有零件 | 缺口（新零件） |
|---|---|---|
| 大小/媒体限制 | 同 `create-temporary-case-route.ts` 的 415/413 写法 | 新路由文件 `src/care/http/watering-advice-route.ts` |
| 身份认证 | `extractBearerToken` | — |
| 主体解析 | `createResolveGuestOrUserPrincipal`（游客 `guest.` / 登录） | — |
| 归属校验 | 无 | **临时案例归属读取器**：游客 `gpc_` 属于该游客会话且 active 未过期；登录 `epc_` 属于该用户且 active 未过期（见 d）。`user_plant` 目标见 e-1 |
| DTO 校验 | `parseWateringAdviceRequest`（已有；未知字段拒绝、时间不晚于 now、坐标 0.01°） | 幂等头解析（照抄临时案例路由） |
| 策略快照 | `resolveMvpWateringPolicy`（纯解析） | **`care/mvp_watering` MySQL 读取器**（不存在，见 c） |
| 植物基线 | `createMysqlTropicalsWateringBaselineRepository`（需 `policyVersion`） | care→plant-knowledge 适配端口（见 d）；`policyVersion` 来源见 e-6 |
| 辐射 | `fetchOpenMeteoRadiation` + `normalizeOpenMeteoRadiation` | 查询窗口（pastDays/forecastDays）取值，见 e-5 |
| 植物光照 | `deriveMvpPlantLightIntervals`（单通道 Lux 法，**不用玻璃策略**） | — |
| 计算 | `assessMvpWatering`（纯计算） | 输入组装器：命令 + 光照时段 + 基线 → `AssessMvpWateringInput`；时区取 Open-Meteo 返回值 |
| 结果构造 | `temporary-care-result-record.ts`（锁定/摘要） | 输入清单、算法发布清单、派生集的构造器（坐标只存 0.01°） |
| 临时养护会话 | 无 | **按 caseRef 首次计算时创建 `temporary_care_sessions` 行**（合同 §4），需会话 Repository（查找或创建，锁案例行） |
| 持久化+幂等 | `saveTemporaryCareResult`（自带事务）、共享 `http_idempotency_records` | 见 e-3：需要把幂等占位/会话创建/结果追加/幂等完成放进同一事务，现有 `saveTemporaryCareResult` 的独立事务不满足 |
| 公开响应 | 无 | `CareCapabilityResponse` DTO + AJV（`{ resultRef: 'cres_…', result }`，不含输入快照/版本/摘要） |
| 审计/日志 | `RequestChainAuditEvent` | — |

## (b) 云函数入口、服务与构建

- 新建 `src/entries/care.ts`（Node22 CommonJS、端口 9000、pino 脱敏，与 diagnosis 入口同形）和 `src/care/http/server.ts`（`/health` + 冻结路由分发）。
- `scripts/build.mjs` 函数清单追加 `{ name: 'care', entry: 'src/entries/care.ts' }`。**注意**：该文件当前有他人未提交改动（weather 登记），追加一行会与之混在同一文件，需主代理决定由谁改。
- `generate-openapi.mjs` 增加 `WateringAdviceRequest` / `CareCapabilityResponse` 组件；route-registry 已有路由（P4）。

## (c) 策略发布与读取器

| 策略 | domain/policyCode | 读取器 | 测试库发布 |
|---|---|---|---|
| MVP 浇水 `care-watering-mvp/v1` | `care` / `mvp_watering`（scopeCode `care_mvp_watering`） | **不存在**，需新建 `mysql-mvp-watering-policy-reader.ts`（照 `mysql-mvp-glass-policy-reader.ts`） | 需发布 `mvp-watering-policy-release.v1.json` 到 qinghuazhi_v2_test（未做） |
| MVP 玻璃 `mvp-glass-policy/v1` | `care` / `mvp_glass` | 已存在 | **本接口不需要**：单通道法不叠加玻璃衰减；`glassLayers` 只保存 |
| Tropicals 名义基线 | 非 business_policy：`watering_baseline_policy` 表（policy_version＋tier＋trigger） | 已存在 | 测试库已有 22 条 v1 active 规则（据基线合同读回记录） |
| Open-Meteo Provider | 配置目录 `open_meteo` confirmed（total 8000ms、1 次、不重试） | 无 Provider Registry 读取器；identity 入口先例是入口常量 | 不涉及 |
| HTTP 公共限制 | `http/request_write` | 已存在 | 视 e-7 |

## (d) 跨域读取边界

- **care → plant-knowledge 基线**：care 不直接拼 SQL。定义 care 侧端口 `readPlantBaseline(catalogTaxonRef) → MvpPlantBaseline | null`，由 care 入口用 plant-knowledge 的 `createMysqlTropicalsWateringBaselineRepository` 实现（只读连接）。`not_found`/不受支持 → `null` → `insufficient_evidence(plant_baseline)`。
- **care → user-plant 临时案例归属**：care 不直接读 `guest_plant_cases` / `authenticated_ephemeral_plant_cases` 业务语义。推荐在 user-plant 域新增只读端口 `readOwnedTemporaryCase({principal, caseRef, nowMs}) → { status: 'owned', caseKind, expiresAtMs } | 'not_found' | 'expired'`，由 care 入口注入。事务内的会话创建与结果追加需要外键所需内部主键，只能在 care Repository 的同一事务里按公开引用＋归属再次 `FOR UPDATE` 锁案例行（与既有 `mysql-temporary-care-result-repository.ts` 的连表写法一致），只读端口用于前置 404。
- **care → identity**：只通过合并主体解析，不读平台字段。

## (e) 需主代理裁决的问题（附推荐）

1. **`user_plant` 目标本阶段是否支持？** 无长期浇水结果表（只有需要环境快照的 `care_decision_derivations`），且长期植物的 catalogTaxonRef/档案来源未定。**推荐**：本切片只支持 `temporary_case`；`user_plant` 返回 400 `VALIDATION_FAILED`（或登记新错误类型），长期结果存储另立切片。
2. **案例不属于本人/不存在/已过期的错误码。** 路由登记的错误集只有 VALIDATION_FAILED、PRINCIPAL_INVALID、IDEMPOTENCY_CONFLICT、SERVICE_UNAVAILABLE，没有 NOT_FOUND，也没有 415/413。**推荐**：在登记中补 `NOT_FOUND`（统一 404，不区分他人/不存在/过期）、`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`。
3. **幂等与事务。** `saveTemporaryCareResult` 自开事务、以 resultRef 自核对，不接共享幂等表。**推荐**：新写 care 应用用例，在一个事务内完成：幂等占位 → 锁案例 → 查找或创建临时养护会话 → 追加结果 → 读回 → 幂等完成；复用 `lockTemporaryCareResult`、record 校验与既有 Repository 的 SQL 形状（必要时给该 Repository 增加接收外部事务的追加方法），不改 `saveTemporaryCareResult` 现有行为。外部调用（读策略、读基线、Open-Meteo）在事务外完成，避免持锁等网络。
4. **临时养护会话/结果有效期来源。** `temporary_care_sessions.expires_at_ms`、`temporary_care_results.expires_at_ms` 必填，配置目录无对应变量。**推荐**：两者都等于所属临时案例 `expires_at_ms`（不延长、不新增配置），与 temporary-case/v1 “游客案例随会话失效”一致。会话按 (case, capability_type='watering', status='active') 复用：同一案例只保留一条 active 浇水会话（需在锁住案例行后查找，表上无唯一约束）。
5. **Open-Meteo 查询窗口与失败处理。** **推荐**：`pastDays` 覆盖“盆土观察 / 最近浇水 / Lux 测量”中最早者到今天（上限 92，超过则更早部分缺段），`forecastDays` 取最大允许值 16 以尽量闭合窗口（是否应进配置目录请裁决）；Provider `unavailable` → 辐射为空序列 → 光照 `anchor_radiation` 缺证据 → 无环境时段 → 窗口开放，仍返回盆土安全门（如 wet 暂停）结论，status 由 `assessMvpWatering` 决定，不返回 503；时区缺失时 `timezone=null`（当地日期为空）。配置目录写有 `cache_per_location_hour`，本切片**推荐不做缓存**（另立切片），请确认。
6. **基线 `policyVersion` 来源。** 基线 Repository 要求明确版本，MVP 浇水发布正文没有引用它。**推荐**：在配置目录登记 `care.watering.baseline_policy_version`（当前 `v1`）并写入 MVP 浇水发布正文或单独小策略；在登记前不得在源码写 `'v1'`。或由主代理裁决为硬规则常量。
7. **请求体上限与幂等保留期。** 同前两片，沿用 1 MB / 168h 代码常量约定（与 create-user-plant/diagnosis 一致），还是改读 `http/request_write` 发布？**推荐**：沿用约定，保持一致。
8. **请求摘要。** **推荐**：对 `parseWateringAdviceRequest` 前的原始 JSON 做规范 JSON（键排序）SHA-256，使字段顺序不同的同体重放仍命中；坐标原值也参与摘要（降精度前），避免两个不同精确坐标被判为同体。
9. **可重放的结果。** 重放应返回首次 `resultRef` 与 `result`（不重算、不再调 Open-Meteo）。无活动策略时的 200 `temporarily_unavailable` 是否也写临时结果并占用幂等键？**推荐**：写入幂等完成（可重放），但不写 `temporary_care_results`（无算法发布可锁定），`resultRef` 由幂等快照保存。需确认响应仍要求 `resultRef`。
10. **MySQL e2e 的基线表。** `watering_baseline_policy` 与 `tropicals_species_encyclopedia_ref` 不在 v2 schema manifest 里（只存在于云端测试库）。**推荐**：e2e 用测试内最小 DDL 夹具（标为 FK/读取桩，不冒充正式 DDL），并请主代理决定这两张表是否补正式迁移。

## 裁决（主代理 2026-10-09）

1. 本片只支持 `temporary_case`；`user_plant` → 400 `VALIDATION_FAILED`，消息「长期植物浇水建议暂未开放」。矩阵注明为阶段性限制。
2. 增加 `NOT_FOUND`（案例不属于我 / 不存在 / 已过期，统一 404）。413/415：共享请求链会产生且既有路由（如 `bindAuthenticatedEphemeralCase`）已登记，故照样登记 `PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`。
3. 新用例在一个事务内复用既有记录/锁零件，不改 `saveTemporaryCareResult`；网络与策略读取在事务之前。
4. 临时养护会话与结果的 `expires_at_ms` 均等于案例 `expires_at_ms`；每个案例最多一个 active 浇水会话。
5. 硬规则 `care.lighting.open_meteo_request_window_days` = {maxPastDays:92, maxForecastDays:16}。回看起点 = 土壤观察、上次浇水、Lux 读数中最早者，截断到 92 天。Provider 失败 → 光照缺段、窗口开放，仍 200；时区缺失为 null。本片不做缓存。
6. 硬规则 `care.watering.baseline_policy_version` = `'v1'`：源码常量 + 测试锁定，注释引用该 catalog id。
7. 沿用 1 MB / 168h 代码常量约定。
8. 请求摘要 = 原始 JSON 规范化（键排序）SHA-256。
9. 无活动策略时同样生成真实 `resultRef` 并写入 `temporary_care_results`（`algorithmReleaseManifest` 明确记录「无发布」），响应 200 + `temporarily_unavailable`。
10. 本片不写迁移；MySQL 套件用测试内最小表，列类型照抄测试库 information_schema。

## 待办登记

- plant-knowledge：v2 schema 缺 Tropicals 基线表（`watering_baseline_policy`、`tropicals_species_encyclopedia_ref`）正式迁移。
