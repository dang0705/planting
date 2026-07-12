# Tier Routing

main 必须先判断 `dispatch_tier`，再选择内部路由字段 `implementation_mode`。`implementation_mode` 由 dispatch-task 根据用户意图、任务配置和触发词自动设置，不是要求用户每次手动输入的启动口令；用户手动写 `implementation_mode=external_implementer` 只表示强制指定外部实现者桥接。旧值 `implementation_mode=zcode_external` 仅兼容 ZCode。低风险任务不强制完整 dispatch，高风险任务不得绕过 contract。

| dispatch_tier | 适用任务 | 默认处理 |
|---|---|---|
| `simple_patch` | 单文件/少量文件、低风险、无 Figma、无 schema/API/状态机、无需外部实现者 | main 可直接修改；不生成完整 Handoff Contract；仍必须做 diff review 和最小验证 |
| `standard_task` | 多文件但在既有架构内，局部功能或普通 UI | `implementation_mode=codex_subagent`，通常派 `implementer_fast` |
| `deep_contract` | API/schema/迁移/安全/跨系统状态机/兼容性或不可逆风险 | `implementation_mode=codex_subagent`，派 `implementer_deep`，读取 `references/high-risk-workflow.md` |
| `external_implementer` | 用户或配置明确要求外部 agent 写代码（ZCode、Trae、Chrome 插件驱动的云端 agent 等） | `implementation_mode=external_implementer`，读取 external implementer references |
| `qa_only` | 只验收、不改代码 | 只派 `qa_reviewer` 或 main 做轻审计 |
| `docs_only` | 只改文档/说明/契约 | main 或 docs_keeper 处理，按影响范围决定 |

## `simple_patch` 边界

`simple_patch` 不是逃避约束：不得触碰 forbidden path，不得新增未授权依赖，不得扩大需求；完成时仍需给出 changed files、验证命令和风险说明。

存在 Figma link、UI 还原、API/schema、迁移、安全、CloudBase、跨端状态机、外部工具协作或用户指定外部实现者时，不得走 `simple_patch`。

## implementation_mode

这是 handoff/validator 使用的内部路由字段。用户不需要逐字输入；main 必须从自然语言触发词或任务配置中推断。

- `codex_subagent`：默认重任务实现模式，使用 `implementer_fast` / `implementer_deep`。
- `external_implementer`：Gate A0 命中外部实现者触发词，或任务配置明确指定。旧 `zcode_external` 兼容为 provider=zcode。

## Gate A0 — External Implementer 简单触发

只要本轮任务需要代码修改，且用户输入出现以下任一正向触发词，必须设置：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode | trae | chrome_cloud_agent | other
external_contract.target_session = current_open_chat | browser_session | remote_session | manual_handoff
```

正向触发词：`外部实现者`、`外部 implementer`、`外部实现`、`external_implementer`、`implementation_mode=external_implementer`、`用 ZCode`、`走 ZCode`、`ZCode 实现`、`ZCode 写代码`、`交给 ZCode`、`用 Trae`、`Trae 实现`、`交给 Trae`、`Chrome 插件里的云端 agent`、`云端 agent 实现`、`zcode_external`、`implementation_mode=zcode_external`、`GLM 在 ZCode 里跑`、`让 GLM 在 ZCode 跑`。其中具体 provider 触发词只决定 `external_contract.provider`，不改变公共 handoff 协议。

明确否定外部实现者或具体 provider、任务不需要代码修改、或只是询问流程/配置/故障时，不触发。
