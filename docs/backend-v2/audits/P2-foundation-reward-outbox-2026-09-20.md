# P2 Foundation 奖励事件 outbox 验收

- ClickUp：[`[P2] 共享基础设施实现`](https://app.clickup.com/t/90182453517/z8v0kmr9mk)
- Expected：`reward-events/v1`、后端数据字典、P2 Foundation 验收标准。
- 测试层次：L1 `unit_fake` + DDL `unit_real_data` 静态读回 + 本地真实 MySQL 8.4 空库约束验证。
- 结论：`LOCAL_FOUNDATION_REWARD_OUTBOX_PASS`；真实 CloudBase、dispatcher、跨域 HTTP 和 subscription inbox 仍未验收。

## Break

原 `006_reliable_events.sql` 无法从四张奖励 outbox 行记录无损重建 `RewardableDomainEventDto`：缺少生产域、统一用户、用户植物、发生引用和策略版本；未冻结派发时间却被设为必填；聚合版本唯一键会错误阻止同一聚合版本内的不同发生实例；状态、租约与 delivered 时间没有组合约束。

协议层也缺少“事件类型只能属于登记生产域”“当前域不能写其他域 outbox”“除知识贡献外必须绑定用户植物”和敏感载荷字段拒绝。

## Expected

1. `user_plant.profile_completed.v1` 只属于 `user-plant`。
2. 两种 care 检查事件只属于 `care`；固定题包完成只属于 `diagnosis`；知识贡献发布只属于 `plant-knowledge`。
3. 生产者重试沿用同一 `eventId` 和 payload；outbox 唯一键为 `(producer_domain, event_id)`。
4. 新记录只能为 `pending`；dispatcher 参数未冻结时 `next_attempt_at_ms` 允许为空。
5. `pending / dispatching / delivered / dead_letter` 与租约、成功时间、脱敏终止原因必须一致。
6. 事件载荷不得携带分值、金额、额度、凭证、Prompt、模型原文、SQL、会话/追踪标识、内部主键或私有对象路径。

## 实际路径

```text
RewardableDomainEventDto
→ Foundation 校验生产域、事件类型、用户植物与载荷字段
→ 生成仅含原事件信封的 pending 内部记录
→ 由所属域 Repository 写入该域 outbox
```

本切片只完成前三步的协议和表约束。Repository 的 SQL 写入、领域业务事实与 HTTP 幂等完成记录同事务仍是下一切片。

## 自动化证据

- RED：`audits/evidence/P2-foundation-reward-outbox-red-2026-09-20.txt`，实现模块不存在时测试套件失败。
- GREEN：`reward-outbox.spec.ts` 共 21 项通过；与 `p1-total-ddl.spec.ts` 合跑共 22 项通过。
- 类型检查：源码与测试 TypeScript 均通过。
- 新增源码/测试 lint：0 warning、0 error；格式检查通过。
- 负向变异：将 `care.soil_check_completed.v1` 错配为 `diagnosis` 后，映射正向测试失败；证据见 `audits/evidence/P2-foundation-reward-outbox-mutation-2026-09-20.txt`。恢复后重新转绿。

## 本地真实 MySQL 8.4 证据

- Docker Desktop `29.8.0`，官方 `mysql:8.4` 镜像，服务端 `8.4.11`；一次性容器，不映射宿主端口，未连接 CloudBase。
- 当前 manifest 的 8 份 DDL 在两个独立空库各执行一次，均创建 87 张表。
- 两个结构导出的 SHA-256 均为 `16c46880a2034146ac17b64097d28e7c9ff754b0d22901a56e61f8bb866c46c6`。
- 当前结构：104 个外键、116 个 CHECK、139 个 UNIQUE；缺表注释、缺字段注释、非 utf8mb4 表和 `_openid` 索引均为 0。
- 合法 care pending 事件写入后，事件版本、生产域、统一用户、用户植物、发生引用、策略版本、状态和空派发时间均可精确读回。
- 同域重复事件由 `uq_care_outbox_event` 拒绝；错误生产域、缺失用户植物、pending 携带租约分别由对应 CHECK 拒绝；最终只有 1 条合法记录。

## 明确未覆盖

- 未实现或启动自动 dispatcher，不私设 P3 待冻结的周期、租约、批量、重试、退避、dead-letter 或重放数值。
- 未验证业务事实、outbox、HTTP 幂等完成记录的同一真实事务；未覆盖提交结果未知后的读回对账。
- 未验证 CloudBase MySQL、服务签名、subscription inbox、乱序/重放/并发消费、真实奖励入账或公开 API。
- `identity_outbox` 与 `subscription_outbox` 是各自领域的通用事件表，不属于 `reward-events/v1` 的四个生产域；本切片没有把奖励专属字段错误套入这两张表。
