# P1 用户植物与游客认领硬化 RED 证据

- 时间：2026-09-20（Asia/Shanghai）
- 独立 Expected：`user-plant/v1`、`state-machines/v1`、`v2-data-dictionary` 与 `guest-session-claim/v1`。
- 命令：`npm --prefix cloudfunctions-v2 test -- --run test/p1-guest-session-claim.spec.ts test/p1-public-contracts.spec.ts`，随后执行 `npm --prefix cloudfunctions-v2 run typecheck`。
- RED 结果：Vitest 为 `17 passed / 2 failed / 19 total`；缺少 `ck_user_plant_lifecycle_status` 和 `ck_user_plant_current_identity_status`，且 `guestClaimResult` validator 尚不存在。TypeScript 同时拒绝缺失的 `guestClaimResult` 属性。
- 边界：该 RED 只证明静态 DDL/公开 DTO 还未满足冻结合同；真实 MySQL 空库负向写入另行执行，不以字符串断言替代。
