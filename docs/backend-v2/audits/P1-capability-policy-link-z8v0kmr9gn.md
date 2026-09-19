# P1 能力快照与不可变策略发布关联闭环

- 关联 ClickUp：`z8v0kmr9gn`（业务策略与统一 Provider 配置架构）；后续消费方：`z8v0kmr970`（统一身份 Principal）。
- 结论：`LOCAL_MYSQL_EMPTY_DATABASE_PASS / CLOUDBASE_MYSQL_NOT_RUN / RUNTIME_NOT_IMPLEMENTED`。
- 变更边界：仅调整 `005_subscription.sql`、`007_configuration.sql`、schema 顺序/说明、数据字典、总 DDL 的 `unit_real_data` 静态断言以及本审计与 RED 证据；未修改配置目录、公共合同、公共类型/AJV、API、前端、tracker 或 ClickUp。

## Expected 与设计裁决

`principal-capability/v1` 要求能力快照中的策略版本可以回放；配置发布架构要求策略发布持有不可变发布引用与规范化内容 SHA-256。因此，快照不能只保存无法验证的 `policy_version` 字符串，也不能复制 `policy_json` 形成第二份策略事实源。

裁决如下：

1. `capability_snapshots` 保存能力策略发布的内部键、领域代码、策略代码、发布引用、发布版本和内容 SHA-256；发布版本映射内部 `CapabilitySnapshot.policyVersion`。
2. 它们以复合外键锁定 `business_policy_releases` 的同一行；快照只允许引用 `subscription/capability_catalog`，并以 CHECK 约束失败关闭其他策略类别。
3. `business_policy_releases` 新增复合唯一身份键，确保外键同时验证内部键、类型、发布引用、版本和内容 SHA-256，而不是只验证可变/可伪造的单字段。
4. manifest 顺序调整为 `001 → 002 → 003 → 004 → 007 → 005 → 006`：先创建策略发布表，再创建引用它的快照表，随后再创建依赖 subscription 的可靠事件表。没有 `ALTER`、启动时 DDL、万能 KV 或策略内容复制。

本裁决仅建立发布关联结构；不会把仍处 `pending` 的完整付费能力目录伪造成已发布策略或开放对应能力。

## TDD 证据与覆盖范围

| 项目 | 记录 |
|---|---|
| 测试层级 | `unit_real_data`：`cloudfunctions-v2/test/p1-total-ddl.spec.ts` 读取真实 DDL 与 manifest，不替身数据库。 |
| RED | [P1-capability-policy-link-red.md](evidence/P1-capability-policy-link-red.md)：测试先失败于旧快照仍含单独 `policy_version`。 |
| 正向 Expected | 快照具有六个发布回放字段；发布表具有复合唯一身份键；快照具有复合外键与固定策略类别 CHECK；配置 DDL 排在订阅 DDL 前。 |
| 负向 Expected | 删除发布引用、内容 SHA、复合外键或把 manifest 恢复为 `005 → 007`，静态断言必须失败；真实 MySQL 不允许该外键指向不存在或不一致的发布元组。 |
| 实际路径 | `manifest.json → 007_configuration.sql.business_policy_releases → 005_subscription.sql.capability_snapshots`。 |
| 未覆盖 | 策略 JSON 的 TypeScript/AJV 校验、策略发布/激活权限、运行时生成能力快照、HTTP 脱敏、CloudBase MySQL 权限与运行时事务。 |

### 执行反写

临时将 `fk_capability_snapshot_policy_release` 改为无关联的 CHECK，并同步该临时 DDL 的 manifest SHA，运行
`npm test -- --run test/p1-total-ddl.spec.ts` 后如预期 RED：`能力快照必须以发布键、引用、版本和内容 SHA-256 关联不可变策略发布`。
随后完整还原 `005_subscription.sql` 的外键和仅该文件的 manifest SHA，定向 Vitest 再次 GREEN。该探针没有进入交付 DDL。

## 本地真实 MySQL 空库验证

- 环境：本机 MySQL `8.4`，新建 `mktemp` 隔离数据目录、Unix socket 与 `--skip-networking`；未连接、读取或修改 CloudBase。
- 过程：按当前 manifest 顺序执行全部 DDL 文件到空数据库 `p1_empty`，然后从 `INFORMATION_SCHEMA` 读取表和外键。
- 结果：建成 `86` 张表；`fk_capability_snapshot_policy_release` 为 `1` 条 referential constraint，目标表读回为 `business_policy_releases`。
- 负向读回：先插入一条 `subscription/capability_catalog` 发布及其完全匹配的游客快照；再以相同发布内部键、引用和版本但不同内容 SHA-256 写第二条快照。前者成功，后者被 MySQL 外键拒绝，表中最终只有 `1` 条快照。
- 回退：该验证实例已正常停止，隔离目录只保留为本地审计材料；仓库 DDL 是空库基线，已有库不得原地 `ALTER`，需要独立迁移与回退批准。

## 验收边界

这证明了本地 MySQL 8.4 的空库语法、顺序和该外键可实际创建；不证明 CloudBase MySQL 兼容、数据库权限、真实策略发布或请求级快照运行时。CloudBase 写入、生产 DDL、策略激活和任何付费能力开放均未获本次工作授权。
