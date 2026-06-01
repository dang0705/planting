# 环境上下文 v7 实现 handoff

日期：2026-05-27

## 范围

本次按 v7 口径落地环境上下文与养护行为 sidecar：

- `weather-http` 新增 `/weather/environment-context`，统一获取 D-10~D-1 历史天气、D0~D+14 预报与 D0 当前天气。
- `diagnose-http` 新增 v7 环境摘要、浇水/施肥/光照 planner 纯函数，并在 follow-up answer 主链消费 `careBehaviorTimeline` 与 `environmentWeatherWindow` 顶层 payload。
- 前端 follow-up 新增最近 10 天行为日期控件；该控件附加在原单选题上，不替代原选项。`answers[]` 仍只提交 `{ questionId, optionId }`，行为时间线与天气窗口走顶层 sidecar。
- runtime snapshot、session state、result read 增加 `careBehaviorTimeline` 与 `environmentCareContext` 恢复字段。

## v7 关键约束

- 浇水依赖属级浇水基线、历史环境、最近 10 天浇水行为、未来 15 天预报。
- 浇水上下文只输出 `likely_too_wet`、`likely_too_dry`、`keep_baseline_or_check_soil`。
- 施肥 MVP 不参考天气，只按 30-45 天薄肥一次、施肥事件、浓度、`lastFertilizedBucket`、换盆和弱生长门控。
- 光照 UV 只在用户存在真实直射/受光场景时参与，不允许 UV-only 命中；前端控件区分“增晒”和“直射”。
- 单次摘要仍为 O(n)，天气 daily records 上限为 10 + 15。

## 主要文件

- `cloudfunctions/weather-http/adapters/qweather-adapter.js`
- `cloudfunctions/weather-http/services/weather-window-service.js`
- `cloudfunctions/weather-http/app.js`
- `cloudfunctions/diagnose-http/utils/environment-context-v7.js`
- `cloudfunctions/diagnose-http/app/care-behavior-payload.js`
- `cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js`
- `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
- `cloudfunctions/diagnose-http/services/session-runtime-snapshot-codec.js`
- `cloudfunctions/diagnose-http/services/session-read-service.js`
- `cloudfunctions/diagnose-http/services/session-result-read-service.js`
- `cloudfunctions/diagnose-http/repositories/prior-plant-context-repository.js`
- `cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js`
- `cloudfunctions/diagnose-http/app/frontend-response.js`
- `src/components/CareBehaviorTimeline.vue`
- `src/components/DiagnosePopup.vue`
- `src/pages/diagnose/follow-up.vue`
- `src/utils/diagnose-flow.js`
- `src/utils/environment-care-context.js`
- `src/api/weather.js`
- `src/vue-query/weather/queries/environment-weather.js`
- `src/vue-query/diagnose/mutations/shared.js`
- `src/vue-query/diagnose/mutations/useDiagnoseFollowUpMutation.js`
- `test-environment-care-context.mjs`
- `test-care-behavior-payload.mjs`

## 接口与字段契约

`POST /weather/environment-context` 入参：

- 必填：`lat`、`lng`
- 可选：`city`、`province`、`diagnosisDate`、`useCache`

返回 `data` 主要字段：

- `historicalDays`：D-10~D-1，最多 10 条 daily record。
- `today`：D0 当前天气与当日预报合并摘要。
- `forecastDays`：D0~D+14，最多 15 条 daily record。
- `meta`：包含 `diagnosisDate`、窗口名称、daily record 数量和来源。
- `cached/cacheScope/cachedAt/expiresAt`：天气窗口缓存信息。

`POST /diagnosis/answer` 顶层 sidecar 字段：

- `careBehaviorTimeline`：前端日期控件产生的最近 10 天行为记录，不进入 `answers[]`。
- `environmentWeatherWindow`：前端用当前位置请求到的环境天气窗口；缺失时后端仍可只保存行为时间线。
- `environmentCareContext`：可选完整环境上下文；通常由后端按 `careBehaviorTimeline + environmentWeatherWindow + plantContext` 构建。

`answers[]` 保持单选契约：只提交 `{ questionId, optionId }`，不得把行为时间线 JSON 写入 `optionId`、`answerValue` 或 `diagnosis_follow_ups.answer_value`。

## 字段生命周期

- 前端：`CareBehaviorTimeline.vue` 写入本地 answer object，`buildFollowUpPayload()` 拆出 `careBehaviorTimeline` 顶层字段。
- 触发：后端 synthetic follow-up 对浇水、施肥、光照相关 `targetDimension` 默认注入 `uiVariant=care_behavior_timeline`；前端也按 `targetDimension` 做兜底识别。
- 诊断 answer 主链：`care-behavior-payload.js` 归一化 sidecar，生成 `environmentCareContext`。
- 多轮恢复：空的 incoming `careBehaviorTimeline` 不能覆盖 snapshot 中已有的真实时间线；只有包含 daily records / events / 明确施肥 bucket 的 incoming timeline 才作为新输入。
- runtime：`diagnosis-engine` 所有返回路径透传 sidecar，包含 route fast path / early return。
- 持久化：`session-runtime-snapshot-codec.js` 将 `careBehaviorTimeline`、`environmentCareContext` 写入 `runtime_snapshot_json`。
- 恢复：`session-read-service.js` 下一轮 answer 从 snapshot 恢复；`session-result-read-service.js` 结果读取也透传。

## 验证

- `node test-environment-care-context.mjs`
- `node test-care-behavior-payload.mjs`
- `npm run lint`：通过，仓库存在既有 warning，无 error。
- `npm run build`：通过。
- `npm test`：通过，5/5。

## 未覆盖

- 未执行 CloudBase 部署、云端 smoke、DB 实例验证。
- 未更新 ClickUp 状态；如需同步，应由任务系统侧追加验收证据。
