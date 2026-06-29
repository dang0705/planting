<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-light-env-20260623-001:START>>>

你是 ZCode 外部实现者，本轮只替代 implementer 写代码阶段。请在当前仓库 `/Users/jay/WebstormProjects/planting` 中完成任务。这个 prompt 将由 Codex main 通过剪贴板一次性粘贴到 ZCode 会话；不要要求用户再复制上下文。

## Architecture Direction

- 目标文件：`src/components/LightEnvironmentPicker.vue`。
- 本任务是 UniApp 3.0 + Vue 3 `<script setup>` + JavaScript + Tailwind CSS 3 + uni-ui 的小程序优先 UI 对齐任务。
- 必须用 uni-ui 的折叠面板能力承载“有窗”详情；不要继续用纯 `view` 卡片伪装折叠面板。
- “方位选择器”“校准方位按钮”“离窗距离”“位置选项”“每天有直射光”必须落在“有窗”折叠面板内部。无窗、补光灯选项不展示这些有窗详情。
- 校准方位弹框中的罗盘指针必须直接参考 Figma 节点 `154:271` 重新对齐。
- 保留现有数据行为：`modelValue`、`update:modelValue`、`change`、`disabled`、`errorText`、`idPrefix`、`questionId`、`sanitizeLightEnvironment`、`createDefaultLightEnvironment`、`compassDirectionToFacing`、`getLightFacingLabel` 合同不能破坏。
- 不要修改云函数、schema、store、诊断数据、package/lockfile 或无关页面。不要提交 git commit。

## Implementation Contract

实现目标：
1. 对齐主 Figma 节点：
   `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=167-8735&t=HfamgFQ9W19WcfRy-4`
   节点：`167:8735`
2. 对齐校准方位弹框罗盘参考节点：
   `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=154-271&t=HfamgFQ9W19WcfRy-4`
   节点：`154:271`
3. 首次 UI 编辑前，必须先直接读取 Figma metadata、design context、screenshot；不要根据 main 文字、记忆或习惯猜 UI。
4. 如果现有 `src/assets/icons/direction-selected-arrow.svg` 可复用，可以复用；否则优先用 Tailwind/视图结构实现，不新增依赖。
5. 输出中必须说明本轮是否保留并验证现有自动化 id。已有 id 例如 `light-env-window-*`、`light-env-window-detail-*`、`light-env-facing-*`、`light-env-calibrate-button-*`、`light-env-distance-slider-*`、`light-env-direction-dialog*` 不得无故删除。

## Allowed / Forbidden Paths

Allowed paths:
- `src/components/LightEnvironmentPicker.vue`
- `src/assets/icons/*.svg`

Forbidden paths:
- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- `cloudfunctions/**`
- `scripts/**`
- `docs/**`
- `.codex/**`
- `.agents/**`

如果必须触碰 allowed_paths 以外文件，先输出 blocker，不要修改。

## Project Constraints

- `rule_refs`：`AGENTS.md:16-34`、`AGENTS.md:36-48`、`.codex/skills/dispatch-task/SKILL.md Gate A0/B2/Figma/Hard stops`。
- Framework：UniApp 3.0 + Vue 3 Composition API + JavaScript。
- Styling system：Tailwind CSS 3。常规 UI 样式优先 Tailwind utility / 项目 token / uni-ui props 或 slots。
- SCSS policy：`new_scss_policy=forbidden`，`scss_exceptions=[]`。不得新增 `.scss`，不得新增 `<style lang="scss">` 或用 scoped style 重建常规 UI。
- Component library：uni-ui (`@dcloudio/uni-ui`)。折叠面板必须优先映射到 uni-ui 组件。
- Dependency policy：`no_new_dependencies`。不得安装插件或修改依赖。
- 中文是一等公民；用户可见文案保持中文优先。
- 单文件超过 500 行时，优先在不越权的前提下做合理拆分；如果拆分需要 allowed_paths 外文件，先返回 blocker。

## Figma Direct Fetch

你必须在 ZCode 环境内直接读取 Figma：
- 主节点 `167:8735`：调用 metadata + design context + screenshot。
- 罗盘弹框节点 `154:271`：调用 metadata + design context + screenshot。
- 读取范围只限本轮相关节点，不要整文件读取。
- 结果中回传 `figma_fetch_evidence`，至少包含：`status`、`acquired_by`、`acquired_before_first_ui_edit`、`source_link`、`node_id`、`calls`、`nodes_read`、`screenshot_ref`、`variables_or_assets_used`、`unresolved`。
- `calls` 至少包含 `get_metadata`、`get_design_context`、`get_screenshot`。

## Figma Blocker Policy

如果 ZCode 当前环境没有 Figma 能力、没有权限、节点无效、screenshot/context 不足，立即输出：
`BLOCKED_ZCODE_FIGMA_UNAVAILABLE`

发生上述情况时不得修改代码，不得让 Codex main 补读视觉细节，也不得凭 main Lite、历史记忆或模型习惯猜实现。

## uni-ui Mapping Contract

首次 UI 编辑前先输出最小 `uni_ui_mapping_evidence`，然后再改代码。要求：
- `status: "completed"`
- `skill: "$uni-ui-figma-component-mapper"` 或 `policy: "uni-ui-figma-component-mapper-contract"`
- `generated_before_first_ui_edit: true`
- `install_dependency_checked: true`
- `easycom_policy: "easycom" | "manual_existing_pattern" | "not_applicable"`
- `regions` 至少覆盖：
  - 有窗折叠面板区域 -> 首选 uni-ui 折叠面板组件
  - 方位选择器区域 -> 说明使用 uni-ui / 原生 / 自定义的选择原因
  - 离窗距离区域 -> 说明 slider/native/uni-ui 的选择原因
  - 校准方位弹框罗盘指针区域 -> 说明指针实现方式和限制
- `used_components` 和 `custom_regions` 必须是数组。

## UI Scope Contract

基于直接 Figma 数据和代码搜索，输出最小 `ui_scope_map`：
- 每项包含 `node_id`、`name`、`type`、`code_candidates`、`selected_path`、`reason`、`qa_required`。
- 复用顺序：项目已有组件 -> props/slot/wrapper 扩展 -> uni-ui -> uni-app/微信原生能力 -> 手写局部 UI。
- 搜索现有 `LightEnvironmentPicker` 调用点和现有 `uni-collapse` 用法，确认 easycom/用法模式后再改。

## Style Stack Contract

输出 `style_stack_compliance`：
- `styling_system` 必须等于 `Tailwind CSS 3`。
- `tailwind_used: true`。
- `new_scss_added: false`。
- `new_dependencies: []`。
- 如因平台限制无法完全用 Tailwind/uni-ui 实现，输出 deviation/blocker，不要静默放宽约束。

## Validation Commands

请在修改后尽量执行并记录结果：
- `npm run lint -- src/components/LightEnvironmentPicker.vue`
- `npm run test:tailwind`
- `npm run build:mp-weixin:local-functions`

如果某条命令因环境或既有 unrelated dirty state 阻断，记录原始错误和归因，不要伪造通过。

## Result JSON Contract

完成或阻断后，在 ZCode 聊天里输出下面结构，外层 sentinel 必须保留。ZCode 的完成声明不是最终完成依据，Codex main 会回收真实 git diff 和测试。

<<<ZCODE_IMPLEMENTER_RESULT:zcode-light-env-20260623-001:START>>>
{
  "status": "completed | blocked",
  "changed_files_claimed": [],
  "summary": "",
  "figma_fetch_evidence": {
    "status": "success | blocked",
    "acquired_by": "zcode_glm",
    "acquired_before_first_ui_edit": true,
    "source_link": "https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=167-8735&t=HfamgFQ9W19WcfRy-4",
    "node_id": "167:8735",
    "calls": ["get_metadata", "get_design_context", "get_screenshot"],
    "nodes_read": [],
    "screenshot_ref": "",
    "variables_or_assets_used": [],
    "unresolved": []
  },
  "ui_scope_map": [],
  "style_stack_compliance": {
    "styling_system": "Tailwind CSS 3",
    "tailwind_used": true,
    "new_scss_added": false,
    "new_dependencies": []
  },
  "component_reuse_evidence": {
    "searched": [],
    "newly_created": [],
    "reason": ""
  },
  "uni_ui_mapping_evidence": {
    "status": "completed",
    "skill": "$uni-ui-figma-component-mapper",
    "generated_before_first_ui_edit": true,
    "regions": [],
    "used_components": [],
    "custom_regions": [],
    "install_dependency_checked": true,
    "easycom_policy": "easycom"
  },
  "validation_claims": {
    "lint": "",
    "tailwind": "",
    "build": "",
    "self_check": ""
  },
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:zcode-light-env-20260623-001:END>>>

<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-light-env-20260623-001:END>>>
