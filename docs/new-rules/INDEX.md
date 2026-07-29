# new-rules 索引（code-base 同步版）

更新时间：2026-06-06

## 当前定位

`new-rules` 不再承担“大而全历史规则库”的角色。它现在只保留当前代码实际运行时需要 AI 理解的规则摘要。

当前唯一主问诊模式是 route 模式。既有 Sxx 规则集与旧追问式扩展规则，不能再作为当前执行事实。

## 文件

- `planting_ai_diagnosis_all_in_one.md`：当前代码运行规则摘要，重点覆盖 route 问诊、黄叶题包、stop/output、前端契约与代码源索引。
- `planting_ai_diagnosis_source_index.json`：当前规则摘要与 `docs/code-logics` 的章节/行号索引。

## 阅读顺序

1. 先读 `docs/code-logics/00_文档总索引_与阅读顺序.md`。
2. 再读 `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md` 与 `05_问诊系统_问题生成_过滤_停止策略.md`。
3. 最后读本目录的 all-in-one，用作 AI 执行任务时的短规则摘要。

## 维护原则

- 以 code-base 为最高事实源。
- all-in-one 只保留当前运行时直接涉及的概念。
- 不再复制历史 S01-Sxx 长文档。
- `ai_and_memories` 的文档引用必须在本目录完成瘦身后再更新。
