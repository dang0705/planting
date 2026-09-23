# 旧代码、数据和内容处置

每一项旧函数、路由、表、CMS 模型、Storage 对象、测试和 OpenViking 条目必须记录：真实调用方、业务用途、v2 owner、处置决定、新 API/表、Expected 来源、验证证据和删除前置条件。

内容转化决定与资源清理决定分开：

```text
REUSE_AS_IS / TRANSFORM / MERGE / SPLIT / REBUILD / REJECT / QUARANTINE
KEEP / ARCHIVE / DELETE
```

测试用户、用户植物、诊断/视觉/养护流水、订单和缓存可以按精确清单清理；植物主数据、身份映射、黄叶/萎蔫题包、症状、规则、提示词、养护知识和 CMS 字段映射必须先审计。

诊断知识的原子复用边界：旧黄叶/萎蔫题包的观察维度、八类虫害候选、`outcomeKey → actionProfileKey` 链、行动阶段/步骤/规避项及来源目录，只作为来源审计候选；旧 `audited/active` 与结果流水均不等于 v2 内容发布许可。尤其旧来源多挂在 Action 上，未逐条证明 Outcome 及映射的来源主张与适用条件；弱线索也可能映射过细的病因。应按[诊断知识来源合同](../contracts/diagnosis-knowledge-sources.md)转换或重建，并经人工审核和新 release 验收，不能整表迁移。
