# 青花植后端 v2 业务关键变量目录

- 机器事实源：`configuration-variable-catalog.json`
- Schema：`configuration-variable-catalog/v1`
- 目录版本：`2026-10-04.1`
- 当前共 216 项业务/治理变量、16 个 Provider 配置档案：已冻结 87 项、待冻结 58 项、不可配置硬规则 71 项。

本文件由同目录生成脚本从 JSON 生成，便于中文阅读。实施 Agent 必须先按领域读取本文件，再只深读该变量引用的合同或决策；不得把 `P1_PENDING` 猜成默认值。待冻结项必须带原因与阻断范围，未冻结前只能推进不依赖该值的工作。

## 读取与变更规则

1. `已冻结`：实现必须从类型化不可变策略或受控部署配置读取，不得另写隐式常量。
2. `待冻结`：只能补证据、合同和测试；其 `blockingScope` 对应功能禁止进入实现或发布。
3. `不可配置硬规则`：必须由代码、数据库约束和测试共同保证，任何 CMS、数据库策略或环境变量都不能覆盖。
4. 每次变更必须同步 JSON、重新生成本文件、更新架构 SHA-256 清单，并执行 P1 配置架构测试。

## Expected 与测试边界

目录的静态校验元数据明确说明 Expected 的来源、已覆盖范围和未覆盖范围；不得把本地目录校验误报为真实 Provider 或 CloudBase 验收。

| 对象 | 测试层次 | Expected 来源 | 已覆盖 | 明确未覆盖 |
|---|---|---|---|---|
| variable | unit_real_data | 每项 expected 与 sourceRefs；已冻结值只接受 P0 决策、已冻结合同或可复算事实源。 | 校验变量 ID、状态、来源、ClickUp 绑定、pending 阻断范围与生成阅读版的一致性。 | 不证明策略运行时解析、DDL、CloudBase 读回或真实业务调用。 |
| providerProfile | unit_real_data | 每个 Provider 的 sourceRefs、输出合同、失败边界与 P0 外部能力证伪卡。 | 校验首批 Provider 档案字段、来源引用、阻断范围与生成阅读版的一致性。 | 不证明凭证有效、网络可达、超时重试、成本计量或真实供应商调用。 |

## 配置化裁决组

主代理先按以下裁决组比较真实变化来源、收益和复杂度，再决定变量是否配置化。领域子代理只能提交证据，不能自行扩大配置范围。

| 裁决组 | 决定 | 真实变化来源 | 收益 | 复杂度判断 |
|---|---|---|---|---|
| `hard_business_rule` | not_configurable | 只有业务架构或安全边界被正式推翻时才会变化，不属于运行期调整 | 保持单一语义、权限和数据一致性 | 配置化会引入越权、漂移和误操作风险，收益远低于复杂度 |
| `identity_sessions` | configurable | 登录平台安全要求、会话风险和用户体验基线会变化 | 可在不改业务代码时缩短/延长会话并快速止损 | 需版本、签发时快照和撤销测试，收益高于复杂度 |
| `entitlements_cost_rewards` | configurable | 套餐、成本、奖励和运营策略会随验证数据调整 | 保持历史账本不变的同时发布新策略并控制成本 | 需不可变策略、原子账本和审计，财务与运营收益显著高于复杂度 |
| `userplant_limits` | configurable | 用户层级、容量成本和档案产品策略可能调整 | 不删除历史数据即可调整未来创建和资产限制 | 需快照和边界测试，收益高于少量复杂度 |
| `taxonomy_governance` | mixed | 权威来源和证据策略可能新增，但分类唯一性和准入安全不可放松 | 允许经过审计地扩展来源，同时保持分类事实可靠 | 来源列表可版本化，唯一键/父链/隔离保留硬规则 |
| `cms_worker_content` | configurable | 内容结构、队列容量、平台预算和审核流程会随运营变化 | 可暂停成本、调整背压和升级展示结构而不影响已发布读取 | 需要队列、Schema、审计和回滚，成本治理收益更高 |
| `care_algorithms` | configurable | 养护算法、证据新鲜度和阈值会随验证数据迭代 | 在稳定外部合同下独立发布算法和阈值并可回放 | 需算法 release 和回归矩阵，长期算法迭代收益显著 |
| `diagnosis_releases` | configurable | 题包、Prompt、Schema、模型产品选择和动作成本会版本化升级 | 可以灰度/回滚且保证历史问诊可回放 | 需组合版本与严格校验，但医疗式建议风险和 AI 成本收益更高 |
| `retention_security` | configurable | 数据最短必要期限、容量和合规要求会调整 | 可按对象类别执行可审计保留和清理 | 需补偿、反向引用和法务确认，隐私收益高于复杂度 |
| `provider_runtime` | configurable | 供应商端点、套餐、限流、故障和价目会变化 | 统一止损、切换合格 Provider、控制超时与成本 | 需 Registry、Adapter、快照和真实验证，外部依赖风险收益显著 |
| `http_runtime` | mixed | 请求容量与防滥用基线会随真实流量变化，但安全处理顺序不可变 | 可调整资源和防刷阈值而不改协议语义 | 数值版本化，安全顺序保留硬规则 |
| `reliability_ops` | configurable | 事件吞吐、积压和故障恢复基线会变化 | 可调批次、租约和退避而保持至少一次加幂等语义 | 运行参数配置化，投递语义保留硬规则 |
| `slo_capacity` | configurable | 真实负载、套餐和数据库容量会变化 | 可在证据基础上调整告警与容量，防止成本或连接雪崩 | 需要压测和监控，可靠性收益明显 |
| `configuration_governance` | mixed | 缓存与发布运营参数会变化，但不可变 release、SHA 和原子指针不可放松 | 兼顾快速发布回滚与可追溯性 | 运行参数配置化，治理不变量保留硬规则 |
| `deployment_environment` | configurable_outside_business_runtime | CloudBase 环境、地域、容量和凭证轮换会变化 | 通过受控部署实现环境隔离与密钥轮换 | 不进入 CMS 或业务表，部署治理收益高于复杂度 |

## 身份与访问主体

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `identity.guest.session_ttl_hours` | 游客令牌有效期 | `identity_sessions` | 领域策略 / 已冻结 | `168` 小时 | identity | identity、plant-knowledge、care、diagnosis、user-plant | 发布新身份策略，仅影响新签发会话；失败：无有效策略时拒绝签发游客会话 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `identity.guest.proof_rotation_grace_seconds` | 游客持有证明轮换宽限期 | `identity_sessions` | 领域策略 / 已冻结 | `300` 秒 | identity | identity、user-plant | 发布新游客身份策略，仅影响轮换后新宽限期；失败：策略不可用时不接受上一版证明，当前证明仍按会话有效期校验 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `identity.user.session_ttl_hours` | 登录用户会话有效期 | `identity_sessions` | 领域策略 / 已冻结 | `24` 小时 | identity | identity、全部公开业务域 | 身份策略新版本向前生效；失败：策略不可用时拒绝签发新会话，不延长旧会话 | P1 / [P2] 统一身份 Principal |
| `identity.user.refresh_window_hours` | 登录会话续期窗口 | `identity_sessions` | 领域策略 / 已冻结 | `0` 小时 | identity | identity | 启用续期必须发布新身份合同和策略版本，并新增轮换与撤销测试；失败：禁止静默续期；过期后重新验证平台凭证并签发新会话 | P1 / [P2] 统一身份 Principal |
| `identity.service_signature.clock_skew_seconds` | 内部服务签名允许时钟偏差 | `identity_sessions` | 领域策略 / 已冻结 | `300` 秒 | identity | Agent API、Job API、Callback API | 安全策略审批发布；失败：无值时拒绝内部签名请求 | P1 / [P1] 公共 HTTP 合同与 OpenAPI 路由骨架 |
| `identity.service_signature.nonce_ttl_seconds` | 内部签名防重放 nonce 有效期 | `identity_sessions` | 领域策略 / 已冻结 | `600` 秒 | identity | Agent API、Job API、Callback API | 安全策略审批发布；失败：无值时拒绝内部签名请求 | P1 / [P1] 公共 HTTP 合同与 OpenAPI 路由骨架 |
| `identity.platform_subject.single_owner` | 平台主体唯一归属规则 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | identity | identity、全部业务域 | 不可配置，变更需架构重审；失败：冲突进入人工裁决 | P1 / [P2] 统一身份 Principal |
| `identity.cloudbase_auth.anonymous_enabled` | CloudBase 匿名身份启用 | `identity_sessions` | 领域策略 / 已冻结 | `true` | identity | identity、游客入口 | 发布新的不可变领域策略版本，只向前生效；失败：策略不可用时停止对应能力，不使用隐式默认值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `identity.guest.issuance_rate_per_hour` | 游客令牌每来源每小时签发上限 | `identity_sessions` | 领域策略 / 已冻结 | `10` 次/小时 | identity | identity | 发布新身份策略，只影响之后的签发判定；失败：策略不可用时拒绝签发游客令牌 | P2 / [P2] 统一身份 Principal |
| `identity.guest.douyin_anonymous_signal_enabled` | 抖音匿名信号作为游客防刷键 | `identity_sessions` | 领域策略 / 已冻结 | `true` | identity | identity | 发布新身份策略；失败：换取失败时不阻断签发，仅按客户端来源限流 | P2 / [P2] 统一身份 Principal |

## 权益、会员、积分与 AI 额度

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `subscription.entitlement.precedence` | 权益层级优先顺序 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["member","trial","free","guest"]` | subscription | subscription、全部业务域 | 不可由配置逆转语义；失败：无法判定时使用最低合法层级 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.trial.duration_hours` | 一次性试用有效期 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `24` 小时 | subscription | identity、subscription、diagnosis、CloudBase Agent | 新策略只向前生效，既有绝对到期时间不重算；失败：策略不可用时不授予试用 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.trial.ai_points` | 试用 AI 点数 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `200` AI 点 | subscription | subscription、diagnosis、CloudBase Agent | 发布新试用策略，不覆盖已发 grant；失败：额度策略不可用时不授予生成式试用 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.trial.ai_scopes` | 试用 AI 能力范围 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `["USER_AGENT_TEXT","USER_DIAGNOSIS_TEXT","USER_DIAGNOSIS_VISUAL"]` | subscription | subscription、diagnosis、CloudBase Agent | 不可变策略版本；失败：scope 不匹配时拒绝预占 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.member.price_cny` | 会员订阅价格 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | 9.90 人民币元/订阅周期 | subscription | subscription、微信支付适配器 | 价格版本与订单快照绑定，不覆盖历史订单；失败：价格策略不可用时停止新下单 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.member.ai_points_per_cycle` | 会员每周期 AI 点数 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `2000` AI 点/订阅周期 | subscription | subscription、diagnosis、CloudBase Agent | 新套餐版本向前生效，历史 grant 不覆盖；失败：策略缺失时不发会员额度 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.member.rollover_enabled` | 会员额度跨周期结转 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | subscription | subscription | 不可配置；失败：周期结束将未消费会员 grant 置过期 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.reward.ai_scopes` | 奖励额度可用能力范围 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `["USER_AGENT_TEXT","USER_DIAGNOSIS_TEXT","USER_DIAGNOSIS_VISUAL"]` | subscription | subscription、diagnosis、CloudBase Agent | 新策略不扩张旧 grant scope；失败：不匹配时拒绝预占 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.reward.expiry_calendar_months` | CMS、等级与兑换奖励有效期 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `3` 日历月 | subscription | subscription | 新策略只影响新 grant；失败：无法解析时不发 grant | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.points.first_profile` | 首株有效档案积分 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `20` 积分 | subscription | user-plant、subscription | 按事件 occurredAt 锁定不可变策略；失败：策略无法解析则隔离事件 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.points.due_soil_check` | 到期盆土与浇水检查积分 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `5` 积分 | subscription | care、subscription | 按事件发生时策略；失败：策略不可用则不入账并进入重试 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.points.due_fertilizer_check` | 到期施肥条件检查积分 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `5` 积分 | subscription | care、subscription | 按事件发生时策略；失败：策略不可用则不入账并进入重试 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.points.fixed_diagnosis` | 有效固定题包问诊积分 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `10` 积分 | subscription | diagnosis、subscription | 按事件发生时策略；失败：策略不可用则隔离事件 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.points.fixed_diagnosis_window_hours` | 固定题包积分防刷窗口 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `720` 小时 | subscription | diagnosis、subscription | 新积分策略；失败：按更严格窗口拒绝重复奖励 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.points.expiry_enabled` | 积分是否过期 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | subscription | subscription | 不可配置；失败：积分持续有效 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.level.thresholds` | 养护等级阈值与奖励 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `[{"code":"L0","name":"萌芽","points":0,"aiReward":0},{"code":"L1","name":"扎根","points":100,"aiReward":50},{"code":"L2","name":"展叶","points":300,"aiReward":100},{"code":"L3","name":"生长","points":800,"aiReward":150},{"code":"L4","name":"茂盛","points":1800,"aiReward":250},{"code":"L5","name":"共生","points":4000,"aiReward":400}]` | subscription | subscription | 版本化发布，已发等级奖励不可重复；失败：策略无效时停止升级和奖励，不改积分账本 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.redemption.catalog` | MVP 积分兑换目录 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `[]` | subscription | subscription | 新增档位必须独立成本审批和真实并发验收；失败：返回稳定空目录 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.ai_cost.point_base_cny` | 单个 AI 点对应基础成本 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | 0.001 人民币元 | subscription | subscription、AI 成本对账 | 新成本策略版本，不重算已结算动作；失败：价目或策略缺失则停止新增生成式消费 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.ai_cost.safety_factor` | AI 成本安全系数 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | 1.25 倍 | subscription | subscription、AI 成本对账 | 新成本策略只影响新动作；失败：无有效策略不发起模型调用 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `subscription.ai_budget.monthly_cny` | 平台 AI 月预算 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `500` 人民币元/月 | subscription | subscription、observability、所有生成式能力 | 预算策略审批后按自然月生效；失败：预算事实不可用时停止新增 AI 消费 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.ai_budget.warning_cny` | AI 月预算告警线 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `400` 人民币元/月 | subscription | observability | 与月预算同版本；失败：无法计算时按最高风险告警 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.ai_budget.restrict_cny` | AI 月预算限制线 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `450` 人民币元/月 | subscription | subscription、所有生成式能力 | 与月预算同版本；失败：达到后仅保留必要对账 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.ai_reservation.ttl_seconds` | AI 额度预占有效期 | `entitlements_cost_rewards` | 领域策略 / 待冻结 | P1_PENDING 秒 | subscription | subscription、diagnosis、CloudBase Agent | 成本策略版本；失败：未冻结前不开放真实模型调用；待冻结原因：合同定义 expiresAt 但未冻结时长；阻断：生成式 AI 调用 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `subscription.ai_action.required_budget_fields` | AI 产品动作成本策略必填字段 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["modelFamily","providerCode","maxInputTokens","maxOutputTokens","maxImages","maxModelLoops","maxCostMicros","estimatedPoints","costPolicyVersion"]` | subscription | diagnosis、CloudBase Agent、subscription | 不可配置；具体动作值通过各动作不可变策略配置；失败：缺任一字段的产品动作不得开放 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `provider.wechat_pay.enabled_platforms` | 会员支付开放平台 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `["wechat_miniprogram"]` | subscription | subscription、PaymentAdapter | 新增平台需独立支付与对账合同；失败：非微信平台不提供购买入口 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `provider.wechat_pay.timeout_ms` | 微信支付调用超时 | `provider_runtime` | 第三方运行配置 / 待冻结 | P1_PENDING 毫秒 | shared-infrastructure | PaymentAdapter | Provider release；失败：未知结果只查单，不重新下单；待冻结原因：sandbox 真实回放未完成；阻断：订阅支付 | P5 / [P5] 真实 MySQL/API/安全/性能验收 |
| `provider.notification.max_attempts` | 平台通知最大尝试次数 | `provider_runtime` | 第三方运行配置 / 待冻结 | P1_PENDING 次 | shared-infrastructure | NotifyAdapter | Provider release；失败：记录未送达，不伪造成功；待冻结原因：平台通知范围尚未证伪；阻断：主动通知 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `subscription.guest.forbidden_ownership` | 游客禁止拥有正式业务资产 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"user_id":false,"userPlant":false,"membership":false,"points":false,"personalAgentContext":false}` | subscription | 全部业务域 | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.capability.catalog` | 四级主体能力目录 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `{"catalogVersion":"subscription-capability-catalog/v1","capabilities":[{"code":"PLANT_IDENTIFICATION","tiers":["guest","free","trial","member"],"consumesAiPoints":false,"scope":"public"},{"code":"FIXED_DIAGNOSIS","tiers":["guest","free","trial","member"],"consumesAiPoints":false,"scope":"public"},{"code":"INDEPENDENT_WATERING","tiers":["guest","free","trial","member"],"consumesAiPoints":false,"scope":"public"},{"code":"SOIL_VISUAL_EVIDENCE","tiers":["guest","free","trial","member"],"consumesAiPoints":false,"scope":"public"},{"code":"USER_PLANT_CREATE","tiers":["free","trial","member"],"consumesAiPoints":false,"scope":"user_plant"},{"code":"POINTS_LEVEL_QUERY","tiers":["free","trial","member"],"consumesAiPoints":false,"scope":"user"},{"code":"REWARDED_AI","tiers":["free","trial","member"],"consumesAiPoints":true,"scope":"reward_grant"},{"code":"USER_AGENT_TEXT","tiers":["trial","member"],"consumesAiPoints":true,"scope":"user"},{"code":"USER_DIAGNOSIS_TEXT","tiers":["trial","member"],"consumesAiPoints":true,"scope":"user_plant"},{"code":"USER_DIAGNOSIS_VISUAL","tiers":["trial","member"],"consumesAiPoints":true,"scope":"user_plant"}],"unknownCapabilityPolicy":"deny"}` | subscription | subscription、全部业务域 | 发布新的不可变领域策略版本，只向前生效；失败：只开放单独已冻结的能力，不把 ALL_PAID_CAPABILITIES 当作运行值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.trial.once_per_user` | 试用每个统一用户终身一次 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | subscription | identity、subscription | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.trial.anchor` | 试用起算锚点 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | user_created_at | subscription | identity、subscription | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.trial.reset_on_context_change` | 换平台、设备、重装或重新登录是否重置试用 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | subscription | identity、subscription | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.ai_action.agent_text` | 小青标准文本动作 | `entitlements_cost_rewards` | 领域策略 / 待冻结 | P1_PENDING 成本策略 | subscription | subscription、diagnosis、CloudBase Agent | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：真实价目、Prompt/Schema 和动作上限尚未共同冻结；阻断：生成式动作 USER_AGENT_TEXT | P4 / [P4] 固定/动态问诊与小青工具 |
| `subscription.ai_action.diagnosis_text` | 用户文本诊断动作 | `entitlements_cost_rewards` | 领域策略 / 待冻结 | P1_PENDING 成本策略 | subscription | subscription、diagnosis、CloudBase Agent | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：真实价目、Prompt/Schema 和动作上限尚未共同冻结；阻断：生成式动作 USER_DIAGNOSIS_TEXT | P4 / [P4] 固定/动态问诊与小青工具 |
| `subscription.ai_action.diagnosis_visual_single` | 用户单图视觉诊断动作 | `entitlements_cost_rewards` | 领域策略 / 待冻结 | P1_PENDING 成本策略 | subscription | subscription、diagnosis、CloudBase Agent | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：真实价目、Prompt/Schema 和动作上限尚未共同冻结；阻断：生成式动作 USER_DIAGNOSIS_VISUAL | P4 / [P4] 固定/动态问诊与小青工具 |
| `subscription.ai_action.diagnosis_visual_multi` | 用户多图视觉诊断动作 | `entitlements_cost_rewards` | 领域策略 / 待冻结 | P1_PENDING 成本策略 | subscription | subscription、diagnosis、CloudBase Agent | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：真实价目、Prompt/Schema 和动作上限尚未共同冻结；阻断：生成式动作 USER_DIAGNOSIS_VISUAL | P4 / [P4] 固定/动态问诊与小青工具 |
| `subscription.capability.guest` | 游客能力集合 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `["PLANT_IDENTIFICATION","FIXED_DIAGNOSIS","INDEPENDENT_WATERING","SOIL_VISUAL_EVIDENCE"]` | subscription | subscription、游客业务入口 | 发布新能力目录版本，只向前生效；失败：策略不可用时拒绝未明确能力 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `subscription.capability.free` | 登录免费用户能力集合 | `entitlements_cost_rewards` | 领域策略 / 已冻结 | `["PLANT_IDENTIFICATION","FIXED_DIAGNOSIS","INDEPENDENT_WATERING","SOIL_VISUAL_EVIDENCE","USER_PLANT_CREATE","POINTS_LEVEL_QUERY","REWARDED_AI"]` | subscription | subscription、登录业务入口 | 发布新能力目录版本，只向前生效；失败：策略不可用时拒绝未明确能力 | P1 / [P1] 业务策略与统一 Provider 配置架构 |

## 用户植物

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `user-plant.free.active_limit` | 免费用户活跃植物上限 | `userplant_limits` | 领域策略 / 已冻结 | `1` 株 | subscription | user-plant、subscription | 新策略限制未来创建及归档后重新激活，不删除或自动归档既有活跃植物；失败：策略不可用时拒绝新增及重新激活植物 | P1 / [P1] 用户植物、身份和游客认领合同 |
| `user-plant.profile.minimum_completeness` | 有效档案最低完整度 | `userplant_limits` | 领域策略 / 已冻结 | `{"profileVersion":"user-plant-profile/v1","requiredFields":["identityStatus","pot","location","lightingEnvironment","ventilationEnvironment"],"acceptedIdentityStates":["unidentified","candidate_pending","confirmed"],"rewardOncePerUser":true}` | user-plant | user-plant、subscription | 用户植物档案策略版本；失败：未冻结前不发首株有效档案积分 | P1 / [P1] 用户植物、身份和游客认领合同 |
| `user-plant.assets.max_count_per_plant` | 单株植物资产数量上限 | `userplant_limits` | 领域策略 / 待冻结 | P1_PENDING 个 | user-plant | user-plant、storage | 资产策略版本；失败：未冻结前只允许最小封面资产集合；待冻结原因：容量与成本尚未测量；阻断：多资产上传 | P2 / [P1] 用户植物、身份和游客认领合同 |
| `user-plant.authenticated_ephemeral.case_ttl_hours` | 已登录用户临时植物案例有效期 | `userplant_limits` | 领域策略 / 已冻结 | `168` 小时 | user-plant | user-plant、care、diagnosis | 发布不可变临时案例策略版本；新值只影响新建案例，已签发案例保留原失效时间；失败：无已冻结策略时拒绝新建已登录临时植物案例，不影响游客临时路径和长期用户植物 | P3 / [P1] 用户植物、身份和游客认领合同 |
| `user-plant.lifecycle.owner_guard` | 用户植物归属校验不可绕过 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | user-plant | 全部用户植物相关域 | 不可配置；失败：归属无法证明返回 404 | P1 / [P1] 用户植物、身份和游客认领合同 |
| `user-plant.guest_claim.once` | 游客案例只能认领一次 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | user-plant | user-plant、care、diagnosis | 不可配置；失败：重复认领返回首次确定结果或冲突 | P1 / [P1] 用户植物、身份和游客认领合同 |
| `user-plant.identity.current_states` | 用户植物当前身份状态集合 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["unidentified","candidate_pending","confirmed"]` | user-plant | user-plant、plant-knowledge | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `user-plant.identity.superseded_history_only` | superseded 只属于身份历史 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | user-plant | user-plant、plant-knowledge | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `user-plant.lifecycle.states` | 用户植物生命周期状态集合 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["active","archived","deleting","deleted"]` | user-plant | user-plant、care、diagnosis | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `user-plant.lifecycle.deleted_recoverable` | 已删除用户植物是否可恢复 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | user-plant | user-plant | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `user-plant.guest_claim.retroactive_points` | 游客认领是否追溯积分 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | user-plant | user-plant、subscription | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `user-plant.guest_claim.direct_fact_or_plan_write` | 游客认领是否自动写事实或计划 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | user-plant | user-plant、care、diagnosis | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `user-plant.guest.max_cases_per_session` | 单个游客会话最多临时植物案例数 | `userplant_limits` | 领域策略 / 已冻结 | `5` 个 | user-plant | user-plant、care、diagnosis | 发布新用户植物策略，只影响之后新建的临时案例；失败：策略不可用时拒绝新建游客临时案例 | P2 / [P1] 用户植物、身份和游客认领合同 |
| `user-plant.guest_claim.processing_lease_seconds` | 游客认领命令处理租约时长 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `30` 秒 | user-plant | user-plant 游客认领 | 认领在单个 MySQL 事务内完成，提交时以“租约未过期且持有者匹配”为写入条件，正确性不依赖时长；时长只决定崩溃后的接管等待，不做运营配置，调整须改代码与测试；失败：租约过期后由新请求原子接管并递增 attempt_count；过期持有者的完成写入被条件拒绝 | P2 / [P2] 统一身份 Principal |
| `user-plant.list.page_size` | 用户植物列表分页大小 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"default":20,"max":50}` | user-plant | GET /api/v2/user-plants（listUserPlants） | 接口容量边界，不做运营配置；调整须同步 user-plant.md 列表合同、代码常量 USER_PLANT_LIST_PAGE_SIZE、OpenAPI 与锁定测试并经评审；失败：运行时不读取目录；limit 超出 1～50 返回 400 VALIDATION_FAILED；常量与目录不一致由一致性测试阻断 | P2 / [E03][P2] 用户植物核心实现 |

## 植物知识、分类与 CMS

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `plant-knowledge.cms.identity_reward_points` | 新增规范植物身份奖励 | `cms_worker_content` | 领域策略 / 已冻结 | `100` AI 点 | subscription | plant-knowledge、subscription | 新奖励策略只影响未来 release；失败：release/唯一键不可证明时不发奖 | P1 / [P1] 植物分类与身份准入硬门 |
| `plant-knowledge.cms.content_reward_points` | 基础展示内容补全奖励 | `cms_worker_content` | 领域策略 / 已冻结 | `50` AI 点 | subscription | plant-knowledge、subscription | 按内容结构版本发布新策略；失败：未实际 release 不发奖 | P1 / [P1] 植物分类与身份准入硬门 |
| `plant-knowledge.taxonomy.authority_priority` | 植物分类权威来源角色与冲突策略 | `taxonomy_governance` | 领域策略 / 已冻结 | `{"primaryClassification":["POWO","WCVP"],"crossCheck":["WFO"],"cultivarAuthority":["RHS_ICRA"],"conflictResolution":"QUARANTINE_AND_HUMAN_REVIEW"}` | plant-knowledge | plant-knowledge、CMS 发布 | 分类证据策略经人工审核发布；失败：来源冲突进入 QUARANTINE | P1 / [P1] 植物分类与身份准入硬门 |
| `plant-knowledge.identity.baidu_candidate_thresholds` | 百度识别候选置信阈值映射 | `taxonomy_governance` | 领域策略 / 待冻结 | P1_PENDING | plant-knowledge | plant-knowledge | 识别准入策略版本；失败：只返回候选，不创建规范身份；待冻结原因：真实百度响应和映射尚未 S4 验证；阻断：自动候选排序 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `plant-knowledge.cms.content_schema_version` | 植物百科展示内容结构版本 | `cms_worker_content` | 领域策略 / 已冻结 | plant-encyclopedia-display/v1 | plant-knowledge | plant-knowledge、CMS、subscription | 不可变结构 release；失败：未知版本草稿不得发布 | P1 / [P1] 植物分类与身份准入硬门 |
| `plant-knowledge.cms.qa_target_count` | 基础展示百科问答目标数量 | `cms_worker_content` | 领域策略 / 已冻结 | `3` 条 | plant-knowledge | 百科补全 Worker、CMS | 内容结构版本；失败：结构不符合则整份草稿拒绝 | P1 / [P1] 植物分类与身份准入硬门 |
| `plant-knowledge.cms.forbidden_fields` | Qwen 百科草稿禁区字段 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["family","genus","species","authority_source","authority_taxon_id","accepted_scientific_name","scientific_name_mutation","taxonomy_review_status","release_status","toxicity","edibility","medicinal_claim","child_safety","pet_safety","watering_frequency","fertilizing_frequency","lighting_requirement","ventilation_requirement","temperature_requirement","humidity_requirement","pest_or_disease_fact","diagnosis_basis","treatment_claim","safety_fact"]` | plant-knowledge | 百科补全 Worker、CMS 发布校验 | 不可通过运营配置缩小禁区；失败：出现任一禁区字段整份拒绝 | P1 / [P1] 植物分类与身份准入硬门 |
| `plant-knowledge.enrichment.queue_lease_seconds` | CMS 补全任务租约时长 | `cms_worker_content` | 领域策略 / 待冻结 | P1_PENDING 秒 | plant-knowledge | 百科补全 Worker | 队列运行策略版本；失败：未冻结时不启动自动 Worker；待冻结原因：数值子项仍 CONTRACT_STOP；阻断：自动 CMS 补全 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `plant-knowledge.enrichment.max_attempts` | CMS 补全任务最大尝试次数 | `cms_worker_content` | 领域策略 / 已冻结 | `3` 次 | plant-knowledge | 百科补全 Worker | 队列运行策略版本；失败：达到 3 次后进入人工队列，不再自动调用模型 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.enrichment.monthly_budget_cny` | CMS 补全真实模型启用预算 | `cms_worker_content` | 领域策略 / 已冻结 | `0` 人民币元/月 | plant-knowledge | 百科补全 Worker、observability | 平台内容预算策略；失败：预算为 0 时暂停生成并继续聚合需求 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.search.query_max_code_points` | 公开植物搜索词最长码点数 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `64` Unicode 码点 | plant-knowledge | plant-knowledge | 首版公开合同固定限制；变更需同步合同、测试和客户端兼容性核对，不作为运营开关；失败：超出上限返回 400 VALIDATION_FAILED | P2 / [P2] 已发布植物身份公开搜索纵向切片 |
| `plant-knowledge.search.result_max_items` | 公开植物搜索单次结果上限 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `20` 条 | plant-knowledge | plant-knowledge | 首版公开合同固定限制；变更需同步合同与测试，不作为运营开关；失败：仅返回前 20 条，并以 truncated 明示存在更多结果 | P2 / [P2] 已发布植物身份公开搜索纵向切片 |
| `plant-knowledge.identity.release_required` | 规范身份必须通过不可变发布准入 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | plant-knowledge | plant-knowledge、user-plant、care、diagnosis | 不可配置；失败：未准入身份保持候选或隔离 | P1 / [P1] 植物分类与身份准入硬门 |
| `provider.baidu_plant.timeout_ms` | 百度植物识别超时 | `provider_runtime` | 第三方运行配置 / 待冻结 | P1_PENDING 毫秒 | shared-infrastructure | BaiduIdentifyAdapter | Provider release；失败：超时返回暂不可用，不写植物身份；待冻结原因：真实接口 S4 未验证；阻断：百度识别真实接入 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `provider.baidu_plant.max_attempts` | 百度植物识别最大尝试次数 | `provider_runtime` | 第三方运行配置 / 待冻结 | P1_PENDING 次 | shared-infrastructure | BaiduIdentifyAdapter | Provider release；失败：未知结果不盲重试；待冻结原因：错误分类和幂等性未实测；阻断：百度识别真实接入 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `plant-knowledge.taxonomy.authority_allowlist` | 分类权威来源白名单 | `taxonomy_governance` | 领域策略 / 已冻结 | `["POWO","WCVP","WFO","RHS_ICRA"]` | plant-knowledge | plant-knowledge | 发布新的不可变领域策略版本，只向前生效；失败：策略不可用时停止对应能力，不使用隐式默认值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.taxonomy.authority_key_unique` | 权威分类键唯一 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | authority_source + authority_taxon_id | plant-knowledge | plant-knowledge、MySQL | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.taxonomy.parent_chain_required` | 分类父链完整性 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | plant-knowledge | plant-knowledge | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.taxonomy.spp_is_species` | spp. 是否可作为具体物种 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | plant-knowledge | plant-knowledge | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.taxonomy.conflict_auto_resolve` | 来源冲突是否自动裁决 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | plant-knowledge | plant-knowledge | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.taxonomy.candidate_writers` | 外部候选写入边界 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"baidu":"candidate_only","qwen":"candidate_only","client":"candidate_only"}` | plant-knowledge | plant-knowledge | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.enrichment.worker_concurrency` | CMS 补全 Worker 并发数 | `cms_worker_content` | 领域策略 / 已冻结 | `1` 个 Worker | plant-knowledge | 百科补全 Worker | 发布新的不可变领域策略版本，只向前生效；失败：策略不可用时停止对应能力，不使用隐式默认值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.enrichment.sort_order` | CMS 补全需求排序 | `cms_worker_content` | 领域策略 / 已冻结 | `["distinct_logged_in_users_30d DESC","valid_evidence_count DESC","hits_30d DESC","first_waiting_at ASC","candidate_ref ASC"]` | plant-knowledge | 百科补全队列 | 发布新的不可变领域策略版本，只向前生效；失败：策略不可用时停止对应能力，不使用隐式默认值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.enrichment.user_candidate_count_window_hours` | 同用户同候选需求计数窗口 | `cms_worker_content` | 领域策略 / 已冻结 | `24` 小时 | plant-knowledge | 百科补全需求聚合 | 发布新的不可变领域策略版本，只向前生效；失败：策略不可用时停止对应能力，不使用隐式默认值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `plant-knowledge.enrichment.backlog_alert_count` | CMS 补全积压告警阈值 | `cms_worker_content` | 领域策略 / 待冻结 | P1_PENDING 条 | plant-knowledge | 百科补全 Worker、observability | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：容量基线尚未测量；阻断：自动 CMS 补全 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `plant-knowledge.enrichment.budget_resume_cny` | CMS 补全预算恢复门 | `cms_worker_content` | 领域策略 / 待冻结 | P1_PENDING 人民币元/月 | plant-knowledge | 百科补全 Worker | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：当前预算固定为 0，恢复值未获批准；阻断：真实 CMS 模型生成 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `plant-knowledge.catalog.default_limit` | 目录搜索默认返回条数 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `10` 条 | plant-knowledge | plant-knowledge | 冻结接口规则；变更须同步合同、Expected 和兼容性，不作为运营开关；失败：不存在隐式运营降级 | P2 / [E01] 植物目录搜索 SQL 与 HTTP 纵向切片 |
| `plant-knowledge.catalog.minimum_limit` | 目录搜索最小返回条数 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `1` 条 | plant-knowledge | plant-knowledge | 冻结接口规则；变更须同步合同、Expected 和兼容性，不作为运营开关；失败：非法 limit 返回 400 VALIDATION_FAILED | P2 / [E01] 植物目录搜索 SQL 与 HTTP 纵向切片 |
| `plant-knowledge.encyclopedia.reference_max_code_points` | 百科路径与目录引用最长码点数 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `512` Unicode 码点 | plant-knowledge | plant-knowledge | 受来源列宽与冻结接口约束；只能通过合同与兼容性变更调整；失败：参数缺失或越界返回 400 VALIDATION_FAILED | P2 / [P2] CMS 分类、百科和发布 |

## 养护、天气与算法

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `care.environment.atomic_facts_immutable` | 原子环境事实不可改写 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | care | care、diagnosis | 不可配置；修正只能追加新事实；失败：拒绝 UPDATE 并保留原记录 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `care.environment.weather_scope_must_be_outdoor` | 天气 Provider 证据必须保留室外空间范围 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | care | Weather Adapter、care、diagnosis | 不可配置；失败：缺少室内证据时降级或返回 insufficient_evidence | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `care.environment.derivation_must_not_overwrite_fact` | 派生环境指标不得回写原子事实 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | care | care、diagnosis | 不可配置；失败：派生失败时不写任何事实、计划或提醒 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `care.reference_profile.release` | 植物级养护 Reference Profile 发布版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care、plant-knowledge | 不可变 Reference Profile release；结构固定为植物基线、光照/VPD/栽培参考及显式 fallback，升级只影响新计算；失败：对应植物缺已发布 Reference Profile 时使用合同允许的显式 fallback；若连 fallback 也无证据则返回 insufficient_evidence；待冻结原因：结构已冻结，但植物级 cultivation reference 当前缺 substrate_preference 等已审核性状；VPD/light 参考也尚未形成正式 release；阻断：植物级 Reference Profile 正式运行与相关浇水个性化 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.environment.derivation_algorithm_release` | Care 确定性派生算法发布版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care、diagnosis | 按派生类型发布不可变 release，请求锁定具体版本与 SHA-256；失败：无已发布算法时对应能力返回 temporarily_unavailable；待冻结原因：派生类型与职责已冻结，但各算法实现 release、映射参数和真实数据验收尚未完成；阻断：Care v2 确定性派生运行时 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.environment.factor_freshness_policy_release` | 各类原子环境证据新鲜度策略版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care、diagnosis | 按原子因素与来源类型发布不可变策略；失败：无法证明新鲜度时排除证据并降低结论置信度；待冻结原因：不同证据类型有效窗口尚未通过真实数据验证；阻断：原子证据过期判定 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.soil_evidence.ttl_hours` | 盆土视觉证据有效期 | `care_algorithms` | 领域策略 / 已冻结 | `24` 小时 | care | care、独立浇水顾问 | 证据策略新版本，只影响新计算；失败：有效期无法证明时要求重新检查 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.weather.current_freshness_minutes` | 实时天气证据新鲜度 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING 分钟 | care | care、天气快照 | 天气证据策略版本；失败：返回证据不足而非伪造实时天气；待冻结原因：和风实时接口与业务新鲜度尚未真实验证；阻断：依赖实时天气的养护结论 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.weather.forecast_freshness_minutes` | 天气预报证据新鲜度 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING 分钟 | care | care、天气快照 | 天气证据策略版本；失败：缺失时降低可信度；待冻结原因：预报边界未冻结；阻断：天气增强养护 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.algorithm_version` | 浇水算法版本 | `care_algorithms` | 领域策略 / 已冻结 | care-watering-mvp/v1 | care | care | 算法 release 不可变，输出合同独立版本化；失败：无已发布算法返回 temporarily_unavailable | P2 / [P4] 盆土视觉和四类养护能力 |
| `care.fertilizing.algorithm_version` | 施肥算法版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care | 算法 release 不可变；失败：无算法返回 temporarily_unavailable；待冻结原因：v2 算法尚未冻结；阻断：v2 施肥实现 | P2 / [P4] 盆土视觉和四类养护能力 |
| `care.lighting.algorithm_version` | 光照算法版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care | 算法 release 不可变；失败：证据不足返回 insufficient_evidence；待冻结原因：算法release尚未发布；MVP允许单双层近似且保留专业参数，不以型号光谱或现场精细校准作为统一前置；必要换算、适用范围及运行验证仍待完成；阻断：v2 光照正式评估与 DLI 生产派生 | P2 / [P4] 盆土视觉和四类养护能力 |
| `care.ventilation.algorithm_version` | 通风算法版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care | 算法 release 不可变；失败：证据不足返回 insufficient_evidence；待冻结原因：v2 算法尚未冻结；阻断：v2 通风实现 | P2 / [P4] 盆土视觉和四类养护能力 |
| `care.output.contract_version` | 四类养护统一输出合同版本 | `care_algorithms` | 领域策略 / 已冻结 | care-capability-result/v1 | care | care、未来前端、CloudBase Agent | 破坏性变化必须升版本并保留兼容读取；失败：未知版本不对外返回 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `care.recommendation.write_fact_directly` | 建议是否可直接写入事实 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | care | care、diagnosis、CloudBase Agent | 不可配置；失败：只返回建议，等待用户确认 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `provider.qweather.timeout_ms` | 和风天气调用超时 | `provider_runtime` | 第三方运行配置 / 待冻结 | P1_PENDING 毫秒 | shared-infrastructure | WeatherAdapter | Provider release；失败：使用仍有效缓存或返回证据不足；待冻结原因：真实调用未 S4 验证；阻断：天气增强能力 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.soil_evidence.states` | 盆土视觉状态集合 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["wet","moist","dry","uncertain"]` | care | care、独立浇水顾问 | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `care.output.status_values` | 养护输出状态集合 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["ready","insufficient_evidence","temporarily_unavailable"]` | care | care、未来前端、CloudBase Agent | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `care.output.confidence_values` | 养护输出可信度集合 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["low","medium","high"]` | care | care、未来前端、CloudBase Agent | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `care.watering.recheck_window_hours` | 浇水建议复查窗口 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING 小时 | care | care | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：不同盆土状态和环境的窗口尚未冻结；阻断：v2 浇水建议 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.lighting.match_thresholds` | 光照需求匹配阈值 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING 标准化区间 | care | care | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：v2 光照算法阈值尚未冻结；阻断：v2 光照建议 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.ventilation.risk_thresholds` | 通风与直吹风险阈值 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING 标准化等级 | care | care | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：v2 通风算法阈值尚未冻结；阻断：v2 通风建议 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.reminder.delivery_window` | 养护提醒允许触达窗口 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING 本地时间窗口 | care | care、NotifyAdapter | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：提醒时段和免打扰规则尚未冻结；阻断：主动养护提醒 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.indoor_environment.algorithm_release` | 室内环境估算算法发布版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care、diagnosis | 不可变 algorithm release；只允许由 outdoor T/RH + air exchange + solar heat + thermal inertia 产生显式 estimated indoor 结果；失败：有室内实测时不需要估算；无实测且无有效估算 release 时返回 insufficient_evidence；待冻结原因：输入结构已冻结，热响应映射与真实数据校准未完成；阻断：无室内实测时的 Air VPD 与依赖它的浇水增强 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.growth_activity.algorithm_release` | 生长活跃状态估计算法发布版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care | 不可变 algorithm/prompt/schema release；证据 ID 与状态枚举固定；失败：低置信度、冲突或 release 不可用时返回 UNKNOWN 并回退安全 baseline；待冻结原因：状态合同已冻结，但知识 release、Prompt/Schema 与真实样本回归尚未完成；阻断：条件性/季节性 watering baseline 选择 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.personal_calibration_policy_release` | 浇水个体干湿循环校准策略版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care | 不可变校准策略；只基于有效干湿周期残差，换盆/换基质/明显换位置后失效或降权；失败：缺少足够高质量周期时 PersonalCalibration=合同允许的中性值，不伪造个体学习；待冻结原因：最小有效周期数、稳健统计窗口与上下界需影子数据校准；阻断：个体历史校准；不阻断无个体校准的基础 DryProgress | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.light.window_plane_algorithm_release` | 窗面入射辐照算法发布版本 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING | care | care | 不可变 algorithm release；Direct/Diffuse 分量独立保留；失败：算法不可用时不以朝向经验表替代，返回 insufficient_evidence；待冻结原因：数学结构已冻结，具体实现与回归集尚未形成 release；阻断：Window Plane Irradiance 与 DLI 正式运行 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.lighting.interval_unit_definitions` | PPFD 区间积分单位定义 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"millisecondsPerSecond":1000,"micromolesPerMole":1000000}` | care | care 离线区间积分 | 单位定义不可配置；仅变更输入单位合同时重审；失败：缺段只报告已知积分，不猜测全天值 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.lighting.window_direct_geometry` | 窗面直射坐标与投影硬规则 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"azimuthOrigin":"true_north_clockwise","angleUnit":"degree","tiltOrigin":"upward_horizontal","backFaceProjection":"zero","horizonProjection":"zero","apertureMethod":"vertical_plane_rectangle_union","distanceUnit":"metre_perpendicular","edgeResult":"boundary","meanProjectionMethod":"nonnegative_whole_interval_bounds","experimentalSolarPosition":"noaa_general_solar_position","solarTimeStandard":"UTC","experimentalIntervalMethod":"harmonic_global_rate_bound_UTC_year_segments"}` | care | care 离线窗面直射计算、care 离线直射可达性、care 同轮窗面投影与植物点瞬时可达性组合、care 完整时段植物点几何直射回放 | 物理与坐标定义不可运营配置；输入语义变化须冻结新合同；失败：DNI 缺失保持 null；时间或坐标错误拒绝 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.lighting.open_meteo_interval_semantics` | Open-Meteo 辐射区间与时间硬规则 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"timeformat":"unixtime_utc_seconds","radiationUnit":"W/m²","hourlyDurationMs":3600000,"minutely15DurationMs":900000,"label":"interval_end","semantics":"preceding_interval_mean"}` | care | care 离线公开辐射制品回放 | 外部语义与单位不能运营配置；Provider 合同变化先更新测试与适配版本；失败：缺值保留 null；单位与时间错误拒绝；不扩大请求或选择其他来源 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.cultivation.pot_safety` | 实际内盆、几何与排水证据准入 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | 内盆和几何均确认后才能判断排水；未知不赋默认；安全不等于浇水许可 三值证据及安全状态 | care | care 离线盆器回放 | 硬规则不可被配置覆盖；变更须更新合同、独立Expected与模型版本；失败：证据不足返回 insufficient_evidence；非法类型拒绝 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.lighting.mvp_glass_selection` | MVP玻璃层数与版本策略准入 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"contractVersion":"mvp-glass-policy/v1","scopeCode":"care_mvp_glass","inputs":["single","double",null],"implicitDefault":false,"professionalParametersRetained":true,"domainCode":"care","policyCode":"mvp_glass","contentDigest":"canonical_sorted_json_sha256"}` | care | care MVP玻璃策略解析与回放、care MySQL活动玻璃策略读取器 | 分类与准入规则不可配置；具体透射值由独立不可变策略发布，不在源码填默认；失败：没有有效active策略明确不可用；层数未确认保留null | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.root_zone_water_deficit` | 根区净补水缺口的量纲与证据边界 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | 有效基质体积×目标/当前体积含水率差；净缺口不等于施水量；缺证据不填默认 | care | care内部水量回放 | 数学和单位规则不能由配置覆盖；模型映射/目标含水率/效率/施水上限独立裁决发布；失败：缺少有效基质或可靠根区量时返回insufficient_evidence；非法类型拒绝 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.local_calendar_dates` | 浇水检查窗口的当地日历表达 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | 按明确植物时区投影UTC窗口；缺端点不补日期；不创建提醒或改写浇水事实 | care | care内部日期回放 | 公历和时间语义不可配置；提前检查比例、通知时刻与正式发布独立裁决；失败：缺时区或窗口返回缺证据，非法时区或不可表达日期拒绝 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.lighting.open_meteo_request_window_days` | Open-Meteo 辐射请求回看与预报天数上限 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"maxPastDays":92,"maxForecastDays":16}` | care | care watering-advice | Open-Meteo 公开接口的 past_days 与 forecast_days 上限，属外部能力边界，不能运营配置；Provider 能力变化先更新适配器与测试；失败：回看起点早于 92 天时截断到 92 天，超出预报覆盖的时段为缺段，检查窗口变宽或开放，不补零 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.baseline_policy_version` | MVP 浇水模型使用的 Tropicals 名义基线版本 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | v1 | care | care watering-advice、plant-knowledge 基线读取 | MVP 参数按 v1 基线标定；更换基线版本必须同时发布新的 care_mvp_watering 策略版本并重新标定，不单独运营切换；失败：该版本无启用行或基线缺失时返回缺证据（insufficient_evidence），不回退其他版本 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.facts.watering_backfill_max_days` | 浇水事实最长补记天数 | `care_algorithms` | 不可配置硬规则 / 不可配置硬规则 | `7` 天 | care | care facts、care proposal confirmations、care plan completions | 产品行为边界，不作运营配置；调整须改代码常量与锁定测试并经评审；失败：超出上限的补记返回 VALIDATION_FAILED，不截断时间 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.plans.check_max_postpone_days` | 检查计划最多推迟天数（检查窗口无最晚端时） | `care_algorithms` | 不可配置硬规则 / 不可配置硬规则 | `7` 天 | care | care proposal confirmations | 产品行为边界，不作运营配置；调整须改代码常量与锁定测试并经评审；失败：超出范围的 scheduledAt 返回 VALIDATION_FAILED | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.open_window_proposal_valid_hours` | 检查窗口无最晚端时浇水建议有效小时数 | `care_algorithms` | 不可配置硬规则 / 不可配置硬规则 | `24` 小时 | care | care watering-advice | 产品行为边界，不作运营配置；调整须改代码常量与锁定测试并经评审；失败：过期建议不可确认（CARE_PROPOSAL_NOT_CONFIRMABLE），需重新获取建议 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.plans.page_size` | 养护计划列表分页大小 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `{"default":20,"max":50}` | care | care plans list | 接口容量边界，不做运营配置；调整须改代码与测试；失败：limit 超出上限返回 VALIDATION_FAILED | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.soil_evidence_fallback_hours` | 湿/微湿盆土证据推算不出时的回退有效小时数 | `care_algorithms` | 领域策略 / 已冻结 | `24` 小时 | care | care watering-advice（临时与长期） | 随 care-watering-mvp/v2 发布正文 soilEvidenceFallbackHours；新版本只影响新计算；失败：无可用发布时整体 temporarily_unavailable | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.soil_evidence_max_hours` | 盆土证据有效期封顶小时数 | `care_algorithms` | 领域策略 / 已冻结 | `72` 小时 | care | care watering-advice（临时与长期） | 随 care-watering-mvp/v2 发布正文 soilEvidenceMaxHours；新版本只影响新计算；失败：超过封顶视为过期，结果缺盆土证据并提示重新观察 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.plans.expiry_grace_hours` | 检查计划过期宽限小时数（超过计划时刻多久仍未完成即过期） | `care_algorithms` | 不可配置硬规则 / 不可配置硬规则 | `72` 小时 | care | care-plan-expiry 事件函数（计划过期扫描） | 不可运营配置；调整须同时评审盆土证据有效期（soilEvidenceMaxHours），同步合同 §12、本目录、care 代码常量与锁定测试并经评审；只影响之后的扫描，不回滚已过期计划；失败：运行时不读取目录；常量与目录不一致由 CI 一致性测试阻断发布；扫描未运行时计划保持 planned，不提前过期 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.plans.expiry_scan` | 检查计划过期扫描频率、批量与单次时长上限 | `reliability_ops` | 不可配置硬规则 / 不可配置硬规则 | `{"cron":"0 0 * * * * *","intervalHours":1,"batchSize":500,"runBudgetFractionOfFunctionTimeout":0.5}` | care | care-plan-expiry 事件函数、CloudBase 定时触发器配置 | 不可运营配置；调整须同步合同 §12、本目录、care 代码常量、定时触发器 cron 与锁定测试并经评审；更改批量需重新评估单批事务锁时长；失败：取不到函数超时则本次不执行（not_started）；批次失败则本次停止、已提交批次保留，下一周期自动补上 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.cultivation_reference_pot` | 干燥基线的参考盆几何 | `care_algorithms` | 领域策略 / 已冻结 | `{"topDiameterCm":15,"bottomDiameterCm":11,"heightCm":13,"wall":"non_porous","drainage":true}` 厘米（盆口内径/盆底内径/内深） | care | care watering-advice（临时与长期，assessMvpWatering → deriveCultivationDrying） | 随 care-watering-mvp/v3 不可变发布正文；新版本只影响新计算，可回退到 v2；失败：无可用 v3 发布时按活动版本（v2）语义；整体无发布时 temporarily_unavailable | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.cultivation_reference_available_water` | 参考基质可用水（AW，Bilderback 2005 口径）比例（定义锚点） | `care_algorithms` | 领域策略 / 已冻结 | `0.3` 体积比 0～1 | care | care watering-advice（临时与长期，assessMvpWatering → deriveCultivationDrying） | 随 care-watering-mvp/v3 不可变发布正文；新版本只影响新计算，可回退到 v2；失败：无可用 v3 发布时按活动版本（v2）语义；整体无发布时 temporarily_unavailable | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.plant_demand_volume_exponent` | 植物蒸腾随盆容积的伸缩指数 | `care_algorithms` | 领域策略 / 已冻结 | `{"min":0,"max":0.52}` 无量纲指数 | care | care watering-advice（临时与长期，assessMvpWatering → deriveCultivationDrying） | 随 care-watering-mvp/v3 不可变发布正文；新版本只影响新计算，可回退到 v2；失败：无可用 v3 发布时按活动版本（v2）语义；整体无发布时 temporarily_unavailable | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.porous_wall_evaporation_ratio` | 透气盆壁单位面积蒸发 ÷ 土表单位面积蒸发（κ） | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING 无量纲 | care | care watering-advice（临时与长期，assessMvpWatering 干燥积分） | 随 care-watering-mvp/v3 不可变发布正文；审定前不得进入源码、环境变量或数据库；新版本只影响新计算，可回退到 v2；失败：未审定时不发布 v3；待冻结原因：待验证票 z8v0kmvewm：室内观叶植物塑料/釉面/素烧陶盆整盆失水称重对比；验证通过前不得进入源码、DTO 或发布正文。Suh 1977：塑料/瓷盆蒸发约为陶盆 43%、陶盆约 2/3 蒸发经盆壁；按常见陶盆壁/口面积比 2.5～5 推导 κ≈0.4～0.8（低置信），需用户审定；阻断：盆壁材质参与干燥窗口（κ、wallMaterial 字段、织物盆）；不阻断已审定的 v3 盆体积/基质模型 | P4 / [E06][验证] 盆壁材质对盆土干燥速度的影响（κ、wallMaterial） |
| `care.watering.pot_wall_material_classes` | 盆壁材质枚举与透气类别映射 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING plastic / glazed_ceramic / unglazed_terracotta / null | care | care watering-advice（临时与长期，assessMvpWatering 干燥积分） | 随 care-watering-mvp/v3 不可变发布正文；审定前不得进入源码、环境变量或数据库；新版本只影响新计算，可回退到 v2；失败：未审定时 DTO 不新增 wallMaterial，v3 不发布；待冻结原因：待验证票 z8v0kmvewm：室内观叶植物塑料/釉面/素烧陶盆整盆失水称重对比；验证通过前不得进入源码、DTO 或发布正文。需新增 MeasuredPotInput.wallMaterial 与档案/watering-advice 请求 DTO 字段（属合同修订）；织物盆是否单列待定；阻断：盆壁材质参与干燥窗口（κ、wallMaterial 字段、织物盆）；不阻断已审定的 v3 盆体积/基质模型 | P4 / [E06][验证] 盆壁材质对盆土干燥速度的影响（κ、wallMaterial） |
| `care.watering.cultivation_retention_fallback` | 缺基质证据时的兜底存量比 | `care_algorithms` | 领域策略 / 已冻结 | `{"min":0.8,"max":1.25}` 无量纲 | care | care watering-advice（临时与长期，assessMvpWatering → deriveCultivationDrying） | 随 care-watering-mvp/v3 发布正文 cultivationRetention（v3 语义：缺基质兜底存量比）；新版本只影响新计算；失败：无可用 v3 发布时按活动版本（v2）语义；整体无发布时 temporarily_unavailable | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.substrate_mix_drying_rule` | 混合基质（配比未知）主要材料规则 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | 未标主要材料：各组分并集；标了主要材料 p：[min(p.min, ½p.min+½其余.min), max(p.max, ½p.max+½其余.max)]；可用水（AW，Bilderback 2005 口径）与持水量上限同一规则 主要材料＝体积占一半及以上 | care | care watering-advice（干燥存量与浇水量）、watering-advice 请求 DTO primarySubstrateMaterial | 硬规则不可被配置覆盖；变更须同步合同 §8.10、combine-mvp-substrate-mix.ts 常量与锁定测试；失败：主要材料不属于所选材料 → VALIDATION_FAILED；v1/v2 策略忽略主要材料 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.no_drainage_drying_upper_bound` | 无孔/排水未知盆的存量上端规则 | `care_algorithms` | 领域策略 / 待冻结 | P1_PENDING — | care | care watering-advice（临时与长期，assessMvpWatering 干燥积分） | 随 care-watering-mvp/v3 不可变发布正文；审定前不得进入源码、环境变量或数据库；新版本只影响新计算，可回退到 v2；失败：公开行为与 v2 相同（不公开窗口、不给水量）；待冻结原因：无孔盆浇入水量未知、可超过容器持水量；是否需要对外给“排水风险下的检查提示”待产品裁决；阻断：无孔/排水未知盆的内部窗口上端（公开结果不受影响，已按既有安全顺序处理） | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.drying_gap_fill_max_hours` | 环境数据缺段可保守补齐的最长小时数 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `6` 小时 | care | care watering-advice（assessMvpWatering → fillMvpDryingGaps，v3 起） | 硬规则：证据连续性准入边界，与 Open-Meteo 逐小时粒度绑定，不随策略发布调参；变更须同步合同 §8.11、MVP_DRYING_GAP_FILL_MAX_HOURS 与锁定测试；失败：缺段 >6 小时保持空洞，按既有规则无结论；v1/v2 不补 | P4 / [P4] 盆土视觉和四类养护能力 |
| `care.watering.cultivation_geometry_relation` | 盆体积与土表面积的圆台几何关系 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | V=πf(R_f²+R_f r+r²)/3，A_top=πR_f²，R_f=r+(R−r)f/H；实际盆与参考盆按同一留空端点取比值后包络 cm、mL、cm² | care | care deriveCultivationDrying、care estimateMvpWaterAmount（装土体积） | 固定数学规则，不可配置；变更须同步合同与锁定测试；失败：几何不全或装不了土 → 兜底存量比，公开结果按既有安全顺序 | P4 / [P4] 盆土视觉和四类养护能力 |

## 问诊与视觉 AI

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `diagnosis.model.family` | AI 问诊产品模型家族 | `diagnosis_releases` | 领域策略 / 已冻结 | qwen3.5-flash | diagnosis | diagnosis、Bailian Adapter | 模型与 Prompt、Schema 组成不可变 release；失败：模型不可用时不静默换模 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `diagnosis.prompt.release_sha256` | AI 问诊提示词发布哈希 | `diagnosis_releases` | 领域策略 / 已冻结 | 11c58cebe3b3c41097d6f6d6b3c5b5d7eb16248e4f07bacd497868a647ccc964 | diagnosis | diagnosis、Bailian Adapter | 不可变 Prompt release；失败：哈希缺失或不匹配时阻断 AI 问诊 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `diagnosis.result.schema_version` | AI 问诊结构化结果版本 | `diagnosis_releases` | 领域策略 / 已冻结 | diagnosis-model-output/v1 | diagnosis | diagnosis、Bailian Adapter | 不可变 JSON Schema release；失败：校验失败整份拒绝 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `diagnosis.visual.max_images` | 单次视觉问诊最大图片数 | `diagnosis_releases` | 领域策略 / 待冻结 | P1_PENDING 张 | diagnosis | diagnosis、storage、AI 成本策略 | 产品动作成本策略版本；失败：未冻结前不开放多图视觉问诊；待冻结原因：动作上限和真实成本未冻结；阻断：视觉问诊 | P4 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.fixed_packages.release_refs` | 黄叶与萎蔫固定题包发布引用 | `diagnosis_releases` | 领域策略 / 待冻结 | P1_PENDING | diagnosis | diagnosis | 题包不可变 release + active 指针；失败：无已发布题包则该症状入口不可用；待冻结原因：V1复用内容与发布数据库保护已验证；正式发布审核、激活及创建运行入口尚未验收；阻断：固定问诊正式运行入口 | P4 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.knowledge.bundle_release_ref` | 诊断原因、结论、行动和映射的兼容知识发布包 | `diagnosis_releases` | 领域策略 / 待冻结 | P1_PENDING | diagnosis | diagnosis、CloudBase CMS 发布校验 | 原因目录、Outcome、Action 和映射作为兼容不可变 release 发布，请求锁定单一快照及 SHA-256；失败：无已审核的兼容发布包时不开放相应诊断结果，不以模型自由生成内容兜底；待冻结原因：P1 诊断知识来源增量合同、旧资产审计与首版内容审核尚未冻结；阻断：黄叶、萎蔫和虫害诊断知识发布与结果验收 | P4 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.dynamic_pest.max_rounds` | 动态虫害问诊最大轮次 | `diagnosis_releases` | 领域策略 / 待冻结 | P1_PENDING 轮 | diagnosis | diagnosis | 动态题包策略版本；失败：达到上限返回可解释的中止结果；待冻结原因：动态题包合同尚未冻结；阻断：动态虫害问诊 | P2 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.advice.direct_fact_write` | 诊断建议是否可直接写事实 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | diagnosis | diagnosis、care | 不可配置；失败：等待用户确认后由 care 写事实 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `provider.bailian.model_code` | 云百炼精确模型标识 | `provider_runtime` | 第三方运行配置 / 已冻结 | qwen3.5-flash-2026-02-23 | shared-infrastructure | BailianDiagnosisAdapter、EncyclopediaQwenAdapter | 每个能力独立 Provider release，禁止静默替换；失败：未冻结精确模型标识时不进行真实调用 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `diagnosis.package.route_priority` | 问诊题包路由优先级 | `diagnosis_releases` | 领域策略 / 待冻结 | P1_PENDING | diagnosis | diagnosis | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：题包路由优先级尚未冻结；阻断：问诊会话路由 | P4 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.visual.retake_limit` | 视觉问诊补拍上限 | `diagnosis_releases` | 领域策略 / 待冻结 | P1_PENDING 次 | diagnosis | diagnosis、storage | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：视觉证据合同尚未冻结；阻断：视觉问诊 | P4 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.result.terminal_states` | 问诊终态集合 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `["conclusive","uncertain","user_declined","invalid_input","temporarily_unavailable"]` | diagnosis | diagnosis | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `diagnosis.session.resume_ttl_hours` | 问诊中断恢复有效期 | `diagnosis_releases` | 领域策略 / 待冻结 | P1_PENDING 小时 | diagnosis | diagnosis | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：恢复期限尚未冻结；阻断：问诊中断恢复 | P4 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.dynamic_pest.tier_question_limits` | 虫害候选档位的提问数量上限 | `diagnosis_releases` | 领域策略 / 已冻结 | `{"low":3,"medium":2,"high":1,"very_likely":1,"direct":0}` 题 | diagnosis | diagnosis动态选题与快照创建 | 审核后不可变策略release，锁定本次兼容版本组；失败：缺策略不生成用户题包；不得沿用V1无档位默认2题 | P4 / [P4] 固定/动态问诊与小青工具 |
| `diagnosis.result.record_schema_version` | 完整诊断结果回放记录结构版本 | `diagnosis_releases` | 不可配置硬规则 / 不可配置硬规则 | diagnosis-result-record/v1 | diagnosis | 诊断结果记录锁定及Repository | 不可配置；结构演进通过新合同及顺序迁移，不覆盖历史记录；失败：结构或摘要不匹配时拒绝，不补当前发布 | P4 / [E05][P4] 固定/动态问诊与小青工具 |
| `diagnosis.result.replay_contract_versions` | 诊断结果内部输入与轨迹结构版本 | `diagnosis_releases` | 不可配置硬规则 / 不可配置硬规则 | `{"input":"diagnosis-replay-input/v1","trace":"diagnosis-decision-trace/v1"}` | diagnosis | 诊断结果锁定和回放Repository | 结构演进通过新合同，禁止开关或默认值覆盖历史版本；失败：缺版本、引用或安全门不一致拒绝 | P4 / [E05][P4] 固定/动态问诊与小青工具 |
| `diagnosis.knowledge.publication_contract` | 兼容知识发布包与原子切换硬规则 | `diagnosis_releases` | 不可配置硬规则 / 不可配置硬规则 | diagnosis-knowledge-release/v1 | diagnosis | 诊断知识发布用例与Repository、精确审核撤销用例与Repository | 结构演进使用新合同；同键重放、原样审核、撤销检查与指针并发不可配置；失败：前置不可用停止发布；并发冲突回滚；未知提交只读对账 | P4 / [E05][P4] 固定/动态问诊与小青工具 |
| `diagnosis.result.public_read` | 诊断结果只读投影与失效拒绝 | `diagnosis_releases` | 不可配置硬规则 / 不可配置硬规则 | diagnosis-result/v1 | diagnosis | 诊断结果GET与归属查询 | 公开结果结构与归属规则通过合同演进，不允许配置绕过；不更换历史知识引用；失败：缺结果404；旧行/损坏/原知识不可用503；未接临时分支503 | P4 / [E05][P4] 固定/动态问诊与小青工具 |

## 云存储与数据生命周期

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `storage.upload.allowed_mime_types` | 私有图片允许的 MIME 类型 | `retention_security` | 领域策略 / 待冻结 | P1_PENDING | shared-storage | user-plant、care、diagnosis、plant-knowledge | 资产安全策略版本；失败：未冻结时拒绝 v2 图片上传；待冻结原因：MIME 白名单未冻结；阻断：v2 图片上传 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `storage.upload.max_image_bytes` | 单张私有图片最大字节数 | `retention_security` | 领域策略 / 待冻结 | P1_PENDING 字节 | shared-storage | user-plant、care、diagnosis、plant-knowledge | 资产安全策略版本；失败：未冻结时拒绝 v2 图片上传；待冻结原因：图片规格与成本未冻结；阻断：v2 图片上传 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `storage.upload.credential_ttl_seconds` | 直传凭证有效期 | `retention_security` | 领域策略 / 待冻结 | P1_PENDING 秒 | shared-storage | storage、各图片业务域 | 资产安全策略版本；失败：凭证策略缺失则不签发；待冻结原因：短时有效期尚未冻结；阻断：客户端直传 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `storage.unbound_retention_hours` | 未绑定上传保留期 | `retention_security` | 领域策略 / 已冻结 | `24` 小时 | shared-storage | storage cleanup | 生命周期策略版本；失败：无法安全删除时隔离并告警 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `storage.failed_retention_days` | 失败或隔离上传保留期 | `retention_security` | 领域策略 / 已冻结 | `7` 天 | shared-storage | storage cleanup | 生命周期策略版本；失败：清理失败进入补偿队列 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `storage.raw_evidence_retention_days` | 诊断与盆土原始证据保留期 | `retention_security` | 领域策略 / 已冻结 | `30` 天 | shared-storage | care、diagnosis、storage cleanup | 生命周期策略版本；失败：物理删除不安全时先隔离 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `storage.user_delete_cleanup_days` | 用户删除后清理窗口 | `retention_security` | 领域策略 / 已冻结 | `30` 天 | shared-storage | 全部持久化域、storage cleanup | 生命周期策略版本与隐私审批；失败：未完成反向引用核对不物理删除 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `storage.private_assets.public_cms_allowed` | 用户私图是否允许进入公共 CMS | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | shared-storage | plant-knowledge、CMS、storage | 不可配置；失败：发现关联立即拒绝发布 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `storage.payment_record.retention_policy` | 支付记录法定保留策略 | `retention_security` | 领域策略 / 待冻结 | P1_PENDING 期限与依据 | subscription | subscription、审计清理 | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：法定期限尚未完成专项确认；阻断：支付记录物理清理 | P5 / [P5] 真实 MySQL/API/安全/性能验收 |
| `storage.business_audit.retention_policy` | 业务审计记录保留策略 | `retention_security` | 领域策略 / 待冻结 | P1_PENDING 期限与依据 | shared-infrastructure | 全部业务域、审计清理 | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：审计类别和法定期限尚未冻结；阻断：审计物理清理 | P5 / [P5] 真实 MySQL/API/安全/性能验收 |
| `storage.immutable_ledgers.delete_by_ttl` | 积分与 AI 额度账本能否按普通 TTL 删除 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | subscription | subscription、审计清理 | 不可配置；如需改变必须回到业务架构和合同重审；失败：违反时拒绝请求、发布或状态转换 | P1 / [P1] 业务策略与统一 Provider 配置架构 |

## HTTP 公共合同

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `http.json_body_limit_bytes` | 普通 JSON 请求体上限 | `http_runtime` | 领域策略 / 已冻结 | `1048576` 字节 | shared-infrastructure | 全部 HTTP 云函数 | HTTP 合同版本变更；失败：超限返回 413 | P1 / [P1] 公共 HTTP 合同与 OpenAPI 路由骨架 |
| `http.list.default_page_size` | 列表默认分页大小 | `http_runtime` | 领域策略 / 已冻结 | `20` 条 | shared-infrastructure | 全部列表 API | HTTP 合同版本变更；失败：未传参数使用 20 | P1 / [P1] 公共 HTTP 合同与 OpenAPI 路由骨架 |
| `http.list.max_page_size` | 列表最大分页大小 | `http_runtime` | 领域策略 / 已冻结 | `50` 条 | shared-infrastructure | 全部列表 API | HTTP 合同版本变更；失败：超过 50 返回校验错误 | P1 / [P1] 公共 HTTP 合同与 OpenAPI 路由骨架 |
| `http.agent_tool_token_ttl_seconds` | 小青工具令牌有效期 | `http_runtime` | 领域策略 / 已冻结 | `300` 秒 | identity | CloudBase Agent、Agent API | 内部服务授权策略版本；失败：过期立即拒绝 | P1 / [P1] 公共 HTTP 合同与 OpenAPI 路由骨架 |
| `http.processing_order.fixed` | HTTP 请求处理顺序固定 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | shared-infrastructure | 全部 HTTP 云函数 | 不可配置；失败：任何步骤缺失均拒绝发布 | P1 / [P1] 公共 HTTP 合同与 OpenAPI 路由骨架 |
| `http.idempotency.retention_hours` | 幂等记录保留期 | `http_runtime` | 领域策略 / 已冻结 | `168` 小时 | shared-infrastructure | 全部写 API | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `http.internal_body_limit_bytes` | 内部 Job/Callback 请求体上限 | `http_runtime` | 领域策略 / 已冻结 | `{"agentApi":262144,"jobApi":262144,"callbackApi":262144}` 字节 | shared-infrastructure | Job API、Callback API | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `http.guest_abuse_limits` | 游客能力宽松防滥用阈值 | `http_runtime` | 领域策略 / 待冻结 | P1_PENDING 请求/时间窗 | shared-infrastructure | 植物识别、固定题包、独立浇水、盆土视觉 | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：缺少真实游客流量基线；阻断：游客公开能力 | P3 / [P3] 游客、试用、会员和奖励闭环 |

## 可靠事件

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `reliable-events.dispatch.interval_seconds` | 可靠事件派发周期 | `reliability_ops` | 领域策略 / 待冻结 | P1_PENDING 秒 | shared-infrastructure | 各域 outbox dispatcher | 可靠事件运行策略；失败：未冻结时不启动自动派发；待冻结原因：数值子项仍 CONTRACT_STOP；阻断：跨域奖励自动入账 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `reliable-events.dispatch.lease_seconds` | 可靠事件派发租约时长 | `reliability_ops` | 领域策略 / 待冻结 | P1_PENDING 秒 | shared-infrastructure | outbox dispatcher | 可靠事件运行策略；失败：租约不明确时不并发派发；待冻结原因：真实故障注入未完成；阻断：跨域奖励自动入账 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `reliable-events.backlog.alert_count` | 可靠事件积压告警阈值 | `reliability_ops` | 领域策略 / 待冻结 | P1_PENDING 条 | shared-infrastructure | observability、outbox dispatcher | 可靠事件运行策略；失败：阈值未知时按异常积压告警；待冻结原因：容量基线未测量；阻断：跨域奖励运维 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `reliable-events.delivery.semantics` | 可靠事件投递语义 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | at_least_once_with_idempotent_consumer | shared-infrastructure | 全部奖励生产域、subscription | 不可配置；失败：重复事件由 inbox 唯一键吸收 | P1 / [P1] 统一 AI 额度和奖励事件合同 |
| `reliable-events.dispatch.batch_size` | 可靠事件单批派发数量 | `reliability_ops` | 领域策略 / 待冻结 | P1_PENDING 条 | shared-infrastructure | outbox dispatcher | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：真实容量未测量；阻断：自动奖励事件派发 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `reliable-events.dispatch.max_attempts` | 可靠事件最大投递次数 | `reliability_ops` | 领域策略 / 待冻结 | P1_PENDING 次 | shared-infrastructure | outbox dispatcher | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：故障注入未完成；阻断：自动奖励事件派发 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `reliable-events.dispatch.backoff_policy` | 可靠事件重试退避策略 | `reliability_ops` | 领域策略 / 待冻结 | P1_PENDING 时间 | shared-infrastructure | outbox dispatcher | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：故障注入未完成；阻断：自动奖励事件派发 | P3 / [P3] 游客、试用、会员和奖励闭环 |
| `reliable-events.replay.window_days` | 可靠事件自动重放窗口 | `reliability_ops` | 领域策略 / 待冻结 | P1_PENDING 天 | shared-infrastructure | outbox dispatcher、subscription inbox | 取得真实证据后发布不可变领域策略版本；失败：未冻结前停止对应范围，不从旧实现猜值；待冻结原因：审计保留和运营响应尚未冻结；阻断：自动历史重放 | P3 / [P3] 游客、试用、会员和奖励闭环 |

## 性能、成本与可观测性

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `observability.ai.total_deadline_max_seconds` | 生成式 AI 请求总截止时间上限 | `slo_capacity` | 领域策略 / 已冻结 | `60` 秒 | shared-infrastructure | 所有生成式能力、监控 | SLO 策略版本；不替代每个 Provider 的连接、读取和首包超时；失败：截止后进入额度对账，不盲重试 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `observability.api.non_ai_p95_ms` | 非 AI API p95 目标 | `slo_capacity` | 领域策略 / 已冻结 | `800` 毫秒 | shared-infrastructure | 全部非 AI API、监控 | SLO 策略版本；失败：不达标阻断发布但不篡改响应 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `observability.api.non_ai_p99_ms` | 非 AI API p99 目标 | `slo_capacity` | 领域策略 / 已冻结 | `1500` 毫秒 | shared-infrastructure | 全部非 AI API、监控 | SLO 策略版本；失败：不达标阻断发布 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `observability.ai.first_visible_event_p95_ms` | AI 首个可见事件 p95 目标 | `slo_capacity` | 领域策略 / 已冻结 | `3000` 毫秒 | shared-infrastructure | diagnosis、CloudBase Agent、监控 | SLO 策略版本；失败：不达标进入性能整改，不伪造首包 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `observability.sql.slow_query_ms` | 慢 SQL 记录阈值 | `slo_capacity` | 领域策略 / 已冻结 | `200` 毫秒 | shared-infrastructure | DB、监控 | SLO 策略版本；失败：超过阈值记录脱敏结构化事件 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `observability.db.connection_safety_ratio` | 数据库连接安全占比 | `slo_capacity` | 领域策略 / 已冻结 | 0.70 比例 | shared-infrastructure | DB、CloudBase 函数部署 | 连接预算策略；失败：最大实例数及其他连接占用未核实前连接池数值保持 STOP | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `observability.db.pool_size` | 单实例数据库连接池上限 | `deployment_environment` | 部署/受控环境 / 待冻结 | P1_PENDING 连接数 | platform-admin | DB、全部云函数 | 部署配置，须基于真实连接上限计算；失败：最大实例数及其他连接占用未核实前不配置连接池或预置并发；待冻结原因：CloudBase MySQL 当前 max_connections=1000 已读回；云函数最大实例数及其他连接占用未核实；阻断：真实并发部署 | P5 / [P5] 真实 MySQL/API/安全/性能验收 |

## 配置治理与部署

| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |
|---|---|---|---|---|---|---|---|---|
| `provider.credentials.storage_mode` | 第三方凭证保存方式 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | credential_ref_only | shared-infrastructure | 全部 Provider Adapter | 不可配置；失败：缺失 credential_ref 时拒绝调用 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `deployment.cloudbase.env_id` | P0-P5 验证 CloudBase 环境 ID | `deployment_environment` | 部署/受控环境 / 已冻结 | cloud1-2grufevs395a9d5e | platform-admin | 部署脚本、云函数、数据库、CMS、Storage | 用户明确授权后修改部署配置；失败：环境不匹配立即 BLOCKED_ENV | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `deployment.cloudbase.region` | CloudBase 地域 | `deployment_environment` | 部署/受控环境 / 已冻结 | ap-shanghai | platform-admin | 部署脚本、云函数 | 随环境部署配置变更；失败：地域不一致停止操作 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.request_snapshot.immutable` | 单次请求配置快照不可变 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | shared-infrastructure | 全部应用服务与 Adapter | 不可配置；失败：解析失败按能力失败关闭或显式降级 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.release.sha256_required` | 配置发布必须带 SHA-256 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | shared-infrastructure | 全部策略注册表、Provider 注册表 | 不可配置；失败：哈希不匹配拒绝激活 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.last_known_good.max_age_seconds` | 最近有效配置最大可复用时长 | `configuration_governance` | 领域策略 / 已冻结 | `300` 秒 | shared-infrastructure | ConfigResolver、全部应用服务 | 配置治理策略版本；失败：身份、支付、权限、AI 成本和写操作无安全版本时失败关闭 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.emergency_switch.max_ttl_minutes` | 紧急关闭开关最长有效期 | `configuration_governance` | 领域策略 / 已冻结 | `240` 分钟 | shared-infrastructure | 全部高成本或高风险能力 | 紧急审批且必须记录 owner、原因与解除条件；失败：到期自动失效或转人工审批，不允许永久开关 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.generic_kv_allowed` | 是否允许万能键值配置表 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `false` | shared-infrastructure | 全部业务域 | 不可配置；失败：新增策略必须有类型、Schema、owner 和迁移 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.active_pointer.atomic` | 配置生效指针原子切换 | `hard_business_rule` | 不可配置硬规则 / 不可配置硬规则 | `true` | shared-infrastructure | 策略注册表、Provider 注册表 | 不可配置；失败：切换失败保留原 active release | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.cache.ttl_seconds` | 已验证配置缓存有效期 | `configuration_governance` | 领域策略 / 已冻结 | `30` 秒 | shared-infrastructure | ConfigResolver | 配置治理策略版本；失败：缓存过期后重新解析 active release，禁止把缓存当事实源 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.snapshot.retention_days` | 配置快照审计保留期 | `configuration_governance` | 领域策略 / 已冻结 | `365` 天 | shared-infrastructure | 配置审计、业务结果回放 | 审计保留策略与法务确认；失败：未冻结前不物理删除快照引用 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.release.approval_policy` | 配置发布审批规则 | `configuration_governance` | 领域策略 / 已冻结 | `{"standard":{"requiredOwnerApprovals":1,"explicitUserApproval":false},"highRisk":{"requiredOwnerApprovals":1,"explicitUserApproval":true},"emergencyDisable":{"requiredOwnerApprovals":1,"explicitUserApproval":false,"maxTtlMinutes":240}}` | shared-infrastructure | 配置发布流水线 | 配置治理规则需用户批准；失败：无审批规则时禁止激活新 release | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `configuration.rollback.allowed_window_hours` | 配置快速回滚窗口 | `configuration_governance` | 领域策略 / 已冻结 | `24` 小时 | shared-infrastructure | 配置发布流水线 | 配置治理策略版本；失败：窗口外仍可走完整审批发布旧版本的新 active 记录 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `deployment.cloudbase.mysql.connection_deadline_ms` | CloudBase MySQL 建连截止时间 | `deployment_environment` | 部署/受控环境 / 待冻结 | P1_PENDING 毫秒 | platform-admin | DB | 受控部署配置；失败：未冻结时不进行真实并发部署；待冻结原因：真实网络和数据库基线未测量；阻断：真实 MySQL 部署 | P5 / [P5] 真实 MySQL/API/安全/性能验收 |
| `deployment.cloudbase.mysql.transaction_deadline_ms` | CloudBase MySQL 事务截止时间 | `deployment_environment` | 部署/受控环境 / 待冻结 | P1_PENDING 毫秒 | platform-admin | DB、全部写用例 | 受控部署配置并受业务事务合同上限约束；失败：未冻结时不得宣称真实事务性能通过；待冻结原因：真实事务时延未测量；阻断：真实写入部署 | P5 / [P5] 真实 MySQL/API/安全/性能验收 |
| `deployment.cloudbase.function.max_instances` | HTTP 云函数最大实例数 | `deployment_environment` | 部署/受控环境 / 待冻结 | P1_PENDING 实例 | platform-admin | CloudBase 部署、DB 连接预算 | 用户明确授权后的部署配置；失败：未冻结时禁止预置并发和生产扩容；待冻结原因：套餐与真实容量未读回；阻断：真实并发部署 | P5 / [P5] 真实 MySQL/API/安全/性能验收 |
| `deployment.cloudbase.storage.access_mode` | CloudBase Storage 访问模式 | `deployment_environment` | 部署/受控环境 / 已冻结 | private | platform-admin | CloudBase Storage、全部图片业务域 | 不可在业务运行时切换；变更需安全重审；失败：非 private 状态阻断用户私图能力 | P1 / [P1] 业务策略与统一 Provider 配置架构 |
| `deployment.cloudbase.credential_resolver_ref` | 受控凭证解析器引用 | `deployment_environment` | 部署/受控环境 / 已冻结 | cloudbase-runtime-credential-resolver/v1 | platform-admin | 全部 Provider Adapter | 受控部署配置和凭证轮换流程；失败：解析器缺失时 Provider 调用失败关闭 | P1 / [P1] 业务策略与统一 Provider 配置架构 |

## 首批 Provider 逐项配置档案

以下每个档案都显式登记同一组运行字段。`P1_PENDING` 表示该字段没有事实依据，不能由 Adapter 自行填默认值；`not_applicable_or_P1_PENDING` 表示必须先裁决是否适用。

| Provider | 能力 | 状态 | 端点 / 凭证 | 超时 / 重试 | 限流 / 熔断 | 成本 / 预算 | 回退与阻断 |
|---|---|---|---|---|---|---|---|
| `baidu_plant` 百度植物识别 | PLANT_IDENTIFICATION_CANDIDATES | pending | P1_PENDING / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=P1_PENDING, warn=P1_PENDING | 返回识别暂不可用或候选不足，绝不写规范身份；阻断：百度识别真实调用 |
| `taxonomy_authority` 植物分类权威来源 | TAXONOMY_EVIDENCE_QUERY | pending | P1_PENDING / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=not_applicable_or_P1_PENDING, month=not_applicable_or_P1_PENDING, warn=not_applicable_or_P1_PENDING | 来源冲突或不可用时进入 QUARANTINE，禁止模型裁决；阻断：植物身份准入 |
| `bailian_qwen_diagnosis` 云百炼 Qwen 问诊 | USER_DIAGNOSIS_TEXT、USER_DIAGNOSIS_VISUAL | pending | P1_PENDING / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=500, warn=400 | 模型、Prompt、Schema、价目或额度任一缺失即停止对应 AI 动作，不静默换模；阻断：AI 问诊 |
| `bailian_qwen_enrichment` 云百炼 Qwen 百科补全 | CMS_ENRICHMENT | pending | P1_PENDING / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=P1_PENDING, warn=P1_PENDING | 暂停后台补全，不影响已发布百科读取；禁区字段整份拒绝；阻断：自动 CMS 百科补全 |
| `qweather` 和风天气 | WEATHER_CURRENT、WEATHER_FORECAST、WEATHER_HISTORY | pending | P1_PENDING / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=P1_PENDING, warn=P1_PENDING | 使用仍在有效期内的标准化快照，否则返回证据不足；阻断：天气增强养护 |
| `wechat_pay` 微信支付 v3 | MINIPROGRAM_SUBSCRIPTION_PAYMENT、PAYMENT_QUERY、PAYMENT_REFUND | pending | P1_PENDING / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=not_applicable_or_P1_PENDING, warn=not_applicable_or_P1_PENDING | 未知结果只查单和对账，禁止自动重下单或跨 Provider 回退；阻断：订阅支付 |
| `platform_notification` 多平台通知 | CARE_REMINDER_NOTIFICATION、SUBSCRIPTION_NOTIFICATION | pending | P1_PENDING / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=P1_PENDING, warn=P1_PENDING | 记录未送达，不把提醒触达伪造成养护事实；阻断：主动通知 |
| `cloudbase_storage` CloudBase 云存储 | PRIVATE_UPLOAD、PRIVATE_READ、ASSET_DELETE | pending | cloudbase_server_sdk / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=P1_PENDING, warn=P1_PENDING | 停止图像增强，禁止退回 Base64 或任意 URL 抓取；阻断：真实图片上传、读取与删除 |
| `cloudbase_cms` CloudBase CMS | CMS_DRAFT_WRITE、CMS_RELEASE_READ、CMS_PUBLISH_CALLBACK | pending | cloudbase_cms_api / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=P1_PENDING, warn=P1_PENDING | 暂停草稿/发布写入，继续读取最后已验证不可变 release；阻断：CMS 自动补全与发布回调 |
| `cloudbase_agent` CloudBase 小青 Agent | AGENT_TOOL_CALL | pending | cloudbase_agent_tool_api / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=P1_PENDING, month=500, warn=400 | 用户范围、工具 allowlist、额度或签名无法证明时只开放公共知识；阻断：小青个人数据与写工具 |
| `cloudbase_mysql` CloudBase MySQL | TRANSACTIONAL_REPOSITORY | pending | cloudbase_mysql_private / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=1, backoff=no_automatic_transaction_retry | rate=connection_budget, circuit=P1_PENDING | policy=cloudbase_resource_budget_PENDING, month=P1_PENDING, warn=P1_PENDING | 连接或事务结果不确定时失败关闭并对账，禁止跨库降级；阻断：真实并发写入 |
| `cloudbase_auth` CloudBase 身份认证 | ANONYMOUS_PRINCIPAL | pending | cloudbase_auth_v2 / P1_PENDING | connect=P1_PENDING, read=P1_PENDING, total=P1_PENDING, attempts=P1_PENDING, backoff=P1_PENDING | rate=P1_PENDING, circuit=P1_PENDING | policy=cloudbase_resource_budget_PENDING, month=P1_PENDING, warn=P1_PENDING | 匿名认证不可用时拒绝签发游客主体；不得以设备、IP、Cookie 或匿名 UID 伪造 user_id；阻断：游客匿名主体真实接入 |
| `wechat_miniprogram_login` 微信小程序登录凭证交换 | PLATFORM_LOGIN_PRINCIPAL | confirmed | wechat_jscode2session / env:WECHAT_MINIPROGRAM_PRIVATE_KEY | connect=2000, read=3000, total=5000, attempts=1, backoff=none_single_use_code | rate=platform_quota_only, circuit=none_fail_closed | policy=free_platform_api, month=0, warn=0 | 凭证或受控配置不可用时拒绝登录，不信任客户端自报的 OpenID 或 HTTP 请求头；阻断：真实微信小程序登录验真；本地 fake Provider 合同与 MySQL 切片不受阻 |
| `open_meteo` Open-Meteo 太阳辐射预报 | SOLAR_RADIATION_FORECAST | confirmed | open_meteo_forecast_v1 / none_public_api | connect=2000, read=5000, total=8000, attempts=1, backoff=none | rate=free_tier_daily_quota_cache_per_location_hour, circuit=none_fail_closed | policy=free_public_api, month=0, warn=0 | 请求失败或数据缺段时对应时段保持缺段，浇水窗口端点开放，不切换其他来源、不外推；阻断：植物位置光照与浇水动态窗口；不阻断盆土安全门与水量估算 |
| `douyin_miniprogram_login` 抖音小程序登录凭证交换 | PLATFORM_LOGIN_PRINCIPAL | confirmed | douyin_jscode2session_v2 / env:DOUYIN_APPID+env:DOUYIN_APP_SECRET | connect=2000, read=3000, total=5000, attempts=1, backoff=none_single_use_code | rate=platform_quota_only, circuit=none_fail_closed | policy=free_platform_api, month=0, warn=0 | 凭证或受控配置不可用时拒绝登录，不信任客户端自报的 openid 或请求头；阻断：真实抖音/小红书小程序登录验真；本地 fake Provider 合同与 MySQL 切片不受阻 |
| `xiaohongshu_miniprogram_login` 小红书小程序登录凭证交换 | PLATFORM_LOGIN_PRINCIPAL | confirmed | xiaohongshu_rmp_token_then_session / env:XIAOHONGSHU_APPID+env:XIAOHONGSHU_APP_SECRET | connect=2000, read=3000, total=5000, attempts=1, backoff=none_single_use_code | rate=platform_quota_only, circuit=none_fail_closed | policy=free_platform_api, month=0, warn=0 | 凭证或受控配置不可用时拒绝登录，不信任客户端自报的 openid 或请求头；阻断：真实抖音/小红书小程序登录验真；本地 fake Provider 合同与 MySQL 切片不受阻 |

## 验收方式

- 机器目录中每项必须有唯一 ID、中文名称、领域、层级、类型、状态、当前值、owner、来源、消费方、变更规则、失败边界、阶段、Ticket 与 Expected。
- `pending` 必须额外具备 `pendingReason` 与 `blockingScope`；对应范围在值冻结前不得实现。
- 目录必须覆盖身份、权益、用户植物、植物知识、养护、问诊、存储、HTTP、可靠事件、可观测性和配置治理。
- 首批 Provider 必须逐个具备端点档案、凭证引用、连接/读取/总超时、重试与退避、限流、熔断、成本/预算、回退链、输出合同、审计保留和阻断范围；待冻结字段不得进入真实 Adapter。
- 任何代码新增可调常量时，先判断其是否属于本目录；属于则先修改策略合同和测试，不允许先埋常量。

