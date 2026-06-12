# code-logics 索引（以 code-base 为最高事实源）

更新时间：2026-06-07

本目录记录当前仓库真实运行逻辑。若本文档与代码冲突，以 `code-base` 为唯一准则；文档必须被修正，而不是让实现迁就既有文档。

## 当前诊断主链结论

- 当前诊断仍以 **route 模式** 汇总证据和决定输出；当前问诊入口按 **mode question package** 收敛，固定题包由 `getQuestionPackageByMode(mode)` 作为显式入口。
- 既有的动态提问控制模型、动态下一题生成、legacy extension residue 不再作为当前事实使用。
- `yellow_leaf` 映射到固定 4 题前置题包：`answerSubmitMode = package`、`questionDisplayMode = package`、`fixedQuestionPackage = true`，并带有 `outcomePolicy`。
- `wilting_droop` 映射到固定 5 题前置题包，source mode 为 `manual_wilting_droop_route_package`：Q0 是 `CareBehaviorTimeline` 水分行为时间线，Q1-Q4 分别覆盖发蔫形态、节律/环境、近期应激和高危异常；黄叶语义不因此改变。
- `wilting_droop` 整包完成后按答案产出“建议行动清单”：可包含多个 `visibleOutcomes`、冲突动作解释、高危提醒和观察周期；不引入概率排序或“最可能原因”作为公开出口。
- `/diagnosis/question/start` 的 `yellowing_mode` 固定走 `static-question-package-start.js` 的模块级静态题包启动路径，返回 active `questions` 与 `questionPackage`；该路径只保存 package snapshot，不加载 prior repository、manual fast path 或 `diagnosis-engine`。
- package 响应以 `questions` 作为前端题目数组；非 package 当前路径才保留单题 session question row anchor 语义。
- 有效 `yellow_leaf` package 的回答归属以 `runtimeSnapshot.questionPackageSnapshot.packageQuestions` 为准；`questionPackageSnapshot` 是运行时当前/校验结构，不是题包 sibling questions 的拒绝依据。
- package answer submit 是终止当前问诊轮次的提交形态；停止与输出资格由 stop state、output eligibility、无 pending package question、正式 outcome type、正式 stop decision 共同决定，不是“答满若干题就输出”。

## 阅读顺序

1. `00_文档总索引_与阅读顺序.md`：总原则、阅读路径、过时概念修正表。
2. `02_诊断HTTP接口_请求响应与路由.md`：HTTP 入口与 handler 差异。
3. `03_诊断运行时主链路_逐步执行逻辑.md`：route-only 主链与决策节点。
4. `05_问诊系统_问题生成_过滤_停止策略.md`：题包、package state 当前层、停止、输出资格的真实代码逻辑。
5. `06_问题排序_证据计分_输出守卫.md`：route condition、候选状态、输出守卫。
6. `07_结果格式化_公开响应_前端接入契约.md`：公开响应与前端题包契约。
7. `10_实施规则映射_开发约束_审计清单.md`：开发/审计检查项。

## 与 new-rules 的关系

`new-rules/planting_ai_diagnosis_all_in_one.md` 已从“大而全历史规则集”收缩为“当前代码实际运行涉及的规则摘要”。若需要找实现事实，优先读本目录；若需要 AI 执行时的最小规则提示，再读 `new-rules`。

## 维护规则

- 新增或变更问诊、停止、输出资格逻辑时，必须同时更新 `03`、`05`、`06`、`07`、`10` 与 `new-rules/planting_ai_diagnosis_all_in_one.md`。
- `ai_and_memories` 只允许引用本目录与 `new-rules` 的最新结构、概念和行号。
- 文档中出现“既有追问模式”“动态多轮追问”“题包按题请求”“既有数组字段是 package 主响应字段”“答题数足够即可输出”“固定 package 限制替代 route 收敛”等说法，均视为需要复核的高风险陈述。
