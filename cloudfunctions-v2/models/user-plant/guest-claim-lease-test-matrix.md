# 游客认领：证明改造、处理租约与完整应用用例测试矩阵（E03 / z8v0kmr9mj）

- Expected 来源：`docs/backend-v2/contracts/guest-session-claim.md`（guest-session-claim/v1，2026-10-09 依 guest-token/v1 §3 主代理授权修订）；`cloudfunctions-v2/models/identity/guest-token-contract.md` §3；主代理 2026-10-09 裁决 A/B/C/D；配置目录硬规则 `user-plant.guest_claim.processing_lease_seconds` = 30；既有 `guest-claim-*-contract.md`。
- TDD：Classic。先改/写测试并跑出 RED，再改产品。

## 1. 证明改造（裁决 A/C）

| ID | 场景 | Expected | 层 |
|---|---|---|---|
| P1 | 证明输入只有会话引用、原游客令牌、时刻、宽限期；不再接受匿名主体摘要 | 多余 `anonymousSubjectHash` 字段拒绝 | unit_fake |
| P2 | 按令牌摘要（当前或上一版）定位并要求引用一致；SQL 不含令牌原文 | 参数为 [ref, hash, hash] | unit_fake |
| P3 | 匿名信号为空的服务端令牌会话可认领；`cloudbase_anonymous`/未知来源一律 not_claimable | — | unit_fake、unit_real_data |
| P4 | 错误令牌、非规范、过短、未来、failed → not_claimable；非持有者看不到过期 | — | unit_fake、unit_real_data |
| P5 | 上一版宽限路径保留（无上一版不触发） | 既有 Expected 不变 | unit_fake、unit_real_data |
| D1 | 认领 DTO 必须含 `guestToken`（^[A-Za-z0-9_-]{43}$），拒绝缺失、长度不符、填充、非法字符、匿名主体字段 | — | unit_real_data（AJV） |

## 2. completed 会话（裁决 B）

| ID | 场景 | Expected | 层 |
|---|---|---|---|
| B1 | 会话 completed + 同键原命令 → 重放原命令 | registered/replayed | unit_real_data |
| B2 | 会话 completed + 新键 → not_claimable，零新增命令 | — | unit_real_data |

## 3. 处理租约（硬规则 30 秒）

| ID | 场景 | Expected | 层 |
|---|---|---|---|
| L1 | 常量 = 30 秒且与配置目录 hard_rule 一致 | — | unit_real_data |
| L2 | requested → processing：attempt_count=1，lease_expires = now+30000，持有者为服务端摘要 | acquired、takeover=false | unit_fake、unit_real_data |
| L3 | processing 且租约已过期（expires ≤ now）→ 原子接管：attempt_count+1，换新持有者，新期限 | acquired、takeover=true | unit_fake、unit_real_data |
| L4 | processing 且租约未过期、持有者不同 → 不接管，原行不变 | held（HTTP 503） | unit_fake、unit_real_data |
| L5 | completed / failed → 不取得，原行不变 | completed / failed | unit_fake、unit_real_data |
| L6 | 命令不存在、claimRef 不符、他人命令 → not_found，零写 | — | unit_real_data |
| L7 | 持有者摘要为 64 位小写十六进制；原文不落库 | — | unit_fake |
| L8 | 过期持有者完成写入被既有完成核心条件拒绝（复用已有完成核心） | expired | unit_real_data |
| L9 | 并发两次取得同一 requested 命令：一个 acquired，另一个 held | — | unit_real_data |

## 4. 完整应用用例

| ID | 场景 | Expected | 层 |
|---|---|---|---|
| A1 | 登记 → 取得租约（同一事务提交）→ 完成（既有完成应用）→ completed | 六字段收据 | unit_fake、unit_real_data |
| A2 | 原成功收据存在 → 直接返回，不登记、不取得 | — | unit_fake |
| A3 | 登记确定拒绝（not_claimable/expired/principal_invalid/idempotency_conflict）→ 原样返回，不取得 | — | unit_fake |
| A4 | 租约被他人持有 → processing（HTTP 503），不调用完成 | — | unit_fake |
| A5 | 租约阶段读到 completed → 只读核对原收据 | — | unit_fake |
| A6 | 完成阶段提交结果未知 → 既有只读核对（复用完成应用） | — | 既有完成应用测试覆盖 |

## 5. 待主代理裁决后再写（暂缓）

HTTP 路由、公开结果（`claimedObjectKinds`）、端到端：见交付报告中的待裁决问题。

## 6. 未覆盖

CloudBase 网关、云端 MySQL；租约时长的运营调整（硬规则不可配置）。
