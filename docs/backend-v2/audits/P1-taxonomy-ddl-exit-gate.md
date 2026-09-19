# P1 植物分类与身份准入硬门：本地 DDL 静态出口

> ticket：`z8v0kmr9gm`  
> 结论：**`LOCAL_STATIC_CONTRACT_PASS / ADMISSION_STOP / MYSQL_NOT_RUN`**

## 1. 结论边界

`plant-taxonomy/v1` 的本地 DDL 静态合同已经闭环：权威键、同键证据、accepted/synonym、受控等级、`spp.`、父链摘要、分类审核、不可变 release item 和单一 active 指针均有可审计的 SQL 结构与专项 Vitest。

这不是分类学正向裁决，也不是数据库或 API 验收。当前逐条审计结论保持不变：`ADMIT=0`、`QUARANTINE=200`、`REJECTED=0`，没有 taxonomy active release，旧 CSV 只能作为精确绑定的遗留参考。

## 2. Expected 与 TDD 证据

| 阶段 | 证据 | 结果 |
|---|---|---|
| Expected | `plant-taxonomy/v1` 的 P1 准入谓词、`P1-taxonomy-admission-audit.md` 的全量否决结论、P1 ticket 验收 | 独立于 DDL 实现固定 |
| RED | `evidence/P1-taxonomy-ddl-red.md` | `p1-taxonomy-ddl.spec.ts`：6 条中 3 条失败 |
| GREEN | `cd cloudfunctions-v2 && npm test -- --run test/p1-taxonomy-ddl.spec.ts` | 6/6 通过 |
| 全量 Vitest | `cd cloudfunctions-v2 && npm test` | `BLOCKED_SHARED`：34/36 通过；guest-session-claim 注册表 SHA 与 `007_configuration.sql` 的 capability snapshot 期望冲突不在本票范围 |
| 全量类型检查 | `cd cloudfunctions-v2 && npm run typecheck` | `BLOCKED_SHARED`：`test/p1-guest-session-claim.red.spec.ts` 有既有的 `string | undefined` 赋值错误，不在本票范围 |

## 3. 静态合同覆盖

| 对象 / 用例 | 层与形态 | 覆盖 | 未覆盖 |
|---|---|---|---|
| `002_plant_knowledge.sql` / 权威键、原始证据、accepted/synonym、父链摘要 | `unit_real_data` / Happy | 同一 authority key 的唯一性、同键证据复合外键、名称类型、父链摘要字段 | 原始制品真实内容和递归父链读回 |
| `002_plant_knowledge.sql` / `spp.`、物种组、cultivar、hybrid、release | `unit_real_data` / Edge | 受控 rank、`spp.` 禁止具体 species、release item 只能快照 `ACTIVE` | 真实 MySQL 对非法插入的拒绝 |
| DDL + schema manifest + taxonomy admission manifest / 遗留隔离与空库静态合同 | `unit_real_data` / Edge | `ADMIT=0/QUARANTINE=200`、DDL SHA、无 DML | 空库执行、持久化读回、发布事务与运行时读取隔离 |

L3 I1 已覆盖的是本地真实制品之间的静态协作；I2–I5 不适用，因为本票未执行外部响应解析、鉴权或数据库写入。没有以 mock、HTTP 200 或代表样本替代 200 条逐条准入。

## 4. 真实性与排雷

| 对象 / 用例 | Break | Expected | Real path | Mutation |
|---|---|---|---|---|
| 权威证据合同 | 删除来源 `CHECK`、同键复合外键、名称类型或父链摘要字段 | `plant-taxonomy/v1` P1 准入谓词 | 测试读取真实 `002_plant_knowledge.sql`；无替身 | 删除任一约束会使“权威键、原始证据、accepted/synonym 和完整父链摘要不能靠名称猜测”失败 |
| 等级与 release 合同 | 删除 `species_group`、`spp.` 限制或 release `ACTIVE` 约束 | P1 ticket 的 rank/隔离/release 验收 | 测试读取真实 DDL；无替身 | 删除任一约束会使“spp、物种组、栽培品种与杂交均走受控等级和隔离准入路径”失败 |
| 隔离与 manifest 合同 | 修改 ADMIT/QUARANTINE 数量、DDL SHA 或加入 DML | P1 否决性审计与空库静态合同 | 测试读取真实 DDL、schema manifest 和 admission manifest；无替身 | 修改任一值会使“200 条遗留候选保持隔离，且空库 DDL 仅作为可重放静态合同”失败 |

| 产品缺陷（A） | 触发场景 | 处理 | 回归证据 |
|---|---|---|---|
| 权威证据、rank/release 和 manifest 静态门缺失 | 草案 DDL 可让不完整分类结构进入后续 release 组装 | 已补齐本地 DDL/manifest 合同 | RED 3 失败 → GREEN 6 通过 |

本次发现 A 为 3 条，本地合同制品修复 N 为 3 条。未发现 B/C。**本轮产品改动：仅修 A 或授权改产品（会红的用例名：`p1-taxonomy-ddl.spec.ts` 的 3 条新增用例）。**

## 5. 未验收与继续条件

- 本票没有真实 MySQL 可用性、空库执行、非法写入拒绝、事务/回滚、并发、持久化读回或 CloudBase MySQL 兼容性证据；这些全部为 `NOT_RUN`，不能外推。
- catalog、identify、CMS、care、diagnosis 与 Agent 对隔离记录的真实 API 拒绝读取尚未验证。
- 只有新的逐条 authority manifest 对每个候选补齐原始制品、版本、rank、accepted/synonym、完整父链、冲突/别名裁决和人工审核，且真实 MySQL/release/API 验收通过，才可把任何记录改为 `ADMIT`。
