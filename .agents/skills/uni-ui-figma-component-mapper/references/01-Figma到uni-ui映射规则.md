# Figma 到 uni-ui 映射规则

## 1. 先读设计语义，不要先写代码

Codex 拿到 Figma 设计后，必须先把页面拆成可命名区域：

| 区域类型 | 识别线索 | 典型 uni-ui 组件 |
|---|---|---|
| 顶部导航 | 标题、返回、右侧操作、固定头部 | `uni-nav-bar` |
| 搜索 | 放大镜、placeholder、取消、清除 | `uni-search-bar` |
| 列表 | 重复行、右箭头、副标题、缩略图、switch、badge | `uni-list` / `uni-list-item` |
| 长列表分页 | 底部“加载中/没有更多” | `uni-load-more` |
| 卡片 | 独立内容块、圆角、阴影、封面、标题摘要 | `uni-card` |
| 表单 | label、输入、校验、错误提示、提交 | `uni-forms` + `uni-forms-item` |
| 输入 | 清除按钮、前后图标、多行、密码 | `uni-easyinput` |
| 单/多选 | radio/checkbox/chip/tag 选项 | `uni-data-checkbox` |
| 下拉 | 单层 dropdown/select | `uni-data-select` |
| 可输可选 | input + 候选项 | `uni-combox` |
| 级联 | 省市区、层级分类、多列选择 | `uni-data-picker` |
| 日期 | 月历、范围、打点 | `uni-calendar` |
| 日期时间 | 日期时间/范围表单选择 | `uni-datetime-picker` |
| 弹层 | 遮罩、底部弹层、居中确认、顶部消息 | `uni-popup` |
| 侧滑面板 | 左/右侧滑菜单或筛选 | `uni-drawer` |
| 宫格 | 3/4/5 列功能入口 | `uni-grid` |
| 栅格 | 24 栅格、响应式列布局 | `uni-row` / `uni-col` |
| 步骤 | 1/2/3 步、流程进度、时间线 | `uni-steps` |
| 轮播点 | banner 下方圆点/条/数字指示 | `uni-swiper-dot` |
| 左滑操作 | 列表行滑出删除/编辑 | `uni-swipe-action` |
| 标签 | 状态 chip、分类标签、胶囊 | `uni-tag` |
| 数字角标 | 未读红点、右上数字、99+ | `uni-badge` |
| 图标 | 内置语义图标 | `uni-icons` |
| 公告 | 顶部黄色提示、滚动公告 | `uni-notice-bar` |
| 评分 | 星级评价、半星 | `uni-rate` |
| 数量 | `- 1 +` 步进器 | `uni-number-box` |
| 表格 | 行列、表头、结构化数据 | `uni-table` |
| 面包屑 | 路径层级 | `uni-breadcrumb` |
| 标题栏 | 区块标题、副标题、竖线装饰 | `uni-section` |
| 章节标题 | h1/h2/h3、页面标题统计 | `uni-title` |
| Tooltip | hover 气泡、问号解释 | `uni-tooltip` |
| 动效 | fade/slide/scale 进出场 | `uni-transition` |

## 2. 组件候选评分

每个 Figma 区域按 0-6 分给候选组件排序：

- 语义命中：0-3 分。组件用途是否正好匹配设计意图。
- 交互命中：0-2 分。组件是否内置所需事件、状态或手势。
- 实施成本：0-1 分。是否能少写自定义样式/逻辑，且平台风险低。

只有最高分组件能作为首选。若两个组件同分，按“平台稳定性 > 代码简洁度 > 视觉还原度”排序。

## 3. 常见歧义决策

### tag vs badge

- `uni-tag`：分类、状态、筛选 chip，可点击切换。
- `uni-badge`：数字、红点、未读数、右上角数量。

### card vs list vs group

- `uni-card`：独立完整信息块，是一个内容入口。
- `uni-list`：重复行或设置项。
- `uni-group`：只是视觉分组和间距。

### calendar vs datetime-picker vs dateformat

- `uni-calendar`：月历视图、日期范围、打点、签到。
- `uni-datetime-picker`：表单选择日期/日期时间/范围。
- `uni-dateformat`：只负责日期文本格式化。

### data-select vs data-picker vs data-checkbox vs combox

- `uni-data-checkbox`：少量可见单选/多选，可呈现 button/tag 风格。
- `uni-data-select`：单层下拉，选项较多。
- `uni-data-picker`：多层级联，如省市区、分类树。
- `uni-combox`：可输入也可选择候选项。

### popup vs drawer

- `uni-popup`：底部、顶部、居中、消息、确认、分享弹层。
- `uni-drawer`：左/右侧滑菜单或筛选面板。

### grid vs row/col

- `uni-grid`：功能入口宫格，语义是菜单/分类。
- `uni-row`/`uni-col`：布局栅格，语义是列布局。

### search-bar vs easyinput

- `uni-search-bar`：搜索动作，有 confirm/cancel/clear。
- `uni-easyinput`：普通表单输入。

## 4. 输出合同

实现前必须输出：

| Figma 区域/节点 | 视觉与交互线索 | 首选组件 | 备选组件 | props/events/slots | 风险/限制 |
|---|---|---|---|---|---|

实现后必须说明：

- 哪些区域使用了 `uni-ui`。
- 哪些区域没有使用 `uni-ui`，原因是什么。
- 哪些组件需要确认安装/导入。
- 微信小程序端需要重点验收的交互。

## 5. 示例

### 示例 A：植物诊断结果页

| Figma 区域 | 线索 | 首选组件 | 备选 | 关键配置 | 风险 |
|---|---|---|---|---|---|
| 顶部标题 | 返回 + “诊断结果” + 保存 | `uni-nav-bar` | 原生导航 | `left-icon`, `right-text`, `@clickLeft`, `@clickRight` | 字体大小不能直接通过 props 改 |
| 结果摘要 | 白色圆角块，标题、摘要、操作 | `uni-card` | 自定义 view | `title`, `sub-title`, slots | App-NVUE 阴影限制 |
| 风险标签 | “需浇水”“光照不足”胶囊 | `uni-tag` | 自定义 view | `text`, `type`, `circle` | 数字角标不要误用 tag |
| 追问题包 | 多个选项 chip | `uni-data-checkbox` | button 组 | `mode=tag`, `localdata`, `v-model` | 高度定制时自定义 |
| 补证上传 | 图片宫格上传 | `uni-file-picker` | 自写 upload | `file-mediatype=image`, `limit`, `mode=grid` | 微信走 `wx.chooseMessageFile()` |
| 底部说明弹层 | 底部 sheet | `uni-popup` | drawer | `type=bottom`, `ref.open()` | 弹出后滚动需额外处理 |

### 示例 B：养护记录列表

| Figma 区域 | 线索 | 首选组件 | 备选 | 关键配置 | 风险 |
|---|---|---|---|---|---|
| 搜索植物 | 放大镜、placeholder、取消 | `uni-search-bar` | easyinput | `v-model`, `@confirm`, `@clear` | 普通表单输入勿用 |
| 记录行 | 缩略图、标题、副标题、右箭头 | `uni-list` | card | `thumb`, `title`, `note`, `showArrow` | 富内容需 slot |
| 左滑删除 | swipe delete | `uni-swipe-action` | 长按菜单 | `right-options`, `@click` | 长列表慎用 autoClose |
| 底部状态 | 没有更多 | `uni-load-more` | 自定义 text | `status=noMore` | 仅列表底部使用 |
