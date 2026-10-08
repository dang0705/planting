# 临时植物案例创建测试矩阵 `temporary-case/v1`

- 被测接口：`POST /api/v2/user-plants/temporary-cases`（operationId `createTemporaryCase`）。
- 唯一 Expected 来源：`models/user-plant/temporary-case-contract.md`（主代理 2026-10-09 冻结）；配置值来源：`docs/backend-v2/architecture/configuration-variable-catalog.md` 中 `user-plant.guest.max_cases_per_session`=5、`user-plant.authenticated_ephemeral.case_ttl_hours`=168（confirmed）；表结构来源：`docs/backend-v2/schema/003/007/008/016/023`；共享幂等协议：`src/foundation/idempotency/*`（既有已验收合同）。
- 策略合同：`user-plant-limits-policy/v1`（domain `user-plant`、policyCode `userplant_limits`、scopeCode `userplant_limits`），正文字段固定顺序 `contractVersion, scopeCode, guestMaxCasesPerSession, authenticatedEphemeralCaseTtlHours`，摘要 = `SHA-256(JSON.stringify(按上述顺序的正文))`。测试中的摘要一律在测试里独立按此顺序计算，不调用被测摘要函数。
- 5 与 168 只出现在测试夹具中（配置目录已确认值），产品源码与环境变量不得出现这两个默认值。
- TDD 路径：Classic。全部测试先落盘并在无产品实现时运行（RED：模块不存在 / 路由 404），再写产品至 GREEN；关键规则另做仓库外突变探针。

## 1. 层次与边界

| 测试文件 | 层次标记 | 真实经过 | 替换的边界 | 明确未覆盖 |
|---|---|---|---|---|
| `test/configuration/user-plant-limits-policy.spec.ts` | unit_fake（L1 纯函数） | 策略 AJV 白名单、摘要、时间窗、快照冻结 | 无（纯函数） | 数据库读取 |
| `test/user-plant/mysql-user-plant-limits-policy-reader.spec.ts` | unit_fake（L3 替身连接） | 读取器 SQL 参数、行校验、正文白名单、解析 | MySQL 连接替换为内存替身 | 真实 MySQL JSON 列行为（见 e2e） |
| `test/contracts/temporary-case-contract.spec.ts` | unit_real_data（L1） | 公开 AJV 校验器、真实 route-registry.json、OpenAPI 产物 | 无 | 运行时 |
| `test/user-plant/temporary-case-rules.spec.ts` | unit_fake（L1） | 数量上限、游客会话有效性、有效期取小规则 | 无 | 持久化 |
| `test/user-plant/create-temporary-case-application.spec.ts` | unit_fake（L3） | 应用编排：幂等占位→锁→计数→插入→读回→幂等完成同事务、拒绝写入为可重放结果、内部故障回滚 | 事务驱动、幂等 Repository、临时案例 Repository 为替身 | 真实 SQL、行锁 |
| `test/user-plant/create-temporary-case-route.spec.ts` | unit_fake（L3） | 真实 node:http + 冻结路由分发 + 固定请求链；server 级无凭证不访问数据库 | 主体解析、策略读取、应用用例为替身 | MySQL、真实令牌 |
| `test/e2e/temporary-case.mysql.spec.ts` | unit_real_data（真实 MySQL 8.4 隔离容器 + 真实 user-plant HTTP 服务） | 全量 schema manifest、真实游客/登录主体解析、真实策略读取器、真实幂等表、真实行锁与事务回滚 | 无云端；docker 隔离库；时钟固定 | CloudBase 网关、云端数据库、真实平台登录 |

## 2. 用例矩阵

| ID | 场景 | 规则/Expected | 来源 | 层 |
|---|---|---|---|---|
| P1 | 策略 Happy：活动发布 → 快照含 guestMaxCasesPerSession=5、authenticatedEphemeralCaseTtlHours=168、版本与摘要 | 合同 §2 策略 | 合同+目录 | L1、reader、e2e |
| P2 | 策略多余字段 / 非正整数 / 摘要不符 / 非 active / 已过期 / 未生效 / 无发布 → 不可用（null），不回退默认 | 合同 §2 策略、CLAUDE.md 8.1 | 合同 | L1、reader |
| C1 | 请求校验器只接受 `{}`；响应校验器：游客 `gpc_`+guest、登录 `epc_`+authenticated、带 Z 的 UTC；混配前缀/多字段拒绝 | 合同 §1 | 合同 | L1 |
| C2 | route-registry 登记 createTemporaryCase（POST、guest_or_authenticated、P2、required_header、五个错误）且 OpenAPI 同步、错误枚举含 TEMPORARY_CASE_LIMIT_REACHED | 合同 §1/§3 + 任务指令 | 合同 | L1 |
| D1 | 游客 active 未过期案例数 < 上限 → 创建；= 上限 → limit_reached | 合同 §2 游客 | 合同 | L1 |
| D2 | 游客 expiresAt **等于所属游客会话 expiresAt**；会话早于与晚于 now+168h 两种情况都必须等于会话 expiresAt，不得借用 authenticatedEphemeralCaseTtlHours（主代理 2026-10-09 裁决更新合同 §1） | 合同 §1 expiresAt | 合同 | L1、e2e |
| D3 | 游客会话非 active 或已过期 → principal_invalid | 合同 §2 游客 | 合同 | L1、e2e |
| D4 | 登录 expiresAt = now + 有效期小时 | 合同 §1 | 合同 | L1、e2e |
| A1 | 游客 Happy：幂等占位、会话锁、插入、读回、幂等完成同一事务，响应 200 `{data:{caseRef,ownerKind:'guest',expiresAt}}` | 合同 §1/§2 幂等 | 合同 | 应用、e2e |
| A2 | 登录 Happy：只调用登录用户锁与登录案例插入，绝不调用游客案例写入 | 合同 §2 登录 | 合同 | 应用、e2e（guest_plant_cases 行数不变） |
| A3 | 游客第 6 个 → 409 TEMPORARY_CASE_LIMIT_REACHED，结果写入幂等完成并提交，不插入 | 合同 §2/§3 | 合同 | 应用、e2e |
| A4 | 幂等 replay / conflict / wait_for_winner → 原样重放 / 409 IDEMPOTENCY_CONFLICT / 503，且不触达案例 Repository | 合同 §2 幂等 | 合同 | 应用；e2e 用真实幂等表（同键异摘要直接调用应用服务，因 HTTP 唯一合法正文为 `{}`） |
| A5 | 插入失败（内部错误）→ 回滚、无幂等完成、错误上抛 | 合同 §2 同事务 | 合同 + 公共 scene「写中断」 | 应用；e2e 用触发器制造插入失败，断言幂等表与案例表无残留 |
| A6 | 会话行缺失（并发失效）→ 401 PRINCIPAL_INVALID 可重放 | 合同 §2 | 合同 | 应用 |
| R1 | 非 JSON / 非空对象 / 多余字段 / 数组 → 400 VALIDATION_FAILED，不读策略、不进事务 | 合同 §1 | 合同 | 路由 |
| R2 | 缺 / 过短 / 重复 Idempotency-Key → 400 | 合同 §1 | 合同 | 路由 |
| R3 | 缺 Bearer、主体解析 PRINCIPAL_INVALID、游客主体已过期 → 401，不读策略、不进事务 | 合同 §2 | 合同 | 路由、e2e（过期/completed 会话、未知令牌） |
| R4 | 策略读取 null 或抛错 → 503 SERVICE_UNAVAILABLE，不进事务 | 合同 §2 策略 | 合同 | 路由、e2e（无活动指针时无写入） |
| R5 | 媒体类型错误 → 415；超大正文 → 413（既有 HTTP 公共合同） | http-api 公共合同 | 既有合同 | 路由 |
| R6 | 游客命令：principalType=guest、scope 为会话引用摘要、caseRef 前缀 gpc_；登录命令：principalType=user、caseRef 前缀 epc_；幂等键只以摘要进入命令 | 合同 §1 + 共享幂等协议 | 合同 | 路由 |
| S1 | 脱敏：响应、审计与幂等快照不含内部主键、游客令牌、user_id、会话摘要、Idempotency-Key 原文 | 合同 §2 脱敏 | 合同 | 路由、e2e |
| S2 | 同键同体重放（含 409 重放）返回首次正文，且不新增行 | 合同 §2 幂等 | 合同 | e2e |
| S3 | 并发：同一游客会话已有 4 个时并发 3 个不同键请求 → 恰好 1 个成功 | 合同 §2「游客会话行加锁」 | 合同 | e2e |
| S4 | 过期或非 active 案例不计入上限 | 合同 §2 游客 | 合同 | L1（计数由 Repository 给出）、e2e（预置 expired/completed/过期 active 行） |

## 3. 风险维度覆盖（N/A 说明）

- U1 空值：空 Bearer、空正文、无策略 → R1/R3/R4。
- U2 边界：计数恰为上限-1/上限（D1、A3）；有效期取小两侧（D2）。
- U3 非法枚举：响应 ownerKind 与前缀混配（C1）；策略 contractVersion 未知（P2）。
- U4 重复提交：A4、S2、S3。
- U5 失败恢复：A5（回滚）、提交结果未知沿用既有对账（复用 `reconcileHttpIdempotencyCommitResult`，本矩阵以应用级一条用例覆盖）。
- U6 持久化读回：e2e 断言表行与响应一致。
- U7 脱敏：S1。
- 时区：所有时间以 UTC 毫秒与带 Z ISO 断言；N/A 本地时区。

## 4. 明确未覆盖

- CloudBase 网关、云端 MySQL、真实平台登录与游客令牌签发链路（签发由 identity 域既有测试覆盖）。
- 案例过期清理、认领/绑定（合同 §4 不在范围）。
- 提交结果未知的真实网络中断（仅应用级替身覆盖）。
