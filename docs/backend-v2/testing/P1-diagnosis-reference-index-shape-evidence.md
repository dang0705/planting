# P1 诊断知识关系索引结构合同证据

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- Expected 来源：[诊断知识持久化与发布合同](../contracts/diagnosis-knowledge-persistence.md)、[Outcome/Action 字段边界](../contracts/diagnosis-outcome-fields.md)与 [009 诊断知识 DDL](../schema/009_diagnosis_knowledge.sql) 的代码长度、枚举及题包引用长度；测试层次为 `unit_real_data`，实际编译仓库交付的 [JSON Schema](../contracts/schemas/diagnosis-knowledge-reference-index.v1.schema.json)。
- 执行文件：[TypeScript 合同测试](../../../cloudfunctions-v2/test/contracts/diagnosis-knowledge-reference-index-contract.spec.ts)。不替换 Schema；不访问 CMS、MySQL、题包目录或网络。

| 场景 | 独立 Expected | 结果 |
|---|---|---|
| Happy | 有明确题包版本、精确主张修订和待判定结论的索引可通过；不强制行动或映射数组非空 | 通过 |
| Edge U1 | 缺题包发布引用、数组含 `null` 或 `undefined` 元素须拒绝 | 通过 |
| Edge U2/U3 | 负数或非整数主张修订、未知风险/关联角色、多余内部字段须拒绝 | 通过 |
| Reverse | 未审核风险级别不得伪装成已审核行动进入关系索引 | 通过 |
| U4–U7 | 本结构合同不持有可变状态、不写库、不调外部服务，无幂等、回滚、并发或用户态覆盖职责 | 不适用 |

Test First：先落盘 5 条测试，Schema 尚不存在时 5 条按预期 RED；加入 Schema 后 5 条 GREEN。执行反写把风险枚举临时加入 `unreviewed`，`拒绝未知风险等级、关联角色和多余内部字段` 按预期 RED；已完整恢复该 Schema，回读 SHA-256 为 `2a87328ad2f8444abe8f9b918208be4428d8c229f61cba4e6c28e49f3dff207b`，再跑 5 条 GREEN。Break：错误地允许未经审核风险级别或空洞数组；Real path：AJV 编译并校验真实合同文件；Mutation：上述临时枚举扩容。

证明范围只是**跨引用校验前的结构输入门**。Schema 不证明来源状态与许可、植物适用性、题包真已发布、候选完整值对象、CMS 审核或发布事务，也不替代跨引用语义校验；这些仍待独立验收。
