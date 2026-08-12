thread_id: 019fae02-5148-7c83-90eb-19cd48bcc076
updated_at: 2026-08-02T11:00:33+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/29/rollout-2026-07-29T21-13-35-019fae02-5148-7c83-90eb-19cd48bcc076.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# 空气交换评估组件从业务卡片重构为通用可复用卡片

Rollout context: 在 `/Users/jay/WebstormProjects/planting` 中迭代独立空气交换评估 UI，并对照 Figma 节点 `450:1537`。用户要求组件符合设计稿、可扩展，且每次修改后必须进行实际 review 与验证。

## Task 1: 空气交换选项卡通用化重构

Outcome: partial

Preference signals:

- 用户指出“开窗和新风的外壳为什么不封装一下选项卡？难道以后再增加一个选项卡还需要定义一遍UI？” -> 类似场景应优先抽取通用组件，页面只传内容和状态，不复制卡片外壳。
- 用户明确要求“我希望是更通用的card” -> 通用卡片不应耦合空气交换业务、`AirflowScene`、标题或描述等字段，应通过 slot 组合内容。
- 用户指出“高度h-108一拿到内容就丢失，card不应该写死高度，而是应该有内容撑出高度” -> 容器组件不得写死业务内容高度；让 slot 内容或 SVG 自身宽高比撑开布局。
- 用户此前多次纠正选中态：未选卡片保持白底，选中态使用 `#e8f5e9` 高亮和品牌绿色边框 -> 修改前必须对照实际 Figma 节点，不能仅凭文字推断视觉状态。

Key steps:

- 新增 `src/components/SelectableCard.vue`，只负责卡片外壳、选中态、禁用态、点击事件和 `id`。
- `AirExchangeAssessment.vue` 改为使用三个 `SelectableCard` 实例，通过 slot 传入场景图、标题、描述和“不确定”内容。
- 删除旧的业务耦合 `AirExchangeOptionCard.vue` 使用方式，并将自动化 id 映射文档更新到 `SelectableCard.vue`。
- 移除卡片内部固定 `h-[108px]`；场景 SVG 内容负责撑开高度。
- 保留 Figma 对照确认的状态样式：未选白底，选中 `#e8f5e9` + `border-brand`。

Failures and how to do differently:

- 之前误删了所有卡片背景，导致未选白底和选中高亮都消失；用户纠正后通过 `get_design_context` 读取 `450:1537`，确认设计稿的实际状态再恢复。未来视觉修改必须先读取具体 Figma 节点并核对未选/选中两种状态。
- 一次测试断言把三个卡片误算为两个，修正断言后通过；测试应覆盖组件抽取后的真实承载位置，而不是依赖旧组件结构。
- 组件测试、动画测试、数据契约测试和格式检查通过，但 `npm run build:mp-weixin:ci` 仍失败，报错为 `[vite:css-post] <css input>:1611:32: Unknown word var`。该失败与当前卡片重构未建立直接因果，现场指向工作区已有 `tailwind.config.js` 修改；未来不得把构建称为通过，需先定位并恢复/修复工作区配置后重新构建。

Reusable knowledge:

- 通用选择卡的稳定职责是：`id`、`selected`、`disabled`、`@click`/`select` 事件和 slot 内容；不要让它知道具体业务场景。
- Figma 节点 `450:1537` 已验证：卡片未选中为白底，选中为浅绿色 `#e8f5e9` 背景加品牌绿色边框；图例区域另有独立浅色背景。
- 当前独立空气交换评估仅评估室内外空气交换，不应混入风扇局部气流、空调直吹或黄叶诊断主流程。

References:

- `/Users/jay/WebstormProjects/planting/src/components/SelectableCard.vue`
- `/Users/jay/WebstormProjects/planting/src/components/AirExchangeAssessment.vue`
- `/Users/jay/WebstormProjects/planting/test/unit/frontend/components/SelectableCard.mjs`
- `/Users/jay/WebstormProjects/planting/test/unit/frontend/components/AirExchangeAssessment.mjs`
- Figma: `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=450-1537`
- Passed: `node test/unit/frontend/components/SelectableCard.mjs`, `node test/unit/frontend/components/AirExchangeAssessment.mjs`, `node test/unit/frontend/components/AirflowScene.mjs`, `node test/unit/frontend/utils/air-exchange-evidence.mjs`, `git diff --check`.
- Build failure: `npm run build:mp-weixin:ci` -> `Unknown word var`.
