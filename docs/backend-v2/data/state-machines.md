# 青花植后端 v2 状态机

- 合同版本：`state-machines/v1`
- 事实来源：已批准业务架构、后端架构及 P0 决策登记册。
- 适用范围：DDL 约束、TypeScript 类型、AJV DTO、领域规则、API 合同和测试。

本文件只定义允许发生的状态变化。任何实现不得通过直接更新数据库绕过状态转换；每次转换必须记录发起者、前置状态、目标状态、幂等键、事务边界、审计时间、失败原因和可重试性。

## 1. 统一用户、平台身份与登录会话

### 统一用户

```text
active → suspended / deleting
suspended → active / deleting
deleting → deleted
```

- `deleted` 是终态；删除由独立账户删除用例发起，不能通过登录或绑定接口恢复。
- 风险系统或受控管理员可以暂停/恢复用户；用户本人只能发起删除，不能自行解除风险暂停。
- 每次暂停、进入删除或完成删除都必须在同一事务中递增 `users.session_version`，使旧会话失效。

### 平台身份绑定

```text
active → revoked / conflicted
revoked → active / conflicted
conflicted → active / revoked
```

- canonical 主体键固定为 `(platform, app_scope, platform_subject_hash)`，终身只归属首次绑定的统一用户；撤销和恢复更新同一行，禁止物理删除后转绑他人。
- 同一用户在同一 `(platform, app_scope)` 最多一个 active 绑定；`DELETE /bindings/{platform}` 只作用于当前已认证会话的 `app_scope`，因此目标唯一。
- 最后一个 active 平台绑定不得通过解绑接口删除；用户要失去全部登录入口必须走账户删除流程。
- 解绑和风险处置必须递增 `users.session_version`，并在同一事务中撤销该用户全部 active 会话；重新绑定只恢复原用户的原绑定记录。
- `conflicted` 只能由受控冲突检测或人工裁决进入和离开；公开错误不得透露该主体属于哪个用户。

### 登录会话

```text
active → revoked / expired
```

- `revoked` 和 `expired` 都是终态；MVP 不静默续期，平台凭证重新验证后创建新会话。
- 解析会话必须同时满足：bearer 摘要匹配、会话 active、未过期、用户 active、会话版本等于用户当前版本、平台绑定 active 且用户和平台均与会话一致。
- 同一幂等键和相同规范化凭证结果返回原会话；同键异参返回稳定冲突。首次登录的统一用户、绑定和会话必须在单一事务中完成，唯一竞争失败时重读赢家并清理本事务，不得留下孤儿用户。

## 2. 用户植物与植物身份

### 用户植物生命周期

```text
active → archived → active
active / archived → deleting → deleted
```

- `deleted` 是终态；删除流程不能恢复为 active。
- 用户植物的归属、档案、环境和当前植物身份都以 `user_plant_id` 聚合。

### 当前植物身份投影

```text
unidentified → candidate_pending → confirmed
candidate_pending → unidentified
confirmed → candidate_pending
```

- `unidentified`（尚未确认）是合理且必要的当前状态：用户可能先创建一株植物，稍后再识别或确认物种。
- 当前投影只允许 `unidentified / candidate_pending / confirmed`。
- `superseded 只属于身份历史`，表示旧的已确认身份被新确认取代，永不作为用户植物当前身份。
- 只有用户明确确认或受控管理员纠错可以进入 `confirmed`；百度/Qwen 识别结果只能形成候选。

## 3. 游客临时案例与登录认领

### 游客会话

```text
active → completed / failed / expired
```

### 游客植物案例

```text
active → completed / failed / expired
completed → claimed
```

- 一个游客会话可以包含多个植物案例；一个案例只对应一株待认领植物及其临时结果集合。
- `claimed` 只表示登录用户已经将整个案例一次性绑定到新建用户植物；不能只认领案例中的部分结果。

### 认领命令

```text
requested → processing → completed / failed
```

- 同一游客植物案例只能成功认领一次；重复同幂等键返回原结果，不得再建一株植物。
- `user-plant` 在本域事务中创建用户植物和认领投影；其他域通过签名内部查询解析归属，不做跨域分布式事务。
- 认领只补充归属，不自动把诊断建议写成事实、计划或积分。

## 4. 试用与会员

### 24 小时试用

```text
eligible → active → expired
eligible → denied
```

- 每个统一 `user_id` 只允许一次试用；跨平台绑定不能重复领取。
- 试用从服务端统一用户 `created_at_ms` 起算绝对 24 小时，并在创建统一用户的同一受控流程中激活；首次打开功能、换设备、换平台、重装或重新登录都不得推迟或重置，到期后回落为免费能力。

### 会员周期

```text
pending → active → expired
pending → failed
active → cancelled / expired
```

- 取消只停止后续续订；已支付周期在其 `ends_at` 前仍为 active。
- 支付回调必须经过验签和幂等处理后才能改变会员状态。

## 5. AI 额度

### 额度批次

```text
active → partially_used → used
active / partially_used → expired / reversed
```

### 额度预占

```text
reserved → settled / released / pending_reconciliation
pending_reconciliation → settled / released
```

- 模型调用前必须完成原子预占；额度不足时不得发起供应商调用。
- 未知供应商结果进入 `pending_reconciliation`，禁止猜测结算或立即释放。
- `reserved → pending_reconciliation` 必须记录原因：观察成本超额、TTL 到期或供应商结果未知；TTL 到期只触发对账，不触发额度释放、分摊变更或账本写入。
- `pending_reconciliation → settled / released` 只能由最终证据裁决；终态保留内部待对账原因作为历史审计字段。
- 结算不能让用户额度为负；超出预占的已发生成本进入平台差额对账。

## 6. 积分、等级与兑换

积分账本只追加 `grant / spend / reverse` 记录，不原地改写历史。`客户端不能提交分值`；业务域只提交行为事实，subscription 根据已发布策略计算积分。

### 积分兑换

```text
requested → committed / rejected
committed → reversed
```

- `committed` 表示积分和兑换权益已在同一受控用例中落账。
- `reversed` 必须引用原兑换记录；MVP 兑换目录为空，但合同和状态保留。

### 奖励事件消费

```text
received → applied / rejected
```

- 事件唯一键保证只入账一次；重复投递返回已存在结果。
- `applied` 后若需纠错，追加冲正账本，不把 inbox 状态改回 received。

## 7. CMS 补缺和贡献奖励

```text
aggregating → queued → leased → generating → validating
validating → draft_ready / rejected / quarantined
draft_ready → review_pending → approved / rejected
approved → released
leased / generating → queued / failed
```

- Qwen 只能生成基础展示内容草稿，不得生成毒性、浇水、施肥、光照、通风或诊断基本面。
- 只有登录用户触发的候选贡献可记录 `contributor_user_id`；游客不进入贡献奖励链路。
- 只有实际发布且满足首次/结构版本规则的内容才产生奖励事件；草稿、审核中和驳回均不奖励。

## 8. 养护、诊断与可靠事件

### 养护建议与计划

```text
proposed → confirmed / dismissed / expired
confirmed → planned / recorded
planned → completed / cancelled / expired
```

- 诊断只生成建议；只有用户确认后的 care 用例才能写事实、计划或提醒。

### 诊断会话

```text
active → completed / failed / expired
```

### Outbox / Inbox 可靠事件

```text
pending → dispatching → delivered / pending / dead_letter
received → applied / rejected
```

- 发布业务事务与 outbox 写入同一事务；消费方按事件唯一键幂等。
- 超时重试不得改变事件载荷；乱序事件必须按聚合版本拒绝或延后。

## 9. 实现硬规则

- 状态值在数据库、领域类型、AJV schema 和 OpenAPI 中必须完全一致。
- 非法转换返回稳定业务错误码，不得静默忽略。
- HTTP 路由不能直接更新状态字段，只能调用明确的 Command。
- 所有终态、重试态和超时策略必须具备独立 Expected 与失败恢复测试。
