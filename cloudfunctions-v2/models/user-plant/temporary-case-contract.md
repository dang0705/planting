# 临时植物案例创建合同 `temporary-case/v1`（主代理 2026-10-09 冻结）

依据：用户 2026-10-09 裁决——新增独立创建接口，浇水、诊断、识别共用同一个 `caseRef`；认领（游客）/绑定（登录）也按它进行。配置目录：`user-plant.guest.max_cases_per_session`=5、`user-plant.authenticated_ephemeral.case_ttl_hours`=168（均 confirmed）。存储沿用既有表：游客 `guest_plant_cases`（003），登录 `authenticated_ephemeral_plant_cases`（016）。

## 1. 接口

`POST /api/v2/user-plants/temporary-cases`（owner `user-plant`，security `guest_or_authenticated`，**必须带 `Idempotency-Key`**，requestContract `CreateTemporaryCaseRequest`，responseContract `TemporaryCaseResponse`）

请求体：严格空对象 `{}`。归属只来自已验证主体，客户端不得提交任何字段（多余字段 `VALIDATION_FAILED`）。

成功 `200 { data: { caseRef, ownerKind, expiresAt } }`：

| 字段 | 说明 |
|---|---|
| `caseRef` | 游客：`gpc_` + 高熵；登录：`epc_` + 高熵（与既有表引用前缀一致） |
| `ownerKind` | `'guest'` 或 `'authenticated'` |
| `expiresAt` | 带 Z 的 UTC ISO。游客：**等于所属游客会话的 `expiresAt`**（游客案例随会话失效；配置目录没有独立的游客案例有效期，不得借用登录临时案例的 168 小时变量）；登录：创建时刻 + `authenticatedEphemeralCaseTtlHours`（配置目录 `user-plant.authenticated_ephemeral.case_ttl_hours`=168） |

## 2. 规则

- **游客**：同一游客会话下 `status='active'` 且未过期的案例 ≥ 5 → `409 TEMPORARY_CASE_LIMIT_REACHED`（不新建）；游客会话必须 `active` 且未过期，否则 `401 PRINCIPAL_INVALID`。
- **登录用户**：本阶段不设数量上限（配置目录未登记登录临时案例上限，不私设默认）；只写 `authenticated_ephemeral_plant_cases`，绝不写 `guest_plant_cases`。
- **幂等**：沿用共享 `http_idempotency_records`。同主体同键同体 → 重放首次结果（含 409）；同键异体 → `409 IDEMPOTENCY_CONFLICT`；处理中 → 503。占位、计数（游客会话行加锁）、插入、读回与幂等完成同一事务。
- **策略**：两项限额/有效期来自已发布 `user-plant` 领域策略（`userplant_limits`）；无可信活动发布 → `503 SERVICE_UNAVAILABLE`，不得用源码默认值。
- **脱敏**：响应、日志、审计不含内部主键、游客令牌、user_id、会话摘要。

## 3. 错误

`VALIDATION_FAILED`(400)、`PRINCIPAL_INVALID`(401)、`TEMPORARY_CASE_LIMIT_REACHED`(409)、`IDEMPOTENCY_CONFLICT`(409)、`SERVICE_UNAVAILABLE`(503)。

## 4. 不在本合同内

- 临时养护会话（`temporary_care_sessions`）由各能力接口（如 watering-advice）在首次计算时按 `caseRef` 创建，不经本接口。
- 案例过期清理、认领/绑定流程沿用既有合同。
