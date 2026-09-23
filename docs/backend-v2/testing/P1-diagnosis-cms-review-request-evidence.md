# P1 诊断知识 CMS 审核请求结构证据

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 独立 Expected 来源：[诊断知识 CMS 人工审核交换合同](../contracts/diagnosis-cms-review-exchange.md)和 [009 诊断知识 DDL](../schema/009_diagnosis_knowledge.sql) 的批准/驳回约束。撤销是针对已有批准的独立命令，不能伪装成第三种审核决定。
- 执行文件：[TypeScript 合同测试](../../../cloudfunctions-v2/test/contracts/diagnosis-cms-review-contract.spec.ts)。测试层次为 `unit_real_data`；AJV 编译仓库内真实 [审核决定 Schema](../contracts/schemas/diagnosis-cms-review-decision.v1.schema.json)和[撤销 Schema](../contracts/schemas/diagnosis-cms-review-revocation.v1.schema.json)，不访问 CMS、身份服务、MySQL 或 HTTP。

| 场景 | 独立 Expected | 结果 |
|---|---|---|
| Happy | 审核绑定不可变候选及完整摘要；撤销绑定既有审核并使用独立幂等引用 | 通过 |
| Edge U1 | 候选摘要、目标审核、理由或撤销引用缺失时拒绝 | 通过 |
| Edge U2/U3 | 非 SHA-256 摘要、未知协议版本、自报审核员或审核时间、额外候选字段须拒绝 | 通过 |
| Reverse | `revoked` 不得作为审核决定；撤销请求不能改写目标候选或自报审核主体 | 通过 |
| U4–U7 | JSON Schema 不持有状态，也不执行幂等对账、持久化、失败回滚、并发控制或用户态覆盖 | 不适用；必须由后续服务和 MySQL 测试覆盖 |

Test First：先落盘审核与撤销的合同测试，两个 Schema 尚不存在时 7 条测试按预期 RED；补入 Schema 后目标测试 GREEN。执行反写临时将 `revoked` 加入审核决定枚举，`撤销不是第三种审核决定` 按预期 RED；完整恢复该 Schema 后目标测试再次 GREEN。Break：把撤销误当审核决定、允许请求体伪造管理员身份；Real path：AJV 编译并校验真实合同文件；Mutation：上述审核决定枚举扩容。

最终验证：目标文件 9 条测试通过；后端 Vitest 全套 64 文件、336 条通过；TypeScript 类型检查、目标文件 oxlint、后端 v2 入口校验及合同注册表 21 项哈希读回通过。

这仅证明**请求结构**，不是 CMS 管理员真实性、服务签名、候选摘要重算、幂等对账、撤销记录、撤销与发布竞争、在线版本停用或 CloudBase 真实环境的验收。后续必须用独立服务测试、真实 MySQL 测试及 CloudBase 权限读回逐层补足。
