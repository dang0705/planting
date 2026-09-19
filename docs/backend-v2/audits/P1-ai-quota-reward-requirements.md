# P1 统一 AI 额度和奖励事件：当前合同与 DDL 语义审计

> 对应 ClickUp：`z8v0kmr96z`（统一 AI 额度和奖励事件合同）  
> 负责 agent：`subscription_terra`  
> 当前状态：`STATIC_CONTRACT_DDL_TEST_PASS / CONFIG_RUNTIME_PROVIDER_OPEN`  
> 审计性质：`unit_real_data` 语义复核；不是订阅实现、真实扣费、真实供应商调用或 `/api/v2` 运行验收。  
> 结论时间：2026-09-20（Asia/Shanghai）。

## 1. 当前事实源与 SHA-256

本审计以当前合同、状态机、数据字典、配置目录、005/006 空库 DDL、TypeScript/AJV 合同和正式静态测试为唯一语义依据；不把旧实现、CloudBase 配置、真实支付、CMS release 或供应商运行态当作当前事实源。

| 当前事实源 | SHA-256 | 用途 |
|---|---|---|
| `docs/backend-v2/contracts/care-points-and-ai-quota.md` | `3f1f240781f2e65d483a9a5a611d40b2f7d2b8c34fb43814f0b1e513f2476ac3` | 额度来源、成本换算、预占/结算/释放、奖励和兑换语义 |
| `docs/backend-v2/contracts/reward-events.md` | `31cc366331f73328b6183dee688c00efd2fee1f68317b3d0574345a5fe26c71e` | outbox/inbox、事件载荷和业务唯一键 |
| `docs/backend-v2/data/state-machines.md` | `c14b685993e5178e52e5bfcb683674b736c3020ac76eab9b60105bbe9a89d5d9` | grant、reservation、兑换、奖励事件状态转换 |
| `docs/backend-v2/data/v2-data-dictionary.md` | `ac41572a0f8263725722bb060092668361e155b393ab0f9da5bd7a8654902f54` | 表职责、投影与长期归属边界 |
| `docs/backend-v2/architecture/configuration-variable-catalog.json` | `7f51103ed728465e4645b853cadac008765cb61ed4abfc2df4ee686a9e4d9c9e` | 已确认产品值与仍为 pending 的配置 |
| `docs/backend-v2/schema/005_subscription.sql` | `c7638d5a8ff51080c81becf458205ba00bdc705fe772af5661843e2357b70fdb` | subscription 表、唯一键和 CHECK |
| `docs/backend-v2/schema/006_reliable_events.sql` | `304dbc8ebd0cae1a464302cd7d932ac572e563b1df3a0f2338320798db537f39` | 各写域 outbox 与安全审计表 |
| `docs/backend-v2/schema/manifest.json` | `ad7e0e8a198ce6b14db7ab6abf0cbffb93e33fbbce640572ab123a18bd173f77` | DDL 顺序与文件 SHA |
| `cloudfunctions-v2/src/contracts/types.ts` | `81ed6d656be12ce6bdeaa2870d6b33c96819953e5f6534a4dcfd11869d374b75` | 公开动作、预占命令、奖励事件 DTO |
| `cloudfunctions-v2/src/contracts/schemas.ts` | `d156dd0d224234669975e9e239fd8de04827192c2ee2db79188baf90d30892af` | DTO/AJV 严格字段和枚举边界 |
| `cloudfunctions-v2/test/p1-subscription-semantics.spec.ts` | `812745f280038c66d43e8060ae4cc950f76a3b9dad91da62bbd9c50ab6d61034` | 005 DDL 语义约束 Expected |
| `cloudfunctions-v2/test/p1-total-ddl.spec.ts` | `af6d892ee8366d1b8e8904c45b2461e2da838189f4407c330995eb54e45ef8c7` | 总 DDL、manifest 和成本字段 Expected |
| `cloudfunctions-v2/test/p1-contract-foundation.spec.ts` | `f915fb1c66d9995083b1a223a08eeac7ba3992f278f482267965ce82b4f74fb8` | 合同注册表和合同 SHA Expected |
| `cloudfunctions-v2/test/p1-public-contracts.spec.ts` | `e0d063d7b00d56b5050d09ff2bba4d626713841cd9b4a2a6e2f289c1becfb1cb` | 公开动作与奖励事件负向 Expected |
| `cloudfunctions-v2/test/p1-state-and-data-dictionary.spec.ts` | `e2d791d823f5dc930b282aa5cc0f364f7fffddc765e2eff41d1524a9dac9cea0` | 状态机、数据字典和 data manifest Expected |

## 2. 当前已冻结的额度、积分和奖励事实

### 2.1 权益、grant 与到期

- `subscription` 是权益、会员周期、积分、等级奖励、AI grant、AI reservation、AI ledger、reward inbox 的唯一事实写入域；生产域只提交业务行为事实。
- 试用为每个统一用户终身一次、200 AI 点、从 `users.created_at_ms` 起绝对 24 小时；会员每个成功订阅周期发 2,000 点，周期结束不结转；CMS 身份/内容奖励分别为 100/50 点，等级奖励为 50/100/150/250/400 点，均从实际入账日起按日历月加 3 个月到期。
- grant 来源枚举已固定为 `TRIAL / MEMBER / CMS_IDENTITY / CMS_CONTENT / CARE_LEVEL / CARE_REDEMPTION`；所有来源在发放时写绝对 `expires_at_ms`，当前 005 以 `expires_at_ms > granted_at_ms` 和来源 CHECK 约束它。
- grant 守恒为 `grantedAmount = availableAmount + reservedAmount + consumedAmount`；`availableAmount` 才是可用于新预占的余额，`available + reserved` 只是审计上的未消费额。
- 额度选择不按会员/试用层级排序；权益层级只决定能力是否允许。已允许的动作在 scope 匹配且未到期的 grant 中按 `expiresAt → grantedAt → grantRef` 升序选择。

### 2.2 成本与 reservation

- 平台 AI 月预算固定为 400 元告警、450 元限制新增消费、500 元停止新增消费；基础识别、天气、确定性算法、固定题包和 CMS 补全不扣用户 AI 点。
- `1 AI 点 = 0.001 元`基础成本乘 `1.25` 安全系数；实际结算是 `向上取整(costMicros / 800)`，全程使用人民币微元整数，不使用浮点金额。
- 一个产品动作只创建一个 reservation；多图诊断仍是一个动作。`estimatedAmount` 必须来自不可变 `costPolicyVersion` 与产品动作上限，客户端只能传动作和能力，不能传预算、成本策略、grant 或结算值。
- 预占流程固定为能力校验 → 按最早到期排序锁定 grant → 同一事务写 reservation/allocation/AI ledger → 模型调用 → 按证据结算或释放；未知供应商结果进入 `pending_reconciliation`，不得盲目释放或重试。
- 005 已写入 reservation 的正数、状态、结算不超过预占、终态字段关系、用户+动作+幂等键唯一约束；allocation 已写入 pair 唯一、正数和逐行守恒；AI ledger 已写入操作唯一键和反向记录约束。

### 2.3 积分、兑换和奖励事件

- 积分账本只追加 `grant / spend / reverse`，账户和等级是可重建投影；积分永不过期，普通消费不降级。客户端和生产域不能提交分值。
- 兑换状态已统一为 `requested → committed / rejected`、`committed → reversed`；005 以状态 CHECK 和 ledger 链接 CHECK 防止 `completed/failed` 混入或缺少冲正引用。MVP 兑换目录为空，不应生成 `CARE_REDEMPTION` grant。
- 生产域事件固定为五类版本化事件；事件只含用户/用户植物、聚合、发生时间、最小事实载荷和 `payloadHash`，不含积分或 AI 点数。`subscription` 按事件时间和策略快照计算奖励。
- 006 为每个写域提供独立 outbox，保存事件 ID、聚合版本、载荷哈希、租约和重试字段；005 的 `subscription_reward_inbox` 以 `event_id` 与 `business_unique_key` 双唯一键去重，状态字段组合由 CHECK 约束。

## 3. 当前产品规则与验证边界

| 规则主题 | 当前最终事实 | 仍未验证的边界 |
|---|---|---|
| 公开 AI DTO 与预算边界 | `types.ts`/`schemas.ts` 已分离公开 AI 动作与内部预占命令；公开请求拒绝 `estimatedAmount`、`costPolicyVersion` 等额外字段。 | 没有真实业务 handler 或 `/api/v2` 路由运行验收。 |
| grant 余额与守恒 | 合同、数据字典和005固定 `available/reserved/consumed` 及整数守恒；静态测试锁定字段/约束。 | 跨多个 grant 的总分配和并发锁定必须用真实 MySQL 验证，逐行 CHECK 不能替代事务证明。 |
| 成本换算与动作上限 | 1.25 安全系数、整数微元公式、不可变 cost policy/action 上限和平台承担差额已写入合同/005字段。 | 四类具体产品动作策略仍为 `P1_PENDING`，不可据此开放真实生成式调用。 |
| reservation 终态与未知结果 | 状态机与005固定 `reserved / settled / released / pending_reconciliation`，超预占不得扣成用户负数。 | `subscription.ai_reservation.ttl_seconds` 仍为 `P1_PENDING`；对账、补占、崩溃恢复和供应商证据未运行验证。 |
| 试用起算、会员与奖励到期 | 试用绑定统一用户创建时间并由005复合外键和24h CHECK固定；会员/奖励到期规则已写入合同和数据字典。 | grant 发放服务、支付验签和到期任务未实现/验证。 |
| 兑换状态机 | 合同、状态机、005 已统一为 `requested/committed/rejected/reversed`。 | MVP 空目录的真实 HTTP 响应、积分账本事务未验证。 |
| outbox/inbox 幂等与奖励去重 | reward-events、005/006 已固定至少一次、event/business 双唯一键、载荷哈希和同事务语义。 | 真实投递租约、重放、不同 event ID 同业务事实和跨域回放未验证。 |

## 4. 静态测试与退出边界

- `p1-contract-foundation.spec.ts`、`p1-public-contracts.spec.ts`、`p1-subscription-semantics.spec.ts`、`p1-total-ddl.spec.ts` 和 `p1-state-and-data-dictionary.spec.ts` 均属于 `unit_real_data` 或 `unit_fake`；它们读取真实合同、DDL、manifest 和 AJV，不连接 MySQL 或供应商。
- 当前静态结果可证明合同字段、枚举、公开脱敏、DDL 唯一键/CHECK、状态转换和制品 SHA 与登记表一致；不能把这些结果描述为真实额度扣减、支付成功、CMS 发布奖励、模型计费或并发原子性。
- 真实运行前置的明确配置缺口是 `subscription.ai_reservation.ttl_seconds` 以及 `subscription.ai_action.agent_text`、`diagnosis_text`、`diagnosis_visual_single`、`diagnosis_visual_multi`，它们在配置目录中仍是 `P1_PENDING`。缺配置时应失败关闭，不得在代码、环境变量或数据库中私设默认值。

## 5. 仍未验证与继续条件

1. 在真实 MySQL 空库执行 005/006 并读回索引、外键、CHECK；用并发事务验证 grant 选择、跨 grant 分配、守恒、死锁重试、同键异参和 reservation 回滚。
2. 接入真实支付 sandbox/验签/查单/对账后，验证会员周期与 2,000 点发放只发生一次；接入真实 CMS release 后，验证身份/内容首次发布奖励和全局主题键。
3. 接入真实供应商价目、用量/账单证据和成本策略后，验证 400/450/500 预算闸门、1.25 换算、超预占平台承担差额、`pending_reconciliation` 终态和未知结果不盲重试。
4. 实现 `/api/v2` 与 CloudBase Agent 的受控内部命令后，再验证 capability scope、user/user_plant 归属、公开脱敏、outbox/inbox 至少一次投递和真实 replay。
5. 在上述证据完成前，保持 `CONFIG_RUNTIME_PROVIDER_OPEN`；本审计只声明当前合同、DDL、测试和 SHA 状态，不宣布生成式能力、支付或奖励系统已上线。
