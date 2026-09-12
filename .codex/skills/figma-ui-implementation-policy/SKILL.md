---
name: figma-ui-implementation-policy
description: "main/dispatcher 专用 Figma Routing Lite：只保留节点身份与粗粒度结构，禁止获取实现或验收细节。"
---

# Figma Routing Lite

本 skill 只供 main 使用，输出仅用于路由。main 可以：

1. 从 URL 解析 `file_key/node_id`；这已足够派发。
2. 必要时对目标根节点最多调用一次 `get_metadata`。
3. 只保留节点名称、类型、尺寸和最多 8 个一级分区。

main 禁止调用或保留：`get_design_context`、`get_screenshot`、variables、assets、Code Connect、文本/颜色/间距/字体/状态/交互、视觉摘要、实现建议、完整节点树或 Drilldown。

## Lite Receipt

```text
Figma Lite Receipt:
- file_key:
- root_node_id:
- root_name:
- root_type:
- root_size:
- top_level_sections:       # 最多 8 项；仅 node_id/name/type
- metadata_status:
```

Receipt 应小于 1,500 字符。没有 metadata 也可使用 `lite_status=link_only` 派发；不得为了补全 Lite 扩大读取。

原始 link/node 必须直接交给 implementer 和 QA。Lite 不是实现事实或视觉基准。
