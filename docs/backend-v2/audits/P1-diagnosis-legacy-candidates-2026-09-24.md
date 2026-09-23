# P1 诊断旧资产候选盘点

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 范围：只读本地旧代码、SQL 与规格；未读取 CloudBase/CMS 当前内容，也未联网核验园艺来源。
- 结论：下列数量只说明旧资产形状，**不是** v2 知识准入数、已审核数或可发布数。

| 旧资产 | 本地可核对的事实 | v2 处置边界 |
|---|---|---|
| [黄叶题包](../../../cloudfunctions/diagnose-http/app/question-package-response.js) | 固定 4 个题目主题；其中浇水、光照、施肥/生长的正文从旧题库 Repository 读取，空气环境由代码生成 | 保留观察维度作转换候选；不能以本地常量证明 CMS 当前题目与发布状态 |
| [萎蔫题包](../../../cloudfunctions/diagnose-http/app/wilting-droop-question-package.js) | 固定 6 题，部分题目共用旧题库 | 按实际证据与园艺原因重新分类；规格提到的 18 个可见行动结果尚不能作为 18 条已核验知识 |
| [动态虫害题包](../../../cloudfunctions/diagnose-http/app/pest-question-package.js) | 8 类候选虫害模式、14 个动态问题模板；一次问诊只抽取相关子集 | 题目是证据采集，不等于确认虫种或病原 |
| [黄叶旧运行快照](../../../cloudfunctions/diagnose-http/app/yellow-leaf-package-runtime-data.js) | 9 个 Outcome、12 条回答效果、7 个 Action Profile、43 条生成式行动；来源主要挂在 Profile 层 | 逐条拆为来源主张、Outcome、Action 和受审映射，不能继承旧 `active` 语义 |
| [旧路由种子](../../../scripts/sql/seed-outcome-route-mvp.sql) | 11 个 `diagnosis_outcomes` 与 10 个 `outcome_action_profiles`；脚本声明仅用于本地/测试环境 | 不能整表迁移或把 `audited/active` 当作 v2 发布许可 |
| [旧行动 SQL](../../../scripts/sql/mvp-diagnosis-action-guidance-20260913.sql) | 102 个结构化 Action ID，写入 14 个 Profile，引用 10 个来源 ID | 仅作候选文本和来源线索；逐项核对适用植物、风险、禁忌与来源主张后再决定保留/转换/重建 |

[旧行动规格](../../../specs/mvp-diagnosis-action-guidance/requirements.md)列出的 10 个机构来源 ID 覆盖 UC IPM、CSU、UMN、UMD、RHS 和 Penn State Extension。当前本地引用不足以证明每条主张的 URL、页面定位、核验日期、适用范围、使用许可和审核人；因此“10 个来源”只是**待核验候选**。旧 SQL 对 Action 的来源挂载，不能自动证明 Outcome 或 Outcome→Action 映射本身可靠。

## 下一最小切片

先处理黄叶入口中的盆土偏湿压力、盆土偏干压力与证据不足待判定三类候选：逐项核对原始题目和回答、建立可定位的来源主张，写出同症状多原因及证据不足的独立 Expected，再冻结最少的安全检查 Action 与禁忌映射。未完成来源、安全和人工审核前，不建 active release、不复制旧 Action 正文为正式 CMS 知识。本盘点不替代 P1 字段/DTO/DDL 合同或后续 MySQL、CMS、真实 API 验收。
