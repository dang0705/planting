# 前端闭环验收约束（environment-weather-window）

## 结论
后端接口能力通过并不等于前端验收通过。ClickUp 86exr721h 的 done 要求补齐前端证据链。

## 必须核验的闭环
1. 前端必须调用 `weather-http/weather/environment-context`。
2. 前端必须将后端返回的 `environmentWeatherWindow` 合并为 `weatherByDate`。
3. `weatherByDate` 必须用于 `CareBehaviorTimeline` 的日期区间（含 D-10~D-1）展示。
4. `follow-up payload` 必须带上 `environmentWeatherWindow`，用于后端环境上下文构建，不得遗漏。

## ClickUp 纪律
ClickUp 没有真实 checklist 时，不得用符号/文字（例如 ✔/✅/yes）替代 checklist 勾选。
- 只能在评论中说明状态。
- 状态变更必须通过 ClickUp 真实的状态动作。

## 建议验证命令（最小闭环）
- `rg "environmentWeatherWindow|weatherByDate|CareBehaviorTimeline|environment-context" -n src`
- `rg "follow-up|followup|environmentWeatherWindow" -n src`
- `rg "D-10|D-1|D-\d+|日期" -n src`

## 复核口径
- 仅在确认：接口调用、字段映射、前端展示、follow-up 透传均完整后，才视为闭环通过。

## 2026-05-31 端上复核证据
- WeChat DevTools 已连接 `dist/build/mp-weixin`。
- 使用真实缓存 payload：`__plantsight_diagnose_follow_up__diag_1780238027450_gchzr4nt`。
- 页面：`/pages/diagnose/follow-up?draftKey=__plantsight_diagnose_follow_up__diag_1780238027450_gchzr4nt`。
- `page_getElements(".care-behavior-cell")` 返回 21 个日期格。
- D-10~D-1 中 `2026-05-21` 至 `2026-05-30` 日期格出现温湿度文本，例如 `21 / 温 / 24/18 / 湿 / 78`、`30 / 温 / 27/21 / 湿 / 62`。
- D0 `2026-05-31` 出现 `温 / 33/25 / 湿 / 35`，未来格 `2026-06-01` 至 `2026-06-04` 出现预报温湿度。
- `mp_getLogs` 复核无新增错误日志。
