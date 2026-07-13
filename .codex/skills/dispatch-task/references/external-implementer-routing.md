# External Implementer Routing

硬约束：所有 external implementer 共享同一套 handoff prompt 生成 schema，不得为不同 provider 定义不同的 prompt 内容格式。
provider 差异只允许存在于发送 adapter（会话入口、DOM 校验、host/tab 校验、发送动作）与 send receipt 字段，不得改变 prompt 的 section 集合、顺序、sentinel 或结构化合同字段。

仅当 `implementation_mode=external_implementer`（兼容旧值 `zcode_external`）时读取。本文定义外部实现者的公共 handoff 生成协议；provider 只作为 adapter 差异层，不得改变 prompt 的主协议。

## 路由

命中“外部实现者 / external implementer / 交给 ZCode / 用 Trae / 让 Chrome 插件里的云端 agent 实现”等正向触发词，且任务需要代码修改时，设置：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode | trae | chrome_cloud_agent | other
external_contract.target_session = current_open_chat | browser_session | remote_session | manual_handoff
```

旧字段兼容：`implementation_mode=zcode_external`、`dispatch_tier=zcode_external`、`zcode_contract` 仅表示 provider 为 ZCode 的旧合同格式。新任务优先使用 `external_contract`。

明确出现“不用外部实现者 / 不用 ZCode / 不用 Trae / disable external implementer”等否定语境，或任务只是询问流程、配置、故障时，不触发。

## 公共边界（统一约束）

1. main 不 spawn Codex implementer，不自己写代码。
2. external implementer 只负责按 prompt 修改代码并写 handoff manual。
3. main 负责合同、路径边界、provider 发送 adapter、Child Run Lock、diff review、QA 派发与 Completion Gate。
4. provider 聊天或 UI 中的“完成”不是完成依据；main 必须重新读取真实 git diff、测试证据和 handoff manual。
5. provider 失败、无 diff、越权修改、prompt 未完整发送、无法读取必要 Figma 或 adapter 不可用时，不得 silent fallback 到 main 或 Codex subagent；需要用户明确批准后才能改派。

## 统一 Prompt 生成规范

统一模板：

```text
assets/templates/external-implementer-prompt-template.md
```

所有 external implementer 的 prompt 必须使用同一模板和同一 sentinel：

- `<<<EXTERNAL_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START|END>>>`
- `<<<EXTERNAL_IMPLEMENTER_RESULT:{dispatch_run_id}:START|END>>>`

prompt 必须完整包含以下 section，且顺序不得变化：

- `## Architecture Direction`
- `## Implementation Contract`
- `## Allowed / Forbidden Paths`
- `## Project Constraints`
- `## Handoff Manual Contract`
- `## Validation Commands`
- `## UI Scope Contract`
- `## Style Stack Contract`
- `## Figma Direct Fetch`
- `## Figma Blocker Policy`
- `## uni-ui Mapping Contract`
- `## Result JSON Contract`

若某 section 对当前任务不适用，仍必须保留标题，并填入 `not_applicable` 或等价占位内容，不得删节 section。

禁止根据 provider 在 prompt 中增加额外结构字段（例如 zcode/trae 专有字段）或改写标题/section/sentinel；任何 provider 差异必须放在 `external-implementer-routing` 的 adapter 小节或各 provider 参考文件中。

## external_contract

最小字段：

```text
provider
target_session
prompt_transport
send_receipt_required: true
handoff_manual_required: true
handoff_completion_status_source: handoff_manual
completion_claim_not_authoritative: true
codex_self_implementation_forbidden: true
generic_fallback_forbidden: true
recovery_required: true
required_prompt_sections
```

`prompt_transport` 示例：

- `clipboard_paste`：本地 UI 聊天窗口，如 ZCode。
- `browser_plugin`：Chrome 插件或浏览器会话中的云端 agent。
- `manual_handoff`：用户明确要求人工外部转交时，只生成 prompt 和 receipt，不伪造工具调用。
- `api_or_mcp`：未来若有专用 provider connector，可记录真实 connector event。

## TRAE Web provider

当 `external_contract.provider=trae` 且通过 Web TRAE / Chrome 受控页面发送 prompt 时，TRAE 必须被当作浏览器 provider adapter，而不是泛化的聊天窗口。

硬规则：

1. TRAE Web 受控页面的目标 host 固定为 `work.enterprise.trae.cn`。adapter 打开页面后必须先校验 `location.origin`/`location.host`；若不是该 host，返回 `blocked: trae_wrong_origin`，不得在其他 TRAE 域名或未知镜像页面发送实现 prompt。
2. Web TRAE 默认可能处于 `Work` 模式；作为 external implementer 执行代码任务前必须切到 `Code` 模式。
3. Code 模式验证路径固定为页面左上角 `div[role="tablist"]` 下文本为 `Code` 的 `button`。只有该按钮同时满足 `aria-selected="true"` 且 `class` 包含 `tabActive-` 前缀，才算已选中 Code 模式。
4. 如果 Code tab 未选中，adapter 必须点击该 `Code` button 并重新读取两个条件；仍不满足时返回 `blocked: trae_code_mode_unavailable`，不得继续发送实现 prompt。
5. TRAE Web 的输入框通常是 Lexical/contenteditable。adapter 必须通过真实焦点与浏览器输入事件触发前端状态更新；发送前必须确认发送按钮存在且 `disabled=false`。仅设置 DOM 文本后点击禁用按钮不算 send receipt。
6. send receipt 至少记录：目标 URL、受控 profile 或 remote-debug 端口、Code tab 的 `aria-selected` 和 `class`、输入框 selector、发送按钮 `disabled=false` 的证据、真实点击/发送动作，以及 prompt sentinel 或摘要。
7. prompt 发送并确认 TRAE 已开始运行后，main 进入 Child Run Lock。TRAE 聊天输出不能替代 `handoff_manual.path`，只能作为排障或 recovery 辅助证据。

## handoff_manual

`handoff_manual.path` 必须位于：

```text
.tmp/dispatch-task/{dispatch_run_id}-handoff-manual.json
```

external implementer 开始任务后置 `status=working`，完成或阻塞时更新为 `completed|blocked`。main 低频回收时必须先读该 JSON，再判断是否进入 recovery。若文件缺失或 JSON 损坏，不得用聊天状态补判完成；recovery result 必须记录 `handoff_manual.status=missing|invalid` 并返回 `blocked`。
