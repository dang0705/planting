# Figma Task Boundaries

存在 `figma_link` 时必须区分 main implementation、external implementer 与 main QA 的证据边界。实现阶段的 Figma 证据和 main QA 独立视觉基准都必须真实取得，不得互相替代。

| 角色 | 必须/允许 | 禁止 |
|---|---|---|
| main implementation | 使用 `$implementer-ui-execution-policy`，在首次 UI 编辑前直接取 metadata + design context + screenshot；同时遵守 `$qa-ui-visual-baseline-policy` 的独立 QA 取证要求 | 依赖 Lite 猜实现、整文件读取 |
| External implementer | 在 provider-specific prompt 中被强制要求直接读取 Figma；若外部运行时有额外截图禁用规则，则遵守对应规则；缺少实现所需 Figma 证据时必须 blocker | 依赖 main Lite 猜实现、让 main 补读完整 Figma |
| Main QA | 使用 `$qa-ui-visual-baseline-policy`，独立取 metadata + reference screenshot，并取得实际运行截图 | 只凭 Lite/实现者转述判通过、整文件读取 |

`main_direct` Figma 模式必须满足：

```text
required_skills.main:
  - $implementer-ui-execution-policy
  - $qa-ui-visual-baseline-policy
```

若 `project_constraints.component_library` 包含 `uni-ui`：

- `main_direct`：handoff 必须追加 `$uni-ui-figma-component-mapper` 与 `uni_ui_mapping_evidence`。
- `external_implementer`：external prompt 必须追加 `uni_ui_mapping_contract`，并要求外部实现者在首次 UI 编辑前输出最小 `Figma 区域/节点 → uni-ui 组件/备选/风险` 映射证据。

main 不得读取或转述 uni-ui 组件索引、映射表、组件规则；只负责把 skill 名、prompt section 或 evidence 名写入 Contract。
