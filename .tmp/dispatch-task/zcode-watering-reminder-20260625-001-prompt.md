<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-watering-reminder-20260625-001:START>>>
# ZCode External Implementer Handoff

本 prompt 通过剪贴板粘贴到 ZCode 当前会话。你是外部实现者，只负责按合同改代码。不要扩大范围。完成后聊天输出 Result JSON；最终完成由 Codex 重新读取 git diff、测试和 QA 判定。

## Architecture Direction
- 目标：实现首页植物卡水滴 icon 的浇水提醒弹框，并把“下次浇水日期”计算收口到后端 `buildWateringPlanner`。
- 核心数据语义：`plant.lastWatered` 在本任务中不是单一日期，而是最近 10 天内 1 次及以上浇水事件集合，用来代表浇水频率输入。
- 算法方向：`buildWateringPlanner` 以属级 `watering.freq / intervalDays` 为基线，叠加最近 10 天实际浇水次数、最近一次浇水距今天数、历史/预报天气偏湿偏干信号，输出 `nextWaterDate`。
- 初始状态：`plant.lastWatered` 为空时，不要臆造 `nextWaterDate`；弹框应提示选择最近 10 天浇水记录。
- 添加至日历成功后：将选择器输出的最近 10 天浇水事件集合写回 `plant.lastWatered` 语义输入，并写回 planner 产出的 `nextWater`；同时创建 water 提醒。
- 如果现有 `last_watered` 数据库字段无法安全承载事件集合，立即输出 blocker；不得强行把数组写进日期类型字段。

## Implementation Contract
- Objective: 实现首页植物卡浇水提醒弹框：用最近 10 天浇水事件集合驱动 `buildWateringPlanner` 计算 `nextWaterDate`，并在添加日历后写回植物浇水记录与提醒。
- Acceptance:
  - 首页 `pages/index/index` 植物卡水滴 icon 打开本页浇水提醒底部弹框，不再直接跳转日历页。
  - 弹框包含上次浇水入口、建议下次浇水 Summary、添加至日历主操作；点击上次浇水入口打开最近 10 天多选浇水日期选择器。
  - 日期选择器复用现有 `care-behavior-timeline` 的多日期浇水事件输出，不新增第三方日期/日历依赖。
  - planner 输入是最近 10 天 `watering_events_10d` 事件集合，不是单一 `lastWateredAt`。
  - `buildWateringPlanner` 输出 `nextWaterDate`、`nextWaterWindow`、`nextWaterReason`。
  - 添加至日历成功后写回植物浇水事件集合到 `plant.lastWatered` 语义输入，并写回 `nextWater`，同时用 `plantingStore.setPlantReminder` 创建 water 提醒。
  - 下线或绕开 `src/store/plants.js` 中旧的前端平均值 `nextWater` 公式，不再作为业务事实源。
  - 不新增依赖，不新增 SCSS，不改 SQL/schema，不削弱现有提醒、植物更新或诊断链路约束。

## Allowed / Forbidden Paths
Allowed:
- `src/pages/index/**`
- `src/components/CareBehaviorTimeline.vue`
- `src/components/care-behavior-timeline/**`
- `src/utils/care-behavior-timeline/**`
- `src/utils/care-behavior-timeline.js`
- `src/store/plants.js`
- `src/store/planting.js`
- `cloudfunctions/diagnose-http/utils/environment-context-v7.js`
- `cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js`
- `cloudfunctions/layer/utils/plant-knowledge.js`
- `cloudfunctions/plant-user-http/**`
- `test/unit-test/test-environment-care-context.mjs`
- `test/unit-test/test-care-behavior-timeline.mjs`
- `test/unit-test/test-pinia.mjs`

Forbidden:
- `package.json`, lockfiles
- `scripts/sql/**`, `SQL-cvs/**`
- `docs/**`, `.codex/**`, `.agents/**`
- `cloudfunctions/**/package.json`
- Any dependency install, schema migration, paid CloudBase feature, or unrelated refactor

## Project Constraints
- framework: UniApp 3.0 + Vue 3 Composition API
- styling_system: Tailwind CSS 3 via weapp-tailwindcss
- new_scss_policy: forbidden
- scss_exceptions: []
- component_library: uni-ui
- dependency_policy: no new dependencies; if dependency/schema is required, output blocked instead of installing or migrating.
- rule_refs:
  - `AGENTS.md §2`: Tailwind 优先、禁止绕过 lint/test/build、不得削弱业务约束、研发期新逻辑完整替代旧逻辑、风险需上报
  - `AGENTS.md §3`: UniApp 3.0、Vue 3、Tailwind CSS 3、uni-ui、Pinia、Vite、微信小程序优先

## Validation Commands
必须在可用时运行：
- `npm run lint`
- `npm run test:ci`
- `node test/unit-test/test-environment-care-context.mjs`
- `node test/unit-test/test-care-behavior-timeline.mjs`
- `npm run build:mp-weixin:ci`

如果命令不存在或环境阻断，Result JSON 中写 `not_applicable` 或 `blocked` 和准确原因。

## UI Scope Contract
- 先搜索并复用现有 `CareBehaviorTimeline` 与 `src/components/care-behavior-timeline/*`，不要复制一套日期选择器。
- 首页弹框可以新增局部组件，但必须放在 allowed paths 内，并用 Tailwind utility 组织样式。
- 不要把诊断专用文案/id 泄漏到首页弹框；如复用组件需要更通用 props，最小改动即可。
- 添加至日历使用现有项目提醒能力（`plantingStore.setPlantReminder`）或项目内已有能力；不得引入系统日历插件。

## Style Stack Contract
- Tailwind 项目中，新增 UI 默认使用 Tailwind utility、项目 token、uni-ui props/slots。
- 禁止新增 `.scss`、`<style lang="scss">` 或用 scoped style 重建常规 UI。
- 微信小程序 button 默认边框/after 需要按现有项目方式处理，例如 `after:border-0`，但不要做无关样式重构。

## Figma Direct Fetch
你必须在 ZCode 内直接获取 Figma metadata + design context + screenshot，再进行 UI 编辑。不要依赖 main 的描述猜 UI。

Primary Figma link:
https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=263-53&t=fgdc3suDpt8953dW-4
Primary node id: `263:53`

Second state Figma link:
https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=282-331&t=fgdc3suDpt8953dW-4
Second node id: `282:331`

必须把两个状态都作为验收目标：
- state 1: 点击首页植物卡水滴后的浇水提醒底部弹框。
- state 2: 点击上次浇水入口后唤起最近 10 天多选日期选择器。

Result JSON 必须包含 `figma_fetch_evidence`，说明你在 ZCode 内读取了两个 node 的 metadata/context/screenshot。

## Figma Blocker Policy
如果 ZCode 当前环境没有 Figma 能力、没有权限、节点无效或 context/screenshot 不足，立即输出 `BLOCKED_ZCODE_FIGMA_UNAVAILABLE`，不得根据 main Lite、记忆或猜测实现 UI。

## uni-ui Mapping Contract
因为 component_library=uni-ui 且存在 Figma link，你必须在首次 UI 编辑前输出 `uni_ui_mapping_evidence`：Figma 区域/节点、视觉与交互线索、首选 uni-ui 组件、备选、采用/自定义决策、原因、风险/限制。不得先手写像素 UI。

## Result JSON Contract
完成后输出：
<<<ZCODE_IMPLEMENTER_RESULT:zcode-watering-reminder-20260625-001:START>>>
{
  "status": "completed | blocked",
  "changed_files_claimed": [],
  "summary": "",
  "figma_fetch_evidence": {
    "primary_node": "",
    "second_node": "",
    "metadata": "",
    "design_context": "",
    "screenshot": ""
  },
  "style_stack_compliance": {
    "tailwind_used": true,
    "new_scss_added": false,
    "new_dependency_added": false
  },
  "component_reuse_evidence": {
    "care_behavior_timeline_reused": true,
    "notes": ""
  },
  "uni_ui_mapping_evidence": {},
  "validation_claims": {
    "commands": []
  },
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:zcode-watering-reminder-20260625-001:END>>>

注意：你在聊天里说完成不等于最终完成。Codex 会重新读取真实 git diff、测试和 QA。
<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-watering-reminder-20260625-001:END>>>
