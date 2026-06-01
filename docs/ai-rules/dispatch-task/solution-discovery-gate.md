# Solution Discovery Gate

## 1. 定位

`Solution Discovery Gate` 是 main agent 在技术方向裁决前必须完成的前置门禁。它证明 main agent 已以可控 token 成本评估过需求复杂度、现有代码复用、成熟方案、uni-app 生态、微信小程序原生能力和手搓必要性。

未通过本门禁，不得进入 Technical Direction Gate，不得派发 implementer。

## 2. Lite / Expanded 双层输出

### 2.1 Solution Discovery Lite

默认使用 Lite。Lite 目标是保证不漂移，同时控制输出。

```text
Solution Discovery Lite:
- complexity: simple / medium / complex / high_risk
- affected_domains: UI / frontend / backend / cloud / DB / runtime / docs / QA
- existing_reuse_checked: yes / no
- third_party_search_needed: yes / no
- search_status: skipped / done / blocked
- candidates_summary: <= 3 items
- selected_preliminary_direction:
- handcode_allowed: yes / no
- blocking_gap:
- pass: yes / no
```

预算：建议 300-450 tokens。

### 2.2 Solution Discovery Expanded

只有以下情况才允许使用 Expanded：

1. 用户明确要求技术选型比较。
2. 功能复杂且可能存在成熟插件 / 第三方方案。
3. Lite 发现阻塞 gap。
4. main agent 无法判断是否手搓。
5. Solution Discovery Lite 不能支撑 Technical Direction Gate。

```text
Solution Discovery Expanded:
- requirement_complexity:
- codebase_discovery:
- ecosystem_discovery:
  - sources_checked:
  - candidates: <= 3
- options_considered:
- selected_preliminary_direction:
- discovery_gap:
- pass:
```

预算：不超过 800 tokens。

## 3. 成熟方案搜索触发条件

以下任一情况必须至少做 Lite 级成熟方案判断：

1. 手搓复杂度高。
2. 涉及 UI 复杂组件、图表、日历、上传、拖拽、富文本、地图、手势、动画、虚拟列表。
3. 涉及通用能力，而非项目强业务逻辑。
4. 预计新增代码较多。
5. 需要兼容微信小程序 / uni-app 多端。
6. 现有代码中没有明确可复用模块。
7. 用户、prompt 或 ClickUp 硬约束要求“优先考虑 uni-app 生态插件 / 现成方案 / 复用”。

## 4. 评估优先级

1. 项目已有实现。
2. 已安装依赖。
3. uni-app 生态插件。
4. 微信小程序原生能力。
5. 稳定 npm / GitHub / 官方方案。
6. 手搓新实现。

如果最终允许手搓，必须说明为什么不能复用、不能 wrapper/adapter、不能插件或原生能力。

## 5. 输出预算硬限制

1. 默认使用 Lite。
2. Expanded 总输出不超过 800 tokens。
3. 候选成熟方案最多 3 个。
4. 每个候选最多 5 行。
5. 代码搜索 query 最多 5 个。
6. 可复用候选最多 5 个。
7. 禁止粘贴完整 README、插件文档、GitHub issue、搜索结果或长日志。
8. 详细搜索记录如需保留，放入 handoff audit appendix。
9. 如果无法联网、无法访问插件市场或 MCP 不可用，必须记录 blocked / unknown，不得假装已搜索。

## 6. 停止条件

以下情况不得进入 Technical Direction Gate：

1. 需求复杂度无法判断。
2. 用户硬约束未被纳入。
3. 明确要求评估插件 / 复用，但没有评估。
4. 选择手搓但没有拒绝复用 / 插件 / 原生能力的理由。
5. 搜索被阻塞且该信息是决策必要条件。
6. discovery_gap 未处理且会影响技术方向。
