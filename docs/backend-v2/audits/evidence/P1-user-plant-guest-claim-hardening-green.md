# P1 用户植物与游客认领硬化 GREEN 证据

- 时间：2026-09-20（Asia/Shanghai）
- DDL 输入：`docs/backend-v2/schema/manifest.json` 的 7 份 SQL，按登记顺序在隔离空库执行。
- 环境：Docker Desktop `29.8.0`、官方 `mysql:8.4` 镜像摘要 `sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a`、MySQL `8.4.11`；一次性容器、`tmpfs` 数据目录、未映射宿主端口，未连接 CloudBase。
- 真实负向写入：先插入一条合法 `users` 记录；`current_identity_status='invalid_identity'` 被 `ck_user_plant_current_identity_status` 拒绝，`lifecycle_status='invalid_lifecycle'` 被 `ck_user_plant_lifecycle_status` 拒绝；两条命令退出码均为 `1`，随后 `SELECT COUNT(*) FROM user_plants` 返回 `0`。
- 公开合同 GREEN：`p1-guest-session-claim.spec.ts` 与 `p1-public-contracts.spec.ts` 共 `19` 项通过，`typecheck` 通过；`GuestClaimResultDto` 严格拒绝内部 BIGINT、`user_id`、proof、租约和 `request_hash`。
- 未覆盖：真实认领业务事务、并发租约、幂等重放、CloudBase MySQL/API、匿名 proof 与 Storage；本证据不声明这些能力已通过。
