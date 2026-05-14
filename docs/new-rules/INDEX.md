# docs/new-rules 索引

## 1. 定位

本目录已切换为 **All-in-One 规则库 + 机器索引** 模式，用于替代原 `new-rules/` 下 48 份 Markdown 的默认读取入口。

默认入口：

1. `docs/new-rules/planting_ai_diagnosis_source_index.json`
2. `docs/new-rules/planting_ai_diagnosis_all_in_one.md` 的第 0～15 章摘要区

禁止默认读取：

1. `planting_ai_diagnosis_all_in_one.md` 的附录 A 全文。
2. `docs/new-rules/archives/` 下的原始源文档。
3. 原 48 份 Markdown 的全量目录。

## 2. 读取原则

1. 先读取 `planting_ai_diagnosis_source_index.json`，根据 `source_id`、`category`、`role`、`keywords`、`status` 命中规则来源。
2. 再读取 `planting_ai_diagnosis_all_in_one.md` 的第 0～15 章整合摘要。
3. 如需原文，只允许读取 All-in-One 附录 A 中指定的 `Sxx` 源文档段落。
4. 每次默认最多回查 1～2 个 `Sxx`。
5. 如果需要超过 2 个 `Sxx`，main agent 必须提供摘要或说明原因。
6. 下游 subagent 优先读取上游 agent 摘要和 handoff，不重复读取 All-in-One 源文档原文。
7. 如索引无法定位，subagent 应停止并请求 main agent 指定 `source_id`、章节或摘要，不得自行全量扫描。

## 3. 推荐读取顺序

```text
任务需求
→ source_index.json
→ All-in-One 第 1 章快速定位索引
→ All-in-One 第 2～15 章整合规则摘要
→ 必要时回查附录 A 指定 Sxx
```

## 4. Dispatch Plan 写法

```text
需要读取的规则文件/章节:
- docs/new-rules/planting_ai_diagnosis_source_index.json：定位 source_id
- docs/new-rules/planting_ai_diagnosis_all_in_one.md：只读第 X 章 / 指定 Sxx
是否涉及 docs/new-rules: 是，命中 source_id: Sxx, Syy
规则文件数量是否超过 2 个: 否 / 是，原因：
规则摘要:
- ...
```

## 5. 与旧索引的关系

本文件替代旧版 `docs/new-rules/INDEX.md` 的“任务域 → 原始文件路径”模式。

原始源文档仍可归档保留，但不再作为 agent 的默认读取入口。
