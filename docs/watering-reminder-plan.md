# 浇水提醒规划

## 目标
基于 `user_plants`、`plants` 和天气数据，生成更可信的浇水提醒，而不是只按固定天数推算。

## 现状
- `getUserPlants` 已返回 `watering_freq`
- `getWeather` 已能按经纬度获取实时天气
- `plants` 表已有浇水频率等静态养护信息
- 前端 `plantsNeedWater` 仅依据 `nextWater <= now`

## 建议的数据流
1. 继续以 `plants.watering_freq` 作为基础频率。
2. 在 `user_plants` 增加用户维度字段：
   - `city`
   - `lat`
   - `lng`
   - `last_weather_check`
   - `watering_strategy` 可选，便于未来手动覆盖
3. 新增云函数 `getWateringReminders`：
   - 拉取当前用户 `user_plants`
   - 关联 `plants` 获取 `watering_freq`
   - 拉取当前位置天气
   - 输出每株植物的 `shouldWater`、`reason`、`recommendedDate`
4. 前端首页只消费提醒结果，不直接自行推算。

## 第一版规则
- 基础频率来自 `watering_freq` 的季节配置。
- 若天气高温、低湿、强日照：提前 1 天提醒。
- 若天气低温、高湿、连续阴雨：延后 1-2 天提醒。
- 若植物最近 24 小时已浇水：强制不提醒。
- 若植物没有位置：回退到固定频率。

## 结果结构建议
```json
{
  "plantId": 12,
  "shouldWater": true,
  "recommendedDate": "2026-03-16T09:00:00.000Z",
  "reason": "近期高温低湿，建议较平时提前浇水",
  "weatherAdjustmentDays": -1
}
```

## 实施顺序
1. 扩充 `user_plants` 位置字段。
2. 新建 `getWateringReminders` 云函数。
3. 首页和植物详情页改用提醒接口。
4. 后续再加入天气预报和推送提醒。
