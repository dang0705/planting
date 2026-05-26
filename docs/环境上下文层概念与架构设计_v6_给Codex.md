# 环境上下文层概念与架构设计 v6（给 Codex）

> 适用范围：青花植 / planting 项目诊断路径规划与养护建议生成  
> 文档定位：给 Codex 执行与审查使用的架构约束文档  
> 版本：v6  
> 核心更新：基于和风天气「时光机最近 10 天」与「未来 15 天天气预报」重新收口环境上下文层；不再要求项目侧滚动缓存历史天气；新增“最近 10 天日期控件 + 当天天气提示”作为用户养护行为回忆辅助。

---

## 1. 核心裁决

### 1.1 环境上下文层是通用层，不是黄叶专用层

环境上下文层不绑定黄叶。它为多个症状路径提供统一环境事实，包括但不限于：

- 黄叶
- 萎蔫
- 焦边
- 掉叶
- 晒伤
- 徒长
- 叶片变淡
- 根区偏湿 / 闷根风险
- 施肥后异常
- 光照突变应激

因此，模块命名不应使用 `yellow_leaf_weather_context` 之类的症状专名。推荐命名：

```ts
environmentContext
plantEnvironmentContext
weatherEnvironmentContext
```

---

### 1.2 属级养护静态数据层保持轻量

`genus_care_profiles` 仍是属级养护基线表。它不承载运行时规则、问诊合并逻辑、解释文案或审计来源。

当前字段口径：

```text
watering_strategy_json
fertilizing_strategy_json
light_strategy_json
airflow_strategy_json
temp_min_c
temp_max_c
humidity_min
humidity_max
uv_index_min
uv_index_max
```

其中：

- `light_strategy_json` 保持短 JSON，仅保存人类可读的光照基线。
- `uv_index_min / uv_index_max` 是属级 UV 参考边界。
- `uv_index_min / uv_index_max` 不代表植物真正需要 UV；它只是当用户问诊确认存在户外、阳台、窗边直射等真实受光场景时，用于判断直射/暴晒风险的环境边界。
- `source_urls`、`qweather_field`、`uv_index_scale`、`questionnaire_merge_keys`、`guardrail_cn`、`audit_*` 不进入生产 SQL。

---

[//]: # (### 1.3 不再做项目侧历史天气滚动缓存)

[//]: # ()
[//]: # (v5 中“过去 15 天诊断窗口需要项目侧滚动缓存补齐”的口径废弃。)

[//]: # ()
[//]: # (新的裁决：)

[//]: # ()
[//]: # (```text)

[//]: # (诊断环境窗口：和风天气时光机最近 10 天历史天气)

[//]: # (养护建议窗口：和风天气未来 15 天天气预报)

[//]: # (项目侧不再为延长历史窗口而自行滚动缓存天气)

[//]: # (```)

[//]: # ()
[//]: # (允许项目侧做技术缓存，例如减少 API 调用、避免重复请求、加快页面响应，但这不是业务上的“自行缓存 15 天历史天气”。)

[//]: # ()
[//]: # (---)

## 2. 和风天气 API 边界

### 2.1 历史天气：时光机最近 10 天

和风天气「天气时光机」用于获取最近 10 天的天气历史再分析数据。请求路径：

```text
/v7/historical/weather
```

关键约束：

```text
date 最多选择最近 10 天，不包含今天
```

因此，诊断历史环境主窗口为：

```text
D-10 ~ D-1
```

其中：

- `D0` 是当天；
- `D-1` 是昨天；
- `D-10` 是最近可取的第 10 个历史日。

当天数据不能从时光机历史接口获取，应使用实时天气或当天预报作为辅助上下文。

---

### 2.2 未来天气：15 天每日预报

养护建议使用和风天气每日天气预报：

```text
/v7/weather/15d
```

每日预报支持 3d、7d、10d、15d、30d 等天数，其中项目当前使用 15d。可使用字段包括：

```text
daily.fxDate
daily.tempMax
daily.tempMin
daily.humidity
daily.precip
daily.cloud
daily.uvIndex
daily.textDay
daily.textNight
daily.windScaleDay
daily.windSpeedDay
```

用途：

- 未来 15 天浇水提醒
- 未来 15 天施肥安全提醒
- 高温/低温风险提示
- 高湿/低湿风险提示
- 高 UV 暴晒风险提示
- 连续降雨/高湿导致慢干提醒
- 强光暴晒与用户摆放位置的合并判断

---

## 3. 诊断窗口与养护窗口

### 3.1 诊断环境窗口

诊断使用过去 10 天历史天气。

```text
诊断环境窗口 = D-10 ~ D-1
```

诊断环境窗口用于判断近期是否存在：

- 持续偏冷
- 持续偏热
- 持续高湿
- 持续低湿
- 冷湿组合
- 热湿组合
- 热干组合
- 高 UV 暴晒窗口
- 连续阴雨 / 低 UV / 高湿慢干窗口
- 温度大幅波动

---

### 3.2 当天环境上下文

当天 `D0` 不属于时光机历史窗口，但可以作为：

- 用户日期控件的当天提示
- 当天养护行为记录
- 当天是否暴晒 / 是否浇水 / 是否施肥的事件补充
- 当天养护建议
- “今天突然恶化”场景的辅助判断

注意：

```text
D0 不应默认作为已发生黄叶的主因依据。
```

如果用户明确表示“今天刚出现 / 今天突然恶化”，D0 可以作为急性事件辅助证据；否则黄叶、掉叶、焦边等滞后症状应主要看 D-10 ~ D-1 的环境与行为。

---

### 3.3 养护建议窗口

养护建议使用未来 15 天预报。

```text
养护建议窗口 = D0 ~ D+14
```

用途：

- 未来高温低湿：提醒提高查土频率
- 未来低温高湿：提醒控水、停肥
- 未来连续高湿/降雨：提醒盆土慢干、不要固定频繁浇水
- 未来高 UV：结合用户摆放位置提醒遮阴或避开中午直射
- 未来温度不在属级适温：提醒暂停或降低施肥
- 未来极端天气：提醒移动摆放位置

---

## 4. 日期控件：最近 10 天 + 当天提示

### 4.1 设计目标

问诊中浇水、施肥、光照变化等行为，不建议只用一句：

```text
最近 7 天浇了几次？
```

应使用日期控件辅助用户回忆：

```text
过去 10 天历史天气 + 当天天气提示 + 每日行为标记
```

这比 7 天更稳，因为：

- 与和风天气时光机最近 10 天完全对齐；
- 覆盖更多盆栽干湿周期；
- 对多肉、大盆、低光高湿等慢干场景更友好；
- 用户仍然可以通过天气提示大致回忆；
- 可以把用户行为和当日天气逐日配对，而不是只统计次数。

---

### 4.2 日期控件展示范围

推荐展示 11 个日期格：

```text
D-10, D-9, D-8, D-7, D-6, D-5, D-4, D-3, D-2, D-1, D0
```

其中：

- `D-10 ~ D-1` 来自时光机历史天气；
- `D0` 来自实时天气或当天预报；
- 诊断历史主窗口仍以 `D-10 ~ D-1` 为准；
- `D0` 主要用于用户当天行为标记和当天养护建议。

如果前端希望减少视觉负担，也可以默认折叠为最近 10 个日期，并让当天永远可见。

---

### 4.3 每日显示信息

每个日期格建议展示：

```text
日期
天气文字
最高 / 最低温
相对湿度
降水量或降水提示
UV 指数
云量或晴阴提示
```

示例：

```text
5/10｜32/24℃｜湿度 78%｜UV 7｜多云
5/11｜28/22℃｜湿度 88%｜UV 2｜小雨
5/12｜35/25℃｜湿度 42%｜UV 9｜晴
```

这些信息用于辅助用户回忆：

- 那天是否很热；
- 那天是否下雨；
- 那天是否晒；
- 那天是否搬到窗边或阳台；
- 那天是否浇过水；
- 那天是否施过肥。

---

### 4.4 每日行为采集

每日只保留轻量按钮，不做重表单。

推荐按钮：

```text
浇水
施肥
强光 / 位置变化
```

点击后再展开细节。

#### 浇水事件

```ts
type WateringEvent10d = {
  date: string
  watered: boolean
  amount?: 'small' | 'normal' | 'thorough' | 'unknown'
}
```

#### 施肥事件

```ts
type FertilizingEvent10d = {
  date: string
  fertilized: boolean
  strength?: 'thin' | 'normal' | 'concentrated' | 'unknown'
}
```

#### 光照变化事件

```ts
type LightChangeEvent10d = {
  date: string
  event:
    | 'moved_to_stronger_light'
    | 'moved_to_weaker_light'
    | 'direct_sun_exposure'
    | 'grow_light_changed'
    | 'none'
    | 'unknown'
}
```

---

## 5. 10 天是否足够判断养护行为

### 5.1 浇水：10 天足够作为主判断窗口

浇水建议使用最近 10 天作为主窗口。

10 天可以判断：

- 近期是否浇水过频；
- 近期是否长时间未浇；
- 高湿/低温期间是否仍频繁浇水；
- 高温/低湿期间是否长期未补水；
- 连续阴雨/高湿是否导致盆土慢干；
- 用户浇水行为是否与环境明显不匹配。

因此，不再需要单独维护 `最近 14 天粗略浇水桶` 作为主逻辑。

推荐：

```ts
watering_events_10d: WateringEvent10d[]
```

运行时可从事件中计算：

```ts
watering_count_10d
thorough_watering_count_10d
watering_on_cold_humid_days
watering_on_high_humidity_days
no_watering_on_hot_dry_days
```

---

### 5.2 施肥：10 天适合抓肥害，不适合判断长期缺肥

施肥必须拆成两类：

| 问题 | 10 天是否足够 |
|---|---|
| 肥害 / 浓肥 / 干土施肥 | 足够 |
| 近期施肥后异常 | 足够 |
| 连续施肥导致盐分压力 | 部分足够 |
| 长期缺肥 | 不足够 |
| 生长期长期未施肥 | 不足够 |

因此，施肥需要：

```ts
fertilizing_events_10d: FertilizingEvent10d[]
last_fertilized_bucket:
  | 'within_10d'
  | '11_30d'
  | '31_60d'
  | 'over_60d'
  | 'almost_never'
  | 'unknown'
```

规则：

```text
肥害看最近 10 天事件
缺肥看 30/60 天粗略桶
```

不要让用户精确回忆 60 天，只需要粗略桶。

---

### 5.3 光照变化：10 天适合捕捉突变

光照变化也适合最近 10 天日期控件。

可捕捉：

- 最近搬到更强光；
- 最近搬到更弱光；
- 最近中午直射暴晒；
- 最近使用或关闭生长灯；
- 最近连续高 UV + 用户确认直射。

光照路径必须合并两类数据：

```text
用户问诊光照场景
+
天气 UV / 云量 / 晴雨提示
```

UV 不得单独定因。

---

## 6. 环境摘要层

### 6.1 历史环境摘要

从 D-10 ~ D-1 构建 `historicalEnvironmentSummary10d`。

```ts
type HistoricalEnvironmentSummary10d = {
  windowDays: 10

  avgTempC: number
  minTempC: number
  maxTempC: number

  avgHumidity: number
  minHumidity: number
  maxHumidity: number

  avgUvIndex?: number
  maxUvIndex?: number

  belowTempMinDays: number
  aboveTempMaxDays: number
  belowHumidityMinDays: number
  aboveHumidityMaxDays: number

  aboveUvMaxDays?: number
  belowUvMinDays?: number

  coldHumidDays: number
  hotHumidDays: number
  hotDryDays: number
  highUvDays?: number

  consecutiveColdHumidDays: number
  consecutiveHotHumidDays: number
  consecutiveHotDryDays: number
  consecutiveHighUvDays?: number
}
```

> 注：和风天气历史天气时光机返回的日数据中包含 `tempMax / tempMin / humidity / precip`，小时数据包含 `temp / humidity` 等；如果历史接口不提供 `uvIndex`，历史 UV 判断可以降级为用户问诊 + 未来预报 / 当天预报，不强行补假数据。

---

### 6.2 未来环境摘要

从 D0 ~ D+14 构建 `forecastEnvironmentSummary15d`。

```ts
type ForecastEnvironmentSummary15d = {
  windowDays: 15

  avgTempMaxC: number
  avgTempMinC: number
  forecastMaxTempC: number
  forecastMinTempC: number

  avgHumidity: number
  maxHumidity: number
  minHumidity: number

  avgUvIndex: number
  maxUvIndex: number

  highHumidityDays: number
  lowHumidityDays: number
  highUvDays: number
  aboveGenusUvMaxDays: number

  rainyDays: number
  cloudyDays: number
  hotDryDays: number
  coldHumidDays: number
}
```

用于养护建议，不用于回溯已发生问题的主因判断。

---

## 7. 属级基线比对

### 7.1 温度比对

从 `genus_care_profiles` 读取：

```text
temp_min_c
temp_max_c
```

对 D-10 ~ D-1 每日数据做相对比对：

```ts
dayAvgTemp < temp_min_c  => belowTempMinDays++
dayAvgTemp > temp_max_c  => aboveTempMaxDays++
```

如只有 `tempMax / tempMin`，可用：

```ts
dayAvgTemp = (tempMax + tempMin) / 2
```

同时保留极值判断：

```ts
dayMinTemp < temp_min_c
dayMaxTemp > temp_max_c
```

---

### 7.2 湿度比对

从 `genus_care_profiles` 读取：

```text
humidity_min
humidity_max
```

对每日湿度做相对比对：

```ts
dayHumidity < humidity_min => belowHumidityMinDays++
dayHumidity > humidity_max => aboveHumidityMaxDays++
```

---

### 7.3 UV 比对

从 `genus_care_profiles` 读取：

```text
uv_index_min
uv_index_max
```

UV 比对只在用户问诊确认存在真实受光场景时启用：

```text
半日照(3~6小时直射日照)
黑暗(非直射日照)
全阴(小于3小时直射日照)
生长灯(专用植物灯)
```

不满足真实受光场景时，UV 不作为定因依据。

示例：

```ts
if (userHasDirectSunExposure && uvIndex > profile.uv_index_max) {
  hit('excess_light_or_sunburn_risk')
}
```

注意：

```text
UV 不是 PAR / PPFD，不能单独代表植物可利用光。
```

---

## 8. 运行时合并逻辑

### 8.1 浇水路径

输入：

```text
watering_strategy_json.freq
temp_min_c / temp_max_c
humidity_min / humidity_max
historicalEnvironmentSummary10d
watering_events_10d
```

判断示例：

```ts
if (
  watering_count_10d >= 3 &&
  historicalEnvironmentSummary10d.aboveHumidityMaxDays >= 4
) {
  hit('watering_too_frequent_in_humid_context')
}

if (
  watering_count_10d === 0 &&
  historicalEnvironmentSummary10d.hotDryDays >= 3
) {
  hit('possible_underwatering_in_hot_dry_context')
}

if (watering_on_cold_humid_days >= 2) {
  hit('root_zone_too_wet_context')
}
```

输出是路径命中项，不是评分。

---

### 8.2 施肥路径

输入：

```text
fertilizing_strategy_json.freq
historicalEnvironmentSummary10d
fertilizing_events_10d
last_fertilized_bucket
```

规则：

```ts
if (
  hasFertilizedWithin10d &&
  recentFertilizerStrength === 'concentrated'
) {
  hit('fertilizer_burn_or_salt_stress')
}

if (
  last_fertilized_bucket in ['over_60d', 'almost_never'] &&
  plantShowsWeakGrowth
) {
  hit('possible_nutrient_deficiency')
}

if (historicalEnvironmentSummary10d.coldHumidDays >= 3) {
  downgradeFertilizingAction('pause')
}
```

---

### 8.3 光照路径

输入：

```text
light_strategy_json
uv_index_min / uv_index_max
historicalEnvironmentSummary10d
forecastEnvironmentSummary15d
light_change_events_10d
用户问诊光照字段
```

规则：

```ts
if (
  userHasDirectSunExposure &&
  aboveGenusUvMaxDays >= 2
) {
  hit('excess_light_or_sunburn_risk')
}

if (
  movedToStrongerLightWithin10d &&
  highUvDays >= 2
) {
  hit('recent_light_increase_stress')
}

if (
  userLightCondition === 'low_light' &&
  plantRequiresBrightLight
) {
  hit('possible_low_light_context')
}
```

---

### 8.4 通风路径

输入：

```text
airflow_strategy_json
growing_environment
window_open_frequency
cross_ventilation
historicalEnvironmentSummary10d
```

通风仍然不能只靠天气判断。高湿、降水、闷热天气只能作为通风路径的背景上下文。

```ts
if (
  userAirflowInput === 'poor' &&
  historicalEnvironmentSummary10d.hotHumidDays >= 3
) {
  hit('poor_airflow_amplifies_stuffy_context')
}
```

---

## 9. 不应做的事

### 9.1 不要恢复评分系统

环境上下文层只提供事实摘要和路径命中辅助，不做综合评分。

禁止：

```text
light_score = ...
watering_score = ...
final_score = ...
```

允许：

```text
命中：高湿慢干背景
命中：高 UV + 用户确认直射
命中：冷湿控水背景
```

---

### 9.2 不要把规则塞回 SQL

SQL 只保存属级静态基线。

不要在 `light_strategy_json` 中塞：

```text
questionnaire_merge_keys
guardrail_cn
source_urls
qweather_field
uv_index_scale
runtime_rule
```

---

### 9.3 不要用 UV 单独定因

错误：

```text
UV 高，所以植物晒伤
```

正确：

```text
UV 高 + 用户确认户外/阳台/窗边直射 + 该属 uv_index_max 较低，所以命中强光/暴晒风险。
```

---

### 9.4 不要用当天单点天气解释既有黄叶

错误：

```text
今天很热，所以黄叶是今天造成的。
```

正确：

```text
黄叶通常是滞后症状，应优先查看过去 10 天环境与用户行为；当天数据主要用于当天养护建议和急性恶化补充。
```

---

## 10. 给 Codex 的实现任务边界

### 10.1 需要新增或调整的模块

建议按项目现有结构落地，不强制具体路径。模块职责如下：

```text
QWeatherAdapter
  拉取时光机历史天气 D-10 ~ D-1
  拉取未来 15 天天气预报 D0 ~ D+14
  拉取当天实时天气或当天预报用于 D0 展示

EnvironmentContextBuilder
  构建 historicalEnvironmentSummary10d
  构建 forecastEnvironmentSummary15d

CareBehaviorTimeline
  接收日期控件提交的 watering_events_10d
  接收 fertilizing_events_10d
  接收 light_change_events_10d
  接收 last_fertilized_bucket

EnvironmentCareMerge
  合并属级基线、历史天气摘要、未来预报摘要、用户行为事件
  输出路径命中上下文
```

---

### 10.2 输出数据示例

```ts
type EnvironmentCareContext = {
  historical: HistoricalEnvironmentSummary10d
  forecast: ForecastEnvironmentSummary15d

  behaviorTimeline: {
    wateringEvents10d: WateringEvent10d[]
    fertilizingEvents10d: FertilizingEvent10d[]
    lightChangeEvents10d: LightChangeEvent10d[]
    lastFertilizedBucket?: LastFertilizedBucket
  }

  pathContexts: {
    wateringContext?: string[]
    fertilizingContext?: string[]
    lightContext?: string[]
    airflowContext?: string[]
  }
}
```

---

## 11. 当前最终口径

```text
环境上下文层是通用层，不绑定黄叶。
属级养护表保持轻量，UV 只保留 uv_index_min / uv_index_max。
诊断历史环境使用和风天气时光机最近 10 天，不再自行滚动缓存 15 天。
养护建议使用和风天气未来 15 天天气预报。
问诊行为使用最近 10 天日期控件，并用每日天气提示辅助用户回忆。
日期控件可展示 D-10 ~ D0；其中 D-10 ~ D-1 是历史诊断主窗口，D0 是当天辅助上下文。
浇水用最近 10 天作为主判断窗口。
施肥用最近 10 天判断肥害/近期异常，但长期缺肥仍需 last_fertilized_bucket 覆盖 11–30 天、31–60 天、超过 60 天。
光照必须合并用户问诊与 UV，不能只看 UV。
路径规划只输出命中上下文和纠偏项，不恢复评分系统。
```

---

## 12. 参考来源

- 和风天气开发文档：天气时光机 `/v7/historical/weather`，最近 10 天历史天气，不包含今天。
- 和风天气开发文档：每日天气预报 `/v7/weather/{days}`，支持 3d、7d、10d、15d、30d。
- 和风天气每日预报字段：`tempMax`、`tempMin`、`humidity`、`precip`、`cloud`、`uvIndex` 等。
