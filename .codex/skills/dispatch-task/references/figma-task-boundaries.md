# Figma Task Boundaries

存在 `figma_link` 时必须区分 main、implementer、ZCode 与 QA 的证据边界。main Lite、implementer 摘要、自检截图不得替代 QA 独立视觉基准。

| 角色 | 必须/允许 | 禁止 |
|---|---|---|
| main | 执行 `references/figma-main-lite-policy.md`；可只解析 link/node，或最多一次 `get_metadata` 形成 Lite | context、screenshot、variables、assets、视觉摘要、实现切片、Drilldown |
| Codex implementer | 使用 `$implementer-ui-execution-policy`，在首次 UI 编辑前直接取 metadata + design context + screenshot；Scope 规则在其 `references/ui-scope-policy.md` 内 | 依赖 main Lite 猜实现、整文件读取 |
| ZCode external implementer | 在 ZCode prompt 中被强制要求直接读取 Figma；若外部运行时为 GLM，则遵守 AGENTS 的截图禁用规则；缺少实现所需 Figma 证据时必须 blocker | 依赖 main Lite 猜实现、让 main 补读完整 Figma |
| QA | 使用 `$qa-ui-visual-baseline-policy`，独立取 metadata + reference screenshot，并取得实际运行截图 | 只凭 main/实现者转述判通过、整文件读取 |

`codex_subagent` Figma 模式必须满足：

```text
required_skills.implementer:
  - $implementer-ui-execution-policy
required_skills.qa:
  - $qa-ui-visual-baseline-policy
```

若 `project_constraints.component_library` 包含 `uni-ui`：

- `codex_subagent`：handoff 必须追加 `$uni-ui-figma-component-mapper` 与 `uni_ui_mapping_evidence`。
- `zcode_external`：ZCode prompt 必须追加 `uni_ui_mapping_contract`，并要求外部实现者在首次 UI 编辑前输出最小 `Figma 区域/节点 → uni-ui 组件/备选/风险` 映射证据。

main 不得读取或转述 uni-ui 组件索引、映射表、组件规则；只负责把 skill 名、prompt section 或 evidence 名写入 Contract。
