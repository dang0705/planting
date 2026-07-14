# 前端自动化 id 与微信开发者工具验收规则

## 1. 定位

本文件维护小程序前端的稳定 `id` 契约、操作映射和 QA 自动化派发规则。

## 2. id 命名规则

1. `id` 必须稳定、语义清楚，用于自动化定位和用户可见状态断言。
2. 动态 `id` 只允许使用稳定业务 key，例如 `plant.id`、`slotType`、`questionId`、`optionId`、`record._id`。
3. 深链或历史适配页面若上游数据缺失稳定 key，可以显式写入 fallback 契约，例如 `questionIndex`、`optionKey`、`optionIndex`；QA 使用前必须按文档确认 fallback 规则。
4. 禁止把 `openid`、token、CloudBase 环境密钥、完整 `diagnosisSessionId`、route debug key、prompt、模型原始返回写进 `id`。
5. 自动化不得依赖中文文案、Tailwind class、页面层级顺序或截图坐标作为首选定位方式。
6. 开发/自动化辅助入口必须标明为辅助入口，不能单独作为真实用户路径验收通过证据。

## 3. 元素 id 映射（按页面 / 模块 / 功能）

按下方结构读取可直接拿到特定范围，无需全量加载。

- 页面/模块
  - 首页（index）：`src/pages/index/index.vue`
  - 植物详情：`src/pages/plant-detail/plant-detail.vue`
  - 诊断弹窗（组件）：`src/components/DiagnosePopup.vue`
  - AI 流程弹窗（组件）：`src/components/AIStreamDialog.vue`
  - 养护时间线（组件）：`src/components/CareBehaviorTimeline.vue`
  - 独立问诊页：`src/pages/diagnose/follow-up.vue`
  - 历史结果页：`src/pages/diagnose/diagnose.vue`
  - 个人中心：`src/pages/profile/profile.vue`
  - 首页卡片组件：`src/pages/index/components/PlantCard.vue`
  - 浇水提醒弹框：`src/pages/index/components/WateringReminderSheet.vue`
  - 天气头部组件：`src/components/HeaderWeatherInfo.vue`
  - 独立浇水建议页：`src/pages/watering-advisor/watering-advisor.vue`

### 3.1 首页（index）

| 功能模块       | 文件                                       | 稳定 id                                | 操作 / 断言                            |
| -------------- | ------------------------------------------ | -------------------------------------- | -------------------------------------- |
| 天气位置信息   | `src/components/HeaderWeatherInfo.vue`     | `header-weather-location-button`       | 点击刷新定位 / 天气                    |
| 天气缓存开关   | `src/components/HeaderWeatherInfo.vue`     | `header-weather-cache-toggle`          | 点击切换天气缓存                       |
| 进入诊断入口   | `src/pages/index/index.vue`                | `diagnose-entry-button-{plant.id}`     | 点击打开诊断弹窗                       |
| 浇水提醒入口   | `src/pages/index/components/PlantCard.vue` | `plant-card-reminder-{plant.id}-water` | 点击打开浇水提醒弹框；断言水滴提醒状态 |
| 主页历史记录项 | `src/pages/index/index.vue`                | `index-diagnose-record-{record._id}`   | 点击查看历史结果                       |

### 3.2 植物详情

| 功能模块 | 文件                                      | 稳定 id                        | 操作 / 断言      |
| -------- | ----------------------------------------- | ------------------------------ | ---------------- |
| 诊断入口 | `src/pages/plant-detail/plant-detail.vue` | `plant-detail-diagnose-button` | 点击打开诊断弹窗 |

### 3.3 诊断弹窗（`DiagnosePopup.vue`）

#### A. 主流程与上传

| 功能模块                 | 文件                               | 稳定 id                                             | 操作 / 断言                                                               |
| ------------------------ | ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| 弹窗根容器               | `src/components/DiagnosePopup.vue` | `diagnose-popup-panel`                              | 断言弹窗已打开                                                            |
| 弹窗滚动内容             | `src/components/DiagnosePopup.vue` | `diagnose-popup-scroll`                             | 断言主内容可见                                                            |
| 主上传阶段               | `src/components/DiagnosePopup.vue` | `diagnose-upload-stage`                             | 断言处于开始诊断前                                                        |
| 0 模型 picker 控件       | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-picker-control`         | 开发/自动化时选择模拟症状类                                               |
| 0 模型 picker 展示容器   | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-picker`                 | 断言当前选中项展示                                                        |
| 0 模型自动化快捷选择     | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-option-{classKey}`      | 自动化优先点击；黄叶为 `diagnose-dev-symptom-class-option-yellowing_mode` |
| 无图症状模式正式快捷入口 | `src/components/DiagnosePopup.vue` | `3ef72261--diagnose-dev-symptom-class-quick-select` | 正式无图症状模式直接诊断入口；点击后调用 `/diagnosis/question/start`      |
| 0 模型清空               | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-clear-button`           | 清除模拟症状类                                                            |
| 主图上传槽位容器         | `src/components/DiagnosePopup.vue` | `diagnose-upload-slot-{slotType}`                   | 断言槽位存在                                                              |
| 主图上传按钮             | `src/components/DiagnosePopup.vue` | `diagnose-upload-{slotType}-button`                 | 点击选择图片                                                              |
| 主图数量                 | `src/components/DiagnosePopup.vue` | `diagnose-upload-count`                             | 断言上传数量                                                              |
| 提交诊断                 | `src/components/DiagnosePopup.vue` | `diagnose-submit-button`                            | 点击提交主诊断                                                            |

#### B. 结果展示

| 功能模块     | 文件                               | 稳定 id                              | 操作 / 断言             |
| ------------ | ---------------------------------- | ------------------------------------ | ----------------------- |
| 结果阶段容器 | `src/components/DiagnosePopup.vue` | `diagnose-result-stage`              | 断言诊断已有结果        |
| 当前结论     | `src/components/DiagnosePopup.vue` | `diagnose-result-current-conclusion` | 断言结论标题 / 摘要可见 |
| 处理建议     | `src/components/DiagnosePopup.vue` | `diagnose-result-action-advice`      | 断言行动建议可见        |
| 暂时不要做   | `src/components/DiagnosePopup.vue` | `diagnose-result-avoid-advice`       | 断言避免项可见          |

#### C. 追问流程

| 功能模块            | 文件                               | 稳定 id                                                           | 操作 / 断言        |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------- | ------------------ |
| 问诊容器            | `src/components/DiagnosePopup.vue` | `diagnose-result-followup-required`                               | 断言进入追问阶段   |
| 问诊问题卡          | `src/components/DiagnosePopup.vue` | `diagnose-followup-question-{questionId}`                         | 断言当前问题可见   |
| 问诊选项            | `src/components/DiagnosePopup.vue` | `diagnose-followup-option-{questionId}-{optionId}`                | 点击回答选项       |
| 追问上一题 / 下一题 | `src/components/DiagnosePopup.vue` | `diagnose-followup-prev-button` / `diagnose-followup-next-button` | 导航问诊步骤       |
| 补图区域            | `src/components/DiagnosePopup.vue` | `diagnose-followup-image-section`                                 | 断言补图入口可见   |
| 补图上传槽位        | `src/components/DiagnosePopup.vue` | `diagnose-followup-upload-slot-{slotType}`                        | 断言补图槽位存在   |
| 补图上传按钮        | `src/components/DiagnosePopup.vue` | `diagnose-followup-upload-{slotType}-button`                      | 点击补图           |
| 提交补图            | `src/components/DiagnosePopup.vue` | `diagnose-followup-image-submit-button`                           | 提交补图诊断       |
| 重置 / 完成         | `src/components/DiagnosePopup.vue` | `diagnose-reset-button` / `diagnose-finish-button`                | 重新开始或关闭弹窗 |

### 3.4 AIStreamDialog（诊断前确认）

| 功能模块        | 文件                                | 稳定 id                    | 操作 / 断言              |
| --------------- | ----------------------------------- | -------------------------- | ------------------------ |
| AI 诊断确认弹窗 | `src/components/AIStreamDialog.vue` | `ai-stream-dialog`         | 断言 AI 诊断过程弹窗出现 |
| AI 诊断确认按钮 | `src/components/AIStreamDialog.vue` | `ai-stream-confirm-button` | 点击进入问诊             |
| AI 诊断取消按钮 | `src/components/AIStreamDialog.vue` | `ai-stream-cancel-button`  | 点击取消继续             |

### 3.5 浇水提醒弹框

| 功能模块       | 文件                                                   | 稳定 id                             | 操作 / 断言          |
| -------------- | ------------------------------------------------------ | ----------------------------------- | -------------------- |
| 弹框基础节点   | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-sheet`           | 断言弹框打开         |
| 保存提醒按钮   | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-confirm-button`  | 点击添加到手机日历   |
| 已保存状态回显 | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-saved-state`     | 断言已保存提醒显示   |
| 已保存下次浇水 | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-saved-next-time` | 断言下次浇水建议显示 |
| 已保存原因说明 | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-saved-reason`    | 断言原因回显可见     |

### 3.6 养护时间线

| 功能模块         | 文件                                      | 稳定 id                                                | 操作 / 断言                                                    |
| ---------------- | ----------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| 时间线卡片       | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-timeline-{questionId}`         | 断言最近 10 天养护行为时间线可见                               |
| 养护日期格       | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-date-{yyyy-mm-dd}`             | 断言时间线 21 格（D-10~D10）窗口渲染；超出窗口或未来置灰不可选 |
| 浇水 marker      | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-water-{yyyy-mm-dd}`            | 断言指定日期浇水 marker；展示型入口，非直接 toggle 入口        |
| 施肥 marker      | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-fertilize-{yyyy-mm-dd}`        | 断言指定日期施肥 marker；展示型入口，非直接 toggle 入口        |
| 光照 marker      | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-light-{yyyy-mm-dd}`            | 断言指定日期强光 marker；展示型入口，非直接 toggle 入口        |
| 浇水 action chip | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-action-water-{yyyy-mm-dd}`     | 点击 / 断言指定日期浇水操作 chip                               |
| 施肥 action chip | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-action-fertilize-{yyyy-mm-dd}` | 点击 / 断言指定日期施肥操作 chip                               |
| 光照 action chip | `src/components/CareBehaviorTimeline.vue` | `diagnose-care-behavior-action-light-{yyyy-mm-dd}`     | 点击 / 断言指定日期光照操作 chip（toggle 入口）                |

### 3.7 独立问诊页（follow-up）

| 功能模块        | 文件                               | 稳定 id                                                                                              | 操作 / 断言                                                 |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 页面根容器      | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page`                                                                             | 断言深链问诊页加载                                          |
| 题卡            | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page-question-card-{questionId 或 questionIndex}`                                 | 断言当前题可见；优先 `questionId`，缺失时用 `questionIndex` |
| 选项            | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page-option-{questionId 或 questionIndex}-{optionId 或 optionKey 或 optionIndex}` | 点击回答选项；优先 `questionId/optionId`，缺失时按 fallback |
| 上一题 / 下一题 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page-prev-button` / `diagnose-followup-page-next-button`                          | 导航独立问诊步骤                                            |
| 完成状态卡      | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-result-card`                                                                      | 断言问诊完成状态可见；不是 outcome 展示区域                 |
| 结论区域        | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-result-outcomes`                                                                  | 唯一 outcome 展示区域，断言 1-N 个 outcomes 平铺展示        |
| 行动建议        | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-result-action-advice`                                                             | 断言建议按 outcome 对应展示                                 |
| 简版完成态卡    | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-outcome-card`                                                                     | 断言没有收敛明细时的完成态可见                              |
| 简版处理建议    | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-outcome-action-advice`                                                            | 断言简版完成态处理建议可见                                  |
| 简版暂时不要做  | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-outcome-avoid-advice`                                                             | 断言简版完成态避免项可见                                    |

### 3.8 历史结果页

| 功能模块     | 文件                              | 稳定 id                              | 操作 / 断言              |
| ------------ | --------------------------------- | ------------------------------------ | ------------------------ |
| 结果页根容器 | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page`              | 断言只读结果页加载       |
| 结论列表     | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page-outcome-list` | 断言历史结果可见         |
| 空态         | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page-empty`        | 断言无历史结果时空态可见 |
| 返回首页按钮 | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page-home-button`  | 点击返回首页             |

### 3.9 个人中心

| 功能模块   | 文件                            | 稳定 id                              | 操作 / 断言      |
| ---------- | ------------------------------- | ------------------------------------ | ---------------- |
| 历史入口   | `src/pages/profile/profile.vue` | `profile-diagnose-history-view-all`  | 点击进入诊断历史 |
| 历史记录项 | `src/pages/profile/profile.vue` | `profile-diagnose-record-{item._id}` | 点击查看历史结果 |

### 3.10 独立浇水建议页

| 功能模块             | 文件                                                          | 稳定 id                                        | 操作 / 断言                                            |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| 步骤切换 swiper      | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-swiper`                      | 断言当前步骤；滑动切换步骤                             |
| 从我的植物选入口     | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-my-plants-entry`             | 点击在页内打开"我的植物"列表视图                       |
| 我的植物列表返回按钮 | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-my-plants-back`              | 点击返回来源选择视图                                   |
| 我的植物列表容器     | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-my-plants-list`              | 断言我的植物列表视图可见                               |
| 我的植物卡片项       | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-my-plant-card-{plant.id}`    | 点击选中该植物；断言选中态显示                         |
| 我的植物确认下一步   | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-my-plants-confirm-button`    | 点击确认选中植物并进入盆型步骤                         |
| 搜索植物输入框       | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-search-input`                | 输入 / 确认搜索植物种类                                |
| 清空搜索             | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-search-clear`                | 点击清空搜索关键词                                     |
| 植物结果行           | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-plant-item-{id}`             | 点击选择植物种类                                       |
| 加载更多             | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-load-more`                   | 点击加载更多搜索结果                                   |
| 下一步：输入盆型     | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-next-button`                 | 点击进入盆型步骤                                       |
| 盆型编辑入口         | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-edit-pot-profile`            | 点击打开盆型编辑器                                     |
| 盆型步骤上一步       | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-back-1`                      | 点击返回选植物步骤                                     |
| 获取建议按钮         | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-compute-button`              | 点击触发浇水建议计算                                   |
| 结果步骤重新输入     | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-back-2`                      | 点击返回盆型步骤                                       |
| 建议毫升数结果       | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-result-amount`               | 断言仅显示建议浇水毫升数，不显示日期/间隔/盆土判断     |
| 完成按钮             | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-done`                        | 点击完成独立浇水建议流程                               |
| 空态重试按钮         | `src/pages/watering-advisor/watering-advisor.vue`             | `watering-advisor-empty-retry`                 | 点击返回重新输入                                       |
