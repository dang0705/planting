<<<EXTERNAL_IMPLEMENTER_HANDOFF:example-zcode-ui-001:START>>>
# External Implementer Handoff

本 prompt 通过当前 provider adapter 完整交付给目标会话。你是外部实现者，只负责按合同改代码。不要扩大范围。

## Architecture Direction
- 在既有 uni-app + Vue 页面结构内实现首页提醒卡片。
- 不新增 store/API/schema，不修改提醒业务数据结构。
- UI 局部拆分、Tailwind utility 组合、现有组件或 uni-ui 复用落点可由你决定。

## Implementation Contract
- Objective: 按目标 Figma 节点实现首页提醒卡片。
- Acceptance:
  - 视觉、文案与交互匹配目标 Figma 节点。
  - 使用项目 TailwindCSS，不新增 SCSS。
  - 优先复用现有组件与 uni-ui。
  - 只修改 allowed_paths 内文件。

## Allowed / Forbidden Paths
Allowed:
- src/pages/home/**
- src/components/home/**

Forbidden:
- package.json
- package-lock.json
- src/api/**
- src/stores/**

## Project Constraints
- framework: uni-app + Vue
- styling_system: tailwindcss
- new_scss_policy: forbidden
- scss_exceptions: []
- component_library: uni-ui
- dependency_policy: no_new_dependencies
- rule_refs: AGENTS.md#UI-与样式

## Handoff Manual Contract
你必须写入本地 handoff manual，路径：
.tmp/dispatch-task/example-zcode-ui-001-handoff-manual.json

执行要求：
- 开始执行后立即创建或更新该 JSON，置 `status=working`。
- 完成代码修改和自检后更新为 `status=completed`。
- 无法继续时更新为 `status=blocked`，并在 `blockers` 写明原因。
- Codex main 会先读取该手册的 `status` 来判断你是否结束；聊天里说完成不算完成。

最小 JSON 结构：
```json
{
  "dispatch_run_id": "example-zcode-ui-001",
  "status": "working | completed | blocked",
  "updated_at": "ISO-8601 timestamp",
  "phase": "audit | editing | validation | final | blocked",
  "changed_files_claimed": [],
  "validation_claims": {},
  "blockers": []
}
```

## Validation Commands
必须在可用时运行：
- npm run typecheck
- npm run build:mp-weixin

如果命令不存在，Result JSON 中写 not_applicable 和原因。

## UI Scope Contract
先搜索已有组件和 uni_modules，再决定复用、wrapper 或新建。不得在未搜索前新建同名/近似组件。

## Style Stack Contract
Tailwind 项目中，新增 UI 默认使用 Tailwind utility、项目 token、uni-ui props/slots。禁止新增 .scss、<style lang="scss"> 或用 scoped style 重建常规 UI。

## Figma Direct Fetch
Figma link: https://figma.com/design/example/file?node-id=10-20
Node id: 10:20
你必须在当前 provider 环境内直接获取 Figma metadata + design context，并在首次 UI 编辑前完成。
若当前运行模型为 GLM 且 AGENTS 规则要求跳过 get_screenshot，则不要调用 get_screenshot；在 Result JSON 的 figma_fetch_evidence 中写入 screenshot_policy_skip，并引用 AGENTS 规则。若无法取得足够设计上下文，返回 BLOCKED_EXTERNAL_FIGMA_UNAVAILABLE，不得猜 UI。Result JSON 必须包含 figma_fetch_evidence。

## Figma Blocker Policy
如果当前 provider 环境没有 Figma 能力、没有权限、节点无效或 context 不足，立即输出 BLOCKED_EXTERNAL_FIGMA_UNAVAILABLE，不得根据 main Lite、记忆或猜测实现 UI。

## uni-ui Mapping Contract
因为 component_library=uni-ui 且存在 Figma link，你必须在首次 UI 编辑前输出 uni_ui_mapping_evidence：Figma 区域/节点、视觉与交互线索、首选 uni-ui 组件、备选、采用/自定义决策、原因、风险/限制。不得先手写像素 UI。

## Result JSON Contract
完成后输出：
<<<EXTERNAL_IMPLEMENTER_RESULT:example-zcode-ui-001:START>>>
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
<<<EXTERNAL_IMPLEMENTER_RESULT:example-zcode-ui-001:END>>>

注意：你在聊天里说完成不等于最终完成。Codex 会重新读取真实 git diff、测试和 QA。
<<<EXTERNAL_IMPLEMENTER_HANDOFF:example-zcode-ui-001:END>>>
