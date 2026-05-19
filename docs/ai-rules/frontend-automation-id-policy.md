# 前端自动化 id 与微信开发者工具验收规则

## 1. 定位

本文件维护小程序前端诊断流的稳定 `id` 契约、操作映射和 QA 自动化派发规则。

适用范围：

1. 首页 / 植物详情进入诊断。
2. `DiagnosePopup` 主诊断弹窗。
3. 0 模型人工诊断入口。
4. 图片上传、开始诊断、AI 诊断确认、问诊答题、补图、完成 / 重置。
5. 独立问诊页 `/pages/diagnose/follow-up`。
6. 只读结果承接页 `/pages/diagnose/diagnose`。
7. 首页 / 个人页诊断历史回放入口。

本文件不定义诊断业务规则，不替代 replay / CloudBase / DB 证据。

## 2. id 命名规则

1. `id` 必须稳定、语义清楚，用于自动化定位和用户可见状态断言。
2. 动态 `id` 只允许使用稳定业务 key，例如 `plant.id`、`slotType`、`questionId`、`optionId`、`record._id`。
3. 深链或历史兼容页面若上游数据缺失稳定 key，可以显式写入 fallback 契约，例如 `questionIndex`、`optionKey`、`optionIndex`；QA 使用前必须按文档确认 fallback 规则。
4. 禁止把 `openid`、token、CloudBase 环境密钥、完整 `diagnosisSessionId`、route debug key、prompt、模型原始返回写进 `id`。
5. 自动化不得依赖中文文案、Tailwind class、页面层级顺序或截图坐标作为首选定位方式。
6. 开发/自动化辅助入口必须标明为辅助入口，不能单独作为真实用户路径验收通过证据。

## 3. 诊断流 id 映射

| 步骤 | 文件 | 稳定 id | 操作 / 断言 |
|---|---|---|---|
| 首页进入诊断 | `src/pages/index/index.vue` | `diagnose-entry-button-{plant.id}` | 点击打开诊断弹窗 |
| 植物详情进入诊断 | `src/pages/plant-detail/plant-detail.vue` | `plant-detail-diagnose-button` | 点击打开诊断弹窗 |
| 诊断弹窗根容器 | `src/components/DiagnosePopup.vue` | `diagnose-popup-panel` | 断言弹窗已打开 |
| 弹窗滚动内容 | `src/components/DiagnosePopup.vue` | `diagnose-popup-scroll` | 断言主内容可见 |
| 主上传阶段 | `src/components/DiagnosePopup.vue` | `diagnose-upload-stage` | 断言处于开始诊断前 |
| 0 模型 picker 控件 | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-picker-control` | 开发/自动化时选择模拟症状类 |
| 0 模型 picker 展示容器 | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-picker` | 断言当前选中项展示 |
| 0 模型自动化快捷选择 | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-option-{classKey}` | 自动化优先点击；黄叶为 `diagnose-dev-symptom-class-option-yellowing_mode` |
| 无图症状模式正式快捷入口 | `src/components/DiagnosePopup.vue` | `3ef72261--diagnose-dev-symptom-class-quick-select` | 正式无图症状模式直接诊断入口；点击后调用 `/diagnosis/question/start` |
| 0 模型清空 | `src/components/DiagnosePopup.vue` | `diagnose-dev-symptom-class-clear-button` | 清除模拟症状类 |
| 主图上传槽位容器 | `src/components/DiagnosePopup.vue` | `diagnose-upload-slot-{slotType}` | 断言槽位存在 |
| 主图上传按钮 | `src/components/DiagnosePopup.vue` | `diagnose-upload-{slotType}-button` | 点击选择图片 |
| 主图数量 | `src/components/DiagnosePopup.vue` | `diagnose-upload-count` | 断言上传数量 |
| 开始诊断 | `src/components/DiagnosePopup.vue` | `diagnose-submit-button` | 点击提交主诊断 |
| AI 诊断确认弹窗 | `src/components/AIStreamDialog.vue` | `ai-stream-dialog` | 断言 AI 诊断过程弹窗出现 |
| AI 诊断确认 | `src/components/AIStreamDialog.vue` | `ai-stream-confirm-button` | 点击进入问诊 |
| AI 诊断取消 | `src/components/AIStreamDialog.vue` | `ai-stream-cancel-button` | 点击取消继续 |
| 结果阶段容器 | `src/components/DiagnosePopup.vue` | `diagnose-result-stage` | 断言诊断已有结果 |
| 当前结论 | `src/components/DiagnosePopup.vue` | `diagnose-result-current-conclusion` | 断言结论标题 / 摘要可见 |
| 处理建议 | `src/components/DiagnosePopup.vue` | `diagnose-result-action-advice` | 断言行动建议可见 |
| 暂时不要做 | `src/components/DiagnosePopup.vue` | `diagnose-result-avoid-advice` | 断言避免项可见 |
| 问诊容器 | `src/components/DiagnosePopup.vue` | `diagnose-result-followup-required` | 断言进入追问阶段 |
| 问诊问题卡 | `src/components/DiagnosePopup.vue` | `diagnose-followup-question-{questionId}` | 断言当前问题可见 |
| 问诊选项 | `src/components/DiagnosePopup.vue` | `diagnose-followup-option-{questionId}-{optionId}` | 点击回答选项 |
| 上一题 / 下一题 | `src/components/DiagnosePopup.vue` | `diagnose-followup-prev-button` / `diagnose-followup-next-button` | 导航问诊步骤 |
| 补图区域 | `src/components/DiagnosePopup.vue` | `diagnose-followup-image-section` | 断言补图入口可见 |
| 补图上传槽位 | `src/components/DiagnosePopup.vue` | `diagnose-followup-upload-slot-{slotType}` | 断言补图槽位存在 |
| 补图上传按钮 | `src/components/DiagnosePopup.vue` | `diagnose-followup-upload-{slotType}-button` | 点击补图 |
| 提交补图 | `src/components/DiagnosePopup.vue` | `diagnose-followup-image-submit-button` | 提交补图诊断 |
| 重置 / 完成 | `src/components/DiagnosePopup.vue` | `diagnose-reset-button` / `diagnose-finish-button` | 重新开始或关闭弹窗 |
| 独立问诊页 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page` | 断言深链问诊页加载 |
| 独立问诊题卡 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page-question-card-{questionId 或 questionIndex}` | 断言当前题可见；优先 `questionId`，缺失时用 `questionIndex` |
| 独立问诊选项 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page-option-{questionId 或 questionIndex}-{optionId 或 optionKey 或 optionIndex}` | 点击回答选项；优先 `questionId/optionId`，缺失时按 fallback |
| 独立问诊上一题 / 下一题 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-page-prev-button` / `diagnose-followup-page-next-button` | 导航独立问诊步骤 |
| 独立问诊完成状态卡 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-result-card` | 断言问诊完成状态可见；不是 outcome 展示区域 |
| 独立问诊唯一结论区域 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-result-outcomes` | 唯一 outcome 展示区域，断言 1-N 个 outcomes 平铺展示 |
| 独立问诊行动建议 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-result-action-advice` | 断言建议按 outcome 对应展示 |
| 独立问诊简版完成态 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-outcome-card` | 断言没有收敛明细时的完成态可见 |
| 独立问诊简版处理建议 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-outcome-action-advice` | 断言简版完成态处理建议可见 |
| 独立问诊简版暂时不要做 | `src/pages/diagnose/follow-up.vue` | `diagnose-followup-outcome-avoid-advice` | 断言简版完成态避免项可见 |
| 结果页根容器 | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page` | 断言只读结果页加载 |
| 结果页结论列表 | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page-outcome-list` | 断言历史结果可见 |
| 结果页空态 | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page-empty` | 断言无历史结果时的空态可见 |
| 返回首页 | `src/pages/diagnose/diagnose.vue` | `diagnosis-result-page-home-button` | 点击返回首页 |
| 首页历史项 | `src/pages/index/index.vue` | `index-diagnose-record-{record._id}` | 点击查看历史结果 |
| 个人页历史入口 | `src/pages/profile/profile.vue` | `profile-diagnose-history-view-all` | 点击进入诊断历史 |
| 个人页历史项 | `src/pages/profile/profile.vue` | `profile-diagnose-record-{item._id}` | 点击查看历史结果 |

## 4. wechat-dev-tools MCP QA 最小流程

QA 执行小程序前端自动化时按以下顺序：

1. 连接微信开发者工具：先调用 `mp_ensureConnection`。
2. 如果连接失败，只允许一次带 `reconnect=true` 的引导重试。
3. 如果工具要求选择项目，调用 `mp_listProjects` 或使用 main agent 指定的 `projectSelection`。
4. 使用 `mp_navigate` 进入页面，或通过入口按钮从真实页面进入诊断流。
5. 使用 `element_getInnerElement` / `element_getInnerElements` 按 `#id` 定位容器和控件。
6. 使用点击、输入、等待、截图工具形成证据；优先记录命中的 `id`、页面路径和用户可见文本。
7. `page_setData` 只允许用于明确标记的诊断辅助测试，不能替代真实用户路径。

MCP 连接成功、页面能打开、截图存在，都不是业务验收通过；必须能证明目标入口、用户可见状态、关键建议/结论区域按 id 命中。

## 5. QA 派发模板

```text
前端自动化 QA 任务：
- 读取规则：docs/ai-rules/frontend-automation-id-policy.md
- 工具：wechat-dev-tools MCP
- 连接：mp_ensureConnection；失败时一次 reconnect；需要项目选择时 mp_listProjects
- 页面入口：
  1. 首页诊断入口 diagnose-entry-button-{plant.id}
  2. 植物详情入口 plant-detail-diagnose-button
  3. 独立问诊页 diagnose-followup-page
  4. 只读结果页 diagnosis-result-page
- 必须断言：
  1. diagnose-popup-panel 可命中
  2. 3ef72261--diagnose-dev-symptom-class-quick-select 作为无图症状模式入口容器可命中；点击具体症状项 diagnose-dev-symptom-class-option-{classKey}
  3. 无图症状入口走 /diagnosis/question/start，不出现 AIStreamDialog / SSE 视觉流程
  4. diagnose-result-current-conclusion 或 diagnose-result-followup-required 可命中
  5. 问诊选项 id 可命中，并且后续提交走 /diagnosis/answer
  6. 该会话证据 sourceType=manual_symptom_mode，可在 result/review/detail 或日志中确认
  7. diagnosis-result-page-outcome-list 或 diagnosis-result-page-empty 可命中
- 禁止：
  1. 不用中文文案或 Tailwind class 作为主选择器
  2. 不用 page_setData 替代真实用户路径，除非任务明确标记为辅助测试
  3. 不把 MCP 成功连接当业务验收
```

## 6. 维护要求

新增或重命名诊断流关键入口时，必须同步更新本文件的映射表。

涉及 `DiagnosePopup.vue`、`follow-up.vue`、`diagnose.vue`、首页/个人页诊断历史入口的 QA 任务，默认把本文件作为 QA 必读规则。
