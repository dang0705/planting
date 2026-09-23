# P1 合同、身份准确性、Schema 与 Foundation

主代理写公共合同、Expected、总 DDL、OpenAPI 和公共测试；领域 agent 不得自行修改这些文件。

必须冻结 Principal、CapabilitySnapshot、User Plant、Guest Claim、Taxonomy、Identity、CMS release、Care Capability Result、Care Points、Level、Redemption、AI Quota、Reward Event、Outbox、Inbox、状态机和表所有权。

业务关键变量与 Provider 配置是 P1 前置硬门：必须建立覆盖全部业务域的逐项目录，区分已冻结、待冻结和不可配置硬规则；每项具备 owner、来源、消费方、变更/回退、阻断范围、Phase、ClickUp ticket 与 Expected。随后才能设计类型化策略 Schema、Provider release、active 指针、请求级快照与相关 DDL。禁止万能 KV、密钥入库和目录外隐式默认值。

新版业务架构新增[已登录用户临时植物案例合同补充门](../contracts/authenticated-ephemeral-plant-case.md)：先冻结与游客路径不同的主体证明、临时案例归属、DTO、状态机、DDL、事务与 RED Expected，再允许 P3 实现这条首版核心路径。此前已验证的其他 P1 合同继续有效；此增量门未通过时不能把“已登录临时使用→绑定用户植物”列为已验收。

诊断另设[Outcome/Action 知识来源合同增量门](../contracts/diagnosis-knowledge-sources.md)：冻结“症状入口 ≠ 园艺原因”双轴、来源与适用性字段、结论/行动/映射 DTO、CMS 发布/回滚边界及独立 Expected。未完成只阻断其所依赖的诊断知识发布与 P4 问诊产品验收，不推翻其他已通过的 P1 合同；旧黄叶/萎蔫题包和虫害候选先审计，不直接作为 v2 发布事实。

退出条件：植物身份准确性审计通过，业务关键变量 100% 分类且 P1 实现依赖项全部冻结，空库建表通过，代表性 RED 已保存，所有合同和架构制品有 SHA-256，`AGENTS.md` 已对齐 TypeScript 与配置治理。

实施入口：

- [P1 合同注册表](../contracts/contract-registry.json)
- [已登录临时植物独立 Expected 草案](../testing/P1-authenticated-ephemeral-expected.md)
- [诊断 Outcome/Action 知识来源合同](../contracts/diagnosis-knowledge-sources.md)
- [诊断知识持久化与发布逻辑合同](../contracts/diagnosis-knowledge-persistence.md)
- [诊断知识 CMS 人工审核交换合同](../contracts/diagnosis-cms-review-exchange.md)
- [诊断旧资产候选盘点](../audits/P1-diagnosis-legacy-candidates-2026-09-24.md)
- [黄叶水分方向来源主张候选](../audits/P1-yellow-leaf-water-source-claims-2026-09-24.md)
- [诊断知识独立 Expected 草案](../testing/P1-diagnosis-knowledge-expected.md)
- [诊断知识 DDL 先行 RED 证据](../audits/evidence/P1-diagnosis-knowledge-ddl-red.md)
- [诊断知识 DDL 本地真实 MySQL 读回](../audits/evidence/P1-diagnosis-knowledge-ddl-local-mysql.md)
- [总数据字典](../data/v2-data-dictionary.md)
- [总 DDL](../schema/README.md)
- [具体路由与 OpenAPI 骨架](../api/README.md)
- [HTTP API 骨架退出闸门](../audits/P1-http-api-openapi-exit-gate.md)
- [植物分类人工批准与种子清单工作流](../implementation/taxonomy-human-approval-workflow.md)
- [业务策略与 Provider 配置架构](../architecture/configuration-and-providers.md)
- [业务关键变量目录](../architecture/configuration-variable-catalog.md)
- [配置架构退出闸门](../audits/P1-configuration-architecture-exit-gate.md)
- [P1 跨票据总退出闸门](../audits/P1-cross-ticket-exit-gate.md)
