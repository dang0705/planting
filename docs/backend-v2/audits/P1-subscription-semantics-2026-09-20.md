# P1 统一 AI 额度和奖励事件：剩余语义裁决

> 对应 ClickUp：`z8v0kmr96z`（统一 AI 额度和奖励事件合同）  
> 性质：只读语义审计；不修改公共合同、总 DDL、测试、追踪或 ClickUp。  
> 结论状态：供主代理冻结为公共合同、状态机、DDL 约束及先行 RED 的裁决输入；不是实现或真实环境验收。  
> 唯一基线：`青花植后端 v2 底层架构重构计划（完整融合闭环终版）`，当前 SHA-256 `1a8382b83eb7720425f201afef9920e148e8eda3b15618e112516839fac10357`（已通过 `verify-entrypoint.mjs`）。

## 1. 范围、输入与可追溯性

只读取当前 subscription 合同、状态机、数据字典、变量目录和既有 P1 审计。未读取旧实现、总 DDL、公共测试、CloudBase 环境或支付/供应商运行态。

| 输入 | 当前 SHA-256 | 本次用途 |
|---|---|---|
| `contracts/care-points-and-ai-quota.md` | `733268d1c0fe1f44e953905dae2d34bae5173d3c64ea4df5bcd35692639d4710` | grant、预占、成本、来源唯一键与到期规则 |
| `contracts/reward-events.md` | `31cc366331f73328b6183dee688c00efd2fee1f68317b3d0574345a5fe26c71e` | outbox/inbox 与奖励事件语义 |
| `data/state-machines.md` | `f84080e4ae17018b5b1fc1f5c82d3f92f50864bf3283647f6b3ea30057a73c0d` | 合法转换及终态 |
| `data/v2-data-dictionary.md` | `f33a95ce4e5329cecc6fb0c418e7b439504298cd8c3e17121c0dfeef167efdec` | 表职责与投影边界 |
| `architecture/configuration-variable-catalog.md` | `959318a062428eb23ac5565fdf8e0c5cb54e1150e9175f372ce5e18461386b84` | 已冻结值、硬规则和阻断项 |
| `architecture/configuration-variable-catalog.json` | `102b0b2b5584958e5a79b53553d831c91f5a58e60b72ed8c622a0fabaa8d23af` | `sourceRefs`、pending 原因及消费者 |

`P1-ai-quota-reward-requirements.md` 的基础 SHA 与当前入口锁不一致，因此仅作为历史缺口线索；其中“subscription 为唯一积分、等级、AI 额度与 inbox 事实写入者”“最早到期优先”“多 grant 原子预占”和“outbox/inbox 至少一次”的结论，仍被上表当前合同直接支持。

## 2. 必须冻结的裁决

### 2.1 `remaining` 不得再作为可扣减字段

1. grant 的可扣减余额唯一命名为 `availableAmount`，**不含**预占；任何新预占只能读取它。
2. 若查询/审计确需“尚未消费”，统一派生为 `unconsumedAmount = availableAmount + reservedAmount`，它**含**预占、不可用于新扣减。
3. 公共 API 不返回模糊的 `remaining`；若历史列名无法立即删除，必须将其映射为 `unconsumedAmount` 并标为内部审计字段，不能展示为“可用”。
4. 每个 grant 永远满足：`grantedAmount = availableAmount + reservedAmount + consumedAmount`；三个金额均为非负整数。

**Expected：**已预占 30 点的 100 点 grant 对新请求只可用 70 点，审计未消费值为 100 点。  
**负向测试：**将 `availableAmount + reservedAmount` 当作可预占余额，或写出不守恒/负数 grant，必须被命令校验或数据库约束拒绝；公共响应出现未定义 `remaining` 必须合同测试失败。

### 2.2 预占、分配、结算、释放的精确守恒

对 reservation `r`，令 `E = estimatedAmount`，其 allocation 为 `a_i`；同一 `reservation_ref + grant_ref` 至多一条 allocation。

1. **预占：**在一个 MySQL 事务锁定同一用户、scope 匹配、未过期且 `availableAmount > 0` 的 grant；按 `(expiresAt ASC, grantedAt ASC, grantRef ASC)` 分配，直至 `Σa_i = E`。对每个 i：`available -= a_i`、`reserved += a_i`；同时追加 reservation、allocation 和不可变 `reserve` ledger。
2. **结算（`0 ≤ S ≤ E`）：**按 allocation 的既有稳定顺序消费，令 `s_i = min(剩余待结算, a_i)`、`l_i = a_i - s_i`，因此 `Σs_i = S`、`Σl_i = E-S`。对每个 i：`reserved -= a_i`、`consumed += s_i`、`available += l_i`；同一事务追加 `settle` 和 `release` ledger，reservation 转 `settled`。
3. **全量释放：**对每个 i：`reserved -= a_i`、`available += a_i`；追加 `release` ledger，reservation 转 `released`。不得删除 allocation 或 reservation。
4. **幂等：**同一 `user_id + productActionId + idempotencyKey` 同参只返回原 reservation，异参（capability、预计值、成本策略版本任一不同）返回稳定冲突；结算/释放以 reservation 与其命令幂等键去重，终态重放只能返回原结果。

**Expected：**两个 grant 分别 40、70 点，为 100 点动作预占后，稳定分配 40、60；实际 75 点时第一 grant 消费 40，第二消费 35、释放 25，两个 grant 和 reservation 均守恒。  
**负向测试：**并发两个 70 点预占争抢同一 100 点余额时至多一个成功；重复 allocation、`Σa_i ≠ E`、结算超过 allocation、释放已结算 reservation、同键异参，都必须拒绝且不写第二笔 ledger。

### 2.3 超预占与未知供应商结果

1. `actualCostPoints > E` 时绝不补扣用户 grant、绝不令账户或 grant 为负，也不得自动把超额转为下一 grant 的消费。
2. 将 reservation 转 `pending_reconciliation`，保留原 allocation/预占；追加可审计的“观察到的超额”记录，记录 `E`、可审计实际点数和 `actual-E` 平台差额，但不把该差额记为用户消费。
3. 仅有最终供应商用量/账单证据的对账命令可离开该状态：确认用户责任上限仍为 `E` 时按 2.2 结算 E、平台承担差额并转 `settled`；确认调用未发生时全量释放并转 `released`。未知结果或 reservation TTL 到期均不得自动释放。
4. 调用前补占仍可用，但必须在动作上限内、调用发生前完成；补占失败即停止未发生循环。当前 `subscription.ai_reservation.ttl_seconds` 和四类产品动作成本策略均为 `pending`，所以真实生成式调用继续 `BLOCKED_ENV`，不得猜测 TTL 或点数。

**Expected：**预占 100、供应商最终证据为 120 时，用户最多消费 100，20 点被明确标为平台差额；未有最终证据时 reservation 保持 `pending_reconciliation`。  
**负向测试：**120 点直接写入用户 grant 消费、TTL job 直接释放未知结果、超过上限后继续模型循环、无证据把 pending 转 settled/released，均必须失败并保留审计。

### 2.4 到期、权益优先级与额度消费顺序

1. 权益层级 `member > trial > free > guest` 只决定一个 capability 是否允许；它**不**决定 grant 的扣减顺序。
2. 已获准动作在全部 scope 匹配且有效的 grant 中严格按 `(expiresAt ASC, grantedAt ASC, grantRef ASC)` 消费；无 `expiresAt` 视为 `+∞`，但当前六类 grant 均应写出绝对到期事实，不以运行时套餐状态回算。
3. 有效区间是 `[grantedAt, expiresAt)`；在 `expiresAt` 整刻及之后不得新增预占。已开始的 reservation 不因 grant 到期自动释放或失效，仍只经结算、释放或对账闭合。
4. 试用按硬规则 `user_created_at` 起算，绝对 24 小时、终身一次、跨平台/设备/重装/重新登录不重置；因此其 grant 到期为 `user_created_at + 24h`。`state-machines.md` 的“首次激活后”文字必须同步为该规则，不能延迟起算。
5. MEMBER grant 仅在验签且对账认可的订阅周期创建，金额 2,000，`expiresAt = verified_subscription_cycle.endsAt`；周期结束未消费部分过期、不结转。退款仅停止未来使用并通过反向 ledger 撤销尚未消费的可用额；有预占时先闭合 reservation。
6. CMS_IDENTITY、CMS_CONTENT、CARE_LEVEL 和未来 CARE_REDEMPTION grant 从实际入账日按日历月加 3 个月到期，不随会员到期提前失效；积分本身永不过期。MVP 兑换目录为空，不创建 CARE_REDEMPTION grant。

**Expected：**会员仍有效而试用先到期时，先消耗试用；会员周期结束时未消费会员点不可进入下一周期，但未过期等级奖励仍可消费。  
**负向测试：**以会员优先跳过更早到期 trial、在到期瞬间新预占、以首次打开 App 推迟试用、换平台获得第二次试用、会员取消立刻清除已支付周期 grant、会员到期清除奖励 grant，均必须拒绝或保留原合法状态。

### 2.5 兑换终态统一

统一采用 `requested → committed | rejected`，`committed → reversed`；`completed/failed` 不得同时作为 `care_redemptions` 的状态值。`committed` 的含义是积分 `spend` ledger、兑换事实和（未来）CARE_REDEMPTION grant 在同一 subscription 事务完成。`reversed` 必须引用原兑换和反向 ledger，不能删除或改写 `committed`。

**Expected：**MVP 任何兑换请求稳定返回“目录未开放”/`rejected`，不写积分 spend、grant 或兑换 committed。  
**负向测试：**空目录仍可 committed、客户端传点数/比例直接影响 grant、reversed 不引用原 committed、同一 committed_ref 重复花积分，均必须失败。

### 2.6 outbox/inbox 的唯一键与重放边界

1. 每个生产域在本域业务事务内写自己的 outbox；其不可变唯一键为 `(producer_domain, event_id)`，且同一 `event_id` 的 `eventType`、`eventVersion`、`payloadHash`、`occurredAt` 和载荷规范化结果必须一致。dispatcher 重试不产生新 eventId。
2. `subscription_reward_inbox` 的主幂等键为 `event_id UNIQUE`。同 ID 同 hash 是重放，返回已保存处理结果；同 ID 异 hash 是篡改/协议冲突，隔离并告警，绝不覆盖既有 inbox。
3. inbox 成功接收后，必须再以奖励业务唯一键防不同 eventId 的重复事实：首档案 `(user_id, reward_type)`；两类 care 检查各自 `planned_occurrence_ref`；固定题包 `(user_id, user_plant_ref, symptom_type, rolling_30x24h_bucket_or_equivalent_immutable_window_ref)`；CMS `(reward_type, reward_subject_key)`；等级 `(user_id, level_code)`。具体键须进入 DDL 唯一约束/受控串行规则，不能只靠消费者日志。
4. inbox、业务唯一键裁决、积分 ledger/投影、等级 grant、AI grant 和 inbox 终态在一个 subscription 事务提交；源 outbox 标 delivered 失败允许再次投递，不得再次入账。
5. `received` 是可恢复技术处理中间态；无效业务事实转 `rejected` 并保存不可重试原因；技术失败保持/回到可重试接收态，不得伪装 `rejected`。`applied` 的业务纠错只追加逆向 ledger，inbox 不回退。

**Expected：**消费者在入账提交后、源 delivered 标记前崩溃并重放时，inbox 与业务唯一键只保留一份积分/grant/ledger。  
**负向测试：**相同 eventId 异 payloadHash 覆盖记录、不同 eventId 对同一计划发生编号重复发奖、生产域直接写 subscription inbox、已 applied 回退为 received 并重算新策略，均必须拒绝或隔离。

## 3. 主代理落盘次序与关闭条件

1. 先在公共合同冻结上述字段命名、状态、错误码、内部命令和公开脱敏响应；同步修正 trial 起算和兑换终态冲突。
2. 再将每个唯一键、非负/守恒检查、allocation 之和、终态禁止转换和同事务边界落入总 DDL/数据字典。
3. 先写 RED，再做 `unit_real_data` MySQL 并发/重放读回；支付、模型、CMS 与 outbox 实际投递仍需后续 `e2e_real_api` 证据，不能由本审计关闭。

本文件 SHA-256 在写入后以文件本体计算并记录于交接消息；修改任何字节必须重新计算，不得沿用旧 SHA。
