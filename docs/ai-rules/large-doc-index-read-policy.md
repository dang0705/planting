# 大目录索引接入说明

## 1. 目的

`docs/code-logics/` 和 `docs/new-rules/` 是高价值但高 token 风险目录。任何 agent 不得默认全量读取。`docs/new-rules/` 已切换为 All-in-One + JSON 索引模式。

## 2. 新读取规则

1. 先读 `INDEX.md`。
2. `docs/code-logics/` 只读取索引命中的 1～2 个具体文档；`docs/new-rules/` 只读取 `source_index.json` 命中的 1～2 个 All-in-One 章节或 Sxx。
3. 如果需要超过 2 个具体文档，main agent 必须提供摘要或说明原因。
4. 下游 agent 优先读上游摘要，不重复读源文档。
5. 索引无法定位时，subagent 必须请求 main agent 指定路径，不得自行扫目录。

## 3. 建议在 subagent 中加入的规则

```text
涉及 `docs/code-logics/` 时，必须先读取 `docs/code-logics/INDEX.md`；涉及 `docs/new-rules/` 时，必须先读取 `docs/new-rules/planting_ai_diagnosis_source_index.json`。
不得全量读取整个目录。
每次默认最多读取 1～2 个命中文档、章节或 Sxx。
若索引无法定位，停止并请求 main agent 补充摘要或指定路径。
```


## 4. new-rules All-in-One 特殊规则

`docs/new-rules/planting_ai_diagnosis_all_in_one.md` 包含整合摘要与附录 A 原文汇编，体量较大。

读取约束：

1. 默认不读取 All-in-One 全文。
2. 默认先读 `planting_ai_diagnosis_source_index.json`。
3. 实现 / 审查优先读取 All-in-One 第 0～15 章整合摘要。
4. 只有需要原文核对时，才读取附录 A 中指定 `Sxx`。
5. 下游 agent 优先读取上游摘要，不重复读取同一 `Sxx` 原文。
6. `docs/new-rules/archive/` 只作归档，不进入默认 agent 工作流。
