<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-add-plant-20260624-001:START>>>

你是 ZCode 外部实现者，目标工作区是 `/Users/jay/WebstormProjects/planting`。本 prompt 通过 Codex computer-use 剪贴板粘贴发送；不要要求 main 代你改代码。完成后只输出结果 JSON，Codex main 会重新读取真实 git diff、跑测试和 QA。

## Architecture Direction

本次任务是 add-plant 页面首屏请求瘦身 + Figma UI 修正。不要重构全局请求层，不改后端，不改 schema，不改依赖。

已由 main 侧代码定位确认：

- `src/pages/add-plant/add-plant.vue` 当前 `onMounted` 中无条件调用 `userStore.ensureLogin()`、`loadPlants()`、`plantStore.getUserPlants()`。
- `src/pages/add-plant/components/PlantForm.vue` 当前 `onMounted` 会 `loadHotCities()`，无已有 careLocation 时再 `matchGpsHotCity()`，因此当第二个 swiper item 被提前挂载时会在进入页面首屏触发 `weather-http/weather/hot-cities` 和 `weather-http/weather/hot-cities/resolve`。
- `auth-user-http/auth/user` 来自 `userStore.ensureLogin() -> maybeRefreshUserInfo() -> refreshUserInfo() -> getUserById(openid)`，不是植物列表首屏必需请求。
- `plant-user-http/user-plants` 普通新增态不是首屏植物名录必需数据；编辑态预填仍需要。

接口处理方向：

1. 普通新增态首屏只保留植物名录列表请求 `plant-catalog-http/catalog/plants`。
2. 不要在普通新增首屏触发 `weather-http/weather/hot-cities`、`weather-http/weather/hot-cities/resolve`、`auth-user-http/auth/user`、`plant-user-http/user-plants`。
3. 热城列表/GPS resolve 是信息步骤“养护城市”能力，必须延后到信息步骤实际挂载或用户打开城市选择时，不能删除。
4. 登录校验仍在 AI 识别和提交前执行；不要削弱登录、AI 配额、提交、careLocation 必填校验。
5. 编辑态或明确从 URL 进入信息步骤编辑已有植物时，仍允许拉取 user-plants 进行预填。

## Implementation Contract

任务：

1. 修正 add-plant 普通新增首屏的非必要请求时机。
2. 按 Figma 节点 `164:4790` 修正 AI 拍照识别按钮 icon 和搜索框 icon，不能继续使用与设计不一致的 emoji 占位。
3. 修复底部 `add-plant-next-button` disabled 状态下小程序 button 默认边框在圆角处断裂的问题。

验收：

- 普通新增态进入 `/pages/add-plant/add-plant` 首屏时，不再触发 `weather-http/weather/hot-cities`、`weather-http/weather/hot-cities/resolve`、`auth-user-http/auth/user` 或 `plant-user-http/user-plants`。
- 首屏植物列表仍正常加载、搜索和分页。
- 进入信息步骤后，养护城市仍自动加载热城并尝试 GPS resolve；定位失败仍能手动选择城市。
- AI 识别和提交前仍会检查登录。
- Figma 指定节点中 AI 拍照识别和搜索框 icon 对齐设计。
- `选好了` disabled 按钮圆角边框不再断裂，禁用态/可点击态尺寸稳定。
- 不新增依赖，不新增 SCSS，不改后端接口/schema。

## Allowed / Forbidden Paths

Allowed paths:

- `src/pages/add-plant/add-plant.vue`
- `src/pages/add-plant/components/PlantSelectionStep.vue`
- `src/pages/add-plant/components/PlantForm.vue`

Forbidden paths:

- `cloudfunctions/**`
- `package.json`
- lockfiles
- `src/store/user.js`
- `src/api/http.js`
- `src/http-functions/**`
- `src/vue-query/**`

如果你认为必须修改 forbidden path，立即输出 blocked，不要越权改。

## Project Constraints

- Framework: UniApp 3.0 + Vue 3 Composition API。
- Styling: Tailwind CSS 3 via weapp-tailwindcss。
- Component library: uni-ui。
- Language: JavaScript。
- 小程序优先，不要按 React/Taro/Zustand 思路实现。
- `new_scss_policy=forbidden`：不得新增 `.scss`、不得新增 `<style lang="scss">`，不得用 scoped style 重建常规 UI。
- 不得新增 npm 依赖。若认为必须新增依赖，输出 blocked。
- 超过 500 行代码必须拆分；本任务应保持局部小改。
- 中文是一等公民，产品文案保持中文。

Relevant rule refs:

- `AGENTS.md §2` Tailwind 优先、禁止削弱业务约束、禁止绕过 lint/test/build、GLM/Figma 截图限制、风险需上报。
- `AGENTS.md §3` UniApp 3.0、Vue 3、Tailwind CSS 3、uni-ui、Pinia、Vite、微信小程序优先。
- `.codex/skills/dispatch-task/SKILL.md Gate B2/Gate C/Gate D` ZCode 外部实现、回收 diff、QA 与 Completion Gate。

## UI Scope Contract

- 只处理 add-plant 页面的首屏请求时机、两个 icon、底部下一步按钮 disabled 视觉。
- 不要改首页、诊断页、profile 页或全局 store。
- 不要改业务字段结构，不要新增兼容 adapter。
- 不要删除 `PlantForm` 的热城/定位能力；只控制它何时触发。

## Style Stack Contract

- 优先 Tailwind utility 和已有组件能力。
- button 默认边框断裂通常来自微信小程序 button `::after` 默认边框；优先用现有 Tailwind/weapp-tw 可工作的局部 class 处理，例如项目中已有 `after:border-0` 用法，可参考但不要全局重置。
- icon 不要使用当前 emoji 占位；根据 Figma 直接读取结果，优先使用 uni-ui/uni-icons 或小程序兼容的内联安全 SVG/image 方案。不得新增 icon 库。

## Figma Direct Fetch

Figma link:

`https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=164-4790&t=SEL67AU3GnnApQrF-4`

Node id: `164:4790`

你必须在 ZCode 环境中直接读取 Figma metadata + design context，并按你的工具能力获取 screenshot/截图来确认 AI 拍照识别按钮和搜索框 icon。不得依赖 main 的转述猜 UI。

注意：当前 ZCode 模型显示为 GLM-5.2。若你的运行时规则禁止 GLM 在读取 Figma metadata/design context 后继续调用 get_screenshot/截图，而用户未授权截图，请不要猜测；输出 blocker，并说明 `BLOCKED_ZCODE_FIGMA_UNAVAILABLE` 或 `BLOCKED_ZCODE_SCREENSHOT_POLICY_CONFLICT`。

## Figma Blocker Policy

以下情况必须 blocked，不得猜：

- 无法打开 Figma link 或节点 `164:4790`。
- 无法获取设计上下文，或 icon 细节不足以判断。
- Figma 权限不足。
- GLM/Figma 截图规则冲突导致无法获得足够视觉事实。

blocked 时不要改 UI。

## uni-ui Mapping Contract

首次 UI 编辑前输出最小 `uni_ui_mapping_evidence`，至少包含：

- Figma 区域/节点。
- 视觉与交互线索。
- 首选 uni-ui / uni-icons / 既有 assets / 内联 SVG 方案。
- 备选方案。
- 采用或自定义决策。
- 风险或限制。

## Validation Commands

实现后自测：

```bash
npm run lint
npm run test:ci
npm run build:mp-weixin:ci
```

如果本轮没有部署云端，端上验收需要完整 LAN 本地函数 flow，不能只用 backend curl 或 gateway health 代替：

```bash
npm run dev:mp-weixin:local-functions:lan
```

然后由 QA 在小程序运行时验证普通新增首屏请求和信息步骤请求时机。

## Result JSON Contract

完成后在 ZCode 聊天输出以下结构，Codex main 会重新验证真实 diff，不会只信你的声明：

```text
<<<ZCODE_IMPLEMENTER_RESULT:zcode-add-plant-20260624-001:START>>>
{
  "agent_identity": {
    "agent_type": "zcode_external",
    "dispatch_run_id": "zcode-add-plant-20260624-001"
  },
  "status": "completed | blocked",
  "changed_files_claimed": [],
  "summary": "",
  "request_timing_evidence": {
    "normal_add_first_screen": "",
    "info_step_weather_behavior": "",
    "edit_mode_user_plants_behavior": ""
  },
  "figma_fetch_evidence": {
    "metadata": "",
    "design_context": "",
    "screenshot_or_policy": ""
  },
  "uni_ui_mapping_evidence": [],
  "style_stack_compliance": {
    "tailwind_used": true,
    "new_scss_added": false,
    "new_dependency_added": false
  },
  "component_reuse_evidence": "",
  "validation_claims": {
    "npm_run_lint": "",
    "npm_run_test_ci": "",
    "npm_run_build_mp_weixin_ci": ""
  },
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:zcode-add-plant-20260624-001:END>>>
```

<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-add-plant-20260624-001:END>>>
