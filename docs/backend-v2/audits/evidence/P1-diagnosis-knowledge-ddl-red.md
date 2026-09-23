# P1 诊断知识专用 DDL：先测后建表的 RED 证据

- 任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 独立 Expected：Master Plan P1 诊断知识治理门、[知识来源合同](../../contracts/diagnosis-knowledge-sources.md)及[持久化与发布逻辑合同](../../contracts/diagnosis-knowledge-persistence.md)要求来源、主张、候选、审核准确摘要、不可变发布包、活动指针和审计由 `diagnosis` 专属结构承载；不能由一次诊断结果 JSON 或通用内容槽位代替。
- 探针：`cloudfunctions-v2/test/contracts/diagnosis-knowledge-ddl.red.spec.ts`，TypeScript + Vitest。测试层次为 `unit_real_data`：读真实 SQL manifest 与 SQL 文件；**不连接** MySQL/CMS，也不验证事务实际原子性。
- 执行：`npm run test:red -- --run test/contracts/diagnosis-knowledge-ddl.red.spec.ts`，2026-09-24 本地运行，1 条失败。失败点：`独立的 diagnosis 知识迁移尚未登记`。这是预期 RED，不能报成测试通过或 P1 诊断知识完成。
- 同轮静态门：`npm run typecheck` 通过；单文件 oxlint 为 0 警告、0 错误。执行时宿主 `node` 为 v24.21.0；Node.js 22 运行与真实 MySQL 需另验。

| 风险维 | 当前证据 | 还需完成 |
|---|---|---|
| 结构缺失 / 错误复用 | RED 探针检测独立迁移和 12 个必要逻辑表及关键摘要/指针列 | 补独立有序 DDL 后转 GREEN，逐表验证外键、唯一键、中文注释和空库回放 |
| `I1` 真正发布协作链 | 未覆盖 | CMS 审核凭据 → MySQL release/active → 诊断读取的真实集成测试 |
| `I2` 缺字段/空集合 | 未覆盖 | 候选缺来源、空映射和错类型引用的拒绝测试 |
| `I3` 错误语义 | 未覆盖 | 摘要不符、来源撤回、Schema 不兼容的明确失败 |
| `I4` 鉴权失败 | 未覆盖 | 非授权审核、发布与读取不得写入或泄露 |
| `I5` 写中断无半成品 | 未覆盖 | 本地真实 MySQL 并发切换、提交结果未知对账和失败回滚 |

真实性记录：Break 为缺少专用迁移却把现有结果 JSON/通用发布当作诊断知识库；Expected 为上述独立合同；Real path 为 `schema/manifest.json` → 所指向的真实 DDL 文件，未替换或模拟任何边界；代表性 Mutation 为删去登记的专用迁移或删去审核摘要列，此测试应变红。该探针为结构 Happy 的先行 RED，不是执行反写档；后续运行实现测试必须补真实 MySQL 与错误/回滚路径。
