# P1 诊断知识单候选引用校验证据

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- Expected 来源：[诊断知识来源合同](../contracts/diagnosis-knowledge-sources.md)、[持久化与发布合同](../contracts/diagnosis-knowledge-persistence.md)、[独立 Expected 草案](P1-diagnosis-knowledge-expected.md)。一隅截图仅提供结果展示分区，不提供园艺事实、候选 JSON 字段或审核凭据。
- 受测对象：[纯关系校验函数](../../../cloudfunctions-v2/src/diagnosis/domain/validate-knowledge-references.ts)；执行测试：[TypeScript 单元测试](../../../cloudfunctions-v2/test/unit/backend/diagnosis/domain/validate-knowledge-references.spec.ts)。层次为 `unit_fake`：人工构造已完成形状校验的单候选关系索引，不调用 CMS、MySQL、题包目录或 HTTP。

| 场景 | 独立 Expected | 结果 |
|---|---|---|
| Happy | 同一候选内原因、结论、行动、映射、题包发布引用和精确来源主张修订全部闭合 | 通过 |
| Edge U1 | 缺失父原因、原因父链成环、未发布症状入口、题包版本不匹配、备选结论缺失均不得进入发布 | 通过 |
| Edge U3 | 映射不能引用不存在的结论或行动；逐项来源不能引用不存在的主张修订或目标 | 通过 |
| Reverse | 高风险行动不能仅靠普通支持主张通过，必须有安全用途主张；每类条目不能只靠整包来源冒充逐项来源；稳定代码不能在同候选重复 | 通过 |
| U2、U4–U7 | 本函数不写库、不发请求、不持有状态，不承担重复命令、事务并发、失败恢复或时间顺序验证 | 不适用；须由发布应用和真实 MySQL 测试覆盖 |

可审计 Test First：先落盘关系校验测试，因实现模块不存在而 RED；实现纯校验后 10 例 GREEN。反写探针临时关闭高风险行动的安全主张检查，`拒绝没有安全主张的高风险行动` 按预期 RED；恢复检查后重新通过。与公开结果合同合跑 27 例通过；`cloudfunctions-v2` 全套 62 文件、322 例通过，TypeScript 类型检查及改动文件 oxlint 通过。

证明范围仅为**已验证形状的单候选关系索引**。来源状态、许可、植物适用性及题包发布状态由输入索引的上游负责，不能因关系函数通过就宣称这些外部事实已验证。候选/发布包的版本化 JSON Schema、CMS 审核凭据、发布事务、CloudBase MySQL 和真实 HTTP 诊断均未由本测试覆盖，仍是 `P1_PENDING`。
