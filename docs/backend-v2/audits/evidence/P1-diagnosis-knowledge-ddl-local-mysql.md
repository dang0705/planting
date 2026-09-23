# P1 诊断知识 DDL：本地真实 MySQL 验证

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 被测制品：[`009_diagnosis_knowledge.sql`](../../schema/009_diagnosis_knowledge.sql) 与 [空库执行顺序](../../schema/manifest.json)；只对本地一次性测试库写入，未写 CloudBase。
- 环境：Docker `mysql:8.4`，服务端读回版本 `8.4.11`；2026-09-24 本地执行。测试容器使用临时数据目录。
- 测试层次：`unit_real_data` / L3。真实边界是 MySQL DDL、外键、唯一键和检查约束；CMS、云函数 HTTP、CloudBase 实例均未经过。

先在旧版诊断迁移上运行 `npm run test:mysql -- --run test/e2e/diagnosis-knowledge.mysql.spec.ts`：4 条中 3 条按独立 Expected 失败，数据库错误放行了跨候选审核、驳回审核和跨知识包发布。随后增加候选范围与审核决定的组合外键、`approved` 检查约束，再运行同一测试：4 条全部通过。该测试还验证审核摘要不匹配被拒绝，以及同一知识包不能创建第二个活动指针。

`npm run test -- --run test/contracts/diagnosis-knowledge-ddl.spec.ts`：静态结构测试 1 条通过，只证明迁移登记和必要表/列存在。`npm run typecheck` 通过；两份新增/调整的诊断测试单文件 oxlint 为 0 警告、0 错误。

另在隔离空库中按 manifest 顺序执行全部 9 个迁移文件，成功读回总计 102 张表；诊断专属 12 张表的列注释空值计数为 0，指向其他表的外键列读回 35 项。此空库结果不证明运行时发布事务、历史诊断结果回放、CMS 权限、CloudBase MySQL 网络与部署。

下一验证门：候选/发布包 JSON Schema 与逐字段字典、受控 CMS 审核凭据、`diagnosis` 发布/回滚应用事务、同键幂等/并发切换/提交结果未知对账及真实 CloudBase 读回。
