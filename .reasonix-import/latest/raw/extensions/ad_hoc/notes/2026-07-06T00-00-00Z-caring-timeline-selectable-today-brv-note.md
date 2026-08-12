## 记录时间
2026-07-06

## 记忆类型
浇水提醒业务事实（可检索知识补充）

## 事实

- 诊断/提醒时间线的可选上界已同步为“当日可选”：`CareBehaviorTimeline` 中上边界从 d-1 放宽到 d0，用户在问诊时间线里可直接点击当日浇水格子。
- `src/utils/care-behavior-timeline/display-window.js` 的选择窗口默认是 `DEFAULT_SELECTABLE_START_OFFSET = -10`、`DEFAULT_SELECTABLE_END_OFFSET = 0`；显示窗口保持原先 d-16~d+4（当前代码的 displayWindow 维持独立不变）。
- `buildCareBehaviorTimelineFromDateEvents` 已移除“过滤当天”的逻辑，便于当天事件参与 `watering_events_10d / fertilizing_events_10d / light_change_events_10d` 的 payload 回传。
- `cloudfunctions/layer/utils/watering-planner.js` 的 `normalizeCareBehaviorTimeline` 改为先按日期去重再“最近 10 天保留最近窗口”，避免当满窗口时把 d0 事件丢掉。
- `cloudfunctions/diagnose-http/utils/environment-context-v7.js` 同步了最近事件截断逻辑，`buildBehaviorSummary` 与 `watering_events_10d` 一并按最近 10 天窗口计算，保留当天输入的可参与度。
- 对外可见契约也同步：`/user-plants/watering-planner` 的入参 `wateringEvents` 约定改为“最近 10 天（含当日可回传）”。

## 约束/应用

在与 `CareBehaviorTimeline`、`watering-planner`、`environment-context-v7` 相关的规则文档、评审或问答时，以“可选上界可达今日、显示窗口与可选窗口分离、后端近期事件采用最近10条（含今天）”作为同步基准。

## 来源
`src/utils/care-behavior-timeline/display-window.js`
`src/components/care-behavior-timeline/useCareBehaviorTimeline.js`
`src/utils/care-behavior-timeline/sidecar.js`
`cloudfunctions/layer/utils/watering-planner.js`
`cloudfunctions/diagnose-http/utils/environment-context-v7.js`
`docs/ACTIVE_CONTRACTS.md`
`docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md`
`docs/new-rules/planting_ai_diagnosis_all_in_one.md`
