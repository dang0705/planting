# 青花植后端 v2 数据字典

- 数据字典版本：`backend-v2-data/v1`
- 状态：Phase 1 合同冻结输入；具体 DDL 必须通过独立 TDD 和空库验证后才能执行。
- 原则：用户植物是一等公民；统一用户与平台身份分离；Repository 是唯一 SQL 入口。

## 1. 全局约定

| 约定 | 固定规则 |
|---|---|
| 内部主键 | 每张核心表使用 `BIGINT UNSIGNED` 自增或受控生成的内部主键，只用于数据库关联。内部主键永不进入公开响应。 |
| 公开引用 | API 使用带类型前缀的高熵字符串；`public_user_id` 固定为 `usr_` 加至少 8 位 ASCII `[A-Za-z0-9_-]`，禁止暴露记录数量或创建顺序。 |
| 用户归属 | 业务表只能使用统一用户内部键关联 `users`；平台 OpenID 等只存在于 `platform_identities`。 |
| 时间 | 数据库存储 UTC 毫秒或具有同等精度的 UTC 时间；API 统一输出 ISO 8601。 |
| 金额与额度 | 使用整数最小单位，禁止浮点数；AI 点数、积分和人民币分相互独立。 |
| 版本 | 可并发修改的聚合必须有 `version`；更新条件包含旧版本号。 |
| 软删除 | 只在合同明确要求恢复或审计时使用；不得以软删除代替数据清理策略。 |
| 字段说明 | 所有 DDL 表和字段必须有中文注释；所有关键 TS 类型和属性必须有中文注释。 |
| 公开安全 | 原始模型输出、提示词、供应商响应、内部状态、内部主键和平台主体标识均不进入公开响应。 |

## 2. 身份域 identity

### `users` — 统一用户主体

| 字段 | 含义与约束 |
|---|---|
| `id` | 内部 `BIGINT UNSIGNED` 主键。 |
| `public_user_id` | 对外 `usr_` 加至少 8 位 ASCII `[A-Za-z0-9_-]`，全局唯一、不可猜测；001 DDL 以 CHECK 拒绝其他格式。 |
| `status` | `active / suspended / deleting / deleted`。 |
| `session_version` | 会话撤销版本，必须大于 0；解绑或风险处置时由同一事务递增。 |
| `created_at` / `updated_at` | UTC 毫秒；`updated_at_ms >= created_at_ms`。 |

### `platform_identities` — 平台身份绑定

| 字段 | 含义与约束 |
|---|---|
| `user_internal_id` | 关联 `users.id`。 |
| `platform` | `wechat / douyin / xiaohongshu / phone`。 |
| `platform_subject_hash` | 规范化平台主体标识的 HMAC-SHA-256 检索摘要，固定为 64 位小写十六进制；原值不得进入业务域与日志。 |
| `subject_hash_algorithm` / `subject_hash_key_version` | 算法固定为 `HMAC-SHA-256`；密钥版本只保存 `[A-Za-z0-9._-]` 引用，不保存密钥材料。 |
| `platform_subject_ciphertext` | 仅在供应商回调确有需要时保存的服务端密文；不得参与公开响应。 |
| `app_scope` | 平台应用范围，避免不同小程序或应用主体的同名标识混淆。 |
| `binding_status` | `active / revoked / conflicted`；active 必须没有 `revoked_at_ms`，revoked 必须有撤销时间，conflicted 不携带撤销时间。 |
| 时间 | `bound_at_ms >= created_at_ms`、`updated_at_ms >= created_at_ms`；撤销时间若存在必须不早于绑定时间。 |
| 唯一约束 | `(platform, app_scope, platform_subject_hash)` 全局唯一；撤销后更新原记录，不允许换用户重建映射。 |

身份会话、服务 nonce 和匿名认证材料使用独立表；仅保存验证所需最小信息和失效时间。

- `user_sessions`：只保存 bearer 会话令牌 SHA-256（64 位小写十六进制）、统一用户、平台身份绑定、会话版本（大于 0）、轮换来源及签发/失效/撤销时间；`expires_at_ms > issued_at_ms`，签发和更新时间不早于记录创建时间，撤销时间位于签发与失效开区间内；复合外键保证会话用户、平台身份所有者和认证平台一致，轮换链也不得跨用户；不保存原始令牌。
- `service_replay_nonces`：服务名、密钥版本标识、nonce 摘要（64 位小写十六进制）、请求时间、请求体 SHA-256（64 位小写十六进制）、最小 scope、签名版本与失效时间；`expires_at_ms > verified_at_ms >= created_at_ms` 且更新时间不早于创建时间；`(service_name, nonce_hash)` 唯一且必须与验签原子写入，更换 `key_id` 不得重复消费同一 nonce。
- 同一平台主体撤销后只能恢复到原统一用户，不允许静默转绑其他用户。

## 3. 用户植物域 user-plant

### `user_plants` — 用户植物聚合根

| 字段 | 含义与约束 |
|---|---|
| `id` | 内部 `BIGINT UNSIGNED` 主键。 |
| `public_user_plant_id` | 对外 `upl_...`，全局唯一。 |
| `user_internal_id` | 所属统一用户；所有访问先做归属校验。 |
| `lifecycle_status` | `active / archived / deleting / deleted`。 |
| `current_identity_status` | `unidentified / candidate_pending / confirmed`。 |
| `version` | 乐观并发版本。 |

相关表：

- `user_plant_profiles`：昵称、展示图、盆器、介质等个体档案。
- `user_plant_care_contexts`：位置、栽培方式、光照、通风等当前养护环境。
- `user_plant_identity_history`：候选、确认、来源证据和被替代历史；`superseded` 只在此处出现。
- `user_plant_assets`：用户植物私有文件引用、用途、状态和清理时间，不保存公开 URL。
- `user_plant_timeline_projection`：可重建时间线投影，不作为事实写入口。
- `guest_sessions`：匿名主体摘要、当前及宽限期上一版持有证明摘要、单调递增证明版本、状态与 24 小时失效时间；状态不含 claimed。
- `guest_plant_cases`：游客临时植物案例、到期时间和认领状态，不伪造 `user_id` 或 `user_plant_id`。
- `guest_claim_commands`：认领命令、已验证证明版本、幂等键、目标用户植物和失败原因；同一案例仅能完成一次。
- `guest_case_claims`：只保存成功认领投影，对 `guest_plant_case_internal_id` 建唯一约束；失败命令不会永久阻断后续重新认领。

临时 care/diagnosis 结果只保存 `guest_plant_case_ref`。认领后由 `user-plant` 提供签名内部查询解析归属，禁止跨域直接改表。

## 4. 订阅、积分与 AI 额度域 subscription

### `capability_snapshots` — 请求级能力裁决快照

保存游客或登录用户在一次请求内使用的只读能力裁决，包括层级、允许能力、奖励 AI 范围、
活跃用户植物上限、策略发布内部键/高熵发布引用/版本/内容 SHA-256、有效期和规范化快照内容 SHA-256。
快照以复合外键锁定 `business_policy_releases` 中 `subscription/capability_catalog` 的同一不可变发布；
不能只保存无法核验的策略版本字符串，也不复制 `policy_json` 形成第二份策略事实源。游客必须没有
`user_internal_id`、层级固定为 `guest` 且植物上限固定为 0；登录用户必须关联统一用户。
该表只用于内部审计和回放，不是公开查询模型，也不代替会员、积分或额度账本。

### `care_point_ledger` — 不可变积分账本

保存 `grant / spend / reverse`、业务唯一键、策略版本、整数分值及原记录引用。客户端不能提交积分值。

### `care_point_accounts` — 积分投影

保存可用积分、累计净获得积分、等级和版本；可以从账本重建。

### `ai_quota_grants` — AI 额度批次

保存来源、范围、发放值、可用值、已预占值、已消费值、发放/到期时间、策略版本和状态。`available_amount` 是当前可扣余额，不包含 `reserved_amount`；审计未消费额为两者之和。三部分必须与发放值整数守恒；试用、会员、CMS、等级奖励必须分批记录。`source_type`、状态和正金额由 CHECK 固定为合同枚举；六类来源均在发放时写入绝对 `expires_at_ms`，且必须晚于 `granted_at_ms`，不得产生永久额度。

### `ai_quota_reservations` — AI 额度预占

保存产品动作、能力、成本策略版本、预估值、结算值、实际成本微元、用量证据引用、平台承担差额、幂等键、状态、待对账原因和到期时间。`settled_amount` 不得超过 `estimated_amount`；`reserved`/`pending_reconciliation` 不得伪造结算额，`settled` 必须有结算额，`released` 的结算额固定为 0。`reserved` 禁止携带待对账原因，`pending_reconciliation` 必须记录 `observed_cost_overage`、`reservation_ttl_expired` 或 `provider_result_unknown` 之一；进入最终结算或释放后保留该历史原因用于审计。实际成本超过预占时禁止多扣用户，进入 `pending_reconciliation` 并把差额计入平台承担成本；TTL 到期只进入待对账，不能自动释放。

### `ai_quota_reservation_allocations` — 预占到额度批次的分摊

记录一次预占从一个或多个 grant 锁定的正整数额度；唯一键防止同一预占重复分摊。每行必须满足 `reserved_amount = remaining_amount + settled_amount + released_amount`。创建预占时 `remaining_amount = reserved_amount` 且结算、释放均为 0；后续只能把 remaining 转入 settled 或 released，终态 remaining 必须归零，因此既允许合法初始预占，也不能结算超过分摊额或丢失释放额。

### `subscription_reward_inbox` — 奖励事件收件箱

保存事件唯一键、事件类型/版本、生产域、主体、用户植物、聚合引用、发生引用、事实发生时间、载荷摘要、生产域策略版本、`subscription` 独立解析的奖励策略版本与内容 SHA-256、处理状态和结果引用。它是 subscription 接收其他域奖励事实的唯一入口。生产域策略只证明业务事实如何形成，不能指定奖励分值；奖励策略必须按 `occurred_at_ms` 首次锁定并在重放时保持不变。`event_id` 与 `business_unique_key` 分别阻止同事件重放和不同事件 ID 的同一业务事实重复入账；`received`、`applied`、`rejected` 与结果/拒绝字段组合受 CHECK 约束。

### `care_point_ledger` / `care_point_accounts` — 积分事实与账户投影

`care_point_ledger` 只追加 `grant / spend / reverse` 事实，禁止原地改写历史；MVP 奖励来源固定为 `FIRST_PROFILE`、`DUE_SOIL_CHECK`、`DUE_FERTILIZER_CHECK`、`FIXED_DIAGNOSIS`，合同外来源由 CHECK 拒绝。`care_point_accounts` 保存可由账本重建的可用积分、累计净获得积分、等级和最后账本位置；普通消费只降低可用积分，不降低累计等级。

其他表：

- `trial_entitlements`：每个统一用户终身一次的 24 小时试用；`starts_at_ms` 通过复合外键固定等于 `users.created_at_ms`，`expires_at_ms` 必须精确等于起算时间加 86,400,000 毫秒，不能由首次打开功能、换设备、换平台或重新登录推迟。
- `subscriptions` / `subscription_periods`：会员及其周期。
- `payment_orders` / `payment_callback_inbox`：订单、验签后的回调和幂等处理。
- `care_level_grants`：终身一次的等级 AI 奖励发放记录。
- `care_redemptions`：积分兑换；MVP 目录为空但合同保留。状态固定 `requested / committed / rejected / reversed`；仅 `committed` 可关联积分 spend 账本，`reversed` 必须同时关联原 spend 和反向账本。
- `ai_quota_accounts`：用户级额度汇总投影，可由 grant 与 ledger 重建。
- `ai_quota_ledger`：预占、结算、释放、过期和冲正的不可变额度账本。
- `ai_provider_tariff_snapshots`：供应商、精确模型、输入/输出单价、币种、生效时间、来源证据和不可变价目 SHA-256。
- `ai_cost_policies`：绑定价目快照、安全系数、舍入规则、状态、生效区间和不可变发布 SHA-256。
- `ai_cost_policy_actions`：按小青文本、问诊文本、单图和多图等产品动作冻结 Token、图片、循环、最大成本和预占额度上限。
- `cms_contribution_reward_decisions`：由 plant-knowledge 持有的全局首发贡献奖励裁决，不由 subscription 直接写。

额度消费按到期时间、发放时间和批次引用稳定排序；权益层级只决定能力，不改变消费顺序。试用从统一用户 `created_at_ms` 起算 24 小时；会员额度在订阅周期末到期且不结转；贡献奖励从入账时起 3 个日历月有效。会员订阅和周期状态必须属于各自冻结枚举，且周期 `ends_at_ms` 必须晚于 `starts_at_ms`。

## 5. 植物知识与 CMS 域 plant-knowledge

- `plant_taxa`：科、属、种/栽培品种的规范身份与权威来源证据。
- `plant_taxon_aliases`：中文名、学名、别名和供应商名称到规范身份的映射。
- `plant_identity_candidates`：识别候选及证据，不能直接成为已确认身份。
- `cms_enrichment_requests`：缺口聚合、预算、租约、状态和贡献用户；游客触发时 `contributor_user_id` 必须为空。
- `content_drafts` / `content_releases`：草稿与不可变发布版本分离。
- `question_packages` / `question_package_releases`：题包及已发布版本。

Qwen 草稿仅可写基础展示介绍和约三个简短问答。毒性、浇水、施肥、光照、通风和诊断基本面必须来自内部维护并经过审核的内容。

## 6. 养护与诊断域

- `care_environment_observations`：不可变原子环境事实；一行只表达一种光照、空气温度、相对湿度、空气运动、盆器、基质、排水或盆土表面因素，并保存用户植物归属、来源类型/引用、空间范围、单位、置信度、观察时间、有效期和规范化证据 SHA-256。室外天气始终保持 `outdoor`，不能冒充室内或植物周围实测。
- `care_environment_snapshots`：一次养护/诊断计算锁定的不可变输入清单；保存用户植物、养护环境配置版本、原子观察引用清单、最近事实/盆土/天气/知识/配置 release 引用及 `input_manifest_sha256`。同一请求不得中途替换证据。
- `care_environment_derivations`：基于一条输入快照和不可变算法 release 追加的派生环境指标；首批包括 VPD、光照暴露、空气交换、基质干燥特征、环境干燥需求和预计干湿周期。保存算法 release、输入清单哈希、结果结构版本、结果 SHA-256、置信度和有效期；不得更新原子事实或伪装为永久植物属性。
- `care_facts`：浇水、施肥、换盆、位置变化和用户观察等已发生事实。
- `care_proposals`：算法建议；不等于事实。
- `care_plans` / `reminder_jobs`：用户确认后的未来动作与提醒。
- `watering_visual_evidence`：盆土视觉证据、私有文件引用、有效期和算法版本。
- `temporary_care_sessions` / `temporary_care_results` / `temporary_watering_visual_evidence`：游客临时养护对象，只关联 `guest_plant_case_ref`。已生成的临时结果必须内联保存原子输入清单、算法 release 清单、派生环境指标及各自 SHA-256，使游客结果可回放；登录认领只增加归属投影，不改写该结果。
- `diagnosis_sessions` / `diagnosis_answers` / `diagnosis_results`：问诊过程、证据和结果。
- 诊断知识增量（**P1 待冻结，当前 004 DDL 尚未覆盖，不得视为已建表**）：症状入口与园艺原因双轴目录、来源主档与可定位的来源主张、Outcome 结论、Action 行动、结论到行动的适用/禁忌映射，以及诊断域专用兼容发布包/active 指针。每项须有稳定代码、中文释义、来源定位与核验时间、适用植物范围、审核/发布版本和 SHA-256；CMS 审核凭据须绑定候选修订内容哈希。具体表拆分、字段、外键、唯一键、索引和旧内容处置必须先通过[诊断知识来源合同](../contracts/diagnosis-knowledge-sources.md)与新增 Phase-P1 ClickUp ticket 冻结，再追加独立迁移并做空库读回。现有 `diagnosis_results.conclusion_json` / `proposal_json` 只保存一次结果，通用 `content_releases.diagnosis_rule` 不承载完整诊断知识发布包，均不能替代可治理的来源主张、人工审核和兼容发布包。
- `diagnosis_visual_evidence`：私有诊断图片引用及保留期。
- `temporary_diagnosis_sessions` / `temporary_diagnosis_answers` / `temporary_diagnosis_results` / `temporary_diagnosis_visual_evidence`：游客临时问诊对象，只关联 `guest_plant_case_ref`。

所有长期记录必须归属 `user_plant_id`；游客临时结果只能归属 `guest_plant_case_ref`，在认领后通过归属投影解释。

原子环境事实、输入快照、派生环境指标和已生成的游客临时养护结果采用只追加模型：Repository 不提供更新用例，数据库触发器拒绝 `UPDATE`。修正事实、更换证据或升级算法时必须追加新记录，不得保持时间戳不变后篡改原行。

## 7. 可靠事件与审计

每个写域拥有自己的 `domain_outbox`；每个消费域拥有 inbox 或业务唯一键。事件必须包含事件公开引用、聚合公开引用、聚合版本、事件类型、schema 版本、发生时间和脱敏载荷。

审计记录只保留安全主体引用、动作、对象公开引用、结果和时间；不得保存凭证、Cookie、平台主体标识、请求体、原始模型输入输出或数据库内部主键。

## 8. 配置治理

- `business_policy_releases`：保存通过具体 TypeScript/AJV Schema 校验的领域策略发布、版本、内容 SHA-256 和生效区间；禁止任意万能键值。能力快照以发布内部键、领域/策略代码、发布引用、版本与内容 SHA-256 的复合外键回放其中的 `subscription/capability_catalog` 发布。
- `active_business_policy_releases`：按业务域和策略代码保存唯一 active 指针，使用版本号完成原子切换。
- `provider_config_releases`：保存 Provider endpoint 档案、`credential_ref`、超时/重试/限流/熔断/成本/回退等类型化配置及 SHA-256；不得保存密钥正文。
- `active_provider_config_releases`：按 Provider 和能力保存唯一 active 指针，切换时同时核对版本和 SHA-256。
- `configuration_request_snapshots`：保存一次请求实际使用的策略/Provider 发布清单及组合 SHA-256；不保存用户数据、追踪标识和凭证。
- `configuration_release_audit_records`：记录验证、激活、回滚和退役动作及脱敏证据引用。

一次请求开始后使用的配置快照不可变。身份、权限、支付、AI 成本与写操作无有效配置时失败关闭；天气、通知等能力只能按已发布回退合同受控降级。

## 9. 保留与删除基线

- 未认领游客案例：24 小时到期；失败/隔离材料最多保留 7 天。
- 诊断和盆土视觉证据：默认 30 天，除非后续法规/产品决策缩短。
- 用户删除：进入 30 天清理流程；支付法定审计材料按独立政策处理。
- 测试数据不是 v2 迁移源；植物主数据、题包和经审计身份数据必须经过旧资产处置与准确性闸门后才可初始化 v2。

具体 DDL 必须逐表补充外键、唯一约束、索引、中文 COMMENT、删除顺序和回退方案，并在全新空库上可重复执行。
