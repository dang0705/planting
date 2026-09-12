---
name: qa-ui-visual-baseline-policy
description: "main QA 专用：从原始 Figma link 独立获取视觉基准，并与实际运行截图和状态比较。"
---

# QA Independent Figma Baseline

main QA 从 Contract 取得原始 `figma_link/node_id` 和 acceptance，不把 main Lite、implementer 摘要或其自检截图当作唯一事实源。

## 必须读取

1. `get_metadata`：目标名称、类型、尺寸和粗结构。
2. `get_screenshot`：目标节点 reference screenshot。
3. `get_design_context`：仅在 variant/state/文本/差异归因无法由截图与 acceptance 判断时，对具体子节点局部读取。

禁止整文件读取或复制完整 context。

## 验收

- 必须取得实现的实际运行截图/目标页面状态；代码、构建成功或 implementer 自述不能替代。
- 比较布局、尺寸、间距、文字、颜色、字体、状态、交互和平台渲染。
- Figma、实际截图或验收状态任一缺失，只能 blocked/not_verified。
- 不运行 unit tests。

## Evidence

```json
{
  "figma_baseline_evidence": {
    "status": "ready",
    "acquired_by": "main",
    "independent_read": true,
    "source_link": "",
    "node_id": "",
    "calls": ["get_metadata", "get_screenshot"],
    "reference_screenshot_ref": "",
    "actual_runtime_screenshot_ref": "",
    "states_checked": [],
    "differences": [],
    "result": "passed"
  }
}
```
