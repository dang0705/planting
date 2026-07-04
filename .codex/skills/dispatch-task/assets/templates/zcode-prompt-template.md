<<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START>>>
# ZCode External Implementer Handoff

本 prompt 通过剪贴板粘贴到 ZCode 当前会话。你是外部实现者，只负责按合同改代码。不要扩大范围。

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

## Figma Blocker Policy
{figma_blocker_policy_or_not_applicable}

## uni-ui Mapping Contract
{uni_ui_mapping_contract_or_not_applicable}

## Result JSON Contract
完成后输出：
<<<ZCODE_IMPLEMENTER_RESULT:{dispatch_run_id}:START>>>
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
<<<ZCODE_IMPLEMENTER_RESULT:{dispatch_run_id}:END>>>

注意：你在聊天里说完成不等于最终完成。Codex 会重新读取真实 git diff、测试和 QA。
<<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:END>>>
