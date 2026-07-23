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
  - 诊断 tab：`src/pages/diagnose/diagnose.vue`
  - 共享诊断内核：`src/components/diagnose-flow/DiagnoseFlow.vue`
  - 诊断弹窗（容器）：`src/components/DiagnosePopup.vue`
  - AI 流程弹窗（组件）：`src/components/AIStreamDialog.vue`
  - 养护时间线（组件）：`src/components/CareBehaviorTimeline.vue`
  - 独立问诊页：`src/pages/diagnose/follow-up.vue`
  - 历史结果页：`src/pages/diagnose/result.vue`
  - 提醒 tab：`src/pages/reminder/reminder.vue`
  - 个人中心：`src/pages/profile/profile.vue`
  - 首页卡片组件：`src/pages/index/components/PlantCard.vue`
  - 添加植物：`src/pages/add-plant/add-plant.vue`
  - 编辑植物：`src/pages/edit-plant/edit-plant.vue`
  - 浇水提醒弹框：`src/pages/index/components/WateringReminderSheet.vue`
  - 天气头部组件：`src/components/HeaderWeatherInfo.vue`
  - 独立浇水建议页：`src/pages/watering-advisor/watering-advisor.vue`
  - 盆型编辑共享内核：`src/components/pot-profile/PotProfileFormCore.vue`（首页 popup 与独立建议 inline 共用，id 由 `idPrefix` prop 前缀化）

### 3.1 首页（index）

| 功能模块       | 文件                                       | 稳定 id                                | 操作 / 断言                            |
| -------------- | ------------------------------------------ | -------------------------------------- | -------------------------------------- |
| 天气位置信息   | `src/components/HeaderWeatherInfo.vue`     | `header-weather-location-button`       | 点击刷新定位 / 天气                    |
| 天气缓存开关   | `src/components/HeaderWeatherInfo.vue`     | `header-weather-cache-toggle`          | 点击切换天气缓存                       |
| 进入诊断入口   | `src/pages/index/index.vue`                | `diagnose-entry-button-{plant.id}`     | 点击打开诊断弹窗                       |
| 编辑植物入口   | `src/pages/index/components/PlantCard.vue` | `index-plant-card-edit-{plant.id}`     | 点击卡片主体进入编辑植物页             |
| 卡片历史入口   | `src/pages/index/components/PlantCard.vue` | `index-plant-card-history-{plant.id}`  | 点击查看该植物诊断历史                 |
| 浇水提醒入口   | `src/pages/index/components/PlantCard.vue` | `plant-card-reminder-{plant.id}-water` | 点击打开浇水提醒弹框；断言水滴提醒状态 |
| 主页历史记录项 | `src/pages/index/index.vue`                | `index-diagnose-record-{record._id}`   | 点击查看历史结果                       |

### 3.2 植物详情

| 功能模块 | 文件                                      | 稳定 id                        | 操作 / 断言      |
| -------- | ----------------------------------------- | ------------------------------ | ---------------- |
| 诊断入口 | `src/pages/plant-detail/plant-detail.vue` | `plant-detail-diagnose-button` | 点击打开诊断弹窗 |

### 3.3 共享诊断内核与弹窗（`diagnose-flow` / `DiagnosePopup.vue`）

#### A. 主流程与上传

| 功能模块                 | 文件                               | 稳定 id                                             | 操作 / 断言                                                               |
| ------------------------ | ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| 弹窗根容器               | `src/components/DiagnosePopup.vue` | `diagnose-popup-panel`                              | 断言弹窗已打开                                                            |
| 弹窗滚动内容             | `src/components/DiagnosePopup.vue` | `diagnose-popup-scroll`                             | 断言主内容可见                                                            |
| 共享内核根容器           | `src/components/diagnose-flow/DiagnoseFlow.vue` | `diagnose-flow`                         | 诊断 tab 与植物卡片弹窗必须出现同一内核                                   |
| 主上传阶段               | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-stage`              | 断言处于开始诊断前                                                        |
| 综合诊断模式             | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-profile-full-button`        | 点击选择 `full`；初始默认选中                                             |
| 只看虫害模式             | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-profile-pest-button`        | 点击选择 `pest`；必须有图片                                               |
| 无图快捷入口区           | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-no-image-entry-panel`       | 断言黄叶、枯萎入口显要可见                                                |
| 无图症状快捷选择         | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-dev-symptom-class-option-{classKey}` | 黄叶使用 `yellowing_mode`，枯萎使用 `wilting_droop_mode`；直接启动原固定题包 |
| 无图症状正式快捷入口     | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `3ef72261--diagnose-dev-symptom-class-quick-select` | 点击后调用 `/diagnosis/question/start`，不得上传图片或调用视觉模型         |
| 快捷选择状态             | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-dev-symptom-class-status`   | 断言当前已选黄叶或枯萎                                                    |
| 快捷选择清空             | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-dev-symptom-class-clear-button` | 清除当前快捷模式                                                       |
| 主图上传槽位容器         | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-slot-{slotType}`     | 断言槽位存在                                                              |
| 主图上传按钮             | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-{slotType}-button`   | 点击选择图片                                                              |
| 主图数量                 | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-count`               | 断言上传数量                                                              |
| 提交诊断                 | `src/components/diagnose-flow/DiagnoseFlow.vue` | `diagnose-submit-button`                     | 点击提交主诊断                                                            |

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

#### D. 方向选择、动态虫害题包与补拍

| 功能模块 | 文件 | 稳定 id | 操作 / 断言 |
| -------- | ---- | ------- | ----------- |
| 方向选择卡 | `src/components/diagnose-flow/DirectionChoiceCard.vue` | `diagnose-direction-choice-card` | 断言同图存在多个诊断方向 |
| 方向选项 | `src/components/diagnose-flow/DirectionChoiceCard.vue` | `diagnose-direction-choice-{modeKey}` | 点击选择 `pest`、`yellow_leaf` 或 `wilting_droop` 方向 |
| 动态虫害题包页 | `src/pages/diagnose/question-package.vue` | `diagnose-question-package-page` | 断言 1～2 题虫害包进入公共题包页 |
| 题包页返回诊断 | `src/Layout.vue` | `layout-left-action` | 从公共题包页按用户真实操作返回原诊断入口；不要用 automator 的 App 级导航命令替代 |
| 动态虫害题卡 | `src/pages/diagnose/question-package.vue` | `diagnose-question-package-page-question-card-{questionId}` | 断言当前剩余信息缺口问题可见 |
| 动态虫害选项 | `src/pages/diagnose/question-package/QuestionPackageOptions.vue` | `diagnose-question-package-page-option-{questionId}-{optionId}` | 点击当前题的单选答案 |
| 风险说明 | `src/pages/diagnose/question-package/QuestionPackageOptions.vue` | `diagnose-question-risk-notice-{questionId}` | 断言风险操作说明可见 |
| 同意风险操作 | `src/pages/diagnose/question-package/QuestionPackageOptions.vue` | `diagnose-question-risk-consent-{questionId}` | 用户明确同意后才可执行对应任务 |
| 不敢操作 / 跳过 | `src/pages/diagnose/question-package/QuestionPackageOptions.vue` | `diagnose-question-risk-skip-{questionId}` | 点击后提交 `unknown`，不得转成阴性 |
| 补拍卡 | `src/components/diagnose-flow/RetakeCard.vue` | `diagnose-retake-card` | 断言服务端建议的补拍部位、原因和操作方式 |
| 补拍安全步骤 | `src/components/diagnose-flow/RetakeCard.vue` | `diagnose-retake-safety-instructions` | 断言风险说明、安全步骤与三分钟截止在确认前可见 |
| 开始补拍 | `src/components/diagnose-flow/RetakeCard.vue` | `diagnose-retake-start-button` | 确认后向服务端申请唯一三分钟授权 |
| 不敢操作 / 跳过补拍 | `src/components/diagnose-flow/RetakeCard.vue` | `diagnose-retake-skip-button` | 记为 `skipped_unknown`，不得作为阴性 |
| 已跳过补拍终态 | `src/components/diagnose-flow/RetakeCard.vue` | `diagnose-retake-skipped-text` | 断言服务端返回未知终态，旧会话不能再次开始补拍 |
| 补拍倒计时 | `src/components/diagnose-flow/RetakeCard.vue` | `diagnose-retake-countdown` | 按服务端时间断言剩余时长 |
| 补拍超时终态 | `src/components/diagnose-flow/RetakeCard.vue` | `diagnose-retake-expired-text` | 断言本次诊断结束，只能重新诊断 |
| 超时后重新诊断 | `src/pages/diagnose/question-package/QuestionPackageRetake.vue` | `diagnose-retake-expired-reset-button` | 结束旧会话并返回诊断入口重新开始 |

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
| 结果页根容器 | `src/pages/diagnose/result.vue` | `diagnosis-result-page`              | 断言只读结果页加载       |
| 结论列表     | `src/pages/diagnose/result.vue` | `diagnosis-result-page-outcome-list` | 断言历史结果可见，允许 1-N 个结果 |
| 空态         | `src/pages/diagnose/result.vue` | `diagnosis-result-page-empty`        | 断言无历史结果时空态可见 |

### 3.9 个人中心

| 功能模块   | 文件                            | 稳定 id                              | 操作 / 断言      |
| ---------- | ------------------------------- | ------------------------------------ | ---------------- |
| 历史入口   | `src/pages/profile/profile.vue` | `profile-diagnose-history-view-all`  | 点击进入诊断历史 |
| 历史记录项 | `src/pages/profile/profile.vue` | `profile-diagnose-record-{item._id}` | 点击查看历史结果 |

### 3.10 独立浇水建议页

| 功能模块             | 文件                                                           | 稳定 id                                          | 操作 / 断言                                         |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| 步骤切换 swiper      | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-swiper`                        | 断言当前步骤；滑动切换步骤                          |
| 从我的植物选入口     | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-my-plants-entry`               | 点击在页内打开"我的植物"列表视图                    |
| 我的植物列表返回按钮 | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-my-plants-back`                | 点击返回来源选择视图                                |
| 我的植物列表容器     | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-my-plants-list`                | 断言我的植物列表视图可见                            |
| 我的植物卡片项       | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-my-plant-card-{plant.id}`      | 点击选中该植物；断言选中态显示                      |
| 我的植物确认下一步   | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-my-plants-confirm-button`      | 点击确认选中植物并进入盆型步骤                      |
| 搜索植物输入框       | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-search-input`                  | 输入 / 确认搜索植物种类                             |
| 清空搜索             | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-search-clear`                  | 点击清空搜索关键词                                  |
| 植物结果行           | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-plant-item-{id}`               | 点击选择植物种类                                    |
| 加载更多             | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-load-more`                     | 点击加载更多搜索结果                                |
| 下一步：输入盆型     | `src/pages/watering-advisor/components/CatalogPlantSearch.vue` | `watering-advisor-next-button`                   | 点击进入盆型步骤                                    |
| 盆型步骤上一步       | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-back-1`                        | 点击返回选植物步骤                                  |
| inline 盆型基质选项  | `src/components/pot-profile/PotProfileFormCore.vue`            | `watering-advisor-pot-profile-substrate-{value}` | 点击切换该基质选项选中态                            |
| inline 排水孔选项    | `src/components/pot-profile/PotProfileFormCore.vue`            | `watering-advisor-pot-profile-drainage-{value}`  | 点击选择有/无排水孔                                 |
| 获取建议按钮         | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-compute-button`                | 点击触发浇水建议计算                                |
| 结果步骤重新输入     | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-back-2`                        | 点击返回盆型步骤                                    |
| 建议水量结果         | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-result-amount`                 | 断言显示建议水量（矿泉水瓶/5L油桶口径，与首页一致） |
| 完成按钮             | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-done`                          | 点击完成独立浇水建议流程                            |
| 空态重试按钮         | `src/pages/watering-advisor/watering-advisor.vue`              | `watering-advisor-empty-retry`                   | 点击返回重新输入                                    |

### 3.11 添加植物 / 编辑植物

| 功能模块         | 文件                                                    | 稳定 id                                                               | 操作 / 断言                                       |
| ---------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| 选植物搜索框     | `src/pages/add-plant/components/PlantSelectionStep.vue` | `add-plant-search-input`                                              | 输入搜索植物                                      |
| AI 识别入口      | `src/pages/add-plant/components/PlantSelectionStep.vue` | `add-plant-ai-identify-button`                                        | 点击拍照识别                                      |
| 植物卡片项       | `src/pages/add-plant/components/PlantSelectionStep.vue` | `add-plant-card-{plant.id}`                                           | 点击选中植物                                      |
| 添加植物下一步   | `src/pages/add-plant/components/PlantSelectionStep.vue` | `add-plant-next-button`                                               | 点击进入信息填写步骤                              |
| 信息表单根节点   | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-form` / `edit-plant-form`                                  | 断言添加/编辑植物表单已渲染                       |
| 植物照片上传     | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-photo-upload` / `edit-plant-photo-upload`                  | 点击上传或替换植物照片                            |
| 植物昵称输入     | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-nickname-input` / `edit-plant-nickname-input`              | 输入植物昵称                                      |
| 城市修改按钮     | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-city-button` / `edit-plant-city-button`                    | 点击打开养护城市选择弹层                          |
| 城市弹层关闭     | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-city-sheet-close` / `edit-plant-city-sheet-close`          | 点击关闭城市选择弹层                              |
| 城市选项         | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-city-option-{locationKey}` / `edit-plant-city-option-{locationKey}` | 点击选择养护城市                        |
| 光照环境控件     | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-light-*` / `edit-plant-light-*`                            | 断言光照环境选择器可见并执行对应选择             |
| 摆放位置选项     | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-location-{slot}` / `edit-plant-location-{slot}`            | 点击切换摆放位置；`slot` 如 `balcony`            |
| 种植日期选择     | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-plant-date-picker` / `edit-plant-plant-date-picker`        | 点击选择种植日期                                  |
| 备注输入         | `src/pages/add-plant/components/PlantForm.vue`          | `add-plant-notes-input` / `edit-plant-notes-input`                    | 输入备注                                          |
| 添加植物上一步   | `src/pages/add-plant/components/PlantInfoStepPanel.vue` | `add-plant-back-to-selection-button`                                  | 点击返回植物选择步骤                              |
| 添加植物提交     | `src/pages/add-plant/components/PlantInfoStepPanel.vue` | `add-plant-submit-button`                                             | 点击完成添加植物                                  |
| 编辑植物提交     | `src/pages/add-plant/components/PlantInfoStepPanel.vue` | `edit-plant-submit-button`                                            | 点击保存植物信息                                  |

### 3.12 诊断 tab 与提醒 tab

| 功能模块 | 文件 | 稳定 id | 操作 / 断言 |
| -------- | ---- | ------- | ----------- |
| 诊断 tab 页面 | `src/pages/diagnose/diagnose.vue` | `diagnose-tab-page` | 断言五项 tab 的诊断页加载 |
| 诊断 tab 共享内核 | `src/pages/diagnose/diagnose.vue` | `diagnose-tab-flow` | 断言页面直接复用 `DiagnoseFlow` |
| 提醒 tab 页面 | `src/pages/reminder/reminder.vue` | `reminder-tab-page` | 断言提醒页加载且只展示浇水入口 |
| 提醒植物列表 | `src/pages/reminder/reminder.vue` | `reminder-tab-plant-list` | 断言用户植物列表可见 |
| 提醒植物项 | `src/pages/reminder/reminder.vue` | `reminder-tab-plant-{plant.id}` | 断言植物信息与浇水入口同卡展示 |
| 打开浇水提醒 | `src/pages/reminder/reminder.vue` | `reminder-tab-water-{plant.id}` | 点击复用 `WateringReminderSheet` |

## 4. automator catalog 映射

端上 automator 验收必须先通过 `test/e2e/automator/catalog.json` 选择精确叶子脚本，并校验脚本 hash 与 execution id。当前叶子与本文件章节对应关系：

| catalog id | 脚本 | 必读 id policy 章节 |
| ---------- | ---- | ------------------- |
| `diagnosis.yellowing.no_image_quick` | `test/e2e/automator/diagnosis/diagnose-yellowing-mcp.mjs` | `3.1`、`3.3`、`3.7` |
| `diagnosis.pest.visual_mode_retake` | `test/e2e/automator/diagnosis/pest-mode-and-retake.mjs` | `3.3`、`3.12` |
| `care.watering.transpiration_v3.independent_advice` | `test/e2e/automator/care/watering/transpiration-v3/independent-advice.mjs` | `3.10` |
| `care.watering.transpiration_v3.user_plant_planner` | `test/e2e/automator/care/watering/transpiration-v3/user-plant-planner.mjs` | `3.10` |
| `care.watering.reminder_dose.bottle_text` | `test/e2e/automator/care/watering/reminder-dose/bottle-text.mjs` | `3.10` |
| `care.watering.reminder_dose.dose_dynamic` | `test/e2e/automator/care/watering/reminder-dose/dose-dynamic.mjs` | `3.10` |
| `care.watering.reminder_dose.dose_label_layout` | `test/e2e/automator/care/watering/reminder-dose/dose-label-layout.mjs` | `3.10` |
| `care.watering.reminder_dose.unit_alignment_final` | `test/e2e/automator/care/watering/reminder-dose/unit-alignment-final.cjs` | `3.10` |
| `care.watering.reminder_dose.unit_alignment_v4` | `test/e2e/automator/care/watering/reminder-dose/unit-alignment-v4.cjs` | `3.10` |
