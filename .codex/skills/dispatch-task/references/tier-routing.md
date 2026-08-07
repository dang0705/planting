# Tier Routing

main 必须先判断 `dispatch_tier`，再设置 `implementation_mode`。除用户明确要求 external implementer 外，所有实现均由 main 完成；`implementation_mode` 不再提供内部 implementer 或 subagent 路由。旧值 `implementation_mode=zcode_external` 仅兼容 ZCode 外部桥接。低风险任务不强制完整 dispatch，高风险任务不得绕过 contract。

| dispatch_tier | 适用任务 | 默认处理 |
|---|---|---|
| `simple_patch` | 单文件/少量文件、低风险、无 Figma、无 schema/API/状态机、无需外部实现者 | `implementation_mode=main_direct`；main 可直接修改；不生成完整 Handoff Contract；仍必须做 diff review 和最小验证 |
| `standard_task` | 多文件但在既有架构内，局部功能或普通 UI | `implementation_mode=main_direct`，main 直接实现并验证 |
| `deep_contract` | API/schema/迁移/安全/跨系统状态机/兼容性或不可逆风险 | `implementation_mode=main_direct`，main 读取 `references/high-risk-workflow.md` 并按 strict 合同执行 |
| `external_implementer` | 用户或配置明确要求外部 agent 写代码（ZCode、Trae、Chrome 插件驱动的云端 agent 等） | `implementation_mode=external_implementer`，读取 external implementer references |

只验收或只改文档的任务由 main 直接执行，**不**进入 Implementation Completion Gate；不得伪装成实现任务。

## `simple_patch` 边界

`simple_patch` 不是逃避约束：不得触碰 forbidden path，不得新增未授权依赖，不得扩大需求；完成时仍需给出 changed files、验证命令和风险说明。

child / external 终态后的格式、lint/build、typo 或机械冲突修复不重新派发，按 `maintenance_patch` 处理；它必须满足 `SKILL.md` §1.3 的文件数、语义行数和风险边界。maintenance patch 不是新的产品实现路由。

存在 Figma link、UI 还原、API/schema、迁移、安全、CloudBase、跨端状态机、外部工具协作或用户指定外部实现者时，不得走 `simple_patch`。

## implementation_mode

这是 handoff/validator 使用的内部路由字段。用户不需要逐字输入；main 必须从自然语言触发词或任务配置中推断。

- `main_direct`：所有非外部任务的实现模式；main 直接实现、验证和回收。
- `external_implementer`：Gate A0 命中外部实现者触发词，或任务配置明确指定。旧 `zcode_external` 兼容为 provider=zcode。
- `main_direct`：用于 `simple_patch`、`standard_task` 和 `deep_contract`；main 直接承担实现、diff review 与合同验证，不得声明 target_role 或 spawn_contract。

## Gate A0 — External Implementer 简单触发

只要本轮任务需要代码修改，且用户输入出现以下任一正向触发词，必须设置：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode | trae | chrome_cloud_agent | other
external_contract.target_session = current_open_chat | headless_new_session | browser_session | remote_session | manual_handoff
```

正向触发词：`外部实现者`、`外部 implementer`、`外部实现`、`external_implementer`、`implementation_mode=external_implementer`、`用 ZCode`、`走 ZCode`、`ZCode 实现`、`ZCode 写代码`、`交给 ZCode`、`用 Trae`、`Trae 实现`、`交给 Trae`、`Chrome 插件里的云端 agent`、`云端 agent 实现`、`zcode_external`、`implementation_mode=zcode_external`、`GLM 在 ZCode 里跑`、`让 GLM 在 ZCode 跑`。其中具体 provider 触发词只决定 `external_contract.provider`，不改变公共 handoff 协议。

`provider=zcode` 是 provider-specific 例外，必须固定追加：

```text
external_contract.target_session = headless_new_session
external_contract.prompt_transport = zcode_headless_cli
external_contract.headless_cli_required = true
external_contract.canonical_prompt_file_reference_required = true
external_contract.credential_source = desktop_custom_provider
external_contract.credential_persistence_forbidden = true
external_contract.clipboard_ui_fallback_forbidden = true
external_contract.provider_execution_receipt_required = true
```

ZCode 的 `desktop_custom_provider` 从 CLI 无密钥 adapter/model 选择唯一匹配桌面 provider，以允许的 kind 映射、规范化 HTTPS baseURL、model 精确匹配，并只注入匹配 provider 的既有 key。`openai-compatible` 使用由 CLI alias 派生的 `<ALIAS>_API_KEY`；canonical prompt 通过短路径指令读取，不使用 `--attach`。其他 provider 的 `current_open_chat` 等通用语义保持不变。

明确否定外部实现者或具体 provider、任务不需要代码修改、或只是询问流程/配置/故障时，不触发。
