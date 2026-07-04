# Tier Routing

main 必须先判断 `dispatch_tier`，再选择内部路由字段 `implementation_mode`。`implementation_mode` 由 dispatch-task 根据用户意图、任务配置和触发词自动设置，不是要求用户每次手动输入的启动口令；用户手动写 `implementation_mode=zcode_external` 只表示强制指定 ZCode 桥接。低风险任务不强制完整 dispatch，高风险任务不得绕过 contract。

| dispatch_tier | 适用任务 | 默认处理 |
|---|---|---|
| `simple_patch` | 单文件/少量文件、低风险、无 Figma、无 schema/API/状态机、无需外部实现者 | main 可直接修改；不生成完整 Handoff Contract；仍必须做 diff review 和最小验证 |
| `standard_task` | 多文件但在既有架构内，局部功能或普通 UI | `implementation_mode=codex_subagent`，通常派 `implementer_fast` |
| `deep_contract` | API/schema/迁移/安全/跨系统状态机/兼容性或不可逆风险 | `implementation_mode=codex_subagent`，派 `implementer_deep`，读取 `references/high-risk-workflow.md` |
| `external_zcode` | 用户或配置明确要求 ZCode/GLM 写代码 | `implementation_mode=zcode_external`，读取 ZCode references |
| `qa_only` | 只验收、不改代码 | 只派 `qa_reviewer` 或 main 做轻审计 |
| `docs_only` | 只改文档/说明/契约 | main 或 docs_keeper 处理，按影响范围决定 |

## `simple_patch` 边界

`simple_patch` 不是逃避约束：不得触碰 forbidden path，不得新增未授权依赖，不得扩大需求；完成时仍需给出 changed files、验证命令和风险说明。

存在 Figma link、UI 还原、API/schema、迁移、安全、CloudBase、跨端状态机、外部工具协作或用户指定 ZCode 时，不得走 `simple_patch`。

## implementation_mode

这是 handoff/validator 使用的内部路由字段。用户不需要逐字输入；main 必须从自然语言触发词或任务配置中推断。

- `codex_subagent`：默认重任务实现模式，使用 `implementer_fast` / `implementer_deep`。
- `zcode_external`：Gate A0 命中 ZCode 触发词，或任务配置明确指定。

## Gate A0 — ZCode 简单触发

只要本轮任务需要代码修改，且用户输入出现以下任一正向触发词，必须设置：

```text
implementation_mode = zcode_external
dispatch_tier = external_zcode
external_implementer = zcode_glm
zcode_target = current_open_chat
```

正向触发词：`用 ZCode`、`走 ZCode`、`ZCode 实现`、`ZCode 写代码`、`交给 ZCode`、`外部实现者`、`外部 implementer`、`外部实现`、`zcode_external`、`implementation_mode=zcode_external`、`GLM 在 ZCode 里跑`、`让 GLM 在 ZCode 跑`、`实现阶段走 ZCode`。其中 `implementation_mode=zcode_external` 只是可选的强制写法，不是唯一触发方式。

明确否定 ZCode、任务不需要代码修改、或只是询问 ZCode 流程/配置/故障时，不触发。
