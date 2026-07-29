# 环境上下文层概念与架构设计 v7（给 Codex）

> 适用范围：青花植 / planting 项目诊断路径规划与养护建议生成  
> 文档定位：给 Codex 执行与审查使用的架构约束文档  
> 版本：v7  
> 核心更新：降低环境上下文层复杂度；施肥在 MVP 阶段不参考天气，统一使用“30–45 天薄肥一次”作为室内植物基线；浇水算法保留天气强相关，并必须加入和风天气时光机最近 10 天历史数据；诊断和养护都使用更简单的事实摘要与路径命中，不恢复评分系统。

---

## 1. 版本裁决摘要

v7 相比 v6 的关键变化：

1. **施肥不再读取天气上下文。**  
   MVP 阶段统一采用：`30–45 天薄肥一次`。  
   天气历史、天气预报、温湿度、UV 不参与施肥频率计算。

2. **浇水继续强依赖环境，但算法降复杂度。**  
   浇水需要同时参考：
   - 属级浇水基线；
   - 和风天气时光机 `D-10 ~ D-1` 历史环境；
   - 用户最近 10 天浇水行为；
   - 和风天气 `D0 ~ D+14` 未来 15 天预报。

3. **环境上下文层继续是通用层。**  
   不绑定黄叶，未来可复用于萎蔫、焦边、掉叶、晒伤、徒长、根区偏湿等路径。

4. **不做评分系统，不做复杂状态机。**  
   只构建少量事实摘要与布尔/枚举型路径上下文。

5. **降低综合复杂度。**  
   这里的复杂度包括：
   - 时间复杂度；
   - 代码阅读复杂度；
   - 实现复杂度；
   - 规则维护复杂度；
   - 数据库字段复杂度。

---

## 2. 权威依据与工程解释

### 2.1 浇水为什么需要天气与历史窗口

室内植物浇水不应按固定日程执行。浇水频率会受到光照、温度、湿度、土壤/介质、容器大小、植物大小、物种等多因素影响。过去一段时间的高湿、低温、热干、连续降雨等会改变盆土干燥速度，也会影响当前根区状态。

因此：

```text
浇水 = 强环境依赖
```

MVP 中，浇水必须加入：

```text
D-10 ~ D-1 历史环境
+
D-10 ~ D0 用户浇水行为
+
D0 ~ D+14 未来预报
```

历史窗口用于判断当前是否已有“偏湿 / 偏干 / 慢干 / 热干”背景；未来窗口用于决定后续是否提高查土频率或延后浇水。

---

### 2.2 施肥为什么不参考天气

室内植物施肥不是逐日天气驱动行为。施肥主要由以下因素决定：

- 植物是否处于活跃生长；
- 是否刚施过肥；
- 肥料浓度是否偏高；
- 是否刚换盆；
- 是否长期未施肥；
- 是否存在明显弱生长。

MVP 阶段不做高复杂度生长期判断，也不把温湿度/UV 作为施肥输入。统一口径：

```text
室内植物 MVP 施肥基线 = 30–45 天薄肥一次
```

施肥模块只使用用户施肥行为输入做安全门控：

- 最近 10 天是否施肥；
- 施肥浓度是否偏浓；
- 上一次施肥大概多久以前；
- 是否刚换盆；
- 是否出现施肥后异常。

禁止通过未来天气自动提高施肥频率。

---

## 3. 和风天气 API 边界

### 3.1 历史天气：时光机最近 10 天

和风天气「天气时光机」请求路径：

```text
/v7/historical/weather
```

业务口径：

```text
历史环境窗口 = D-10 ~ D-1
```

约束：

- 最多取最近 10 天；
- 不包含今天；
- D0 当天数据使用实时天气或当天预报展示；
- 不再做业务意义上的项目侧 15 天滚动历史缓存。

允许做技术缓存以减少 API 调用，但技术缓存不是算法要求。

---

### 3.2 未来天气：15 天每日预报

和风天气每日天气预报请求路径：

```text
/v7/weather/15d
```

业务口径：

```text
未来养护窗口 = D0 ~ D+14
```

可用字段包括：

```text
fxDate
tempMax
tempMin
humidity
precip
cloud
uvIndex
textDay
textNight
windScaleDay
windSpeedDay
```

用途：

- 浇水后续查土频率；
- 高湿 / 低温慢干提醒；
- 高温 / 低湿缺水提醒；
- 高 UV + 用户确认直射时的强光提醒；
- 当天日期控件辅助展示。

---

## 4. 属级养护数据层

`genus_care_profiles` 继续保持轻量，不承载运行时规则、解释文案或审计信息。

保留字段口径：

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

### 4.1 光照字段口径

`light_strategy_json` 只保存短 JSON，例如：

```json
{
  "way": "明亮散射光",
  "freq": [4, 8],
  "unit": "小时/天",
  "other": "避免直晒"
}
```

`uv_index_min / uv_index_max` 是属级 UV 参考边界，只在用户问诊确认存在户外、阳台、窗边直射等真实受光场景时参与判断。

禁止把以下内容写入 SQL：

```text
source_urls
qweather_field
uv_index_scale
questionnaire_merge_keys
guardrail_cn
audit_*
runtime_rule
```

### 4.2 施肥字段口径

MVP 阶段，室内植物施肥运行时统一使用：

```text
30–45 天薄肥一次
```

`fertilizing_strategy_json` 可以继续保留在属级表中，但 MVP 施肥算法不以属级差异做复杂分支。

建议运行时常量：

```ts
const MVP_INDOOR_FERTILIZING_BASELINE = {
  intervalDays: [30, 45],
  type: 'thin_liquid_fertilizer',
  action: 'normal'
}
```

---

## 5. 日期控件：最近 10 天 + 当天提示

### 5.1 展示范围

日期控件展示 11 个日期格：

```text
D-10, D-9, D-8, D-7, D-6, D-5, D-4, D-3, D-2, D-1, D0
```

其中：

- `D-10 ~ D-1` 来自和风天气时光机；
- `D0` 来自实时天气或当天预报；
- `D0` 主要用于用户当天行为和当天养护建议；
- 既有黄叶、焦边、掉叶等滞后症状，默认仍主要看 `D-10 ~ D-1`。

### 5.2 每日展示信息

每个日期格展示：

```text
日期
天气文字
最高 / 最低温
相对湿度
降水提示
UV 指数
云量或晴阴提示
```

示例：

```text
5/10｜32/24℃｜湿度 78%｜UV 7｜多云
5/11｜28/22℃｜湿度 88%｜UV 2｜小雨
5/12｜35/25℃｜湿度 42%｜UV 9｜晴
```

### 5.3 每日行为采集

每日只保留轻量按钮：

```text
浇水
施肥
强光 / 位置变化
```

点击后再采集细节。

```ts
type WateringEvent10d = {
  date: string
  watered: boolean
  amount?: 'small' | 'normal' | 'thorough' | 'unknown'
}

type FertilizingEvent10d = {
  date: string
  fertilized: boolean
  strength?: 'thin' | 'normal' | 'concentrated' | 'unknown'
}

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

## 6. 环境摘要层：简化版

v7 不再构建大量复杂状态。环境摘要只保留浇水与光照路径真正需要的字段。

### 6.1 历史环境摘要

```ts
type HistoricalEnvironmentSummary10d = {
  windowDays: 10

  highHumidityDays: number
  lowHumidityDays: number
  coldHumidDays: number
  hotDryDays: number
  hotHumidDays: number
  rainyDays: number

  maxUvIndex?: number
  aboveGenusUvMaxDays?: number
}
```

计算来源：

```text
D-10 ~ D-1
```

说明：

- `coldHumidDays`：低于属级适温下限，并高于属级适湿上限；
- `hotDryDays`：高于属级适温上限，并低于属级适湿下限；
- `hotHumidDays`：高于属级适温上限，并高于属级适湿上限；
- `highHumidityDays`：高于属级适湿上限；
- `lowHumidityDays`：低于属级适湿下限；
- `rainyDays`：降水量大于 0 或天气文本为降雨类；
- `aboveGenusUvMaxDays`：UV 高于属级 `uv_index_max`，且用户存在真实受光场景时才使用。

如历史接口不提供 UV，历史 UV 字段可以为空，不造假数据。

---

### 6.2 未来环境摘要

```ts
type ForecastEnvironmentSummary15d = {
  windowDays: 15

  highHumidityDays: number
  lowHumidityDays: number
  coldHumidDays: number
  hotDryDays: number
  hotHumidDays: number
  rainyDays: number

  maxUvIndex: number
  aboveGenusUvMaxDays: number
}
```

计算来源：

```text
D0 ~ D+14
```

用途：

- 只用于未来浇水和光照风险提示；
- 不用于施肥频率计算；
- 不直接解释既有症状主因。

---

## 7. 浇水算法：保留环境依赖，但降低复杂度

### 7.1 输入

```text
watering_strategy_json.freq
temp_min_c / temp_max_c
humidity_min / humidity_max
HistoricalEnvironmentSummary10d
ForecastEnvironmentSummary15d
WateringEvent10d[]
```

### 7.2 派生字段

```ts
type WateringBehaviorSummary10d = {
  wateringCount10d: number
  thoroughWateringCount10d: number
  lastWateredDaysAgo?: number
}
```

### 7.3 只输出三个水分上下文

```ts
type WateringContext =
  | 'likely_too_wet'
  | 'likely_too_dry'
  | 'keep_baseline_or_check_soil'
```

### 7.4 规则

#### 偏湿上下文

```ts
if (
  historical.highHumidityDays >= 4 &&
  watering.wateringCount10d >= 3
) {
  wateringContext = 'likely_too_wet'
}
```

```ts
if (
  historical.coldHumidDays >= 2 &&
  watering.wateringCount10d >= 2
) {
  wateringContext = 'likely_too_wet'
}
```

含义：

```text
最近环境慢干 + 用户浇水频繁，当前更应控水。
```

#### 偏干上下文

```ts
if (
  historical.hotDryDays >= 3 &&
  watering.wateringCount10d === 0
) {
  wateringContext = 'likely_too_dry'
}
```

```ts
if (
  forecast.hotDryDays >= 3 &&
  watering.lastWateredDaysAgo != null &&
  watering.lastWateredDaysAgo >= 7
) {
  wateringContext = 'likely_too_dry'
}
```

含义：

```text
近期或未来偏热偏干，且长期未浇，应提高查土频率。
```

#### 默认上下文

```ts
wateringContext = 'keep_baseline_or_check_soil'
```

含义：

```text
不根据天气直接决定浇水日期，仍以土壤干湿为准。
```

### 7.5 输出建议动作

```ts
type WateringAction =
  | 'delay_and_check_soil'
  | 'increase_soil_check_frequency'
  | 'follow_baseline_check_soil'
```

映射：

```ts
if (wateringContext === 'likely_too_wet') {
  action = 'delay_and_check_soil'
}

if (wateringContext === 'likely_too_dry') {
  action = 'increase_soil_check_frequency'
}

if (wateringContext === 'keep_baseline_or_check_soil') {
  action = 'follow_baseline_check_soil'
}
```

### 7.6 复杂度

```text
时间复杂度：O(n)
n = 历史 10 天 + 未来 15 天，最多 25 个 daily records
空间复杂度：O(1)
规则复杂度：低
```

禁止把浇水做成多因素评分系统。

---

## 8. 施肥算法：MVP 固定基线，不参考天气

### 8.1 输入

```text
FertilizingEvent10d[]
last_fertilized_bucket
recentFertilizerStrength
plantShowsWeakGrowth
justRepottedRecently
```

施肥算法禁止读取：

```text
HistoricalEnvironmentSummary10d
ForecastEnvironmentSummary15d
temp
humidity
uvIndex
rainyDays
hotDryDays
coldHumidDays
```

### 8.2 MVP 基线

```ts
const fertilizingBaseline = {
  intervalDays: [30, 45],
  fertilizerType: 'thin_liquid_fertilizer',
  label: '30–45 天薄肥一次'
}
```

### 8.3 长期粗略桶

```ts
type LastFertilizedBucket =
  | 'within_10d'
  | '11_30d'
  | '31_60d'
  | 'over_60d'
  | 'almost_never'
  | 'unknown'
```

### 8.4 输出动作

```ts
type FertilizingAction =
  | 'pause'
  | 'thin_after_due'
  | 'normal_baseline'
  | 'possible_deficiency_check'
```

### 8.5 规则

#### 近期已施肥

```ts
if (
  lastFertilizedBucket === 'within_10d' ||
  fertilizingEvents10d.length > 0
) {
  fertilizingAction = 'pause'
}
```

#### 近期浓肥或施肥后异常

```ts
if (
  recentFertilizerStrength === 'concentrated'
) {
  hit('fertilizer_burn_or_salt_stress')
  fertilizingAction = 'pause'
}
```

#### 30 天内施过肥

```ts
if (lastFertilizedBucket === '11_30d') {
  fertilizingAction = 'pause'
}
```

#### 31–60 天未施肥

```ts
if (lastFertilizedBucket === '31_60d') {
  fertilizingAction = 'thin_after_due'
}
```

#### 超过 60 天或基本未施肥

```ts
if (
  lastFertilizedBucket in ['over_60d', 'almost_never'] &&
  plantShowsWeakGrowth
) {
  fertilizingAction = 'possible_deficiency_check'
}
```

#### 刚换盆

```ts
if (justRepottedRecently) {
  fertilizingAction = 'pause'
}
```

### 8.6 复杂度

```text
时间复杂度：O(m)
m = 最近 10 天施肥事件数，通常 0~2
空间复杂度：O(1)
规则复杂度：低
```

施肥模块不做天气、温湿度、UV 合并。

---

## 9. 光照 / UV 算法：保留用户问诊为主

光照路径仍需要合并：

```text
用户问诊光照场景
+
uv_index_min / uv_index_max
+
未来 15 天 uvIndex
+
最近 10 天光照变化事件
```

但 UV 不单独定因。

### 9.1 输入

```text
light_strategy_json
uv_index_min / uv_index_max
ForecastEnvironmentSummary15d
LightChangeEvent10d[]
用户问诊光照字段
```

### 9.2 规则

```ts
if (
  userHasDirectSunExposure &&
  forecast.aboveGenusUvMaxDays >= 2
) {
  hit('excess_light_or_sunburn_risk')
}
```

```ts
if (
  movedToStrongerLightWithin10d &&
  userHasDirectSunExposure
) {
  hit('recent_light_increase_stress')
}
```

```ts
if (
  userLightCondition === 'low_light' &&
  plantRequiresBrightLight
) {
  hit('possible_low_light_context')
}
```

### 9.3 不做的事

禁止：

```text
UV 高 => 晒伤
UV 低 => 光照不足
```

必须合并用户位置、是否直射、窗帘/玻璃遮挡、生长灯等问诊字段。

---

## 10. 通风路径：保持问诊主导

通风路径不做天气强驱动。

输入：

```text
airflow_strategy_json
growing_environment
window_open_frequency
cross_ventilation
plant_crowding
```

天气只作为轻量背景：

```ts
if (
  userAirflowInput === 'poor' &&
  historical.hotHumidDays >= 3
) {
  hit('poor_airflow_amplifies_stuffy_context')
}
```

不做通风评分。

---

## 11. 模块职责

### 11.1 QWeatherAdapter

职责：

```text
拉取 D-10 ~ D-1 时光机历史天气
拉取 D0 ~ D+14 未来 15 天预报
拉取 D0 实时天气或当天预报用于日期控件展示
```

不负责诊断。

### 11.2 EnvironmentContextBuilder

职责：

```text
构建 HistoricalEnvironmentSummary10d
构建 ForecastEnvironmentSummary15d
```

只输出摘要，不输出病因。

### 11.3 CareBehaviorTimeline

职责：

```text
接收 WateringEvent10d[]
接收 FertilizingEvent10d[]
接收 LightChangeEvent10d[]
接收 last_fertilized_bucket
```

### 11.4 WateringPlanner

职责：

```text
合并属级浇水基线
合并历史环境摘要
合并未来环境摘要
合并最近 10 天浇水事件
输出 wateringContext 与 WateringAction
```

### 11.5 FertilizingPlanner

职责：

```text
使用 MVP 固定基线 30–45 天薄肥一次
读取最近 10 天施肥事件
读取 last_fertilized_bucket
输出 FertilizingAction
```

禁止读取天气摘要。

### 11.6 LightPlanner

职责：

```text
合并用户光照问诊
合并 uv_index_min / uv_index_max
合并未来 UV
合并最近 10 天光照变化事件
输出光照路径命中上下文
```

---

## 12. 输出对象建议

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

  watering: {
    context: WateringContext
    action: WateringAction
  }

  fertilizing: {
    baseline: {
      intervalDays: [30, 45]
      fertilizerType: 'thin_liquid_fertilizer'
    }
    action: FertilizingAction
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

## 13. 不应做的事

### 13.1 不要恢复评分系统

禁止：

```text
watering_score
fertilizer_score
light_score
final_score
```

允许：

```text
wateringContext = likely_too_wet
fertilizingAction = pause
lightContext includes excess_light_or_sunburn_risk
```

### 13.2 不要让施肥参考天气

禁止：

```ts
if (forecast.hotDryDays >= 3) {
  fertilizerInterval *= 0.8
}

if (historical.coldHumidDays >= 3) {
  fertilizingAction = 'pause'
}
```

v7 中，施肥模块不读取天气摘要。

### 13.3 不要把浇水固定成日程

禁止：

```text
每 7 天浇一次
```

正确：

```text
按属级基线作为查土节奏参考；结合过去 10 天环境和浇水事件，决定延后或提高查土频率；最终仍以盆土实际干湿为准。
```

### 13.4 不要把规则塞回 SQL

SQL 只保存静态基线。

### 13.5 不要用 UV 单独定因

必须结合用户问诊中的真实受光场景。

---

## 14. 当前最终口径

```text
环境上下文层是通用层，不绑定黄叶。
属级养护表保持轻量，UV 只保留 uv_index_min / uv_index_max。
和风天气时光机提供 D-10 ~ D-1 历史环境。
和风天气 15 天预报提供 D0 ~ D+14 未来环境。
问诊行为使用最近 10 天日期控件，并用每日天气提示辅助用户回忆。
浇水是天气强相关路径，必须使用历史 10 天 + 未来 15 天 + 用户浇水事件。
施肥在 MVP 阶段不参考天气，统一使用 30–45 天薄肥一次。
施肥只用最近 10 天施肥事件和 last_fertilized_bucket 做门控。
光照必须合并用户问诊与 UV，不能只看 UV。
通风以问诊为主，天气只做背景。
路径规划只输出上下文和纠偏项，不恢复评分系统。
整体算法保持 O(n)，n 不超过 25 天 daily records。
```

---

## 15. 参考来源

- 和风天气开发文档：天气时光机 `/v7/historical/weather`，支持最近 10 天历史天气，不包含今天。
- 和风天气开发文档：每日天气预报 `/v7/weather/{days}`，支持 3d、7d、10d、15d、30d，项目使用 15d。
- Iowa State University Extension：室内植物浇水不应固定日程，浇水频率受光照、温度、湿度、介质、容器、植物大小和物种等因素影响。
- Iowa State University Extension：室内植物不需要太多肥料；多数室内植物在活跃生长期每月 1–2 次即可，通用肥建议按 1/2 或 1/4 浓度使用。
