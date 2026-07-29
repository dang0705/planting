---
type: decision
status: active
created: 2026-06-26
domain: [architecture, backend, frontend]
source_verified:
  - cloudfunctions/layer/utils/watering-planner.js
  - cloudfunctions/diagnose-http/utils/environment-context-v7.js
  - cloudfunctions/plant-user-http/app.js
  - cloudfunctions/layer/utils/plant-knowledge.js
  - src/pages/index/components/WateringReminderSheet.vue
  - src/store/plants.js
  - src/components/CareBehaviorTimeline.vue
---

# 浇水日推算逻辑架构决策

## 1. 核心决策

`buildWateringPlanner` 已从 `diagnose-http/utils/environment-context-v7.js` 抽取到 `cloudfunctions/layer/utils/watering-planner.js` 作为共享纯计算模块。diagnose-http 与 plant-user-http 共用同一实现，避免代码漂移。

## 2. planner 输出契约

原有输出（诊断链路依赖）：`baseline / wateringContext / action / reasons / thresholds / calculation`

新增输出（首页浇水提醒弹框依赖）：
- `nextWaterDate`：下次浇水日期 'YYYY-MM-DD' 或 null
- `nextWaterWindow`：[minDays, maxDays] 建议窗口
- `nextWaterReason`：人类可读的推算理由

## 3. WET 阻断逻辑

WET（偏湿/过浇）时 `nextWaterDate` 返回 null，不推导具体浇水日期。前端检测到 WET 后：
- "添加至日历"按钮禁用，文案改为"近期过浇，暂不安排浇水"
- Summary 卡片变橙色显示"过浇警示"

WET 触发条件（两条路径，任一满足）：
1. **浇水次数超限**：`wateringCount10d > effectiveWetWaterings10d`（基线窗口容量减去天气偏湿扣减）
2. **强偏湿环境独立触发**：`strongWetEnvironment`——至少 2 种偏湿天气信号命中（高湿、冷湿、雨天）且有浇水记录。不限制 lastWateredDaysAgo 天数。

## 4. nextWaterDate clamp

所有分支（WET/DRY/BASELINE）的 nextWaterDate 都 clamp 到不早于 referenceDate + 1（明天），避免算出过去日期。

## 5. 天气数据流

前端 `WateringReminderSheet` 在用户点击"上次浇水"入口时调 `getEnvironmentWeatherWindow({ mode: 'environment' })`，获取：
- `historicalDays`（过去 10 天）→ 传给后端 `weatherDays` → planner `historical`
- `forecastDays`（未来 15 天）→ 传给后端 `forecastDays` → planner `forecast`

后端 `buildWeatherSummary` 从日数据提取 highHumidityDays/coldHumidDays/rainyDays/hotDryDays 等摘要字段，适配 `tempMaxC/tempMinC/humidity/precipMm/textDay` 实际字段名。

天气数据同时通过 `mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline` 合入 timeline，让 `CareBehaviorTimeline` 组件渲染每日温湿度。

## 6. 性能优化

planner 接口不走 `getUserPlantInstanceById`（3 次串行 SQL），改用 `getUserPlantWateringStrategy`（2 次 SQL）：
1. 查 `user_plant_instances` 拿 `plant_id` / `session_plant_id`
2. 用 `getPlantCatalogById` 查属级 watering 策略

不查 `watering_events_json`（planner 不需要已有事件，事件是前端传入的）、不查 `alias_summary`。

## 7. schema 变更

新增 `watering_events_json` TEXT 列存 10 天浇水事件集合 JSON。`last_watered` 保留单值语义（取最近事件日期）。
- 读：`getUserPlantWateringEvents` 单独 try/catch 查询，列不存在时返回 null 不阻断
- 写：从主 UPDATE 拆出，单独 try/catch 写入，列不存在时跳过不阻断 `last_watered` / `next_water` 写入

需云端执行 `ALTER TABLE user_plant_instances ADD COLUMN watering_events_json TEXT`。

## 8. 前端旧公式下线

`src/store/plants.js` 的 `completeWatering` 不再用前端平均值公式计算 `nextWater`（`Math.round((min+max)/2)`），改为写回 planner 产出的 `nextWaterDate` + 浇水事件集合。无参调用向后兼容（仅写 `lastWatered = now`）。
