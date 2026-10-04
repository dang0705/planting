# 首次用户试用即时可见性：Identity / Subscription 边界裁决草案

- 状态：待主代理裁决；本文件只比较方案，不修改 Identity、Subscription、DDL、API 或配置。
- 目标：在保留“试用从统一用户创建时刻起算 24 小时、每个统一用户一生一次”的已冻结语义下，避免新用户已经登录成功但试用权益尚不可见的跨域时间窗。
- Expected 来源：`docs/backend-v2/data/state-machines.md` §4、`docs/backend-v2/architecture/configuration-variable-catalog.md` 的 `subscription.trial.duration_hours`、`subscription.trial.ai_points`、`subscription.trial.once_per_user`、`subscription.trial.anchor`；Identity / Subscription 的 P1 合同与 DDL。

## 已冻结事实

1. 统一用户创建时间 `users.created_at_ms` 是唯一试用起算锚点；重新登录、换平台、换设备或改变客户端上下文都不得重置。
2. 当前试用有效期是 24 小时；每用户终身一次；当前 AI 试用额度与能力范围由 Subscription 已发布的试用策略决定，不得由 Identity 复制或维护。
3. Identity 负责创建统一用户和平台绑定；Subscription 负责权益与 AI 额度账本。Identity 不直接写 Subscription 表。
4. `identity_outbox` 可承载 Identity 自有事件，但统一用户创建事件的正式名称、载荷版本、Subscription inbox、幂等键、失败恢复和登录首响可见性尚无已冻结合同；identity 签发草案中的 `unified-user-created/v1` 目前只是待裁决提议，不是注册生效事件。
5. 由于云函数间没有共同 MySQL 事务，“登录成功后再同步调用 Subscription”不能把两域写入变成原子操作。
6. 当前状态机写明试用需在统一用户创建的同一受控流程中激活；005 DDL 又存在每用户一条的 `trial_entitlements` 实体。若选择“资格纯派生、entitlement 行首次使用才物化”，必须先由主代理明确这两项的目标语义是否允许变更，不能把候选 C 当成现有合同的直接实现。

## 方案比较

| 方案 | 一致性与可见性 | 复杂度/风险 | 结论 |
|---|---|---|---|
| A. 统一用户创建时跨函数同步创建 trial grant | 用户首次登录返回前可以等待 Subscription grant；但 Identity 与 Subscription 不共享事务。Subscription 超时或提交未知时，登录重试可能重复发放或让用户已有身份却不能登录；需要跨函数重试、幂等、未知提交对账和明确失败语义。 | 高耦合、登录可用性依赖额度服务、无法提供真正原子提交。即使幂等完善，也只是可恢复的分布式流程。 | 不推荐作为最小方案。若产品要求登录首响前账本必须存在，必须另立跨域事务/恢复合同，不能把同步 HTTP 当成原子性。 |
| B. Identity outbox → Subscription inbox 异步发放 | Identity 用户创建事务可靠记录事件，Subscription 最终建立 trial grant；消费可重试并去重。 | 事件合同、Inbox、派发、积压告警、死信/人工修复都需实现。异步期间权益/额度暂不可见，直接违反“试用创建后立即可用”的体验，除非另有即时投影。 | 作为跨域事实传播有用，但单独不能闭环即时可见性；当前不应先实现未冻结事件。 |
| C. 按 `users.created_at_ms` 派生试用资格；AI grant 在首次 Subscription 额度事务中惰性建立 | 登录后读取到可信统一用户创建时间，Subscription 的权益判断按 `created_at_ms <= now < created_at_ms + duration` 派生试用资格；首次 AI 额度操作在同一 Subscription 事务内，以**每用户终身固定**来源引用建立 grant，策略版本仅作首次 grant 的锁定元数据，再执行额度预占。登录到第一次权益查询之间不依赖 outbox。 | 权益判定需要从受控 Identity 用户摘要获得 `created_at_ms`。现有 `trial_entitlements.uq_trial_user_once(user_internal_id)` 保证每用户最多一条试用资格实体；`ai_quota_grants.uq_ai_grant_source(user_internal_id, source_type, source_ref)` 保证同一来源 grant 至多一条。trial grant 的 `source_ref` 若包含策略版本会绕过“每用户终身一次”，故必须保持跨策略版本稳定。幂等、并发和 24h 边界要做真实 MySQL 测试。未发生 AI 操作的用户不产生无用 ledger grant。**但当前“创建时激活”状态机与物理 entitlement 行要求未裁决前，不能称其可实施。** | 作为候选的“资格即时派生 + AI 额度首次使用惰性建账”复杂度最低；只有主代理先确认是否把试用资格改为派生事实、`trial_entitlements` 改为惰性审计/物化投影后，才可进入实施。 |

## 推荐方案 C 的约束草案

1. Identity 的统一用户查询/Principal 合同需明确提供经过验证的最小摘要：`user_id`、`created_at_ms`、`status`、必要的 `session_version`。Subscription 已有 Repository 会读取 `users` 行完成账户解析；建议先核对其受控 SQL 投影并在 Identity 合同中界定可消费字段，而不是笼统禁止该既有读路径或新增第二套身份查询。不得把 BIGINT 内部主键、平台主体、Bearer 原文或无关身份字段暴露给 Subscription 应用层。
2. Subscription 的能力裁决只把 `created_at_ms` 作为试用时间锚点，并使用请求锁定的已发布试用策略；到期边界为 `[created_at_ms, created_at_ms + duration)`。已确认的 24h 是当前策略发布值，不应在 Identity 写一个第二份 TTL 常量。
3. 若权益快照只需要判断是否处于试用中，可直接按创建时间派生，不需要登录事件或先写 entitlement projection。
4. 若主代理批准惰性物化，首次 AI 额度预占在 Subscription 单一事务内：重新核验 trial 时间资格与策略快照，按固定 trial grant 来源种类为该用户生成跨策略版本稳定的终身 `source_ref`，由 `uq_ai_grant_source(user_internal_id, source_type, source_ref)` 做幂等防重；策略发布版本只存入首次 grant 的 `policy_version` 元数据。若还创建/更新 `trial_entitlements`，须由 `uq_trial_user_once(user_internal_id)` 保证每用户终身一条，并保持 `starts_at_ms = users.created_at_ms`、`expires_at_ms = starts_at_ms + 24h`。随后从可用余额进行原子预占。该操作不是“每次查询都发额度”。
5. 超过 24h 后不能再创建试用 grant；用户已在有效试用期间建成的账本事实仍依账本合同保留并结算，不能因定时清理或策略新版本重算历史 grant。
6. 免费/试用/会员层级的优先级及 AI 额度来源沿用 Subscription 合同；不能因仍在 24h 内而绕过已经存在的会员、权益或额度规则。
7. 需要独立冻结 `source_ref` 规范化文本、策略版本关联、grant 唯一键、trial/free/member 重叠处理及过期未消费点数语义；在这些合同通过前，不实现或宣称该跨域链路完成。

## 对外接口与测试边界

- 统一用户创建时刻的来源须由 Identity 合同/只读边界确认。现有 Subscription Repository 已读取 `users` 行；决策应明确是扩充该现有受控投影，还是通过身份只读端口提供字段，不能误称当前完全没有此读取。无论采用哪一条，业务层不得直接拼接/发起跨域 SQL，也不得复制另一份创建时间事实。
- `capability snapshot` 的即时试用层级若改为派生事实，须在同一个请求中依赖可信创建时间与已发布试用策略；如 Identity 查询不可用或用户状态不允许，按最低合法层级失败关闭，不凭事件未到推断永久免费。现合同的“创建同一流程激活”未改之前，不能把派生资格视为已经满足状态机。
- 真实验证至少需要：L1 测试覆盖创建边界前/到期边界/边界后及主体上下文变更不重置；L2 两个独立 MySQL 连接并发首次 AI 预占，只创建一笔 trial grant 并只预占一次；重试、事务中断和策略换版不重复发 grant；无额度请求不写 ledger；Provider/HTTP/CloudBase 另行验收。
- 方案 B 若继续被要求，仍需额外测试事件丢失/重复、Inbox 重试、派发延迟时的能力可见性和登录响应承诺；不能以 outbox 存在本身作为端到端证据。

## 待主代理裁定

1. 是否批准把“同一受控创建流程激活”语义改为：资格从可信 `users.created_at_ms` 即时派生，`trial_entitlements` 可按需惰性物化，而不要求身份创建事务中已经存在该物理行？这是方案 C 能否实施的首要门。
2. 是否批准把 `created_at_ms` 纳入 Identity 统一用户摘要合同，并复用 Subscription 当前读取 `users` 的受控 Repository 路径，而不是新增越域写或同步调用？
3. 是否确认资格实体使用 `uq_trial_user_once(user_internal_id)`，额度 grant 使用 `uq_ai_grant_source(user_internal_id, source_type, source_ref)`；grant `source_ref` 必须按用户终身稳定且不含策略版本，版本只写 `policy_version`？
4. 24h 内从未触发 AI 使用的用户是否只获得派生权益、不生成当前策略定义的额度 grant？推荐是；额度只在实际操作时有成本意义。
5. 24h 内建立、但期满后才首次产生 settlement 的预占/请求如何处理？必须依据既有预占与结算合同裁定，不在此稿推断。

本草案不是生产实现或配置发布授权；Identity bearer 内部用例与本跨域裁决彼此独立，可在不写 Subscription 的前提下继续验证。
