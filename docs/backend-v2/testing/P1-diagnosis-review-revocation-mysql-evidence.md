# P1 诊断知识审核撤销的本地 MySQL 证据

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 独立 Expected 来源：[CMS 人工审核交换合同](../contracts/diagnosis-cms-review-exchange.md)：撤销针对既有批准，保留原审核，独立幂等引用、理由和管理员审计；[诊断知识持久化合同](../contracts/diagnosis-knowledge-persistence.md)：撤销后不得凭该批准新建发布。
- 实际路径：[TypeScript 真实 MySQL 测试](../../../cloudfunctions-v2/test/e2e/diagnosis-knowledge.mysql.spec.ts)在隔离 MySQL 8.4 空库顺序执行 009、[010 迁移](../schema/010_diagnosis_review_revocations.sql)，直接插入与读回审核及撤销表。未替换 MySQL；未连接 CMS、CloudBase 或 HTTP。

| L3 风险 | 本地可核验结果 | 状态 |
|---|---|---|
| I1 Happy | 已批准审核可产生独立撤销，原批准的 `decision` 仍为 `approved`，撤销理由可读回 | 通过 |
| I2 缺字段/空值 | 仅空白的撤销理由被 CHECK 拒绝，表仍为空 | 通过 |
| I3 错误语义 | 驳回审核不可作为撤销目标；同一批准不能再次撤销；同一撤销引用不能用于另一个有效批准 | 通过 |
| I4 鉴权 | 本测试直接以隔离库管理员执行 SQL，不验证服务签名或 CMS 管理员主体 | 未覆盖，须由受控命令和真实 CMS 权限验收 |
| I5 写中断 | 各条约束失败的单语句 INSERT 不留半条撤销记录；跨表发布事务的提交中断尚未实现 | 部分覆盖，完整事务待测 |

Test First：静态 DDL 测试先因 manifest 缺少 010 迁移 RED，真实 MySQL 套件先因迁移文件不存在 RED；加入迁移后真实 MySQL 5 项 GREEN。总 DDL 测试又发现最初 010 使用 `ALTER TABLE`，违反空库只建表合同并 RED；将复合键预置于 009，010 改为只建新表。执行反写曾暂时移除 `uq_diag_revocation_target`，真实 MySQL 的重复目标用例按预期 RED；完整恢复唯一键后同一套件再次 GREEN。当前 010 文件 SHA-256 为 `645d3766668af04ce68b64ccb726a8400d3c65ccb3bf18bcde9514c110f64c77`，与 manifest 登记值一致。

最终回归：`npm run typecheck` 通过；`npm test` 为 64 文件、337 项通过；`npm run test:mysql` 为 9 文件、25 项通过，其中诊断知识隔离库 5 项通过。新增的[全量 manifest 真实 MySQL 测试](../../../cloudfunctions-v2/test/e2e/schema-manifest.mysql.spec.ts)在一座新空库中按登记顺序执行全部 10 个文件，成功读回 103 张表、撤销表及诊断字段中文注释。schema、data、contract 三份清单的逐文件 SHA-256 校验均通过。以上仍只是本地 MySQL 8.4，不代表 CloudBase MySQL 的真实权限、SDK 或部署环境。

全量空库测试的 L3 覆盖边界：I1 为全部迁移在同一库成功执行和表读回；I2 为文件缺失、哈希不符或诊断字段缺中文注释时失败；I3 为 manifest 顺序错误或撤销表缺失时失败；I4 不适用，因为测试以隔离库管理员直接建表，不涉及应用鉴权；I5 未覆盖中途失败后的清理与重跑，需由独立迁移执行器和部署回退验收。代表性心智突变是交换 009/010 顺序或删除 010 建表，前者会使建表外键失败，后者会使撤销表读回失败；本测试不能证明应用层发布事务。

Break：撤销驳回、重复撤销或以另一撤销引用覆盖已有事实。Real path：MySQL 8.4 实际约束而非 mock/字符串存在性。Mutation：移除目标唯一键，重复撤销立即被测试抓住。

本证据**不证明**审核记录或撤销记录的应用层只追加权限、同引用同参幂等读回、撤销与发布事务并发串行化、撤销后拒绝新发布、已在线版本的停用策略，亦不证明 CloudBase MySQL 的真实权限与限制；这些必须在后续层级分别验收。
