# 积分、等级与 AI 额度合同

- 合同版本：`care-points-ai-quota/v1`
- 所有者：`subscription`，其他业务域禁止直接写积分、等级、兑换或 AI 额度表。

积分是唯一用户奖励货币，永不过期、不可转账、不可提现。消费积分不降低等级。

| 等级 | 名称 | 累计积分 | AI 奖励 |
|---|---|---:|---:|
| L0 | 萌芽 | 0 | 0 |
| L1 | 扎根 | 100 | 50 |
| L2 | 展叶 | 300 | 100 |
| L3 | 生长 | 800 | 150 |
| L4 | 茂盛 | 1,800 | 250 |
| L5 | 共生 | 4,000 | 400 |

五级奖励合计 950 AI 点，每级终身一次，自发放日起三个月有效。

## MVP 积分来源

- 首株植物有效档案：20。
- 到期盆土/浇水检查：5，浇水和暂不浇水相同。
- 到期施肥条件检查：5，不要求实际施肥。
- 有效固定题包完成：10，同一植物和症状 30 天最多一次。

不奖励登录、浏览、识别、建删植物、浇水次数、施肥次数、照片上传和 AI 消费。

## AI 额度来源

```text
TRIAL / MEMBER / CMS_IDENTITY / CMS_CONTENT / CARE_LEVEL / CARE_REDEMPTION
```

额度必须记录来源、范围、金额、剩余值、发放时间、过期时间和策略版本；消费按允许当前能力且最早到期优先。

## 已冻结产品数值

- 24 小时试用：从服务端统一用户 `created_at_ms` 起算，共 200 AI 点，只允许 `USER_AGENT_TEXT`、`USER_DIAGNOSIS_TEXT`、`USER_DIAGNOSIS_VISUAL`；每个统一用户终身一次，换设备、换平台、重装和重新登录不得重置。
- 会员：每订阅周期 2,000 AI 点；无日限额、周限额，不结转。
- CMS 新规范身份实际发布：100 AI 点；基础展示内容首次发布当前结构版本：50 AI 点。
- CMS 与等级奖励自入账日起按日历月加三个月到期，不随会员到期提前失效。
- MVP 不开放积分兑换，但积分、等级和等级 AI 奖励继续累计；`CARE_REDEMPTION` 只保留合同与状态，不发布兑换目录。
- 平台 AI 月预算：400 元告警，450 元限制新增消费，500 元停止新增 AI 消费；基础非生成式能力不进入用户 AI 点数。

## 额度 grant 与预占

公开引用前缀固定如下：

- 额度批次：`aqg_`；
- 额度预占：`aqr_`；
- 积分账本：`cpl_`；
- 积分兑换：`crd_`。

这些高熵公开引用与数据库 `BIGINT UNSIGNED` 内部主键无关。`policyVersion` 使用 `{policy-domain}/YYYY-MM-DD.revision`，例如 `ai-cost/2026-09-20.1`；已被额度、账本或事件引用的策略版本不可覆盖，只能发布新版本。

```ts
export type AiQuotaGrant = {
  grantRef: string
  user_id: string
  sourceType: 'TRIAL' | 'MEMBER' | 'CMS_IDENTITY' | 'CMS_CONTENT' | 'CARE_LEVEL' | 'CARE_REDEMPTION'
  sourceRef: string
  grantedAmount: number
  /** 尚未预占、可以立即用于新请求的额度。 */
  availableAmount: number
  /** 已被进行中产品动作原子锁定、尚未结算的额度。 */
  reservedAmount: number
  /** 已经完成结算的额度。 */
  consumedAmount: number
  grantedAt: string
  /** 额度批次的绝对失效时间；所有来源都必须提供，达到该时刻后不能再用于新预占。 */
  expiresAt: string
  capabilityScope: Array<'USER_AGENT_TEXT' | 'USER_DIAGNOSIS_TEXT' | 'USER_DIAGNOSIS_VISUAL'>
  policyVersion: string
  status: 'active' | 'partially_used' | 'used' | 'expired' | 'reversed'
  version: number
}

export type AiQuotaReservation = {
  reservationRef: string
  user_id: string
  productActionId: string
  costPolicyVersion: string
  capability: 'USER_AGENT_TEXT' | 'USER_DIAGNOSIS_TEXT' | 'USER_DIAGNOSIS_VISUAL'
  estimatedAmount: number
  settledAmount?: number
  /** 供应商用量证据按不可变价目快照折算的人民币微元。 */
  actualCostMicros?: number
  /** 脱敏用量证据引用，不包含模型原文、凭证或用户数据。 */
  usageEvidenceRef?: string
  /** 超过用户预占且不得转嫁给用户的人民币微元。 */
  platformAbsorbedCostMicros: number
  status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  idempotencyKey: string
  expiresAt: string
}
```

每个 grant 必须始终满足整数守恒：

```text
grantedAmount = availableAmount + reservedAmount + consumedAmount
```

- 预占只允许 `availableAmount → reservedAmount`。
- 结算只允许 `reservedAmount → consumedAmount`。
- 释放只允许 `reservedAmount → availableAmount`。
- 每条跨 grant 分摊必须保存 `remainingAmount`，并始终满足 `reservedAmount = remainingAmount + settledAmount + releasedAmount`；初始预占全部进入 remaining，结算或释放只允许从 remaining 转出，终态 remaining 必须为 0。
- 过期和冲正必须追加 `ai_quota_ledger` 记录，禁止原地抹掉历史。
- `ai_quota_accounts` 是按用户汇总的可重建投影，不是扣费事实源；grant、allocation 与不可变 ledger 才是事实源。
- `capabilityScope` 是至少一项、去重且排序稳定的能力集合，不是单一字符串。
- 时间有效区间固定为 `[grantedAt, expiresAt)`；即 `expiresAt 为开区间`，达到该时刻就不能再用于新预占。

### 来源唯一键与撤销

| 来源 | 业务唯一键 |
|---|---|
| `TRIAL` | `user_id + trial_policy_version`，终身一次 |
| `MEMBER` | `user_id + verified_subscription_cycle_ref` |
| `CMS_IDENTITY` | `reward_type + reward_subject_key` |
| `CMS_CONTENT` | `reward_type + reward_subject_key`，主题键包含内容结构版本 |
| `CARE_LEVEL` | `user_id + level_code`，每级终身一次 |
| `CARE_REDEMPTION` | `user_id + committed_redemption_ref` |

- 经核验的退款、欺诈或错误 release 只能通过反向 ledger 撤销尚未消费的可用额度，不能删除原 grant 或篡改已消费历史。
- grant 尚有预占时不能直接进入 `reversed`；相关 reservation 先结算、释放或进入 `pending_reconciliation`。
- 已发生且可审计的供应商成本由平台承担，不得通过退款或冲正制造用户负余额。
- 会员退款只停止未来使用并撤销尚未消费额度；不追溯删除用户植物、事实、积分、等级或已经合法消费的额度。

固定流程：

```text
校验 CapabilitySnapshot 与能力 scope
→ 按 expires_at、granted_at、grant_ref 稳定排序
→ 在单一 MySQL 事务中锁定 grant
→ 原子预占并记录跨 grant allocation
→ 提交模型调用
→ 按实际成本结算
→ 释放未使用预占
→ 无法确认供应商结果时进入 pending_reconciliation
```

- 余额不足必须在模型调用前返回 `AI_QUOTA_INSUFFICIENT`。
- 同一 `user_id + productActionId + idempotencyKey` 只能有一个预占；同键异参冲突。
- 预占不得让任一 grant 或账户余额为负。
- 未知模型结果不得直接释放额度；对账后只能转为 `settled` 或 `released`。
- `estimatedAmount` 必须来自不可变 `costPolicyVersion` 的产品动作上限，而不是模型适配器临时猜测；多图诊断仍是一个产品动作。
- 模型调用开始前可以在剩余可用额度内原子补占；补占失败必须停止尚未发生的后续模型循环。
- 已发生调用的可审计成本若意外超过预占，不得制造用户负余额或静默多扣；预占进入 `pending_reconciliation`，超额先记平台差额，待价格/用量对账策略裁决。
- 预占 TTL 到期只表示该记录需要对账，不证明模型调用未发生；扫描任务必须把仍为 `reserved` 的到期记录原子改为 `pending_reconciliation` 并记录 `reservation_ttl_expired`，不得自动释放额度。只有最终证据确认未调用后才允许释放。
- `pending_reconciliation` 必须记录内部待对账原因：观察成本超额为 `observed_cost_overage`，预占 TTL 到期为 `reservation_ttl_expired`，供应商结果未知为 `provider_result_unknown`；进入最终 `settled` 或 `released` 后保留历史原因用于审计，但不得进入公开响应。

### AI 点数换算与产品动作上限

- `1 AI 点` 对应 `0.001 元`供应商基础变动成本，并乘 `1.25` 安全系数；结算点数固定为 `向上取整(实际可审计成本元 × 1000 × 1.25)`。
- 实现不得使用浮点金额。供应商成本统一换算为人民币微元（`1 元 = 1,000,000 微元`），等价整数公式为 `向上取整(costMicros / 800)`。
- 实际可审计成本由不可变供应商价目快照和真实输入、输出、图像等计量计算；供应商账单到达后允许通过对账追加差额记录。缓存预占一律按 `0` 命中估算，命中缓存只会降低实际结算。
- 每个 `costPolicyVersion` 必须为每种产品动作冻结模型、最大输入/输出、最多图片、最多内部模型循环、最大成本微元和 `estimatedAmount`。没有价目快照和上限的动作不得开放。
- 多图诊断在用户侧仍是一个 `productActionId`；所有图片和内部模型循环的实际成本汇总到同一 reservation，不能把内部实现次数伪装成多个用户动作重复扣费。
- 后续模型循环可能突破当前预占时，必须在调用前于该产品动作上限内原子补占；补占失败就停止尚未发生的循环。已经发生的可审计成本若超过预占，平台先承担差额、reservation 进入 `pending_reconciliation`，不得扣成负数。

## CMS 贡献奖励裁决

- `cms_contribution_reward_decisions` 以 `(reward_type, reward_subject_key)` 全局唯一，保存首位合格贡献、审核发布引用、奖励结果和冲正引用。
- 身份补缺和基础内容补缺分别使用独立主题键；同一主题无论被多少用户或重试触发，只能产生一次首发奖励。
- 游客没有贡献奖励资格，也不得写入贡献用户字段。
- 奖励裁决产生 `knowledge.contribution_released.v1` 事实事件；subscription 仍通过 inbox 幂等入账，plant-knowledge 不直接写 AI grant。

## 积分账本与等级

- 积分账本是 `grant / spend / reverse` 不可变记录；账户余额是可重建投影。
- 奖励事件只携带行为事实和策略版本，客户端与生产域都不能提交分值。
- 同一业务唯一键只能入账一次；冲正必须引用原账本记录，不能删除或原地改数。
- 等级由“累计净获得积分”计算；普通消费不降级，欺诈/错误奖励冲正可以重算。
- 每个等级 AI 奖励终身一次，五级合计 950 点。

## 策略时间解析

- 奖励消费者按事件的 `occurredAt` 解析当时已发布且生效的不可变积分策略，并把 `policyVersion` 和策略 SHA-256 写入 inbox/ledger。
- 重放旧事件必须继续使用首次接收时锁定的策略版本；不能因新策略发布而重算分值。
- 同一 `eventId` 的 `payloadHash` 或策略版本发生变化时必须隔离并告警，不能覆盖既有处理结果。
