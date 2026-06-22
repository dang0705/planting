---
name: uni-ui-figma-component-mapper
description: "将 Figma 设计细节映射到 uni-app 官方 uni-ui 组件。根据 Figma 实现 Vue/uni-app 页面时，把视觉线索、交互、表单、列表、弹层、导航等关联到可用 uni-ui 组件、props/events 和代码骨架，避免只按像素手写 UI。"
---

# uni-ui Figma 组件映射技能

## 目标

当任务是“根据 Figma 设计实现 uni-app / Vue 页面”时，不要只把 Figma 当成像素稿。你必须把设计中的**结构、语义、交互、状态、重复模式**映射到官方 `uni-ui` 组件，并输出可落地的组件选择依据。

默认平台优先级：**微信小程序 > H5 > App**。如果任务或仓库已有更明确的平台约束，以仓库为准。

## 何时触发

用户或任务中出现以下任一情况时使用本技能：

- Figma、设计稿、节点、frame、design、UI 还原、组件匹配、设计系统、界面实现。
- uni-app、uni-ui、DCloud、Vue3、小程序页面、微信小程序页面。
- 要把 Figma 中的列表、表单、弹窗、日期选择、搜索、卡片、角标、图标、步骤条等转成代码。

## 必读资料

使用本技能时，先读取：

1. `references/01-Figma到uni-ui映射规则.md`
2. `references/02-组件索引.md`
3. `references/03-实施护栏.md`
4. 必要时用 `assets/component-map.json` 或 `scripts/match_uni_ui_component.py` 做候选组件检索。

## 工作流程

1. **提取 Figma 线索**
   - 节点名、文本、图标、布局方向、重复结构、状态层、弹层、交互注释。
   - 识别是“内容容器 / 表单 / 选择 / 列表 / 导航 / 弹层 / 状态提示 / 动效 / 数据展示”中的哪一类。

2. **优先复用组件，而不是手写外观**
   - 基础 `view/text/image/button/swiper/picker` 能稳定解决的，不强行套 `uni-ui`。
   - 但只要设计语义命中 `uni-ui` 的扩展组件，优先使用对应组件。

3. **输出候选组件排序**
   每个设计区域至少给出：
   - Figma 线索
   - 首选 uni-ui 组件
   - 备选组件
   - 选择理由
   - 关键 props / events / slots
   - 不采用组件或需自定义的原因

4. **生成代码骨架**
   - 使用 kebab-case 组件标签，如 `<uni-list>`、`<uni-forms>`、`<uni-popup>`。
   - 默认使用 `easycom`，不要在页面里手动 `import` / `components` 注册，除非仓库现有规范明确要求。
   - 若组件依赖 `sass`、`uni-icons`、子组件、平台能力，必须在实现说明中标出。

5. **落地前检查**
   - 检查仓库是否已有 `uni_modules` 或 `@dcloudio/uni-ui`。
   - Vue3 + Vite 项目通常不需要为 `@dcloudio/uni-ui` 额外加 `vue.config.js`。
   - 不要新增非官方 UI 库来替代 `uni-ui`，除非用户明确要求。

## 输出格式

实现前必须先给出一张映射表：

| Figma 区域/节点 | 视觉与交互线索 | 首选 uni-ui 组件 | 备选 | 关键 props/events | 风险/限制 |
|---|---|---|---|---|---|

然后再给代码。若组件无法覆盖设计，要明确写：`需自定义`，并说明为什么。

## 组件选择原则

- **语义优先**：选择能表达真实交互意图的组件，不按视觉相似度硬套。
- **微信小程序优先**：涉及文件选择、弹层滚动、滑动操作、动画等，必须检查小程序限制。
- **表单优先闭环**：只要有字段校验，优先 `uni-forms + uni-forms-item + 输入/选择组件`。
- **列表优先组合**：普通列表用 `uni-list`，列表底部状态用 `uni-load-more`，左滑操作用 `uni-swipe-action`。
- **弹层分流**：居中/底部/顶部弹层用 `uni-popup`，侧滑菜单用 `uni-drawer`。
- **日期分流**：展示月历/打点/范围用 `uni-calendar`；表单日期时间选择用 `uni-datetime-picker`；纯日期文本用 `uni-dateformat`。

## 禁止事项

- 不要只照 Figma 像素手写一堆 `view`，却漏掉可用 `uni-ui` 组件。
- 不要把 `uni-tag` 当数字角标用；数字/红点用 `uni-badge`。
- 不要把 `uni-popup` 当侧边抽屉用；侧滑菜单用 `uni-drawer`。
- 不要把普通下拉、级联、可输入候选框混用：`data-select`、`data-picker`、`combox` 必须按语义区分。
- 不要在没有安装或导入组件的仓库里直接使用组件而不说明依赖。
