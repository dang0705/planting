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
  - 用户植物统一页：`src/subpackages/plant/user-plant-detail/user-plant-detail.vue`（`mode=create` 新增、`mode=edit` 编辑、`mode=view` 只读）
  - 诊断 tab：`src/pages/diagnose/diagnose.vue`
  - 诊断分包真实流程：`src/subpackages/diagnosis/flow.vue`
  - 共享诊断内核：`src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue`
  - 诊断弹窗（容器）：`src/subpackages/diagnosis/components/DiagnosePopup.vue`
  - AI 流程弹窗（组件）：`src/components/AIStreamDialog.vue`
  - 养护时间线（组件）：`src/components/CareBehaviorTimeline.vue`
  - 独立问诊页：`src/pages/diagnose/follow-up.vue`
  - 历史结果页：`src/subpackages/diagnosis/result.vue`
  - 提醒 tab：`src/pages/reminder/reminder.vue`
  - 个人中心：`src/pages/profile/profile.vue`
  - 订阅会员页：`src/subpackages/subscription/subscription.vue`
  - 首页卡片组件：`src/pages/index/components/PlantCard.vue`
  - 植物图片展示组件：`src/components/PlantDisplayBase.vue`
  - 用户植物表单：`src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue`
  - 用户植物只读内容：`src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue`
  - 植物环境条件入口组：`src/components/PlantEnvironmentSettingsGroup.vue`
  - 植物光照环境设置页：`src/subpackages/care/plant-environment/light-environment.vue`
  - 浇水提醒弹框：`src/pages/index/components/WateringReminderSheet.vue`
  - 天气头部组件：`src/components/HeaderWeatherInfo.vue`
  - 独立浇水建议页：`src/subpackages/care/watering-advisor/watering-advisor.vue`
  - 盆型编辑共享内核：`src/components/pot-profile/PotProfileFormCore.vue`（首页 popup 与独立建议 inline 共用，id 由 `idPrefix` prop 前缀化）
  - 完整空气环境评估：`src/components/AirEnvironmentAssessment.vue`（室内外换气上游 + 植物周围室内气流下游；独立页面只是组件容器）
  - 用户植物空气环境：`src/components/UserPlantAirEnvironmentCard.vue`
  - 题包空气环境：`src/subpackages/diagnosis/question-package/AirEnvironmentQuestionInput.vue`

### 3.1 首页（index）

| 功能模块            | 文件                                                                 | 稳定 id                                                                                                                                                                                                                                                                                                                                                                                                   | 操作 / 断言                                                   |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 天气位置信息        | `src/components/HeaderWeatherInfo.vue`                               | `header-weather-location-button`                                                                                                                                                                                                                                                                                                                                                                          | 点击刷新定位 / 天气                                           |
| 天气缓存开关        | `src/components/HeaderWeatherInfo.vue`                               | `header-weather-cache-toggle`                                                                                                                                                                                                                                                                                                                                                                             | 点击切换天气缓存                                              |
| 进入诊断入口        | `src/pages/index/index.vue`                                          | `diagnose-entry-button-{plant.id}`                                                                                                                                                                                                                                                                                                                                                                        | 点击进入诊断分包流                                            |
| 创建植物入口        | `src/pages/index/index.vue`                                          | `index-empty-add-plant-button` / `index-add-plant-button`                                                                                                                                                                                                                                                                                                                                                 | 点击创建植物；上报 `user_click_create_plant`                  |
| 独立浇水建议入口    | `src/pages/index/index.vue`                                          | `index-watering-advisor-entry`                                                                                                                                                                                                                                                                                                                                                                            | 点击进入独立浇水建议；上报 `isolated_watering_planner`        |
| 植物图片失效重试    | `src/components/PlantDisplayBase.vue`                                | `plant-display-image-{plant.id}`                                                                                                                                                                                                                                                                                                                                                                          | 图片加载失败时只重签当前植物图片，不刷新植物列表              |
| 编辑植物入口        | `src/pages/index/components/PlantCard.vue`                           | `index-plant-card-edit-{plant.id}`                                                                                                                                                                                                                                                                                                                                                                        | 点击植物图片进入编辑植物页                                    |
| 卡片历史入口        | `src/pages/index/components/PlantCard.vue`                           | `index-plant-card-history-{plant.id}`                                                                                                                                                                                                                                                                                                                                                                     | 点击查看该植物诊断历史                                        |
| 浇水提醒入口        | `src/pages/index/components/PlantCard.vue`                           | `plant-card-reminder-{plant.id}-water`                                                                                                                                                                                                                                                                                                                                                                    | 点击打开浇水提醒弹框；断言水滴提醒状态                        |
| 施肥时间表入口      | `src/pages/index/components/PlantCard.vue`                           | `plant-card-fertilization-{plant.id}`                                                                                                                                                                                                                                                                                                                                                                     | 点击打开首页底部施肥时间表弹框                                |
| 首页施肥弹框        | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `plant-card-fertilization-sheet`                                                                                                                                                                                                                                                                                                                                                                          | 断言施肥弹框已打开                                            |
| 首页施肥弹框内容    | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `plant-card-fertilization-sheet-content`                                                                                                                                                                                                                                                                                                                                                                  | 施肥表等内容的纵向滚动容器；提醒入口固定在底部                |
| 首页施肥月度表      | `src/components/FertilizationMonthlyTable.vue`                       | `plant-card-fertilization-monthly-table`                                                                                                                                                                                                                                                                                                                                                                  | 断言月份、肥料类型和来源名称可见                              |
| 施肥提醒底部入口    | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `fertilization-reminder-entry-button`                                                                                                                                                                                                                                                                                                                                                                     | 吸底显示；点击打开选择肥料 BottomPopup                        |
| 施肥提醒选择弹框    | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `fertilization-reminder-setup-sheet` / `fertilization-reminder-setup-sheet-content` / `fertilization-reminder-setup-close-button`                                                                                                                                                                                                                                                                         | 在第二个 BottomPopup 中选择液体肥或缓释肥                     |
| 施肥提醒肥料选项    | `src/pages/index/components/FertilizationReminderSetup.vue`          | `fertilization-reminder-option-liquid` / `fertilization-reminder-option-slow-release`                                                                                                                                                                                                                                                                                                                     | 选择本月固定周期对应的肥料类型                                |
| 设置下次施肥提醒    | `src/pages/index/components/FertilizationReminderSetup.vue`          | `fertilization-reminder-preview-button`                                                                                                                                                                                                                                                                                                                                                                   | 先按最新施肥历史和当前月规则请求服务端计算 pending 提醒计划   |
| 施肥提醒 Alert 入口 | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `fertilization-reminder-alert-info-button`                                                                                                                                                                                                                                                                                                                                                                | 关闭施肥提醒 Alert 后，可再次查看日期与首次确认原因           |
| 施肥提醒 Alert 容器 | `src/pages/index/components/FertilizationReminderAlert.vue`          | `fertilization-reminder-alert`                                                                                                                                                                                                                                                                                                                                                                            | 展示下次施肥日期及首次确认原因                                |
| 施肥提醒 Alert 取消 | `src/pages/index/components/FertilizationReminderAlert.vue`          | `fertilization-reminder-alert-cancel-button`                                                                                                                                                                                                                                                                                                                                                              | 关闭 Alert，不保存提醒                                        |
| 施肥提醒 Alert 确认 | `src/pages/index/components/FertilizationReminderAlert.vue`          | `fertilization-reminder-alert-confirm-button`                                                                                                                                                                                                                                                                                                                                                             | 确认设置日历并保存施肥提醒                                    |
| 施肥暂缓状态        | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `fertilization-reminder-deferred`                                                                                                                                                                                                                                                                                                                                                                         | 暂缓施肥期间阻断提醒设置                                      |
| 首次确认日期补录区  | `src/pages/index/components/FertilizationReminderPreview.vue`        | `fertilization-reminder-asserted-date-section`                                                                                                                                                                                                                                                                                                                                                            | 首次确认提醒中补录用户记得的上次施肥日期                      |
| 补录上次施肥日期    | `src/pages/index/components/FertilizationReminderPreview.vue`        | `fertilization-reminder-asserted-date-picker`                                                                                                                                                                                                                                                                                                                                                             | 只能选择今天及以前的日期                                      |
| 按补录日期重算      | `src/pages/index/components/FertilizationReminderPreview.vue`        | `fertilization-reminder-asserted-date-recalculate-button`                                                                                                                                                                                                                                                                                                                                                 | 取消旧 pending 后按用户补录日期重新生成提醒                   |
| 施肥日历确认/重试   | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `fertilization-reminder-calendar-confirm-button`                                                                                                                                                                                                                                                                                                                                                          | 用户确认后添加手机日历，或复用 planId 重试同步                |
| 施肥提醒取消设置    | `src/pages/index/components/FertilizationMonthlySheet.vue`           | `fertilization-reminder-cancel-button`                                                                                                                                                                                                                                                                                                                                                                    | 取消当前 pending 计划，不写入 active 提醒                     |
| 施肥提醒已保存状态  | `src/pages/index/components/SavedFertilizationReminderState.vue`     | `fertilization-reminder-saved-state`                                                                                                                                                                                                                                                                                                                                                                      | 断言 active / 到期状态回显                                    |
| 施肥提醒设置前条件  | `src/pages/index/components/FertilizationReminderSetup.vue`          | `fertilization-reminder-preflight` / `fertilization-reminder-condition-{conditionCode}-yes` / `fertilization-reminder-condition-{conditionCode}-no`                                                                                                                                                                                                                                                       | 仅对非生长条件显示逐项回答；生长条件由施肥条件 Alert 统一确认 |
| 施肥提醒设置错误    | `src/pages/index/components/FertilizationReminderSetup.vue`          | `fertilization-reminder-sync-error`                                                                                                                                                                                                                                                                                                                                                                       | 断言 422 等业务拒绝已在设置区显示用户可读原因                 |
| 更换肥料确认        | `src/pages/index/components/FertilizationReminderSetup.vue`          | `fertilization-reminder-fertilizer-type-change-group` / `fertilization-reminder-fertilizer-type-change-ack`                                                                                                                                                                                                                                                                                               | 选择不同于最近一次记录的肥料时明确确认                        |
| 到期施肥条件        | `src/pages/index/components/SavedFertilizationReminderState.vue`     | `fertilization-reminder-condition-checks` / `fertilization-reminder-due-condition-{conditionCode}-yes` / `fertilization-reminder-due-condition-{conditionCode}-no`                                                                                                                                                                                                                                        | 到期时重新确认服务端返回的当前月条件                          |
| 首次确认最短间隔    | `src/pages/index/components/SavedFertilizationReminderState.vue`     | `fertilization-reminder-minimum-interval` / `fertilization-reminder-minimum-interval-group` / `fertilization-reminder-minimum-interval-ack`                                                                                                                                                                                                                                                               | 首次确认提醒到期时确认已达到本表最短间隔                      |
| 施肥提醒完成        | `src/pages/index/components/SavedFertilizationReminderState.vue`     | `fertilization-reminder-complete-button`                                                                                                                                                                                                                                                                                                                                                                  | 记录今天真实施肥日期                                          |
| 施肥提醒跳过        | `src/pages/index/components/SavedFertilizationReminderState.vue`     | `fertilization-reminder-dismiss-button`                                                                                                                                                                                                                                                                                                                                                                   | 本次跳过且不写施肥日期                                        |
| 删除日历施肥提醒    | `src/pages/index/components/SavedFertilizationReminderState.vue`     | `fertilization-reminder-delete-calendar-button`                                                                                                                                                                                                                                                                                                                                                           | 打开手机日历手动删除确认区                                    |
| 删除日历确认 Popup  | `src/pages/index/components/FertilizationReminderCalendarDelete.vue` | `fertilization-reminder-calendar-delete` / `fertilization-reminder-calendar-delete-content` / `fertilization-reminder-calendar-delete-close-button` / `fertilization-reminder-calendar-delete-body` / `fertilization-reminder-calendar-delete-group` / `fertilization-reminder-calendar-delete-ack` / `fertilization-reminder-calendar-delete-confirm` / `fertilization-reminder-calendar-delete-dismiss` | 点击删除入口后，在独立底部 Popup 中确认已手动删除日历提醒     |
| 主页历史记录项      | `src/pages/index/index.vue`                                          | `index-diagnose-record-{record._id}`                                                                                                                                                                                                                                                                                                                                                                      | 点击查看历史结果                                              |
| 首页盆土检查指导    | `src/pages/index/components/WateringReminderSheet.vue`               | `watering-reminder-soil-check-guidance`                                                                                                                                                                                                                                                                                                                                                                   | 断言浇水提醒中显示先检查盆土的指导                            |
| 浇水日历同步失败    | `src/pages/index/components/WateringReminderSheet.vue`               | `watering-reminder-calendar-sync-error`                                                                                                                                                                                                                                                                                                                                                                   | 系统日历已添加但应用内保存失败时，断言重试同步说明可见        |

### 3.2 用户植物只读模式

| 功能模块               | 文件                                                                         | 稳定 id                                        | 操作 / 断言                                    |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| 诊断入口               | `src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-diagnose-button`            | 点击进入诊断分包入口页                         |
| 浇水入口               | `src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-water-button`               | 点击记录浇水；上报 `enter_user_plant_watering` |
| 编辑入口               | `src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-edit-button`                | 进入同一路由的 `mode=edit`                     |
| 删除入口               | `src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-delete-button`              | 点击原生确认提示；取消不得发起删除请求         |
| 植物详情图片失效重试   | `src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-image`                      | 图片加载失败时只重签当前植物图片               |
| 空气环境保存           | `src/components/UserPlantAirEnvironmentCard.vue`                             | `user-plant-detail-air-environment-save`       | 完成三项后保存；失败时草稿必须保留             |
| 保存错误               | `src/components/UserPlantAirEnvironmentCard.vue`                             | `user-plant-detail-air-environment-save-error` | 断言保存失败说明和重试入口仍可见               |
| 编辑页环境条件组       | `src/components/PlantEnvironmentSettingsGroup.vue`                           | `edit-plant-environment-group`                 | 断言光照和空气入口属于同一环境条件分组         |
| 编辑页基本信息分区     | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`           | `edit-plant-basic-info-section`                | 断言照片、昵称、种植日期和备注归入基本信息分区 |
| 编辑页养护信息分区     | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`           | `edit-plant-care-info-section`                 | 断言养护城市和环境设置归入养护信息分区         |
| 编辑页盆信息分区       | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`           | `edit-plant-pot-info-section`                  | 断言盆型和基质入口归入盆信息分区               |
| 编辑页光照环境入口     | `src/components/PlantEnvironmentSettingsGroup.vue`                           | `edit-plant-environment-light-entry`           | 点击进入独立光照环境设置页                     |
| 编辑页空气环境入口     | `src/components/PlantEnvironmentSettingsGroup.vue`                           | `edit-plant-environment-air-entry`             | 点击进入独立空气环境设置页                     |
| 光照环境设置完成       | `src/subpackages/care/plant-environment/light-environment.vue`               | `plant-light-environment-complete-button`      | 保存光照环境并携带结果返回编辑页               |
| 空气环境设置完成       | `src/subpackages/care/airflow/index.vue`                                     | `plant-air-environment-complete-button`        | 植物编辑模式下保存空气环境并携带结果返回编辑页 |
| 空气环境设置页返回编辑 | `src/subpackages/care/airflow/index.vue`                                     | `plant-air-environment-back-button`            | 植物编辑模式下放弃本次设置并返回编辑页         |

新增模式复用同一份表单骨架，三处分区的稳定 id 仅将 `edit-plant-` 前缀替换为 `add-plant-`：`add-plant-basic-info-section`、`add-plant-care-info-section`、`add-plant-pot-info-section`。

### 3.3 共享诊断内核与弹窗（`diagnose-flow` / `DiagnosePopup.vue`）

#### A. 主流程与上传

| 功能模块             | 文件                                                                                           | 稳定 id                                               | 操作 / 断言                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 弹窗根容器           | `src/subpackages/diagnosis/components/DiagnosePopup.vue`                                       | `diagnose-popup-panel`                                | 断言弹窗已打开                                                                               |
| 弹窗滚动内容         | `src/subpackages/diagnosis/components/DiagnosePopup.vue`                                       | `diagnose-popup-scroll`                               | 断言主内容可见                                                                               |
| 诊断 Tab 实际入口    | `src/pages/diagnose/diagnose.vue`                                                              | `diagnose-tab-page` / `diagnose-tab-intake`           | Tab 直入并停留在真实主包照片/无图症状入口；没有自动跳转、分流或中间页                        |
| 诊断分包真实流程页   | `src/subpackages/diagnosis/flow.vue`                                                           | `diagnosis-flow-page` / `diagnosis-flow-page-content` | 首页和植物详情入口进入此真实执行页；诊断 Tab 不经过该页                                      |
| 共享内核根容器       | `src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue`                                     | `diagnose-flow`                                       | 分包真实流程页和可复用诊断弹窗容器使用同一内核                                               |
| 主上传阶段           | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-upload-stage`                               | 主包 Tab 与分包流程共用同一照片/无图症状首屏                                                 |
| 综合诊断模式         | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-profile-full-button`                        | 点击选择 `full`；初始默认选中                                                                |
| 只看虫害模式         | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-profile-pest-button`                        | 点击选择 `pest`；必须有图片                                                                  |
| 无图快捷入口区       | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-no-image-entry-panel`                       | 断言黄叶、枯萎入口显要可见                                                                   |
| 无图症状快捷选择     | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-dev-symptom-class-option-{classKey}`        | 黄叶使用 `yellowing_mode`，枯萎使用 `wilting_droop_mode`；从主包入口开始原固定题包           |
| 无图症状正式快捷入口 | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `3ef72261--diagnose-dev-symptom-class-quick-select`   | 从诊断 Tab 点击后在原页调用 `/diagnosis/question/start`，仅一次跳转直达问题包，不得伪造响应  |
| 快捷选择状态         | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-dev-symptom-class-status`                   | 断言当前已选黄叶或枯萎                                                                       |
| 快捷选择清空         | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-dev-symptom-class-clear-button`             | 清除当前快捷模式                                                                             |
| 主图上传槽位容器     | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-upload-slot-{slotType}`                     | 断言槽位存在                                                                                 |
| 主图上传按钮         | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-upload-{slotType}-button`                   | 点击选择图片                                                                                 |
| 主图数量             | `src/components/diagnosis/DiagnoseIntake.vue`                                                  | `diagnose-upload-count`                               | 断言上传数量                                                                                 |
| 提交诊断             | `src/pages/diagnose/diagnose.vue` / `src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue` | `diagnose-submit-button`                              | 主包在原页完成真实请求后仅一次跳转直达问题包；分包内重试/重置时提交主诊断；均上报 `diagnose` |
| 问诊包返回           | `src/Layout.vue`                                                                               | `layout-left-action`                                  | 诊断 Tab 直达问诊包时返回诊断 Tab；其他既有问诊来源保持原有返回行为                          |

#### B. 结果展示

| 功能模块                                                  | 文件                                                              | 稳定 id                                 | 操作 / 断言                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| 结果阶段容器                                              | `src/subpackages/diagnosis/components/DiagnosePopup.vue`          | `diagnose-result-stage`                 | 断言诊断已有结果                                               |
| 当前结论                                                  | `src/subpackages/diagnosis/components/DiagnosePopup.vue`          | `diagnose-result-current-conclusion`    | 断言结论标题 / 摘要可见                                        |
| 处理建议                                                  | `src/subpackages/diagnosis/components/DiagnosePopup.vue`          | `diagnose-result-action-advice`         | 断言行动建议可见                                               |
| 暂时不要做                                                | `src/subpackages/diagnosis/components/DiagnosePopup.vue`          | `diagnose-result-avoid-advice`          | 断言避免项可见                                                 |
| 根腐诊断入口（outcomes 命中 overwatering 时显示，禁用态） | `src/subpackages/diagnosis/diagnose-flow/DiagnoseResultStage.vue` | `diagnose-result-root-rot-entry`        | 断言过浇 outcome 存在时根腐入口可见；本轮为禁用占位，无 @click |
| 根腐诊断入口按钮（即将上线）                              | `src/subpackages/diagnosis/diagnose-flow/DiagnoseResultStage.vue` | `diagnose-result-root-rot-entry-button` | 断言禁用文案"即将上线"可见；题包完善后切换为真实 @click 入口   |

#### C. 追问流程

| 功能模块            | 文件                                                     | 稳定 id                                                           | 操作 / 断言        |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- | ------------------ |
| 问诊容器            | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-result-followup-required`                               | 断言进入追问阶段   |
| 问诊问题卡          | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-followup-question-{questionId}`                         | 断言当前问题可见   |
| 问诊选项            | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-followup-option-{questionId}-{optionId}`                | 点击回答选项       |
| 追问上一题 / 下一题 | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-followup-prev-button` / `diagnose-followup-next-button` | 导航问诊步骤       |
| 补图区域            | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-followup-image-section`                                 | 断言补图入口可见   |
| 补图上传槽位        | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-followup-upload-slot-{slotType}`                        | 断言补图槽位存在   |
| 补图上传按钮        | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-followup-upload-{slotType}-button`                      | 点击补图           |
| 提交补图            | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-followup-image-submit-button`                           | 提交补图诊断       |
| 重置 / 完成         | `src/subpackages/diagnosis/components/DiagnosePopup.vue` | `diagnose-reset-button` / `diagnose-finish-button`                | 重新开始或关闭弹窗 |

#### D. 方向选择、动态虫害题包与补拍

| 功能模块            | 文件                                                                            | 稳定 id                                                         | 操作 / 断言                                                                      |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 方向选择卡          | `src/subpackages/diagnosis/diagnose-flow/DirectionChoiceCard.vue`               | `diagnose-direction-choice-card`                                | 断言同图存在多个诊断方向                                                         |
| 方向选项            | `src/subpackages/diagnosis/diagnose-flow/DirectionChoiceCard.vue`               | `diagnose-direction-choice-{modeKey}`                           | 点击选择 `pest`、`yellow_leaf` 或 `wilting_droop` 方向                           |
| 动态虫害题包页      | `src/subpackages/diagnosis/question-package.vue`                                | `diagnose-question-package-page`                                | 断言 1～2 题虫害包进入公共题包页                                                 |
| 题包当前题标记      | `src/subpackages/diagnosis/question-package.vue`                                | `diagnose-question-package-page-active-question-{questionId}`   | 仅供 Automator 确认当前可交互题；零尺寸，不改变用户可见题面或操作                |
| 题包页返回诊断      | `src/Layout.vue`                                                                | `layout-left-action`                                            | 从公共题包页按用户真实操作返回原诊断入口；不要用 automator 的 App 级导航命令替代 |
| 动态虫害题卡        | `src/subpackages/diagnosis/question-package.vue`                                | `diagnose-question-package-page-question-card-{questionId}`     | 断言当前剩余信息缺口问题可见                                                     |
| 旧题包重新开始      | `src/subpackages/diagnosis/question-package/QuestionPackageRestartRequired.vue` | `diagnose-question-package-restart-required-button`             | v1 黄叶/发蔫未完成会话只显示此提示，不展示旧题                                   |
| 动态虫害选项        | `src/subpackages/diagnosis/question-package/QuestionPackageOptions.vue`         | `diagnose-question-package-page-option-{questionId}-{optionId}` | 点击当前题的单选答案                                                             |
| 风险说明            | `src/subpackages/diagnosis/question-package/QuestionPackageOptions.vue`         | `diagnose-question-risk-notice-{questionId}`                    | 断言风险操作说明可见                                                             |
| 同意风险操作        | `src/subpackages/diagnosis/question-package/QuestionPackageOptions.vue`         | `diagnose-question-risk-consent-{questionId}`                   | 用户明确同意后才可执行对应任务                                                   |
| 不敢操作 / 跳过     | `src/subpackages/diagnosis/question-package/QuestionPackageOptions.vue`         | `diagnose-question-risk-skip-{questionId}`                      | 点击后提交 `unknown`，不得转成阴性                                               |
| 补拍卡              | `src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue`                        | `diagnose-retake-card`                                          | 断言服务端建议的补拍部位、原因和操作方式                                         |
| 补拍安全步骤        | `src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue`                        | `diagnose-retake-safety-instructions`                           | 断言风险说明、安全步骤与三分钟截止在确认前可见                                   |
| 开始补拍            | `src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue`                        | `diagnose-retake-start-button`                                  | 确认后向服务端申请唯一三分钟授权                                                 |
| 不敢操作 / 跳过补拍 | `src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue`                        | `diagnose-retake-skip-button`                                   | 记为 `skipped_unknown`，不得作为阴性                                             |
| 已跳过补拍终态      | `src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue`                        | `diagnose-retake-skipped-text`                                  | 断言服务端返回未知终态，旧会话不能再次开始补拍                                   |
| 补拍倒计时          | `src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue`                        | `diagnose-retake-countdown`                                     | 按服务端时间断言剩余时长                                                         |
| 补拍超时终态        | `src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue`                        | `diagnose-retake-expired-text`                                  | 断言本次诊断结束，只能重新诊断                                                   |
| 超时后重新诊断      | `src/subpackages/diagnosis/question-package/QuestionPackageRetake.vue`          | `diagnose-retake-expired-reset-button`                          | 结束旧会话并返回诊断入口重新开始                                                 |

#### D.1 诊断结果内问诊题包（DiagnoseQuestionPackageSection）

| 功能模块         | 文件                                                                         | 稳定 id                                                                                                      | 操作 / 断言                                      |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 题包容器         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-result-question-package-required`                                                                  | 断言结果卡内进入继续问诊阶段                     |
| 题包 Swiper      | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-swiper`                                                                           | 断言问诊题卡轮播容器可见                         |
| 当前题卡         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-question-{questionId}`                                                            | 断言当前问题卡可见                               |
| 风险说明         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-risk-notice-{questionId}`                                                                 | 断言风险操作说明可见                             |
| 同意风险操作     | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-risk-consent-{questionId}`                                                                | 用户明确同意后才可执行对应任务                   |
| 不敢操作 / 跳过  | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-risk-skip-{questionId}`                                                                   | 点击后跳过当前题                                 |
| 选项栈           | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-option-stack-{questionId}`                                                        | 断言当前题选项组可见                             |
| 折叠面板         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-collapse-{questionId}`                                                            | 展开折叠选项                                     |
| 选项按钮         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-option-{questionId}-{optionId}`                                                   | 点击选择当前题答案                               |
| 上一题           | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-prev-button`                                                                      | 导航到上一题                                     |
| 下一题 / 提交    | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-next-button`                                                                      | 提交当前题或完成问诊                             |
| 空气环境未知     | `src/subpackages/diagnosis/question-package/AirEnvironmentQuestionInput.vue` | `diagnose-air-environment-{questionId}-unknown`                                                              | 仅将当前空气题标为不确定，不能附带 sidecar       |
| 已保存空气摘要   | `src/components/AirEnvironmentSummaryCard.vue`                               | `diagnose-air-environment-{questionId}-summary`                                                              | 已保存且位置未变时直接使用；不展开编辑器         |
| 修改保存空气     | `src/components/AirEnvironmentSummaryCard.vue`                               | `diagnose-air-environment-{questionId}-edit`                                                                 | 点击后展开空气环境编辑器                         |
| 位置确认         | `src/components/AirEnvironmentSummaryCard.vue`                               | `diagnose-air-environment-{questionId}-confirm-location`                                                     | 位置变化时明确确认后才能继续                     |
| 位置变化提示     | `src/subpackages/diagnosis/question-package/AirEnvironmentQuestionInput.vue` | `diagnose-air-environment-{questionId}-location-confirmation`                                                | 未确认时显示旧资料已带入，不能静默使用           |
| 空气换气选项     | `src/components/AirEnvironmentAssessment.vue`                                | `diagnose-air-environment-{questionId}-exchange-*`                                                           | 第一项：按换气来源和开窗情况填写                 |
| 空气周围空间     | `src/components/AirEnvironmentAssessment.vue`                                | `diagnose-air-environment-{questionId}-canopy-*`                                                             | 第二项：选择开阔、有些遮挡、周围遮挡较多或不确定 |
| 空气设备风父选项 | `src/components/DeviceAirflowAssessment.vue`                                 | `diagnose-air-environment-{questionId}-device-mode-none` / `device-mode-has-airflow` / `device-mode-unknown` | 第二项先记录设备风是否到达植物                   |
| 空气设备风判断   | `src/components/DeviceAirflowAssessment.vue`                                 | `diagnose-air-environment-{questionId}-device-source-{source}-{relation}`                                    | 每种设备选择不直吹或直吹；不选择表示不到植物     |
| 空气内部步骤导航 | `src/components/AirEnvironmentAssessment.vue`                                | `diagnose-air-environment-{questionId}-next-step` / `previous-step`                                          | 只切换上下游，不推进外层题包                     |
| 空问题占位       | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-empty-question`                                                                   | 断言无可继续回答的问题                           |
| 补图区域         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-image-section`                                                                    | 断言补图入口可见                                 |
| 建议补拍部位     | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-capture-suggestions`                                                              | 断言建议优先补拍部位可见                         |
| 补图槽位网格     | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-upload-slot-grid`                                                                 | 断言补图槽位组可见                               |
| 补图槽位         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-upload-slot-{slotType}`                                                           | 断言指定槽位存在                                 |
| 补图上传按钮     | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-upload-{slotType}-button`                                                         | 点击补到指定槽位                                 |
| 删除补图         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-remove-image-{index}-button`                                                      | 删除已选补图                                     |
| 清空补图         | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-clear-images-button`                                                              | 清空所有补图                                     |
| 补图被阻止       | `src/subpackages/diagnosis/diagnose-flow/DiagnoseQuestionPackageSection.vue` | `diagnose-question-package-upload-blocked`                                                                   | 断言当前阶段不能补图的原因                       |

| 问诊结果反馈卡 | `src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue` / `src/subpackages/diagnosis/question-package.vue` | `diagnose-question-package-result-feedback-card` | 断言完成问诊后反馈入口可见 |
| 问诊结果反馈提交 | `src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue` | `diagnose-question-package-result-feedback-submit` | 提交反馈并断言成功状态 |
| 问诊结论反馈卡 | `src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue` / `src/subpackages/diagnosis/question-package.vue` | `diagnose-question-package-outcome-feedback-card` | 断言结论卡内反馈入口可见 |
| 问诊结论反馈提交 | `src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue` | `diagnose-question-package-outcome-feedback-submit` | 提交反馈并断言成功状态 |

### 3.4 AIStreamDialog（诊断前确认）

| 功能模块        | 文件                                | 稳定 id                    | 操作 / 断言                                   |
| --------------- | ----------------------------------- | -------------------------- | --------------------------------------------- |
| AI 诊断确认弹窗 | `src/components/AIStreamDialog.vue` | `ai-stream-dialog`         | 断言 AI 诊断过程弹窗出现                      |
| AI 诊断确认按钮 | `src/components/AIStreamDialog.vue` | `ai-stream-confirm-button` | 点击进入问诊；上报 `enter_diagnose_questions` |
| AI 诊断取消按钮 | `src/components/AIStreamDialog.vue` | `ai-stream-cancel-button`  | 点击取消继续                                  |

### 3.5 浇水提醒弹框

| 功能模块         | 文件                                                   | 稳定 id                               | 操作 / 断言                        |
| ---------------- | ------------------------------------------------------ | ------------------------------------- | ---------------------------------- |
| 弹框基础节点     | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-sheet`             | 断言弹框打开                       |
| 保存提醒按钮     | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-confirm-button`    | 点击添加到手机日历                 |
| 浇水日期取消按钮 | `src/pages/index/components/WateringReminderSheet.vue` | `watering-date-picker-cancel-button`  | 关闭浇水日期选择器，不触发规划请求 |
| 浇水日期确认按钮 | `src/pages/index/components/WateringReminderSheet.vue` | `watering-date-picker-confirm-button` | 提交浇水日期并触发规划请求         |
| 已保存状态回显   | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-saved-state`       | 断言已保存提醒显示                 |
| 已保存下次浇水   | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-saved-next-time`   | 断言下次浇水建议显示               |
| 已保存原因说明   | `src/pages/index/components/WateringReminderSheet.vue` | `watering-reminder-saved-reason`      | 断言原因回显可见                   |

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

| 功能模块     | 文件                                                                                                      | 稳定 id                                                                                            | 操作 / 断言                          |
| ------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 结果页根容器 | `src/subpackages/diagnosis/result.vue`                                                                    | `diagnosis-result-page`                                                                            | 断言只读结果页加载                   |
| 结论列表     | `src/subpackages/diagnosis/result.vue`                                                                    | `diagnosis-result-page-outcome-list`                                                               | 断言历史结果可见，允许 1-N 个结果    |
| 空态         | `src/subpackages/diagnosis/result.vue`                                                                    | `diagnosis-result-page-empty`                                                                      | 断言无历史结果时空态可见             |
| 加载失败重试 | `src/subpackages/diagnosis/result.vue`                                                                    | `diagnosis-result-page-retry`                                                                      | 单条诊断记录加载失败时重新请求该记录 |
| 诊断反馈卡   | `src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue` / `src/subpackages/diagnosis/result.vue` | `diagnosis-result-page-feedback-card`                                                              | 断言反馈入口随结果展示               |
| 诊断反馈选项 | `src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue`                                          | `diagnosis-result-page-feedback-helpful-yes/no` / `diagnosis-result-page-feedback-accurate-yes/no` | 选择有帮助程度和判断准确程度         |
| 提交诊断反馈 | `src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue`                                          | `diagnosis-result-page-feedback-submit`                                                            | 提交后断言成功状态；重复提交禁用     |

### 3.9 个人中心

| 功能模块     | 文件                            | 稳定 id                              | 操作 / 断言                               |
| ------------ | ------------------------------- | ------------------------------------ | ----------------------------------------- |
| 我的植物入口 | `src/pages/profile/profile.vue` | `profile-menu-myPlants`              | 点击切回首页植物列表；不得跳转日历/提醒页 |
| 会员服务入口 | `src/pages/profile/profile.vue` | `profile-subscription-entry`         | 点击进入会员服务分包页                    |
| 历史重试     | `src/pages/profile/profile.vue` | `profile-diagnose-history-retry`     | 历史加载失败时重新请求最近 5 条记录       |
| 历史记录项   | `src/pages/profile/profile.vue` | `profile-diagnose-record-{item._id}` | 点击查看该条历史结果                      |

### 3.9.1 会员服务

| 功能模块     | 文件                                            | 稳定 id                                  | 操作 / 断言                                  |
| ------------ | ----------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| 页面根容器   | `src/subpackages/subscription/subscription.vue` | `subscription-page`                      | 断言会员服务分包页已打开                     |
| 当前会员摘要 | `src/subpackages/subscription/subscription.vue` | `subscription-membership-summary`        | 断言当前会员类型和有效期可见                 |
| 套餐列表     | `src/subpackages/subscription/subscription.vue` | `subscription-plan-list`                 | 断言服务端套餐已加载                         |
| 套餐项       | `src/subpackages/subscription/subscription.vue` | `subscription-plan-{plan.id}`            | 点击选择套餐；动态 ID 只使用服务端 plan.id   |
| 套餐立即购买 | `src/subpackages/subscription/subscription.vue` | `subscription-plan-{plan.id}-pay-button` | 创建订单并调用微信支付；重复点击期间保持禁用 |
| 套餐加载失败 | `src/subpackages/subscription/subscription.vue` | `subscription-plans-error`               | 断言加载失败说明和重新加载入口可见           |
| 套餐重新加载 | `src/subpackages/subscription/subscription.vue` | `subscription-plans-retry-button`        | 重新请求服务端套餐                           |
| 支付状态     | `src/subpackages/subscription/subscription.vue` | `subscription-payment-status`            | 断言支付处理中、失败或完成状态可见           |
| 支付状态文案 | `src/subpackages/subscription/subscription.vue` | `subscription-payment-status-text`       | 断言用户可理解的支付/订单确认说明            |
| 订单状态     | `src/subpackages/subscription/subscription.vue` | `subscription-payment-order-status`      | 断言订单查询返回的状态可见                   |
| 刷新订单状态 | `src/subpackages/subscription/subscription.vue` | `subscription-refresh-order-button`      | 支付确认超时或订单处理中时重新查询订单       |

### 3.10 独立浇水建议页

| 功能模块             | 文件                                                                                                         | 稳定 id                                                                     | 操作 / 断言                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| 步骤切换 swiper      | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-swiper`                                                   | 断言当前步骤；滑动切换步骤                            |
| 从我的植物选入口     | `src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-my-plants-entry`                                          | 点击在页内打开"我的植物"列表视图                      |
| 我的植物列表返回按钮 | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plants-back`                                           | 点击返回来源选择视图                                  |
| 我的植物列表容器     | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plants-list`                                           | 断言我的植物列表视图可见                              |
| 我的植物卡片项       | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plant-card-{plant.id}`                                 | 点击选中该植物；断言选中态显示                        |
| 我的植物确认下一步   | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plants-confirm-button`                                 | 点击确认选中植物并进入盆型步骤                        |
| 搜索植物输入框       | `src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-search-input`                                             | 输入 / 确认搜索植物种类                               |
| 清空搜索             | `src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-search-clear`                                             | 点击清空搜索关键词                                    |
| 植物结果行           | `src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-plant-item-{id}`                                          | 点击选择植物种类                                      |
| 加载更多             | `src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-load-more`                                                | 点击加载更多搜索结果                                  |
| 下一步：输入盆型     | `src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-next-button`                                              | 点击进入盆型步骤                                      |
| 盆型步骤上一步       | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-back-1`                                                   | 点击返回选植物步骤                                    |
| 空气环境上一步       | `src/components/AirEnvironmentAssessment.vue` / `src/subpackages/care/watering-advisor/watering-advisor.vue` | `watering-advisor-air-environment-back`                                     | 编辑态由组件承载并返回选植物；已保存摘要态由页面承载  |
| 空气环境下一步       | `src/components/AirEnvironmentAssessment.vue` / `src/subpackages/care/watering-advisor/watering-advisor.vue` | `watering-advisor-air-environment-next`                                     | 编辑态由组件承载并进入盆型；已保存摘要态由页面承载    |
| 空气环境换气选项     | `src/components/AirEnvironmentSinglePageExchange.vue`                                                        | `watering-advisor-air-environment-single-*`                                 | 填写换气来源与开窗情况                                |
| 空气环境设备勾选     | `src/components/AirEnvironmentSinglePagePrototype.vue`                                                       | `watering-advisor-air-environment-single-device-source-{source}-toggle`     | 勾选/取消该设备风是否到达植物；勾选后才可设置直吹关系 |
| 空气环境设备风判断   | `src/components/AirEnvironmentSinglePagePrototype.vue`                                                       | `watering-advisor-air-environment-single-device-source-{source}-{relation}` | 已勾选设备选择不直吹或直吹                            |
| 已保存空气摘要       | `src/components/AirEnvironmentSummaryCard.vue`                                                               | `watering-advisor-air-environment-summary`                                  | 已保存且位置未变时可直接下一步                        |
| 修改保存空气         | `src/components/AirEnvironmentSummaryCard.vue`                                                               | `watering-advisor-air-environment-edit`                                     | 展开编辑器；迟到读取不得覆盖已编辑草稿                |
| 位置确认提示         | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-location-confirmation`                    | 位置变动时必须确认或修改                              |
| 确认当前位置未变     | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-confirm-location`                         | 位置变动时显式确认旧资料仍可使用                      |
| 同步状态             | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-sync-status`                              | 仅弱状态，不能阻断建议主流程                          |
| 重试保存             | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-retry-save`                               | 保存失败后重试；不替换完成按钮                        |
| inline 盆型基质选项  | `src/components/pot-profile/PotProfileFormCore.vue`                                                          | `watering-advisor-pot-profile-substrate-{value}`                            | 点击切换该基质选项选中态                              |
| inline 排水孔选项    | `src/components/pot-profile/PotProfileFormCore.vue`                                                          | `watering-advisor-pot-profile-drainage-{value}`                             | 点击选择有/无排水孔                                   |
| 获取建议按钮         | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-compute-button`                                           | 点击触发浇水建议计算                                  |
| 结果步骤重新输入     | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-back-2`                                                   | 点击返回盆型步骤                                      |
| 建议水量结果         | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-result-amount`                                            | 断言显示建议水量（矿泉水瓶/5L油桶口径，与首页一致）   |
| 盆土检查指导         | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-result-soil-check`                                        | 断言无历史时仍提示先检查盆土，不生成虚假日期          |
| 无历史日期说明       | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-result-no-history`                                        | 断言无上次浇水记录时明确说明暂不推导下一次日期        |
| 独立建议确认浇水     | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-result-confirm-watered-button`                            | 用户完成本次浇水后记录当天事件，供后续建议使用        |
| 完成按钮             | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-done`                                                     | 点击完成独立浇水建议流程                              |
| 空态重试按钮         | `src/subpackages/care/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-empty-retry`                                              | 点击返回重新输入                                      |

### 3.11 添加植物 / 编辑植物

| 功能模块                 | 文件                                                                               | 稳定 id                                                                          | 操作 / 断言                                         |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| 选植物搜索框             | `src/subpackages/plant/user-plant-detail/components/PlantSelectionStep.vue`        | `add-plant-search-input`                                                         | 输入搜索植物                                        |
| AI 识别入口              | `src/subpackages/plant/user-plant-detail/components/PlantSelectionStep.vue`        | `add-plant-ai-identify-button`                                                   | 点击拍照识别                                        |
| 植物卡片项               | `src/subpackages/plant/user-plant-detail/components/PlantSelectionStep.vue`        | `add-plant-card-{plant.id}`                                                      | 点击选中植物                                        |
| 添加植物下一步           | `src/subpackages/plant/user-plant-detail/components/PlantSelectionStep.vue`        | `add-plant-next-button`                                                          | 点击进入信息填写步骤                                |
| 信息表单根节点           | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-form` / `edit-plant-form`                                             | 断言添加/编辑植物表单已渲染                         |
| 新增植物选择步骤滚动容器 | `src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue`       | `add-plant-selection-scroll`                                                     | 验证植物选择步骤的纵向滚动视口和快速滑动后的布局    |
| 植物信息步骤滚动容器     | `src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue`        | `add-plant-info-scroll` / `edit-plant-info-scroll`                               | 验证新增/编辑信息表单的纵向滚动视口、底部操作区可达 |
| 植物信息步骤底部操作栏   | `src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue`        | `add-plant-submit-bar` / `edit-plant-submit-bar`                                 | 保存/完成按钮始终固定在信息页底部，不随表单内容滚动 |
| 植物照片上传             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-photo-upload` / `edit-plant-photo-upload`                             | 点击上传或替换植物照片                              |
| 植物照片预览失效重试     | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-photo-preview` / `edit-plant-photo-preview`                           | 图片加载失败时只重签当前照片                        |
| 植物昵称输入             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-nickname-input` / `edit-plant-nickname-input`                         | 输入植物昵称                                        |
| 城市修改按钮             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-city-button` / `edit-plant-city-button`                               | 点击打开养护城市选择弹层                            |
| 城市弹层关闭             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-city-sheet-close` / `edit-plant-city-sheet-close`                     | 点击关闭城市选择弹层                                |
| 城市选项                 | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-city-option-{locationKey}` / `edit-plant-city-option-{locationKey}`   | 点击选择养护城市                                    |
| 光照环境控件             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-light-*` / `edit-plant-light-*`                                       | 断言光照环境选择器可见并执行对应选择                |
| 盆型输入入口             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-pot-profile-button` / `edit-plant-pot-profile-button`                 | 点击打开盆型与基质输入弹层                          |
| 盆型确认保存             | `src/subpackages/plant/user-plant-detail/components/UserPlantPotProfileEditor.vue` | `add-plant-pot-profile-confirm-button` / `edit-plant-pot-profile-confirm-button` | 新增暂存到提交载荷；编辑直接保存接口                |
| 摆放位置选项             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-location-{slot}` / `edit-plant-location-{slot}`                       | 点击切换摆放位置；`slot` 如 `balcony`               |
| 种植日期选择             | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-plant-date-picker` / `edit-plant-plant-date-picker`                   | 点击选择种植日期                                    |
| 备注输入                 | `src/subpackages/plant/user-plant-detail/components/PlantForm.vue`                 | `add-plant-notes-input` / `edit-plant-notes-input`                               | 输入备注                                            |
| 添加植物上一步           | `src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue`        | `add-plant-back-to-selection-button`                                             | 点击返回植物选择步骤                                |
| 添加植物提交             | `src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue`        | `add-plant-submit-button`                                                        | 点击完成添加植物；上报 `save_user_new_plant`        |
| 编辑植物提交             | `src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue`        | `edit-plant-submit-button`                                                       | 点击保存植物信息                                    |

### 3.12 诊断 tab 与提醒 tab

| 功能模块          | 文件                              | 稳定 id                                     | 操作 / 断言                                                                    |
| ----------------- | --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| 诊断 tab 实际薄壳 | `src/pages/diagnose/diagnose.vue` | `diagnose-tab-page` / `diagnose-tab-intake` | 诊断 tab 直入并停留在真实照片/无图症状入口；仅用户开始诊断后才跳入分包真实流程 |
| 提醒 tab 页面     | `src/pages/reminder/reminder.vue` | `reminder-tab-page`                         | 断言提醒页加载且只展示浇水入口                                                 |
| 提醒植物列表      | `src/pages/reminder/reminder.vue` | `reminder-tab-plant-list`                   | 断言用户植物列表可见                                                           |
| 提醒植物项        | `src/pages/reminder/reminder.vue` | `reminder-tab-plant-{plant.id}`             | 断言植物信息与浇水入口同卡展示                                                 |
| 打开浇水提醒      | `src/pages/reminder/reminder.vue` | `reminder-tab-water-{plant.id}`             | 点击复用 `WateringReminderSheet`                                               |
| 打开施肥提醒      | `src/pages/reminder/reminder.vue` | `reminder-tab-fertilization-{plant.id}`     | 点击复用 `FertilizationMonthlySheet`，保存后重新读取植物状态                   |

### 3.12.1 养护日历

| 功能模块     | 文件                              | 稳定 id                                                         | 操作 / 断言                                    |
| ------------ | --------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| 节气详情     | `src/pages/calendar/calendar.vue` | `calendar-solar-term-details`                                   | 打开当前与下一个节气信息                       |
| 完成浇水任务 | `src/pages/calendar/calendar.vue` | `calendar-task-complete-{plant.id}`                             | 通过真实 API 保存浇水记录并重新加载任务状态    |
| 推迟浇水任务 | `src/pages/calendar/calendar.vue` | `calendar-task-postpone-{plant.id}`                             | 通过真实提醒 API 将日期推迟到明天并重新加载    |
| 撤销日历任务 | `src/pages/calendar/calendar.vue` | `calendar-task-undo-{plant.id}`                                 | 通过真实用户界面恢复原提醒与植物状态并重新读取 |
| 添加植物     | `src/pages/calendar/calendar.vue` | `calendar-add-plant-button` / `calendar-empty-add-plant-button` | 跳转统一 `mode=create` 植物详情页              |
| 植物计划详情 | `src/pages/calendar/calendar.vue` | `calendar-plant-plan-{plant.id}`                                | 跳转统一 `mode=view&id` 植物详情页             |

### 3.13 完整空气环境评估（独立容器页）

空气环境由同一个 `AirEnvironmentAssessment` 组件承载，所有当前入口统一使用 `layout-mode="single-page"` 和 `height-mode="content"`，将室内外换气、周围空间和设备风放在同一页完成。浇水建议、诊断题包、独立空气环境页和植物详情均直接调用组件，不得拆成两个业务路由。

| 功能模块                 | 文件                                                   | 稳定 id                                                                                                                          | 操作 / 断言                                              |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 完整评估容器             | `src/components/AirEnvironmentAssessment.vue`          | `airflow-assessment`                                                                                                             | 断言上下游组件根节点可见                                 |
| 单页原型容器             | `src/components/AirEnvironmentSinglePagePrototype.vue` | `airflow-single-page`                                                                                                            | 独立页单页通风记录入口                                   |
| 单页换气方式             | `src/components/AirEnvironmentSinglePageExchange.vue`  | `airflow-single-exchange-window` / `airflow-single-fresh-air-switch`                                                             | 左右各半；左侧动态图例，右侧紧凑控制区                   |
| 单页开窗补充项           | `src/components/AirEnvironmentSinglePageExchange.vue`  | `airflow-single-window-direction-one` / `airflow-single-window-direction-two_or_more` / `airflow-single-window-frequency-picker` | 选择开窗方向与频率；“几乎不开”显示关窗图例               |
| 单页周围空间             | `src/components/AirEnvironmentSinglePagePrototype.vue` | `airflow-single-canopy-*`                                                                                                        | 选择无遮挡、有些遮挡、遮挡较多或不确定                   |
| 单页设备风模式           | `src/components/AirEnvironmentSinglePagePrototype.vue` | `airflow-single-device-mode-none` / `has_airflow` / `unknown`                                                                    | 先记录没有设备风、有或不确定                             |
| 单页设备风判断           | `src/components/AirEnvironmentSinglePagePrototype.vue` | `airflow-single-device-source-{source}-{relation}`                                                                               | 每种设备选择不直吹或直吹；不选择表示不到植物             |
| 单页当前记录             | `src/components/AirEnvironmentSinglePagePrototype.vue` | `airflow-single-summary`                                                                                                         | 断言三类通风信息已汇总显示                               |
| 单页完成按钮             | `src/components/AirEnvironmentSinglePagePrototype.vue` | `airflow-submit-button`                                                                                                          | 单页原型完成；答案不完整时不可用                         |
| 通用步骤轨道             | `src/components/common/ButtonStepTrack.vue`            | `airflow-swiper`                                                                                                                 | 断言两个步骤项由通用轨道承载                             |
| 上游步骤                 | `src/components/AirEnvironmentAssessment.vue`          | `airflow-exchange-step`                                                                                                          | 第一项：室内外空气交换                                   |
| 下游步骤                 | `src/components/AirEnvironmentAssessment.vue`          | `airflow-local-airflow-step`                                                                                                     | 第二项：植物周围室内气流                                 |
| 换气图例槽位             | `src/components/SelectableCard.vue`                    | `airflow-exchange-source-window`                                                                                                 | 唯一动态图例槽位；根据开窗频率、方向或新风状态变化       |
| 开窗方向：一个方向       | `src/components/AirExchangeAssessment.vue`             | `airflow-exchange-window-direction-one`                                                                                          | 仅 `source=window` 时可见；点击选择单方向                |
| 开窗方向：两个及以上方向 | `src/components/AirExchangeAssessment.vue`             | `airflow-exchange-window-direction-two-or-more`                                                                                  | 仅 `source=window` 时可见；点击选择双方向                |
| 开窗频率：每天           | `src/components/AirExchangeAssessment.vue`             | `airflow-exchange-window-frequency-daily`                                                                                        | 仅 `source=window` 时可见；点击选择每天                  |
| 开窗频率：隔天           | `src/components/AirExchangeAssessment.vue`             | `airflow-exchange-window-frequency-every-other-day`                                                                              | 仅 `source=window` 时可见；点击选择隔天                  |
| 开窗频率：每周 1–2 次    | `src/components/AirExchangeAssessment.vue`             | `airflow-exchange-window-frequency-weekly-1-2`                                                                                   | 仅 `source=window` 时可见；点击选择每周 1–2 次           |
| 开窗频率：几乎不开       | `src/components/AirExchangeAssessment.vue`             | `airflow-exchange-window-frequency-almost-never`                                                                                 | 选择后显示显式关窗图例与“开启新风”开关                   |
| 开启新风                 | `src/components/AirExchangeAssessment.vue`             | `airflow-exchange-fresh-air-switch`                                                                                              | 仅选择“几乎不开”时可见；打开后记录 `source=fresh_air`    |
| 上游到下游               | `src/components/AirEnvironmentAssessment.vue`          | `airflow-next-step` / `airflow-previous-step`                                                                                    | 只切换组件内部步骤，不提交外层流程                       |
| 植物周围空间             | `src/components/AirEnvironmentAssessment.vue`          | `airflow-canopy-*`                                                                                                               | 第二项选择开阔、有些遮挡、周围遮挡较多或不确定           |
| 设备风父选项             | `src/components/DeviceAirflowAssessment.vue`           | `airflow-device-mode-none` / `airflow-device-mode-has-airflow` / `airflow-device-mode-unknown`                                   | 先记录没有设备风、有或不确定                             |
| 设备风判断               | `src/components/DeviceAirflowAssessment.vue`           | `airflow-device-source-{source}-{relation}`                                                                                      | 每种设备选择不直吹或直吹；不选择表示不到植物             |
| 完成按钮                 | `src/components/AirEnvironmentAssessment.vue`          | `airflow-submit-button`                                                                                                          | 室内气流 item 内完成；初始未答或答案不完整不可用         |
| 结果摘要                 | `src/subpackages/care/airflow/index.vue`               | `airflow-result-summary`                                                                                                         | 断言显示“记录完成”与用户已选的换气方式；不得展示等级结论 |
| 重置按钮                 | `src/subpackages/care/airflow/index.vue`               | `airflow-reset-button`                                                                                                           | 点击清空选择并回到初始未答态                             |

### 3.14 光照环境 V2

光照选择器不再收集窗向、房间位置或离窗距离。四种自然光型、进入方式和补光灯使用同一套动态 id；{prefix} 为页面传入的 idPrefix，{questionId} 为档案或诊断题 id。

| 功能模块     | 文件                                                                  | 稳定 id                                                       | 操作 / 断言                                                               |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 光型图例     | src/components/LightEnvironmentPicker.vue                             | {prefix}-illustration-{questionId}                            | 断言切换光型后展示对应原始 SVG                                            |
| 直射光       | src/components/LightEnvironmentPicker.vue                             | {prefix}-type-direct-{questionId}                             | 选择直射光                                                                |
| 明亮散射光   | src/components/LightEnvironmentPicker.vue                             | {prefix}-type-bright_diffuse-{questionId}                     | 选择明亮散射光                                                            |
| 较弱散射光   | src/components/LightEnvironmentPicker.vue                             | {prefix}-type-weak_diffuse-{questionId}                       | 选择较弱散射光                                                            |
| 几乎无自然光 | src/components/LightEnvironmentPicker.vue                             | {prefix}-type-almost_none-{questionId}                        | 选择后进入方式禁用且保存为 null                                           |
| 透过玻璃     | src/components/LightEnvironmentPicker.vue                             | {prefix}-entry-through_glass-{questionId}                     | 选择阳光透过窗玻璃                                                        |
| 开放环境     | src/components/LightEnvironmentPicker.vue                             | {prefix}-entry-open_environment-{questionId}                  | 选择开放环境                                                              |
| 补光灯       | src/components/LightEnvironmentPicker.vue                             | {prefix}-supplemental-light-{questionId}                      | 独立切换补光灯，不改变自然光型                                            |
| 档案确认     | src/components/LightEnvironmentPicker.vue                             | {prefix}-confirm-current-{questionId}                         | 诊断中确认已有 V2 档案仍然有效                                            |
| 近期光照变化 | src/subpackages/diagnosis/question-package/QuestionPackageOptions.vue | diagnose-question-package-page-option-{questionId}-{optionId} | 独立选择 stronger_direct_light / no_clear_change / weaker_light / unknown |
| 独立页保存   | src/subpackages/care/plant-environment/light-environment.vue          | plant-light-environment-complete-button                       | 保存并真实读回 V2 光照环境                                                |

## 4. automator catalog 映射

端上 automator 验收必须先通过 `test/e2e/automator/catalog.json` 选择精确叶子脚本，并校验脚本 hash 与 execution id。当前叶子与本文件章节对应关系：

| catalog id                                          | 脚本                                                                         | 必读 id policy 章节 |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| `diagnosis.yellowing.no_image_quick`                | `test/e2e/automator/diagnosis/diagnose-yellowing-mcp.mjs`                    | `3.1`、`3.3`、`3.7` |
| `diagnosis.pest.visual_mode_retake`                 | `test/e2e/automator/diagnosis/pest-mode-and-retake.mjs`                      | `3.3`、`3.12`       |
| `care.watering.transpiration_v3.independent_advice` | `test/e2e/automator/care/watering/transpiration-v3/independent-advice.mjs`   | `3.10`              |
| `care.watering.transpiration_v3.user_plant_planner` | `test/e2e/automator/care/watering/transpiration-v3/user-plant-planner.mjs`   | `3.10`              |
| `care.watering.reminder_dose.bottle_text`           | `test/e2e/automator/care/watering/reminder-dose/bottle-text.mjs`             | `3.10`              |
| `care.watering.reminder_dose.dose_dynamic`          | `test/e2e/automator/care/watering/reminder-dose/dose-dynamic.mjs`            | `3.10`              |
| `plant.light_environment_save_event_channel`        | `test/e2e/automator/business/light-environment-save.mjs`                     | `3.12.1`、`3.14`    |
| `care.watering.reminder_dose.dose_label_layout`     | `test/e2e/automator/care/watering/reminder-dose/dose-label-layout.mjs`       | `3.10`              |
| `care.watering.reminder_dose.unit_alignment_final`  | `test/e2e/automator/care/watering/reminder-dose/unit-alignment-final.cjs`    | `3.10`              |
| `care.watering.reminder_dose.unit_alignment_v4`     | `test/e2e/automator/care/watering/reminder-dose/unit-alignment-v4.cjs`       | `3.10`              |
| `care.air_exchange.v1`                              | `test/e2e/automator/care/airflow/air-exchange-v1.mjs`                        | `3.13`              |
| `care.air_environment_v2.user_plant_watering`       | `test/e2e/automator/care/airflow/air-environment-v2-user-plant-watering.mjs` | `3.10`              |
| `diagnosis.air_environment_v2.question_packages`    | `test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs`      | `3.1`、`3.3`        |
