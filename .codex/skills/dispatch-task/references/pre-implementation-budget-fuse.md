# Pre-Implementation Budget Fuse

## 定位

本文件定义正式进入 implementer 之前的 token 预算保险丝。目标是减少 pre-implementation 阶段上下文爆炸，同时不削弱 Phase Gate。

## 预算估算

输出模板见：

```text
../assets/templates/phase-gates.md
```

## 风险分级

| 等级 | 估算范围 | 动作 |
|---|---:|---|
| low | < 12k | 正常继续 |
| medium | 12k-30k | 使用 receipt 和 role_context_packets |
| high | 30k-60k | 必须压缩 facts、减少候选、推迟 Drilldown |
| extreme | > 60k | 必须停止说明原因，自动执行任务前 dirty snapshot commit是否继续重上下文 |

## BRV 降本动作

Phase 1.5 的 BRV Recall Receipt 是 pre-implementation 降本手段。预算为 medium 及以上时，必须优先用 BRV 输出的 `docs_to_read` 和 `code_to_verify` 限定 docs/code 读取范围；不得因为已有 BRV 就额外全量读取 docs 或 rules。

## high / extreme 压缩动作

1. Gate 输出改为 receipt。
2. ClickUp 只保留硬约束句、非目标、checklist matrix 和 blocking gaps。
3. Solution Discovery 使用 Lite。
4. Figma 默认只保留 Lite、Technical Scope Slice、QA Visual Baseline Slice 和 Drilldown Request。
5. 完整 Drilldown 默认由 implementer 在 implementation 阶段按 request 读取。
6. QA 只接收 QA Visual Baseline Slice。
7. 长日志、截图、DevTools dump、完整搜索结果放入 audit appendix 或证据路径。
