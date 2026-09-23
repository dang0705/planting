# v2 总 DDL 实施入口

- 版本和执行顺序：[manifest.json](manifest.json)
- 只允许在全新空库按 manifest 顺序执行；不得在 HTTP 函数启动时执行。
- 当前 DDL 是合同冻结制品，不代表已经通过真实 CloudBase MySQL 验收。
- `_openid` 仅为 CloudBase 技术兼容字段，固定为空；业务归属只能使用 `user_internal_id`，公开 API 只使用高熵公开引用。
- 所有时间存储为 UTC 毫秒，API 转换为 ISO 8601。

验证顺序：

1. 校验 manifest SHA-256。
2. 在隔离空库执行全部文件。
3. 从 `INFORMATION_SCHEMA` 重新导出表、字段、注释、索引、外键并核对。
4. 执行跨用户归属、认领幂等、额度守恒、outbox/inbox 重放等真实 MySQL 测试。
5. 保存数据库版本、环境标识、执行时间和脱敏证据；未完成不得宣称 P1 空库门通过。

业务策略与 Provider 配置分别使用类型化发布表和 active 指针，不允许万能 KV；`configuration_json` 只能包含已通过对应 Schema 的非密钥值，凭证仅保存 `credential_ref`。当前 manifest 将 `007_configuration.sql` 放在 `005_subscription.sql` 前：`capability_snapshots` 必须以外键锁定 `business_policy_releases` 中的能力目录发布（内部键、发布引用、版本和内容 SHA-256），因此发布表必须先建。该顺序只解决空库依赖，不授权启动时 DDL、`ALTER` 或对既有库原地升级。

`008_foundation.sql` 独立保存共享 HTTP 幂等记录，不复用服务 nonce、业务命令表或各域 outbox。数据库只保存主体作用域和幂等键的不可逆摘要，以及已脱敏公开结果。`http.idempotency.retention_hours=168` 由请求锁定的已发布策略计算为 `expires_at_ms`；DDL 不硬编码保留时长，也不把该时长错用到 outbox/inbox。

诊断 Outcome/Action 知识来源、园艺原因目录与兼容发布包由 `009_diagnosis_knowledge.sql` 独立承载，不复用 `004_care_diagnosis.sql` 的一次结果 JSON 或通用内容发布槽位。该迁移已通过本地 MySQL 8.4 独立空库和全量 manifest 顺序执行；关键审核与发布约束另有真实 MySQL 测试。此结果不证明 CMS 审核交换、发布/回滚事务、CloudBase MySQL 或真实 HTTP 闭环；P1 仍须完成字段字典、版本化 JSON Schema 和剩余合同验收。

`010_diagnosis_review_revocations.sql` 在 009 之后建立独立审核撤销事实，撤销只能指向既有批准，保留原审核决定，并以唯一键禁止同一批准重复撤销。009 从建表起不设置可变的审核撤销时间列，010 也只建新表，满足本目录的**全新空库顺序初始化**约束；两者不得作为已有数据环境的无损原地升级脚本。当前全量 manifest 的 10 个文件已在同一座隔离 MySQL 8.4 空库顺序执行并读回 103 张表，证据见[审核撤销与全量空库验证](../testing/P1-diagnosis-review-revocation-mysql-evidence.md)。真实 MySQL 已验证目标批准、驳回拒绝、重复目标和空理由约束；发布事务仍必须锁定目标并检查撤销表，数据库外键本身不能阻止撤销后新发布。
