# Pre-Implementation Budget Fuse

## 1. 定位

本文件定义正式进入 implementer 之前的 token 预算保险丝。它的目标是减少 pre-implementation 阶段的上下文爆炸，同时不削弱 Phase Gate。

## 2. 预算估算

main agent 在进入 implementer 前必须输出：

```text
Pre-Implementation Budget Check:
- estimated_pre_impl_tokens: low / medium / high / extreme
- risk_reason:
- heaviest_sources:
  - ClickUp:
  - Figma:
  - GitHub:
  - CloudBase:
  - code_context:
  - rules:
- compression_actions:
- continue_allowed: yes / no
```

## 3. 风险分级

| 等级 | 估算范围 | 动作 |
|---|---:|---|
| low | < 12k | 正常继续 |
| medium | 12k-30k | 使用 receipt 和 role_context_packets，避免扩写 |
| high | 30k-60k | 必须压缩事实、减少候选、推迟 Drilldown |
| extreme | > 60k | 必须停止说明原因，请求用户确认是否继续重上下文 |

## 4. high / extreme 必须执行的压缩动作

1. Gate 输出改为 receipt。
2. ClickUp 只保留硬约束句、非目标、checklist matrix 和 blocking gaps。
3. Solution Discovery 使用 Lite，不使用 Expanded，除非用户明确需要。
4. Figma 默认只保留 Lite；Implementation Slice / Drilldown 默认不进入 main agent 长上下文。
5. 候选插件 / 第三方方案最多列 3 个。
6. role_context_packet 必须遵守预算上限。
7. 长日志、截图、DevTools dump、完整搜索结果放入 audit appendix 或证据路径。

## 5. 禁止事项

1. 禁止因上下文过重而跳过 Phase Gate。
2. 禁止用完整 Figma、完整 ClickUp、完整日志填充默认上下文。
3. 禁止把预算检查写成长篇分析。
4. 禁止把缓存命中当作确定前提；缓存只能视为额外收益。

## v50 Figma Drilldown 预算规则

1. main agent pre-implementation 阶段默认不得读取完整 `Figma Node Drilldown`。
2. main agent 只生成 `Figma Drilldown Request`。
3. 完整 Drilldown 默认由 implementer 在 implementation 阶段按 request 读取。
4. QA 只接收 `QA Visual Baseline Slice`，不接收完整 Drilldown。
5. QA 需要局部 Drilldown 时，必须先说明 UI 对齐失败、baseline 不足或 variant 不明确。
6. high / extreme 预算下，Drilldown 必须延迟到 implementer，不能提前进入 main agent 上下文。


## v53 explicit Drilldown MCP

pre-implementation 阶段只生成 `Figma Drilldown Request`。  
implementation 阶段由 implementer 通过 `implementer-ui-execution-policy` 显式调用 Figma MCP。

不得把“可能继承 MCP”作为流程前提。
