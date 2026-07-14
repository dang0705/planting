<<<EXTERNAL_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START>>>
# External Implementer Handoff

本 prompt 通过当前 provider adapter 完整交付给目标会话。你是外部实现者，只负责按合同改代码。不要扩大范围。

## Architecture Direction
{architecture_direction}

## Implementation Contract
- Objective: {objective}
- Acceptance:
{acceptance_items}

## Allowed / Forbidden Paths
Allowed:
{allowed_paths}

Forbidden:
{forbidden_paths}

## Project Constraints
- framework: {framework}
- styling_system: {styling_system}
- new_scss_policy: {new_scss_policy}
- scss_exceptions: {scss_exceptions}
- component_library: {component_library}
- dependency_policy: {dependency_policy}
- rule_refs: {rule_refs}

## Handoff Manual Contract
你必须写入本地 handoff manual，路径：
{handoff_manual_path}

执行要求：
- 开始执行后立即创建或更新该 JSON，置 `status=working`。
- 完成代码修改和自检后更新为 `status=completed`。
- 无法继续时更新为 `status=blocked`，并在 `blockers` 写明原因。
- 如果你运行在不能写入本地主工作区文件的 Web/云端环境，必须通过 PR 或远端分支交付，并在最终结果中给出 PR URL 或 remote branch；本地 handoff manual 可标记为不可用，但聊天完成声明不能替代 PR/branch。
- Codex main 会先读取该手册的 `status` 来判断你是否结束；聊天里说完成不算完成。

最小 JSON 结构：
```json
{
  "dispatch_run_id": "{dispatch_run_id}",
  "status": "working | completed | blocked",
  "updated_at": "ISO-8601 timestamp",
  "phase": "audit | editing | validation | final | blocked",
  "changed_files_claimed": [],
  "validation_claims": {},
  "blockers": []
}
```

## Validation Commands
{validation_commands}

## UI Scope Contract
{ui_scope_contract_or_not_applicable}

## Style Stack Contract
{style_stack_contract_or_not_applicable}

## Figma Direct Fetch
{figma_direct_fetch_or_not_applicable}

截图规则：若当前运行模型为 GLM 且 AGENTS 规则要求跳过 `get_screenshot`，不要调用截图工具；必须在 `figma_fetch_evidence.screenshot_policy_skip` 记录 `allowed=true` 与 `policy_ref`。若没有足够设计上下文，则返回 `BLOCKED_EXTERNAL_FIGMA_UNAVAILABLE`，不得猜 UI。

## Figma Blocker Policy
{figma_blocker_policy_or_not_applicable}

## uni-ui Mapping Contract
{uni_ui_mapping_contract_or_not_applicable}

## Result JSON Contract
完成后输出：
<<<EXTERNAL_IMPLEMENTER_RESULT:{dispatch_run_id}:START>>>
{
  "status": "completed | blocked",
  "changed_files_claimed": [],
  "summary": "",
  "figma_fetch_evidence": {},
  "style_stack_compliance": {},
  "component_reuse_evidence": {},
  "uni_ui_mapping_evidence": {},
  "validation_claims": {},
  "blockers": []
}
<<<EXTERNAL_IMPLEMENTER_RESULT:{dispatch_run_id}:END>>>

注意：你在聊天里说完成不等于最终完成。Codex 会重新读取真实 git diff、测试和 QA。
<<<EXTERNAL_IMPLEMENTER_HANDOFF:{dispatch_run_id}:END>>>
