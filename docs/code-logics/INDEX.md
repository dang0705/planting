# code-logics 索引（以 code-base 为最高事实源）

更新时间：2026-06-06

本目录记录当前仓库真实运行逻辑。若本文档与代码冲突，以 `code-base` 为唯一准则；文档必须被修正，而不是让实现迁就旧文档。

## 当前诊断主链结论

- 当前问诊主模式是 **route 模式**，其核心事实来源是 `planOutcomeRoutes`、`routeDecision`、`visibleOutcomeKeys`、`nextQuestionKeys`、`stopDecision` 与运行时 `questionQueue`。
- 旧的“ranking / score gap / hypothesis pool 决定追问与停止”的说法不再作为当前事实使用。
- 常规 route 追问每轮最多 1 题；`diagnosis-engine.js` 在 route complete path 中以 `maxQuestionCount: 1` 调用 route planner，并最终将候选追问 `.slice(0, 1)`。
- 黄叶手动入口存在 4 题前置题包：`questionPackage.mode = yellow_leaf`，`answerSubmitMode = package`，`questionDisplayMode = package`。
- 黄叶题包已收敛为包级持久化与归属校验：有效 `yellow_leaf` package 会让包内 4 题按同一当前轮次落库并通过 ownership；legacy `questionQueue` 仍只作为兼容/选择锚点，不能拒绝 package sibling questions。非题包路径仍保持 queue-anchor 单题行为。
- 停止与输出资格由 `stage === final`、`followUpRequired === false`、无 active queue、正式 outcome type、正式 stop decision 共同决定；不是“答满若干题就输出”。

## 阅读顺序

1. `00_文档总索引_与阅读顺序.md`：总原则、阅读路径、过时概念修正表。
2. `02_诊断HTTP接口_请求响应与路由.md`：HTTP 入口与 handler 差异。
3. `03_诊断运行时主链路_逐步执行逻辑.md`：route-only 主链与决策节点。
4. `05_问诊系统_问题生成_过滤_停止策略.md`：追问、停止、输出资格的真实代码逻辑。
5. `06_问题排序_证据计分_输出守卫.md`：route gate、候选状态、输出守卫。
6. `07_结果格式化_公开响应_前端接入契约.md`：公开响应与前端题包契约。
7. `10_实施规则映射_开发约束_审计清单.md`：开发/审计检查项。

## 与 new-rules 的关系

`new-rules/planting_ai_diagnosis_all_in_one.md` 已从“大而全历史规则集”收缩为“当前代码实际运行涉及的规则摘要”。若需要找实现事实，优先读本目录；若需要 AI 执行时的最小规则提示，再读 `new-rules`。

## 维护规则

- 新增或变更问诊、停止、输出资格逻辑时，必须同时更新 `03`、`05`、`06`、`07`、`10` 与 `new-rules/planting_ai_diagnosis_all_in_one.md`。
- `ai_and_memories` 只允许引用本目录与 `new-rules` 的最新结构、概念和行号。
- 文档中出现“旧追问模式”“动态多轮 ranking 追问”“答题数足够即可输出”“黄叶 4 题后端全链路已闭环”等说法，均视为需要复核的高风险陈述。
