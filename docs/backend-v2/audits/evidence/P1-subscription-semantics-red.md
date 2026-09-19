# P1 订阅额度与奖励 DDL RED 证据

- 时间：2026-09-20T02:01:27+08:00
- 命令：`cd cloudfunctions-v2 && npm exec vitest run --config vitest.config.mjs test/p1-subscription-semantics.spec.ts`
- 结果：RED，退出码 `1`。
- 首个失败：`005_subscription.sql` 缺少 `ck_ai_grant_source_type`，因此无法拒绝合同外额度来源。
- Expected 来源：`care-points-ai-quota/v1`、`reward-events/v1`、`state-machines/v1`、`backend-v2-data/v1`，以及 `P1-subscription-semantics-2026-09-20.md` 的守恒、终态和重放裁决。
- 测试层次：`unit_real_data`；读取真实 005 DDL，不连接 MySQL。
- 覆盖：U2 额度与结算边界、U3 非法金额/状态、U4 幂等唯一键；未覆盖真实 MySQL CHECK 执行、并发锁、死锁重试、供应商对账或真实 outbox 投递。
