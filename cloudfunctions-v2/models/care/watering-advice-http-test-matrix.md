# 浇水建议 HTTP 测试矩阵 `watering-advice/v1`

- 被测接口：`POST /api/v2/care/watering-advice`（operationId `createWateringAdvice`）。
- Expected 来源：`watering-advice-http-contract.md`（冻结）；`watering-advice-wiring-plan.md`「裁决」1–10（主代理 2026-10-09）；`mvp-watering-policy-contract.md`；`mvp-watering-test-matrix.md` I1（根区干＋16/12/14cm 有孔内盆＋泥炭珍珠岩 → `water_allowed`、建议 40～300 mL，为独立手算 Expected）；`user-plant/temporary-case-contract.md` §4；配置目录硬规则 `care.lighting.open_meteo_request_window_days`、`care.watering.baseline_policy_version`。
- 阶段性限制：本片只支持 `target.kind='temporary_case'`；`user_plant` → 400 `VALIDATION_FAILED`「长期植物浇水建议暂未开放」（裁决 1）。
- 解释性约定（非合同原文，交付时报告）：HTTP 用户自报的盆土观察以 `reliable: true` 进入映射（合同 §3「有可靠盆土观察」；请求无来源字段）。
- TDD 路径：Classic，测试先落盘跑 RED，再写产品。

## 1. 层次与边界

| 测试文件 | 层次 | 真实经过 | 替换边界 | 未覆盖 |
|---|---|---|---|---|
| `test/care/watering-advice-hard-rules.spec.ts` | unit_real_data（L1） | 两条硬规则常量、回看/预报天数计算；读取真实配置目录 JSON 核对 | 无 | 网络 |
| `test/care/mysql-mvp-watering-policy-reader.spec.ts` | unit_fake（L3） | 读取器 SQL 参数、行/指针/元数据校验、严格策略解析 | MySQL 连接替身 | 真实 JSON 列（见 e2e） |
| `test/contracts/care-capability-contract.spec.ts` | unit_real_data（L1） | 公开响应 AJV、route-registry、OpenAPI | 无 | 运行时 |
| `test/care/build-watering-advice.spec.ts` | unit_fake（L3） | 命令→光照→`assessMvpWatering`→清单组装 | Open-Meteo 以真实制品（`test/care/fixtures/open-meteo-hourly-radiation.json`）标准化后传入 | 网络、数据库 |
| `test/care/create-watering-advice-application.spec.ts` | unit_fake（L3） | 同事务编排：幂等占位→锁案例→会话→追加→读回→幂等完成 | 事务驱动、幂等、仓储替身 | SQL |
| `test/care/watering-advice-route.spec.ts` | unit_fake（L3） | node:http + 冻结分发 + 请求链；care server 无凭证不访问数据库 | 主体、归属、策略、基线、辐射、用例替身 | MySQL、真实 Provider |
| `test/e2e/watering-advice.mysql.spec.ts` | unit_real_data | 隔离 MySQL 8.4 全量 v2 DDL + 测试内最小 Tropicals 基线表（列类型照抄测试库 information_schema）+ 真实 care HTTP 服务、真实主体解析、真实策略读取器、真实基线仓储、真实幂等与临时养护表 | Open-Meteo 由 fetch 替身返回真实制品；时钟固定 | CloudBase、真实 Open-Meteo 网络、云端库 |

## 2. 用例

| ID | 场景 | Expected | 来源 |
|---|---|---|---|
| H1 | 回看天数 = 最早证据（盆土/上次浇水/Lux）到 now 的天数向上取整，截断 92；无证据 0；预报恒 16 | 硬规则 | 裁决 5 |
| H2 | 基线版本常量 = 'v1'，与配置目录一致 | 硬规则 | 裁决 6 |
| P1 | 策略读取：活动指针连发布 → 可用快照 + releaseRef；无行 → unavailable；指针不一致/元数据藏正文/状态非 active → 不可用 | 合同 §6、配置治理 | 策略合同 |
| C1 | 响应 `{resultRef: cres_…, result}`；result 只含 care-capability-result/v1 外壳与 watering-assessment/v1 详情；不得含输入快照/策略版本/摘要 | HTTP 合同 响应 | 合同 |
| C2 | 路由登记：errors 含 VALIDATION_FAILED、PRINCIPAL_INVALID、NOT_FOUND、PAYLOAD_TOO_LARGE、UNSUPPORTED_MEDIA_TYPE、IDEMPOTENCY_CONFLICT、SERVICE_UNAVAILABLE；OpenAPI 组件同步 | 裁决 2 | 裁决 |
| B1 | 无策略 → `temporarily_unavailable`，算法清单记录 `none_published` | 合同「无活动策略发布 → 200」、裁决 9 | 合同 |
| B2 | 辐射不可用 → 无环境时段、时区 null；根区干＋有孔内盆＋材料 → 仍 `water_allowed` 且 40～300 mL（水量与环境无关） | 裁决 5、mvp 矩阵 I1 | 合同 |
| B3 | 根区湿 → `pause_watering`、无水量 | mvp 合同 §3 | 合同 |
| B4 | 基线缺失 → `insufficient_evidence` | mvp 合同 §6 | 合同 |
| B5 | 输入清单坐标为 0.01° 降精度值，不含精确坐标 | HTTP 合同 location | 合同 |
| A1 | 应用：同事务顺序；会话/结果 expires = 案例 expires | 裁决 3/4 | 裁决 |
| A2 | 已有 active 浇水会话 → 复用，不新建 | 裁决 4 | 裁决 |
| A3 | 案例锁不到 → 404 NOT_FOUND 写幂等完成 | 裁决 2 | 裁决 |
| A4 | 幂等 replay/conflict/wait → 不触达仓储 | HTTP 合同 写入与幂等 | 合同 |
| A5 | 追加失败 → 回滚、无幂等完成 | 同事务 | 裁决 3 |
| R1 | `user_plant` → 400「长期植物浇水建议暂未开放」，不读策略/不调 Provider | 裁决 1 | 裁决 |
| R2 | 未知字段 / 非 JSON / 时间晚于 now → 400 | HTTP 合同 | 合同 |
| R3 | 缺/非法幂等头 → 400；缺 Bearer → 401 | HTTP 合同 | 合同 |
| R4 | 游客传 epc_ / 登录传 gpc_ / 归属读取 not_found → 404，不调 Provider | 裁决 2 | 裁决 |
| R5 | 策略或基线读取抛错 → 503；Provider 不可用仍 200 | 裁决 5 | 裁决 |
| R6 | Provider 查询坐标为降精度值，past/forecast 来自 H1 | HTTP 合同、裁决 5 | 合同 |
| R7 | 请求摘要 = 原始 JSON 规范化 SHA-256：键顺序不同同摘要 | 裁决 8 | 裁决 |
| E1 | e2e 游客 Happy：200，resultRef 可在 temporary_care_results 读回，result_json 与响应一致；会话/结果 expires = 案例 expires；只写一条会话 | 合同 + 裁决 | — |
| E2 | e2e 同键同体重放：同 resultRef，不新增结果行；同键异体 409 | 合同 | — |
| E3 | e2e 登录用户临时案例 Happy；他人案例 404；无策略 200 temporarily_unavailable 且仍写结果行 | 裁决 2/9 | — |
| E4 | e2e 第二次不同键请求复用同一 active 浇水会话 | 裁决 4 | — |
| E5 | e2e 脱敏：响应/审计/结果表不含令牌、user_id、会话引用、精确坐标 | 合同 | — |

## 3. 明确未覆盖

- 真实 Open-Meteo 网络与配额、缓存（裁决 5 本片不做）；CloudBase 部署与网关。
- 长期植物（裁决 1）；算法数值精度（已由 mvp 矩阵覆盖，本矩阵只复用 I1 水量）。
