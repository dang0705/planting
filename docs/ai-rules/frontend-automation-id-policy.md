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
  - 用户植物统一页：`src/pages/user-plant-detail/user-plant-detail.vue`（`mode=create` 新增、`mode=edit` 编辑、`mode=view` 只读）
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
  - 用户植物表单：`src/pages/user-plant-detail/components/UserPlantDetailForm.vue`
  - 用户植物只读内容：`src/pages/user-plant-detail/components/UserPlantDetailView.vue`
  - 植物环境条件入口组：`src/components/PlantEnvironmentSettingsGroup.vue`
  - 植物光照环境设置页：`src/pages/plant-environment/light-environment.vue`
  - 浇水提醒弹框：`src/pages/index/components/WateringReminderSheet.vue`
  - 天气头部组件：`src/components/HeaderWeatherInfo.vue`
  - 独立浇水建议页：`src/pages/watering-advisor/watering-advisor.vue`
  - 盆型编辑共享内核：`src/components/pot-profile/PotProfileFormCore.vue`（首页 popup 与独立建议 inline 共用，id 由 `idPrefix` prop 前缀化）
  - 完整空气环境评估：`src/components/AirEnvironmentAssessment.vue`（室内外换气上游 + 植物周围室内气流下游；独立页面只是组件容器）
  - 用户植物空气环境：`src/components/UserPlantAirEnvironmentCard.vue`
  - 题包空气环境：`src/pages/diagnose/question-package/AirEnvironmentQuestionInput.vue`

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

### 3.2 用户植物只读模式

| 功能模块               | 文件                                                             | 稳定 id                                        | 操作 / 断言                                    |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| 诊断入口               | `src/pages/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-diagnose-button`            | 点击打开诊断弹窗                               |
| 浇水入口               | `src/pages/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-water-button`               | 点击记录浇水                                   |
| 编辑入口               | `src/pages/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-edit-button`                | 进入同一路由的 `mode=edit`                     |
| 删除入口               | `src/pages/user-plant-detail/components/UserPlantDetailView.vue` | `user-plant-detail-delete-button`              | 点击确认删除                                   |
| 空气环境保存           | `src/components/UserPlantAirEnvironmentCard.vue`                 | `user-plant-detail-air-environment-save`       | 完成三项后保存；失败时草稿必须保留             |
| 保存错误               | `src/components/UserPlantAirEnvironmentCard.vue`                 | `user-plant-detail-air-environment-save-error` | 断言保存失败说明和重试入口仍可见               |
| 编辑页环境条件组       | `src/components/PlantEnvironmentSettingsGroup.vue`               | `edit-plant-environment-group`                 | 断言光照和空气入口属于同一环境条件分组         |
| 编辑页光照环境入口     | `src/components/PlantEnvironmentSettingsGroup.vue`               | `edit-plant-environment-light-entry`           | 点击进入独立光照环境设置页                     |
| 编辑页空气环境入口     | `src/components/PlantEnvironmentSettingsGroup.vue`               | `edit-plant-environment-air-entry`             | 点击进入独立空气环境设置页                     |
| 光照环境设置完成       | `src/pages/plant-environment/light-environment.vue`              | `plant-light-environment-complete-button`      | 保存光照环境并携带结果返回编辑页               |
| 空气环境设置完成       | `src/pages/airflow/index.vue`                                    | `plant-air-environment-complete-button`        | 植物编辑模式下保存空气环境并携带结果返回编辑页 |
| 空气环境设置页返回编辑 | `src/pages/airflow/index.vue`                                    | `plant-air-environment-back-button`            | 植物编辑模式下放弃本次设置并返回编辑页         |

### 3.3 共享诊断内核与弹窗（`diagnose-flow` / `DiagnosePopup.vue`）

#### A. 主流程与上传

| 功能模块             | 文件                                                   | 稳定 id                                             | 操作 / 断言                                                                  |
| -------------------- | ------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| 弹窗根容器           | `src/components/DiagnosePopup.vue`                     | `diagnose-popup-panel`                              | 断言弹窗已打开                                                               |
| 弹窗滚动内容         | `src/components/DiagnosePopup.vue`                     | `diagnose-popup-scroll`                             | 断言主内容可见                                                               |
| 共享内核根容器       | `src/components/diagnose-flow/DiagnoseFlow.vue`        | `diagnose-flow`                                     | 诊断 tab 与植物卡片弹窗必须出现同一内核                                      |
| 主上传阶段           | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-stage`                             | 断言处于开始诊断前                                                           |
| 综合诊断模式         | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-profile-full-button`                      | 点击选择 `full`；初始默认选中                                                |
| 只看虫害模式         | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-profile-pest-button`                      | 点击选择 `pest`；必须有图片                                                  |
| 无图快捷入口区       | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-no-image-entry-panel`                     | 断言黄叶、枯萎入口显要可见                                                   |
| 无图症状快捷选择     | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-dev-symptom-class-option-{classKey}`      | 黄叶使用 `yellowing_mode`，枯萎使用 `wilting_droop_mode`；直接启动原固定题包 |
| 无图症状正式快捷入口 | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `3ef72261--diagnose-dev-symptom-class-quick-select` | 点击后调用 `/diagnosis/question/start`，不得上传图片或调用视觉模型           |
| 快捷选择状态         | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-dev-symptom-class-status`                 | 断言当前已选黄叶或枯萎                                                       |
| 快捷选择清空         | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-dev-symptom-class-clear-button`           | 清除当前快捷模式                                                             |
| 主图上传槽位容器     | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-slot-{slotType}`                   | 断言槽位存在                                                                 |
| 主图上传按钮         | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-{slotType}-button`                 | 点击选择图片                                                                 |
| 主图数量             | `src/components/diagnose-flow/DiagnoseUploadStage.vue` | `diagnose-upload-count`                             | 断言上传数量                                                                 |
| 提交诊断             | `src/components/diagnose-flow/DiagnoseFlow.vue`        | `diagnose-submit-button`                            | 点击提交主诊断                                                               |

#### B. 结果展示

| 功能模块                                                  | 文件                                                   | 稳定 id                                 | 操作 / 断言                                                    |
| --------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------- |
| 结果阶段容器                                              | `src/components/DiagnosePopup.vue`                     | `diagnose-result-stage`                 | 断言诊断已有结果                                               |
| 当前结论                                                  | `src/components/DiagnosePopup.vue`                     | `diagnose-result-current-conclusion`    | 断言结论标题 / 摘要可见                                        |
| 处理建议                                                  | `src/components/DiagnosePopup.vue`                     | `diagnose-result-action-advice`         | 断言行动建议可见                                               |
| 暂时不要做                                                | `src/components/DiagnosePopup.vue`                     | `diagnose-result-avoid-advice`          | 断言避免项可见                                                 |
| 根腐诊断入口（outcomes 命中 overwatering 时显示，禁用态） | `src/components/diagnose-flow/DiagnoseResultStage.vue` | `diagnose-result-root-rot-entry`        | 断言过浇 outcome 存在时根腐入口可见；本轮为禁用占位，无 @click |
| 根腐诊断入口按钮（即将上线）                              | `src/components/diagnose-flow/DiagnoseResultStage.vue` | `diagnose-result-root-rot-entry-button` | 断言禁用文案"即将上线"可见；题包完善后切换为真实 @click 入口   |

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

| 功能模块            | 文件                                                                     | 稳定 id                                                         | 操作 / 断言                                                                      |
| ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 方向选择卡          | `src/components/diagnose-flow/DirectionChoiceCard.vue`                   | `diagnose-direction-choice-card`                                | 断言同图存在多个诊断方向                                                         |
| 方向选项            | `src/components/diagnose-flow/DirectionChoiceCard.vue`                   | `diagnose-direction-choice-{modeKey}`                           | 点击选择 `pest`、`yellow_leaf` 或 `wilting_droop` 方向                           |
| 动态虫害题包页      | `src/pages/diagnose/question-package.vue`                                | `diagnose-question-package-page`                                | 断言 1～2 题虫害包进入公共题包页                                                 |
| 题包当前题标记      | `src/pages/diagnose/question-package.vue`                                | `diagnose-question-package-page-active-question-{questionId}`   | 仅供 Automator 确认当前可交互题；零尺寸，不改变用户可见题面或操作                |
| 题包页返回诊断      | `src/Layout.vue`                                                         | `layout-left-action`                                            | 从公共题包页按用户真实操作返回原诊断入口；不要用 automator 的 App 级导航命令替代 |
| 动态虫害题卡        | `src/pages/diagnose/question-package.vue`                                | `diagnose-question-package-page-question-card-{questionId}`     | 断言当前剩余信息缺口问题可见                                                     |
| 旧题包重新开始      | `src/pages/diagnose/question-package/QuestionPackageRestartRequired.vue` | `diagnose-question-package-restart-required-button`             | v1 黄叶/发蔫未完成会话只显示此提示，不展示旧题                                   |
| 动态虫害选项        | `src/pages/diagnose/question-package/QuestionPackageOptions.vue`         | `diagnose-question-package-page-option-{questionId}-{optionId}` | 点击当前题的单选答案                                                             |
| 风险说明            | `src/pages/diagnose/question-package/QuestionPackageOptions.vue`         | `diagnose-question-risk-notice-{questionId}`                    | 断言风险操作说明可见                                                             |
| 同意风险操作        | `src/pages/diagnose/question-package/QuestionPackageOptions.vue`         | `diagnose-question-risk-consent-{questionId}`                   | 用户明确同意后才可执行对应任务                                                   |
| 不敢操作 / 跳过     | `src/pages/diagnose/question-package/QuestionPackageOptions.vue`         | `diagnose-question-risk-skip-{questionId}`                      | 点击后提交 `unknown`，不得转成阴性                                               |
| 补拍卡              | `src/components/diagnose-flow/RetakeCard.vue`                            | `diagnose-retake-card`                                          | 断言服务端建议的补拍部位、原因和操作方式                                         |
| 补拍安全步骤        | `src/components/diagnose-flow/RetakeCard.vue`                            | `diagnose-retake-safety-instructions`                           | 断言风险说明、安全步骤与三分钟截止在确认前可见                                   |
| 开始补拍            | `src/components/diagnose-flow/RetakeCard.vue`                            | `diagnose-retake-start-button`                                  | 确认后向服务端申请唯一三分钟授权                                                 |
| 不敢操作 / 跳过补拍 | `src/components/diagnose-flow/RetakeCard.vue`                            | `diagnose-retake-skip-button`                                   | 记为 `skipped_unknown`，不得作为阴性                                             |
| 已跳过补拍终态      | `src/components/diagnose-flow/RetakeCard.vue`                            | `diagnose-retake-skipped-text`                                  | 断言服务端返回未知终态，旧会话不能再次开始补拍                                   |
| 补拍倒计时          | `src/components/diagnose-flow/RetakeCard.vue`                            | `diagnose-retake-countdown`                                     | 按服务端时间断言剩余时长                                                         |
| 补拍超时终态        | `src/components/diagnose-flow/RetakeCard.vue`                            | `diagnose-retake-expired-text`                                  | 断言本次诊断结束，只能重新诊断                                                   |
| 超时后重新诊断      | `src/pages/diagnose/question-package/QuestionPackageRetake.vue`          | `diagnose-retake-expired-reset-button`                          | 结束旧会话并返回诊断入口重新开始                                                 |

#### D.1 诊断结果内问诊题包（DiagnoseQuestionPackageSection）

| 功能模块         | 文件                                                                  | 稳定 id                                                                                                      | 操作 / 断言                                      |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 题包容器         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-result-question-package-required`                                                                  | 断言结果卡内进入继续问诊阶段                     |
| 题包 Swiper      | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-swiper`                                                                           | 断言问诊题卡轮播容器可见                         |
| 当前题卡         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-question-{questionId}`                                                            | 断言当前问题卡可见                               |
| 风险说明         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-risk-notice-{questionId}`                                                                 | 断言风险操作说明可见                             |
| 同意风险操作     | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-risk-consent-{questionId}`                                                                | 用户明确同意后才可执行对应任务                   |
| 不敢操作 / 跳过  | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-risk-skip-{questionId}`                                                                   | 点击后跳过当前题                                 |
| 选项栈           | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-option-stack-{questionId}`                                                        | 断言当前题选项组可见                             |
| 折叠面板         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-collapse-{questionId}`                                                            | 展开折叠选项                                     |
| 选项按钮         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-option-{questionId}-{optionId}`                                                   | 点击选择当前题答案                               |
| 上一题           | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-prev-button`                                                                      | 导航到上一题                                     |
| 下一题 / 提交    | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-next-button`                                                                      | 提交当前题或完成问诊                             |
| 空气环境未知     | `src/pages/diagnose/question-package/AirEnvironmentQuestionInput.vue` | `diagnose-air-environment-{questionId}-unknown`                                                              | 仅将当前空气题标为不确定，不能附带 sidecar       |
| 已保存空气摘要   | `src/components/AirEnvironmentSummaryCard.vue`                        | `diagnose-air-environment-{questionId}-summary`                                                              | 已保存且位置未变时直接使用；不展开编辑器         |
| 修改保存空气     | `src/components/AirEnvironmentSummaryCard.vue`                        | `diagnose-air-environment-{questionId}-edit`                                                                 | 点击后展开空气环境编辑器                         |
| 位置确认         | `src/components/AirEnvironmentSummaryCard.vue`                        | `diagnose-air-environment-{questionId}-confirm-location`                                                     | 位置变化时明确确认后才能继续                     |
| 位置变化提示     | `src/pages/diagnose/question-package/AirEnvironmentQuestionInput.vue` | `diagnose-air-environment-{questionId}-location-confirmation`                                                | 未确认时显示旧资料已带入，不能静默使用           |
| 空气换气选项     | `src/components/AirEnvironmentAssessment.vue`                         | `diagnose-air-environment-{questionId}-exchange-*`                                                           | 第一项：按换气来源和开窗情况填写                 |
| 空气周围空间     | `src/components/AirEnvironmentAssessment.vue`                         | `diagnose-air-environment-{questionId}-canopy-*`                                                             | 第二项：选择开阔、有些遮挡、周围遮挡较多或不确定 |
| 空气设备风父选项 | `src/components/DeviceAirflowAssessment.vue`                          | `diagnose-air-environment-{questionId}-device-mode-none` / `device-mode-has-airflow` / `device-mode-unknown` | 第二项先记录设备风是否到达植物                   |
| 空气设备风子选项 | `src/components/DeviceAirflowAssessment.vue`                          | `diagnose-air-environment-{questionId}-device-mode-circulating` / `device-mode-direct`                       | 选择有设备风后记录是否直吹                       |
| 空气设备风来源   | `src/components/DeviceAirflowAssessment.vue`                          | `diagnose-air-environment-{questionId}-device-source-*`                                                      | 选择子选项后记录风来自哪里                       |
| 空气内部步骤导航 | `src/components/AirEnvironmentAssessment.vue`                         | `diagnose-air-environment-{questionId}-next-step` / `previous-step`                                          | 只切换上下游，不推进外层题包                     |
| 空问题占位       | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-empty-question`                                                                   | 断言无可继续回答的问题                           |
| 补图区域         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-image-section`                                                                    | 断言补图入口可见                                 |
| 建议补拍部位     | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-capture-suggestions`                                                              | 断言建议优先补拍部位可见                         |
| 补图槽位网格     | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-upload-slot-grid`                                                                 | 断言补图槽位组可见                               |
| 补图槽位         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-upload-slot-{slotType}`                                                           | 断言指定槽位存在                                 |
| 补图上传按钮     | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-upload-{slotType}-button`                                                         | 点击补到指定槽位                                 |
| 删除补图         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-remove-image-{index}-button`                                                      | 删除已选补图                                     |
| 清空补图         | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-clear-images-button`                                                              | 清空所有补图                                     |
| 补图被阻止       | `src/components/diagnose-flow/DiagnoseQuestionPackageSection.vue`     | `diagnose-question-package-upload-blocked`                                                                   | 断言当前阶段不能补图的原因                       |

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

| 功能模块     | 文件                            | 稳定 id                              | 操作 / 断言                       |
| ------------ | ------------------------------- | ------------------------------------ | --------------------------------- |
| 结果页根容器 | `src/pages/diagnose/result.vue` | `diagnosis-result-page`              | 断言只读结果页加载                |
| 结论列表     | `src/pages/diagnose/result.vue` | `diagnosis-result-page-outcome-list` | 断言历史结果可见，允许 1-N 个结果 |
| 空态         | `src/pages/diagnose/result.vue` | `diagnosis-result-page-empty`        | 断言无历史结果时空态可见          |

### 3.9 个人中心

| 功能模块   | 文件                            | 稳定 id                              | 操作 / 断言      |
| ---------- | ------------------------------- | ------------------------------------ | ---------------- |
| 历史入口   | `src/pages/profile/profile.vue` | `profile-diagnose-history-view-all`  | 点击进入诊断历史 |
| 历史记录项 | `src/pages/profile/profile.vue` | `profile-diagnose-record-{item._id}` | 点击查看历史结果 |

### 3.10 独立浇水建议页

| 功能模块             | 文件                                                                                              | 稳定 id                                                  | 操作 / 断言                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| 步骤切换 swiper      | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-swiper`                                | 断言当前步骤；滑动切换步骤                           |
| 从我的植物选入口     | `src/pages/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-my-plants-entry`                       | 点击在页内打开"我的植物"列表视图                     |
| 我的植物列表返回按钮 | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plants-back`                        | 点击返回来源选择视图                                 |
| 我的植物列表容器     | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plants-list`                        | 断言我的植物列表视图可见                             |
| 我的植物卡片项       | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plant-card-{plant.id}`              | 点击选中该植物；断言选中态显示                       |
| 我的植物确认下一步   | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-my-plants-confirm-button`              | 点击确认选中植物并进入盆型步骤                       |
| 搜索植物输入框       | `src/pages/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-search-input`                          | 输入 / 确认搜索植物种类                              |
| 清空搜索             | `src/pages/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-search-clear`                          | 点击清空搜索关键词                                   |
| 植物结果行           | `src/pages/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-plant-item-{id}`                       | 点击选择植物种类                                     |
| 加载更多             | `src/pages/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-load-more`                             | 点击加载更多搜索结果                                 |
| 下一步：输入盆型     | `src/pages/watering-advisor/components/CatalogPlantSearch.vue`                                    | `watering-advisor-next-button`                           | 点击进入盆型步骤                                     |
| 盆型步骤上一步       | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-back-1`                                | 点击返回选植物步骤                                   |
| 空气环境上一步       | `src/components/AirEnvironmentAssessment.vue` / `src/pages/watering-advisor/watering-advisor.vue` | `watering-advisor-air-environment-back`                  | 编辑态由组件承载并返回选植物；已保存摘要态由页面承载 |
| 空气环境下一步       | `src/components/AirEnvironmentAssessment.vue` / `src/pages/watering-advisor/watering-advisor.vue` | `watering-advisor-air-environment-next`                  | 编辑态由组件承载并进入盆型；已保存摘要态由页面承载   |
| 空气环境换气选项     | `src/components/AirEnvironmentAssessment.vue`                                                     | `watering-advisor-air-environment-exchange-*`            | 填写换气来源与开窗情况                               |
| 空气环境内部下一步   | `src/components/AirEnvironmentAssessment.vue`                                                     | `watering-advisor-air-environment-next-step`             | 从室外换气项进入室内气流项；不推进浇水主线           |
| 空气环境内部上一步   | `src/components/AirEnvironmentAssessment.vue`                                                     | `watering-advisor-air-environment-previous-step`         | 从室内气流项返回室外换气项；不返回选植物             |
| 空气环境设备风来源   | `src/components/DeviceAirflowAssessment.vue`                                                      | `watering-advisor-air-environment-device-source-*`       | 仅直吹或不直吹后显示；仅上游选择新风时显示新风来源   |
| 已保存空气摘要       | `src/components/AirEnvironmentSummaryCard.vue`                                                    | `watering-advisor-air-environment-summary`               | 已保存且位置未变时可直接下一步                       |
| 修改保存空气         | `src/components/AirEnvironmentSummaryCard.vue`                                                    | `watering-advisor-air-environment-edit`                  | 展开编辑器；迟到读取不得覆盖已编辑草稿               |
| 位置确认提示         | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-location-confirmation` | 位置变动时必须确认或修改                             |
| 确认当前位置未变     | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-confirm-location`      | 位置变动时显式确认旧资料仍可使用                     |
| 同步状态             | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-sync-status`           | 仅弱状态，不能阻断建议主流程                         |
| 重试保存             | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-air-environment-retry-save`            | 保存失败后重试；不替换完成按钮                       |
| inline 盆型基质选项  | `src/components/pot-profile/PotProfileFormCore.vue`                                               | `watering-advisor-pot-profile-substrate-{value}`         | 点击切换该基质选项选中态                             |
| inline 排水孔选项    | `src/components/pot-profile/PotProfileFormCore.vue`                                               | `watering-advisor-pot-profile-drainage-{value}`          | 点击选择有/无排水孔                                  |
| 获取建议按钮         | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-compute-button`                        | 点击触发浇水建议计算                                 |
| 结果步骤重新输入     | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-back-2`                                | 点击返回盆型步骤                                     |
| 建议水量结果         | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-result-amount`                         | 断言显示建议水量（矿泉水瓶/5L油桶口径，与首页一致）  |
| 完成按钮             | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-done`                                  | 点击完成独立浇水建议流程                             |
| 空态重试按钮         | `src/pages/watering-advisor/watering-advisor.vue`                                                 | `watering-advisor-empty-retry`                           | 点击返回重新输入                                     |

### 3.11 添加植物 / 编辑植物

| 功能模块       | 文件                                                            | 稳定 id                                                                        | 操作 / 断言                           |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| 选植物搜索框   | `src/pages/user-plant-detail/components/PlantSelectionStep.vue` | `add-plant-search-input`                                                       | 输入搜索植物                          |
| AI 识别入口    | `src/pages/user-plant-detail/components/PlantSelectionStep.vue` | `add-plant-ai-identify-button`                                                 | 点击拍照识别                          |
| 植物卡片项     | `src/pages/user-plant-detail/components/PlantSelectionStep.vue` | `add-plant-card-{plant.id}`                                                    | 点击选中植物                          |
| 添加植物下一步 | `src/pages/user-plant-detail/components/PlantSelectionStep.vue` | `add-plant-next-button`                                                        | 点击进入信息填写步骤                  |
| 信息表单根节点 | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-form` / `edit-plant-form`                                           | 断言添加/编辑植物表单已渲染           |
| 植物照片上传   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-photo-upload` / `edit-plant-photo-upload`                           | 点击上传或替换植物照片                |
| 植物昵称输入   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-nickname-input` / `edit-plant-nickname-input`                       | 输入植物昵称                          |
| 城市修改按钮   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-city-button` / `edit-plant-city-button`                             | 点击打开养护城市选择弹层              |
| 城市弹层关闭   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-city-sheet-close` / `edit-plant-city-sheet-close`                   | 点击关闭城市选择弹层                  |
| 城市选项       | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-city-option-{locationKey}` / `edit-plant-city-option-{locationKey}` | 点击选择养护城市                      |
| 光照环境控件   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-light-*` / `edit-plant-light-*`                                     | 断言光照环境选择器可见并执行对应选择  |
| 盆型输入入口   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-pot-profile-button` / `edit-plant-pot-profile-button`               | 点击打开盆型与基质输入弹层            |
| 盆型确认保存   | `src/pages/user-plant-detail/components/UserPlantPotProfileEditor.vue` | `add-plant-pot-profile-confirm-button` / `edit-plant-pot-profile-confirm-button` | 新增暂存到提交载荷；编辑直接保存接口 |
| 摆放位置选项   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-location-{slot}` / `edit-plant-location-{slot}`                     | 点击切换摆放位置；`slot` 如 `balcony` |
| 种植日期选择   | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-plant-date-picker` / `edit-plant-plant-date-picker`                 | 点击选择种植日期                      |
| 备注输入       | `src/pages/user-plant-detail/components/PlantForm.vue`          | `add-plant-notes-input` / `edit-plant-notes-input`                             | 输入备注                              |
| 添加植物上一步 | `src/pages/user-plant-detail/components/PlantInfoStepPanel.vue` | `add-plant-back-to-selection-button`                                           | 点击返回植物选择步骤                  |
| 添加植物提交   | `src/pages/user-plant-detail/components/PlantInfoStepPanel.vue` | `add-plant-submit-button`                                                      | 点击完成添加植物                      |
| 编辑植物提交   | `src/pages/user-plant-detail/components/PlantInfoStepPanel.vue` | `edit-plant-submit-button`                                                     | 点击保存植物信息                      |

### 3.12 诊断 tab 与提醒 tab

| 功能模块          | 文件                              | 稳定 id                         | 操作 / 断言                      |
| ----------------- | --------------------------------- | ------------------------------- | -------------------------------- |
| 诊断 tab 页面     | `src/pages/diagnose/diagnose.vue` | `diagnose-tab-page`             | 断言五项 tab 的诊断页加载        |
| 诊断 tab 共享内核 | `src/pages/diagnose/diagnose.vue` | `diagnose-tab-flow`             | 断言页面直接复用 `DiagnoseFlow`  |
| 提醒 tab 页面     | `src/pages/reminder/reminder.vue` | `reminder-tab-page`             | 断言提醒页加载且只展示浇水入口   |
| 提醒植物列表      | `src/pages/reminder/reminder.vue` | `reminder-tab-plant-list`       | 断言用户植物列表可见             |
| 提醒植物项        | `src/pages/reminder/reminder.vue` | `reminder-tab-plant-{plant.id}` | 断言植物信息与浇水入口同卡展示   |
| 打开浇水提醒      | `src/pages/reminder/reminder.vue` | `reminder-tab-water-{plant.id}` | 点击复用 `WateringReminderSheet` |

### 3.13 完整空气环境评估（独立容器页）

空气环境由同一个 `AirEnvironmentAssessment` 组件承载两个连续步骤：第一项判断室内外空气交换，第二项判断植物周围的室内局部气流。独立页面 `/pages/airflow/index` 只是该组件的容器；浇水建议、诊断题包和植物详情均直接调用组件，不得拆成两个业务路由。

| 功能模块                 | 文件                                          | 稳定 id                                                                                        | 操作 / 断言                                              |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 完整评估容器             | `src/components/AirEnvironmentAssessment.vue` | `airflow-assessment`                                                                           | 断言上下游组件根节点可见                                 |
| 通用步骤轨道             | `src/components/common/ButtonStepTrack.vue`   | `airflow-swiper`                                                                               | 断言两个步骤项由通用轨道承载                             |
| 上游步骤                 | `src/components/AirEnvironmentAssessment.vue` | `airflow-exchange-step`                                                                        | 第一项：室内外空气交换                                   |
| 下游步骤                 | `src/components/AirEnvironmentAssessment.vue` | `airflow-local-airflow-step`                                                                   | 第二项：植物周围室内气流                                 |
| 换气来源：窗户情况       | `src/components/SelectableCard.vue`           | `airflow-exchange-source-window`                                                               | 点击选择窗户情况；展开单/双方向或关闭窗户补充项          |
| 换气来源：新风系统       | `src/components/SelectableCard.vue`           | `airflow-exchange-source-fresh_air`                                                            | 点击选择新风；下游才显示新风气流来源                     |
| 换气来源：不确定         | `src/components/SelectableCard.vue`           | `airflow-exchange-source-unknown`                                                              | 点击选择不确定；记录中须保留“不确定”                     |
| 开窗方向：一个方向       | `src/components/AirExchangeAssessment.vue`    | `airflow-exchange-window-direction-one`                                                        | 仅 `source=window` 时可见；点击选择单方向                |
| 开窗方向：两个及以上方向 | `src/components/AirExchangeAssessment.vue`    | `airflow-exchange-window-direction-two-or-more`                                                | 仅 `source=window` 时可见；点击选择双方向                |
| 开窗方向：关闭窗户       | `src/components/AirExchangeAssessment.vue`    | `airflow-exchange-window-direction-closed`                                                     | 仅 `source=window` 时可见；点击选择关闭窗户              |
| 开窗频率：每天           | `src/components/AirExchangeAssessment.vue`    | `airflow-exchange-window-frequency-daily`                                                      | 仅 `source=window` 时可见；点击选择每天                  |
| 开窗频率：隔天           | `src/components/AirExchangeAssessment.vue`    | `airflow-exchange-window-frequency-every-other-day`                                            | 仅 `source=window` 时可见；点击选择隔天                  |
| 开窗频率：每周 1–2 次    | `src/components/AirExchangeAssessment.vue`    | `airflow-exchange-window-frequency-weekly-1-2`                                                 | 仅 `source=window` 时可见；点击选择每周 1–2 次           |
| 上游到下游               | `src/components/AirEnvironmentAssessment.vue` | `airflow-next-step` / `airflow-previous-step`                                                  | 只切换组件内部步骤，不提交外层流程                       |
| 植物周围空间             | `src/components/AirEnvironmentAssessment.vue` | `airflow-canopy-*`                                                                             | 第二项选择开阔、有些遮挡、周围遮挡较多或不确定           |
| 设备风父选项             | `src/components/DeviceAirflowAssessment.vue`  | `airflow-device-mode-none` / `airflow-device-mode-has-airflow` / `airflow-device-mode-unknown` | 先记录没有设备风、有设备风吹到植物或不确定               |
| 设备风子选项             | `src/components/DeviceAirflowAssessment.vue`  | `airflow-device-mode-circulating` / `airflow-device-mode-direct`                               | 选择“有设备风吹到植物”后，继续记录是否直吹叶片           |
| 设备风来源               | `src/components/DeviceAirflowAssessment.vue`  | `airflow-device-source-*`                                                                      | 选择直吹/不直吹后显示；仅上游选择新风时显示新风来源      |
| 完成按钮                 | `src/components/AirEnvironmentAssessment.vue` | `airflow-submit-button`                                                                        | 室内气流 item 内完成；初始未答或答案不完整不可用         |
| 结果摘要                 | `src/pages/airflow/index.vue`                 | `airflow-result-summary`                                                                       | 断言显示“记录完成”与用户已选的换气方式；不得展示等级结论 |
| 重置按钮                 | `src/pages/airflow/index.vue`                 | `airflow-reset-button`                                                                         | 点击清空选择并回到初始未答态                             |

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
| `care.watering.reminder_dose.dose_label_layout`     | `test/e2e/automator/care/watering/reminder-dose/dose-label-layout.mjs`       | `3.10`              |
| `care.watering.reminder_dose.unit_alignment_final`  | `test/e2e/automator/care/watering/reminder-dose/unit-alignment-final.cjs`    | `3.10`              |
| `care.watering.reminder_dose.unit_alignment_v4`     | `test/e2e/automator/care/watering/reminder-dose/unit-alignment-v4.cjs`       | `3.10`              |
| `care.air_exchange.v1`                              | `test/e2e/automator/care/airflow/air-exchange-v1.mjs`                        | `3.13`              |
| `care.air_environment_v2.user_plant_watering`       | `test/e2e/automator/care/airflow/air-environment-v2-user-plant-watering.mjs` | `3.10`              |
| `diagnosis.air_environment_v2.question_packages`    | `test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs`      | `3.1`、`3.3`        |
