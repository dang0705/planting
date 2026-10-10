# 配置总入口：三层分层规则（configuration-layers/v2）

- 版本：v2，2026-10-10。以**用户 2026-10-10 新方针**为准：**日常维护以「环境变量 + 策略发布」为主，业务参数尽量少用代码常量。**
  v1（同日早些时候）「业务规则只放代码层」的表述作废。
- 状态：分类与迁移清单（§5）**待用户确认**。确认后再修订配置目录层级与状态、实现 CLI 与迁移。
- 关联：`configuration-and-providers.md` §1（合同总则）、`configuration-variable-catalog.json`（登记处）。
- 证据：`.codex/backend-v2/evidence/E00-configuration-entry-2026-10-10.json`。

## 1. 三层是什么（前端类比）

| 层 | 前端类比 | 何时生效 | 放什么 | 怎么改 |
|---|---|---|---|---|
| **策略发布** `BusinessPolicyRelease` | 带版本号、可一键回滚的远程配置平台 | **运行时**：发布新版本，再切换 active 指针；可回滚，可按版本复算历史结果 | 所有**有业务含义、将来可能调**的值（时长、天数、分页、上限、默认值、算法参数） | 策略发布 CLI：validate → publish → activate；出问题 rollback |
| **环境变量** `src/configuration/environment.ts` | 部署平台里的 `.env.production`，加一个用 schema 校验过的 `env.ts` | **部署时**：改函数环境变量，重启实例后生效 | 凭证、连接、Provider 超时、批量、租约、重试、日志级别等**运维**参数 | CloudBase 控制台或部署脚本；越界时函数启动直接失败 |
| **代码常量** `src/configuration/runtime-parameters.ts` | `constants.ts` 里那些「改了就是另一个协议」的值 | **随版本发布** | **只保留**协议、安全、数据完整性不变量和 Schema 硬边界 | 改代码 + 改合同 + 跑测试；每条都要写明「为何不能是策略或环境变量」 |

一个参数只属于一层，不存在「环境变量覆盖策略」或「策略覆盖代码」。唯一的组合关系是**代码硬边界框住策略**：
策略的 AJV Schema 用代码常量做 `maximum` / `minimum`。例如列表分页上限的策略值最多只能等于公开合同里 `maxItems` 的绝对上限；
策略只能在边界之内调整，不能突破已发布的 API 合同。

## 2. 分层判定规则

按顺序判定，命中即停：

1. **凭证或连接信息** → 环境变量（只登记变量名，值不打印）。
2. **只影响「系统怎么跑」、不影响「用户看到什么业务结果」的运维旋钮**：超时、批量、租约、重试次数、单次运行时长占比、日志级别、连接池 → 环境变量，并且必须登记上下限。
3. **协议、安全或数据完整性的不变量**：事实不可变、归属校验、状态枚举、令牌熵、HMAC 最小字节、端口、单位换算、HTTP 状态码、合同版本字符串，以及**防攻击的请求体绝对上限**、与数据库列长度绑定的输入长度上限、外部 Provider 文档规定的硬上限 → 代码常量。必须写出「改它会破坏什么」。
4. **其余一切有业务含义的值** → 策略发布。按业务域合并成少量策略，禁止一个参数一个策略，也禁止万能 KV。

## 3. 策略发布层的硬要求（沿用 configuration-and-providers.md §4–§5）

- 每个策略有独立的 TypeScript 类型、AJV Schema、`schema_version`、不可变 release、规范化 SHA-256 和 active 指针；切换与回滚都写审计行。
- **复用现有表**：`business_policy_releases`、`active_business_policy_releases`、`configuration_release_audit_records`（`007_configuration.sql`）。新策略只是新增 `(domain_code, policy_code)`，**不需要新 DDL**。v1 种子 SQL 只写入 `docs/backend-v2/schema/seeds/`，不执行。
- **请求内只读快照**：一次请求（或一次定时任务运行）开头读一次 active 发布，后面全程用这一份。读不到、Schema 不过或 SHA 不符时：HTTP 返回 503，定时任务本次不执行（`not_started`）。**不回退源码默认值**。
- **按版本复算**：算法类结果要记下所用策略的 `release_version`，这样能用同一版本重算历史结果。所以和浇水计算同链路的参数应并入 `care/mvp_watering` 的新版本，不要另开一个策略。
- **上线顺序**：先发布并激活 v1，再部署读取策略的新代码。顺序反了会导致对应接口 503。

## 4. 环境变量层

现有 7 项运维覆盖（2026-10-10 主代理裁定）保持不变：微信 / 抖音登录、Open-Meteo、云存储的总时限；发件箱租约 / 每批；过期扫描每批。在新方针下另提议 3 项，见 §5.2 E8–E10。
读取、校验、脱敏规则同 v1：所有 `process.env` 只在 `environment.ts` 读取；非法或越界时启动失败，错误信息不含取值；空串视为未设置；凭证容器序列化输出 `[已脱敏]`。

## 5. 迁移清单（待用户确认）

图例：**旧层** `code`＝代码常量 / 注册表，`hard`＝目录 `hard_rule`，`dp-code`＝目录 `domain_policy` 但以代码常量实现。
「需新增」列：**类型**＝新策略类型 + AJV Schema + reader + v1 正文；**DDL** 一律「否」（复用既有表）。

### 5.1 迁到策略发布（取值不变）

| # | 参数（目录 key） | 现值 | 旧层 → 新层 | 目标策略（domain / policy） | 影响文件 | 需新增 | 实施 |
|---|---|---|---|---|---|---|---|
| P1 | 计划过期宽限 `care.plans.expiry_grace_hours` | 72h | hard → policy | `care / long_term_rules` | `care/domain/care-plan-expiry-rules.ts`、`care/application/expire-care-plans.ts`、`entries/care-plan-expiry.ts` | 类型 | 本轮 |
| P2 | 浇水补记天数 `care.facts.watering_backfill_max_days` | 7d | hard → policy | `care / long_term_rules` | `care/domain/long-term-care-rules.ts`、`care/http/long-term-care-routes.ts`、`care/application/long-term-care-commands.ts` | 同上 | 本轮 |
| P3 | 检查推迟上限 `care.plans.check_max_postpone_days` | 7d | hard → policy | `care / long_term_rules` | 同上 | 同上 | 本轮 |
| P4 | 建议有效期 `care.watering.open_window_proposal_valid_hours` | 24h | hard → policy | `care / long_term_rules` | 同上 + `care/application/create-user-plant-watering-advice.ts`（浇水建议路径，另一代理在改：届时由入口注入快照值） | 同上 | 本轮（浇水建议文件只改注入点，需与另一代理协调） |
| P5 | 计划列表分页 `care.plans.page_size` | {20, 50} | hard → policy | `care / long_term_rules` | 同上 | 同上（max ≤ 合同 `maxItems` 50） | 本轮 |
| P6 | 缺段补齐 `care.watering.drying_gap_fill_max_hours` | 6h | hard → policy | **建议并入 `care / mvp_watering` 新版本**（与浇水计算同一版本复算），主代理原示例为 `care.watering_runtime` | `care/watering/fill-mvp-drying-gaps.ts` 及浇水计算调用链 | mvp_watering 新 schema 版本 | **延后**：浇水建议路径另一代理在改 |
| P7 | 光照模型系数 `maximumPpfdPerGhi`=2.3、室内气候窗口 24h（未登记） | 2.3 / 24h | code → policy | 同 P6，并入 `care / mvp_watering` | `care/watering/derive-mvp-plant-light.ts` | 同 P6；先登记目录 | 延后，同 P6 |
| P8 | 用户植物列表分页 `user-plant.list.page_size` | {20, 50} | hard → policy | `user-plant / list_rules` | `user-plant/domain/user-plant-list-query.ts`、`user-plant/repository/mysql-user-plant-list-repository.ts`（maxFetchLimit=51 由 max+1 派生）、`contracts/user-plant-list-delete-contract.ts`（`maxItems` 50 保留为合同上限） | 类型 | **只出清单**（user-plant 另一代理） |
| P9 | 时间线分页 `user-plant.timeline.page_size` | {20, 50} | hard → policy | `user-plant / list_rules` | `user-plant/domain/timeline.ts`、`contracts/user-plant-timeline-contract.ts`（`maxItems` 保留） | 同上 | 只出清单 |
| P10 | 封面数量上限 `user-plant.assets.max_count_per_plant` | 1 | dp-code → policy | `user-plant / asset_rules` | `user-plant/domain/cover-asset.ts` | 类型 | 只出清单 |
| P11 | 替换封面清理天数 `user-plant.assets.replaced_cover_cleanup_days` | 7d | dp-code → policy | `user-plant / asset_rules` | 同上 | 同上 | 只出清单 |
| P12 | 上传 MIME 白名单 `storage.upload.allowed_mime_types` | jpeg/png/webp | dp-code → policy | `user-plant / asset_rules`（Schema 枚举只允许代码已支持魔数识别的类型，策略只能选子集） | 同上 | 同上 | 只出清单 |
| P13 | 上传最大字节 `storage.upload.max_image_bytes` | 5 MiB | dp-code → policy | `user-plant / asset_rules`（Schema `maximum` 为代码绝对上限，建议 10 MiB） | 同上 | 同上 | 只出清单 |
| P14 | 公开搜索返回上限 `plant-knowledge.search.result_max_items` | 20 | hard → policy | `plant-knowledge / public_search` | `plant-knowledge/repository/mysql-published-plant-search-repository.ts`、`plant-knowledge/application/search-plant-catalog.ts` | 类型（max ≤ 合同 20 的绝对上限） | 本轮 |
| P15 | 目录搜索默认条数 `plant-knowledge.catalog.default_limit` | 10 | hard → policy | `plant-knowledge / public_search` | `plant-knowledge/application/search-plant-catalog.ts` | 同上 | 本轮 |
| P16 | 城市气候推荐 top 上限 `weather.city_climate.recommend_top_max` | 50 | hard → policy | `weather / public_read` | `weather/application/city-climate-fit.ts` | 类型 | 本轮 |
| P17 | 城市气候推荐 top 默认（未登记） | 10 | code → policy | `weather / public_read` | 同上 | 同上；先登记目录 | 本轮 |

合并后**新增 5 个策略类型**：`care/long_term_rules`、`plant-knowledge/public_search`、`weather/public_read`（本轮实现）；`user-plant/list_rules`、`user-plant/asset_rules`（只出清单）。另需 `care/mvp_watering` 出一个新 schema 版本（P6、P7，延后）。

### 5.2 迁到环境变量（运维）

| # | 参数 | 现值 | 旧层 → 新层 | 变量名（建议） | 范围（建议） | 影响文件 | 实施 |
|---|---|---|---|---|---|---|---|
| E1–E4 | 4 个 Provider 总时限 | 5000/5000/8000/10000 | 已是 env（2026-10-10） | 已有 | 已裁定 | — | 已完成 |
| E5–E7 | 发件箱租约 / 每批、过期扫描每批 | 30s/100/500 | 已是 env（2026-10-10） | 已有 | 已裁定 | — | 已完成 |
| E8 | 发件箱最大尝试次数 `care.outbox_dispatch.maxAttempts` | 5 | hard → env（**与同日早先裁定「保留硬规则」不同，请确认**） | `V2_CARE_OUTBOX_MAX_ATTEMPTS` | 3–10 | `care/application/dispatch-care-outbox.ts`、`environment.ts`、入口 | 本轮（确认后） |
| E9 | 过期扫描时长占函数超时比例 `care.plans.expiry_scan.runBudgetFractionOfFunctionTimeout` | 0.5 | hard → env | `V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT`（整数百分比，避免小数解析） | 20–80 | `care/domain/care-plan-expiry-rules.ts`、`environment.ts` | 本轮（确认后） |
| E10 | 游客认领处理租约 `user-plant.guest_claim.processing_lease_seconds` | 30s | hard → env（主代理示例列为策略；我建议与发件箱租约一样按运维处理，请裁定） | `V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS` | 10–120 | `user-plant/domain/guest-claim-lease.ts` | 只出清单 |
| E11 | 待实现 Provider 超时 / 重试：`provider.baidu_plant.*`、`provider.qweather.timeout_ms`、`provider.wechat_pay.timeout_ms`、`provider.notification.max_attempts` | pending | provider_runtime → env | 实现时登记 | 实现时登记 | — | 冻结后随实现 |
| E12 | 两个定时任务 cron（`care.outbox_dispatch.cron`、`care.plans.expiry_scan.cron`）与 `intervalHours` | 每分钟 / 每小时 | hard → **部署配置**（CloudBase 触发器） | 不是进程环境变量，属部署清单 | — | 代码只保留说明 | 文档化 |

### 5.3 保留代码常量（每条写明为何不能是策略或环境变量）

| 类别 | 条目 | 为何不能是策略 / 环境变量 |
|---|---|---|
| 数据完整性不变量（目录 hard_rule，布尔或语义规则） | `care.environment.atomic_facts_immutable`、`derivation_must_not_overwrite_fact`、`weather_scope_must_be_outdoor`、`care.recommendation.write_fact_directly`、`diagnosis.advice.direct_fact_write`、`identity.platform_subject.single_owner`、`user-plant.lifecycle.owner_guard`、`user-plant.guest_claim.once / retroactive_points / direct_fact_or_plan_write`、`user-plant.lifecycle.deleted_recoverable`、`user-plant.identity.superseded_history_only`、`subscription.trial.once_per_user / anchor / reset_on_context_change`、`subscription.member.rollover_enabled`、`subscription.points.expiry_enabled`、`subscription.guest.forbidden_ownership`、`plant-knowledge.identity.release_required`、`plant-knowledge.taxonomy.*`（6 项）、`storage.private_assets.public_cms_allowed`、`storage.immutable_ledgers.delete_by_ttl`、`http.processing_order.fixed`、`reliable-events.delivery.semantics`、`configuration.*` 五项治理不变量、`provider.credentials.storage_mode` | 这些是数据库约束、触发器和审计闭环的前提。设成可切换，就等于允许关掉安全或归属保护，后果不可逆（事实被改写、跨用户访问、重复发奖）。 |
| 状态与枚举 | `user-plant.identity.current_states`、`user-plant.lifecycle.states`、`care.soil_evidence.states`、`care.output.status_values / confidence_values`、`diagnosis.result.terminal_states`、`subscription.entitlement.precedence`、`subscription.ai_action.required_budget_fields`、`plant-knowledge.cms.forbidden_fields` | 枚举同时写在 DDL、AJV 合同和前端分支里；运行时增删值会让旧客户端和数据库约束失配。 |
| 合同与算法版本、公式 | `diagnosis.result.record_schema_version / replay_contract_versions / public_read`、`diagnosis.knowledge.publication_contract`、`care.watering.baseline_policy_version`、`care.lighting.mvp_glass_selection`、`care.watering.root_zone_water_deficit`、`care.watering.local_calendar_dates`、`care.watering.substrate_mix_drying_rule`（含「主要材料 ½」）、`care.watering.cultivation_geometry_relation`、`care.cultivation.pot_safety`、`care.lighting.window_direct_geometry / interval_unit_definitions / open_meteo_interval_semantics` | 这是「怎么算」的定义，不是「算多少」的参数。改它等于发新算法版本，必须连同代码和复算测试一起发布。 |
| 安全与协议 | 令牌熵 32 / 16 字节、HMAC 密钥最少 32 字节、平台 code 最大长度 128 / 256、`servicePort=9000`、数据库端口上限 65535、服务签名时钟偏差 300s / nonce 600s（`identity.service_signature.*`，调用方与验证方必须同时一致） | 降低它们就是降低安全强度。签名参数是两个服务之间的协议，单边改动会互相拒签。 |
| 防攻击与合同绝对上限 | `http.json_body_limit_bytes`=1 MiB；`http.idempotency.retention_hours`=168h（http-api/v1 对客户端的重试语义承诺）；`plant-knowledge.search.query_max_code_points`=64、`encyclopedia.reference_max_code_points`=512（以及 `mysql-tropicals-taxon-reader.ts` 的 512）、`catalog.minimum_limit`=1；各 DTO `maxLength` / `maxItems`；各分页的合同 `maxItems` 绝对上限 | 正文上限是读入内存之前的防线，不能依赖一次数据库读取。输入长度和数据库列、索引绑定。幂等保留期写在公开合同里，改它要先改合同。这些值同时作为对应策略 Schema 的硬边界。 |
| 外部 Provider 文档硬上限 | `care.lighting.open_meteo_request_window_days` {92, 16} | Open-Meteo 官方允许的范围，超出即请求失败；策略不能大于它。 |
| 单位换算与 HTTP 状态码 | `3_600_000`、`86_400_000`、`1_000_000`、200 / 400 / … / 503 | 数学与协议事实，没有可调的意义。 |

### 5.4 已是策略发布（不变）

`identity/identity_sessions`（会话时长、游客 TTL 等）、`subscription/*`、`user-plant/userplant_limits`、`user-plant/profile_minimum_completeness`、`user-plant/profile_progress`（另一代理）、`care/mvp_watering`、`care/mvp_glass`、浇水基线策略（`024`）。目录中 127 项 policy 层不变。

## 6. 实施计划（确认后执行）

1. **配置目录**：按 §5 修订层级与状态。业务参数从 `hard_rule` 改为 `domain_policy` + `confirmed`，所在层 `policy`，取值不变；环境变量项登记 `environmentOverrides`；保留项写 `configurationTierNote` 说明原因。同步修订各领域锁定测试的 Expected（以本清单为真相源，先 RED）。
2. **策略发布 CLI** `cloudfunctions-v2/scripts/policy-release.mjs`，只用 Node 内置模块 + 现有 `mysql2` / `ajv` 依赖：
   - `validate`：按策略类型做 AJV 校验，并计算 canonical SHA-256。
   - `publish`：插入一条不可变版本，状态为 verified，不切换指针。
   - `activate`：条件更新 `WHERE version = 期望值 AND active_release_version = 期望值`，影响 0 行即判定并发冲突、拒绝执行；同时写一条审计行。
   - `list`：列出历史版本。
   - `rollback`：把指针指回上一版，同样走条件更新并写审计行。
   - 连接信息经 `environment.ts` 读取。默认 dry-run，只有显式 `--apply` 才真正写库。在本地 Docker MySQL 上做真实库测试。
3. **本轮迁移**：P1–P5、P14–P17，以及 E8、E9。每个策略包括：类型、AJV Schema、v1 正文（取值等于现值）、reader（请求内快照，读失败 503 / not_started）、领域代码改为从快照读取、v1 种子 SQL（只写文件）。
4. **只出清单**：P6–P13、E10（user-plant 域与浇水建议路径完成后再迁）。

## 7. 待用户拍板

1. **缺段补齐和光照系数（P6、P7）的归属**：并入 `care/mvp_watering` 新版本，还是按主代理示例新开 `care/watering_runtime`？我建议并入：它们和浇水计算是同一条链路，放在一起才能用同一个版本号复算历史结果。
2. **发件箱最大尝试次数和过期扫描时长占比（E8、E9）改为环境变量**：这和同日早些时候「最大重试次数保留硬规则」的裁定不同，需要确认。
3. **游客认领租约（E10）**：按运维参数走环境变量（我的建议，与发件箱租约一致），还是按示例走策略？
4. **以下 3 项按方针保留代码常量，需要确认**：服务签名时钟偏差 / nonce（协议参数）、幂等保留期 168h（公开合同承诺）、搜索词长度 64 / 引用长度 512（输入边界）。
5. **上线顺序**：先发布并激活各策略 v1，再部署读取策略的新代码。否则对应接口会返回 503。
