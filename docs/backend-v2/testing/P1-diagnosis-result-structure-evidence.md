# P1 本次诊断公开结果结构合同证据

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- Expected 来源：[Outcome 字段设计与结果呈现边界](../contracts/diagnosis-outcome-fields.md)、[诊断知识来源合同](../contracts/diagnosis-knowledge-sources.md)；用户提供的一隅截图只作为信息分区样本，不作为园艺处置真相源。
- 受测对象：[公开结果 Schema](../contracts/schemas/diagnosis-result.v1.schema.json)；执行测试：[TypeScript 合同测试](../../../cloudfunctions-v2/test/contracts/diagnosis-result-contract.spec.ts)。层次为 `unit_real_data`：读取真实合同文件，不替换 Schema；不调用模型、CMS、MySQL 或 HTTP。

| 场景 | 独立 Expected | 结果 |
|---|---|---|
| Happy | 结构能表达结论、证据及限制、其他可能、分层行动、逐项公开来源和复查 | 通过 |
| Edge U1 | 确定性/紧急度/隔离理由不得缺省；证据数组含 `null`、来源为空、行动缺少适用范围/风险/停止条件/逐项来源均拒绝 | 通过 |
| Edge U3 | 内部主键、模型原文、未经合同定义的药剂字段及非 HTTPS 来源链接不得进入公开结构 | 通过 |
| Reverse | 模型自评百分比不得直接公开；行动建议不得声明免用户确认 | 通过 |
| U2、U4–U7 | 本合同只校验单份不可变 JSON 的结构，不负责并发、重复提交、状态恢复、持久化或跨次序写入 | 不适用；须由诊断应用与 HTTP/MySQL 测试覆盖 |

可审计 Test First：初版代表性测试先落盘，缺少 Schema 时为 RED（9 例失败）；加入结构 Schema 后 12 例 GREEN。随后先增加行动适用范围、风险、停止条件及逐项来源的测试，原 Schema 下有效样本按预期 RED，扩展 Schema 后定向 17 例 GREEN。初版反写探针将根对象的 `additionalProperties` 临时放宽为 `true`，`拒绝模型自评百分比` 测试按预期 RED；已恢复为 `false`。本次 `cloudfunctions-v2` 全套测试 62 文件、322 例通过，TypeScript 类型检查与改动文件 oxlint 均通过。

证明范围仅是**结构与脱敏合同**。此证据不证明图片诊断准确率、来源许可、知识发布有效性、Action 禁忌门、CMS 审核、真实 HTTP 响应或用户植物归属。逐项公开来源字段存在，也不证明来源内容真实或适用。Schema/字段仍标为 `P1_PENDING`；运行时不得仅凭结构校验展示未经审核的园艺处置。
