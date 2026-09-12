# 室内植物光照算法：基于最近十天天气聚合字段的最终设计与开发计划（中文优先版）

> 面向 Codex / AI 实现任务。本文档以当前 `recent-10d.json` 的真实字段结构为准。中文概念优先；英文仅保留既有代码字段、文件名、类型名和第三方接口原始字段。

---

## 1. 目标

青花植的室内植物光照算法不追求精确照度值，不计算专业 Lux、PAR 或 DLI。当前阶段只估算：

```text
室内等效光照小时
```

然后与属级养护数据里的光照需求比较：

```json
{
  "way": "全日照/半日照",
  "freq": [5, 8],
  "unit": "小时/天",
  "other": "以实际光照强度与直射时段校正，避免机械按距离判断"
}
```

最终输出：

```text
光照不足
基本满足
光照偏强
```

核心原则：

1. 天气只修正室外可用光。
2. 室内真实光照主要由朝向、窗户、离窗距离、遮挡和是否直射决定。
3. 天气证据缺失时，使用中性天气因子，不把缺失误判为低光。
4. 云量优先；云量缺失时用和风天气图标兜底；天气文字只做最后兼容。
5. 紫外线指数缺失时保持中性，不用温度、湿度、气压、露点反推紫外线。
6. 保持现有问诊路径与结果项逻辑，不改成原因排序模型。

---

## 2. 现有天气缓存结构

天气缓存采用两层结构：

```text
weather-cache/v1/locations/{locationKey}/days/{date}.json
weather-cache/v1/locations/{locationKey}/recent-10d.json
```

| 路径 | 中文含义 | 职责 |
|---|---|---|
| `days/{date}.json` | 单日天气缓存 | 保存当天分时段采样与单日聚合 |
| `recent-10d.json` | 最近十天天气聚合 | 保存问诊使用的最近十天历史天气证据 |

问诊历史窗口使用：

```text
D-10 到 D-1
```

当天 D0 不参与历史症状形成原因判断。

---

## 3. `recent-10d.json` 当前主结构

当前最近十天聚合文件结构如下：

```ts
type Recent10dWeatherCache = {
  schemaVersion: 'weather-cache/v1/recent-10d';

  location: WeatherCacheLocation;
  generatedAt: string;
  sourceKind: 'weather_cache_recent_10d';
  quality: 'complete' | 'partial' | 'missing' | 'invalid';

  weatherEvidenceInsufficient: boolean;
  weatherObjectPath: string;

  dailyObjectPaths: Record<string, string>;

  window: {
    timezone: string;
    targetDate: string;
    start: string;
    end: string;
    days: number;
  };

  historicalDays: Recent10dHistoricalDay[];
  plantFeatures: Recent10dPlantFeatures;

  meta: {
    diagnosisDate: string;
    sourceKind: 'weather_cache_recent_10d';
    quality: 'complete' | 'partial' | 'missing' | 'invalid';
    weatherObjectPath: string;
    weatherEvidenceInsufficient: boolean;
    recordCounts: {
      historicalDays: number;
      forecastDays: number;
      totalDailyRecords: number;
    };
    historicalWindow: {
      start: string;
      end: string;
    };
  };
};
```

`weatherObjectPath` 是顶层字段，同时也存在于 `meta.weatherObjectPath` 中。两者应保持一致。

---

## 4. `historicalDays` 的职责

`historicalDays` 是最近十天每日摘要，不是完整单日缓存。

缺失日示例：

```json
{
  "date": "2026-06-10",
  "source": "weather_cache_daily_missing",
  "sourceKind": "weather_cache_daily_archive",
  "quality": "missing",
  "weatherObjectPath": "weather-cache/v1/locations/city:shanghai/days/2026-06-10.json",
  "warning": "daily_archive_missing",
  "missing": true
}
```

类型建议：

```ts
type Recent10dHistoricalDay = {
  date: string;
  source: string;
  sourceKind: string;
  quality: 'complete' | 'partial' | 'missing' | 'invalid';
  weatherObjectPath: string;

  warning?: string;
  missing?: boolean;

  dailyRollup?: {
    lightFeatures?: DailyLightFeatures;
  };
};
```

规则：

```text
historicalDays 中的 missing=true 代表该日单日归档缺失。
缺失不是低光。
缺失只降低天气证据可信度。
```

---

## 5. `plantFeatures` 是最近十天植物天气特征容器

当前 `recent-10d.json` 已经使用 `plantFeatures` 承载植物相关天气特征。现有字段包括：

```ts
type Recent10dPlantFeatures = {
  dayCount: number;
  missingDayCount: number;

  avgHumidity: number | null;
  minHumidity: number | null;
  maxHumidity: number | null;

  totalPrecipMm: number;
  rainyDays: number;
  highUvDays: number;

  dryAirDays: number;
  humidAirDays: number;

  maxTempC: number | null;
  minTempC: number | null;

  heatStressDays: number;
  coldStressDays: number;
};
```

光照相关的最近十天聚合字段也放入 `plantFeatures`，保持当前数据结构集中，不新增顶层 `lightFeatures`。

追加字段建议：

```ts
type Recent10dPlantFeatures = {
  // 已有字段保持不变
  dayCount: number;
  missingDayCount: number;

  avgHumidity: number | null;
  minHumidity: number | null;
  maxHumidity: number | null;

  totalPrecipMm: number;
  rainyDays: number;
  highUvDays: number;

  dryAirDays: number;
  humidAirDays: number;

  maxTempC: number | null;
  minTempC: number | null;

  heatStressDays: number;
  coldStressDays: number;

  // 光照新增字段
  validLightDayCount?: number;
  missingLightDayCount?: number;

  weatherLightFactor10d?: number | null;
  daylightFactor10d?: number | null;

  daylightCloudMean10d?: number | null;
  daylightCloudP75Mean10d?: number | null;
  daylightCloudMax10d?: number | null;

  visibilityMean10d?: number | null;
  visibilityMin10d?: number | null;

  lowLightDays?: number;
  veryLowLightDays?: number;

  dominantWeatherIcon10d?: string | null;
  dominantWeatherText10d?: string | null;
  dominantWeatherLightCategory10d?: WeatherLightCategory | null;

  lightConfidence?: 'high' | 'medium' | 'low' | 'none';
  lightEvidenceInsufficient?: boolean;
};
```

命名原则：

```text
使用 plantFeatures 作为最近十天植物天气特征容器。
新增光照字段使用 light / weatherLight / daylight / visibility 前缀。
不新增顶层 lightFeatures，避免和现有 plantFeatures 并行。
```

---

## 6. 整体天气证据与光照证据

当前文件已有顶层字段：

```ts
weatherEvidenceInsufficient: boolean;
```

语义：

```text
最近十天天气证据整体不足。
```

光照新增字段：

```ts
plantFeatures.lightEvidenceInsufficient?: boolean;
```

语义：

```text
最近十天光照天气证据不足。
```

判断规则：

```ts
plantFeatures.lightEvidenceInsufficient = validLightDayCount < 3;
```

消费规则：

```ts
const lightEvidenceInsufficient =
  plantFeatures.lightEvidenceInsufficient
  ?? recent10d.weatherEvidenceInsufficient
  ?? true;
```

证据不足时：

```text
天气光照因子 = 1.00
天气侧不参与加减权
最终可信度下降
不得输出“最近十天天气导致光照不足/偏强”
```

---

## 7. 单日天气采样结构

单日天气缓存中，一天按 4 个时段采样：

```text
morning：早晨
forenoon：上午
noon：中午
afternoon：下午
```

单条采样结构：

```ts
type WeatherNowSample = {
  slotName: 'morning' | 'forenoon' | 'noon' | 'afternoon';

  sampledAt: string;
  obsTime?: string;

  temp?: number;
  feelsLike?: number;

  icon?: string;
  text?: string;

  wind360?: number;
  windDir?: string;
  windScale?: string;
  windSpeed?: number;

  humidity?: number;
  precipLastHour?: number;
  pressure?: number;
  visibilityKm?: number;
  cloud?: number;
  dew?: number;

  sourceKind: 'weather_now_sample' | string;
};
```

光照算法使用字段：

| 字段 | 中文含义 | 用途 |
|---|---|---|
| `cloud` | 云量 | 室外可用光的核心天气代理变量 |
| `icon` | 和风天气图标代码 | 云量缺失时的首选分类兜底 |
| `text` | 天气文字 | 展示、解释、旧数据兼容 |
| `visibilityKm` | 能见度 | 雾霾、低能见度的弱修正 |
| `obsTime` | 实际观测时间 | 排除明显落在白昼窗口外的光照样本 |
| `slotName` | 计划采样时段 | 分时段加权 |

不进入光照主公式：

```text
temp
feelsLike
humidity
pressure
wind360
windDir
windScale
windSpeed
dew
```

`precipLastHour` 仅用于极端降水兜底，不作为常规光照主因子。

---

## 8. 单日光照特征

单日缓存中的日级聚合字段：

```text
dailyRollup.lightFeatures
```

结构建议：

```ts
type DailyLightFeatures = {
  daylightCloudMean: number | null;
  daylightCloudP75: number | null;
  daylightCloudMax: number | null;

  visibilityMin: number | null;
  visibilityMean: number | null;

  dominantWeatherIcon: string | null;
  dominantWeatherText: string | null;
  weatherLightCategory: WeatherLightCategory | null;

  weatherLightFactor: number | null;
  lowLightProxy: 'low' | 'medium' | 'high' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'none';
};
```

可信度规则：

```ts
function getDailyLightConfidence(validLightSampleCount: number) {
  if (validLightSampleCount >= 3) return 'high';
  if (validLightSampleCount === 2) return 'medium';
  if (validLightSampleCount === 1) return 'low';
  return 'none';
}
```

规则：

```text
可信度只表达数据完整性与可靠性。
可信度不得直接乘到天气光照因子上。
数据不完整不是天气变暗。
```

---

## 9. 天气光照因子的字段优先级

单样本天气光照因子的字段优先级：

```text
云量 cloud
→ 天气图标 icon
→ 天气文字 text
→ 默认值 unknown
```

规则：

1. 有云量时，使用云量。
2. 云量缺失且天气图标存在时，使用图标分类兜底。
3. 云量和图标都缺失时，使用天气文字最后兼容。
4. 三者都缺失时，使用默认值。
5. 云量存在时，不得再用图标或天气文字重复扣分。

---

## 10. 云量因子

```ts
function getCloudFactor(cloud?: number | null) {
  if (typeof cloud !== 'number') return null;

  return clamp(
    1 - (cloud / 100) * 0.55,
    0.45,
    1.00
  );
}
```

| 云量 | 云量因子 |
|---:|---:|
| 0% | 1.00 |
| 50% | 约 0.73 |
| 100% | 0.45 |

100% 云量不降为 0，因为阴天仍有散射光。

---

## 11. 能见度因子

```ts
function getVisibilityFactor(visibilityKm?: number | null) {
  if (typeof visibilityKm !== 'number') return 1.00;

  if (visibilityKm < 3) return 0.85;
  if (visibilityKm < 5) return 0.90;
  if (visibilityKm < 10) return 0.96;
  return 1.00;
}
```

能见度只做弱修正。

---

## 12. 天气图标兜底

天气图标使用和风天气官方图标代码分类。

参考：

```text
https://dev.qweather.com/docs/resource/icons/
```

边界：

```text
图标代码到天气类别的分类依据来自和风天气官方图标代码。
天气类别到光照因子的数值是青花植内部启发式参数。
该因子不代表和风官方光照强度，也不代表 Lux、PAR 或 DLI。
```

天气光照类别：

```ts
type WeatherLightCategory =
  | 'clear'            // 晴
  | 'partly_cloudy'    // 少云 / 晴间多云
  | 'cloudy'           // 多云
  | 'overcast'         // 阴
  | 'light_rain'       // 小雨 / 阵雨 / 细雨
  | 'moderate_rain'    // 中雨 / 普通雨
  | 'heavy_rain'       // 大雨及以上
  | 'snow'             // 雪 / 雨雪
  | 'fog_haze_dust'    // 雾 / 霾 / 沙尘
  | 'unknown';         // 未知
```

图标到类别映射：

```ts
const ICON_TO_LIGHT_CATEGORY: Record<string, WeatherLightCategory> = {
  '100': 'clear',
  '150': 'clear',

  '102': 'partly_cloudy',
  '152': 'partly_cloudy',
  '103': 'partly_cloudy',
  '153': 'partly_cloudy',

  '101': 'cloudy',
  '151': 'cloudy',

  '104': 'overcast',

  '300': 'light_rain',
  '305': 'light_rain',
  '309': 'light_rain',
  '314': 'light_rain',
  '350': 'light_rain',

  '301': 'moderate_rain',
  '302': 'moderate_rain',
  '306': 'moderate_rain',
  '315': 'moderate_rain',
  '351': 'moderate_rain',
  '399': 'moderate_rain',

  '303': 'heavy_rain',
  '304': 'heavy_rain',
  '307': 'heavy_rain',
  '308': 'heavy_rain',
  '310': 'heavy_rain',
  '311': 'heavy_rain',
  '312': 'heavy_rain',
  '313': 'heavy_rain',
  '316': 'heavy_rain',
  '317': 'heavy_rain',
  '318': 'heavy_rain',

  '400': 'snow',
  '401': 'snow',
  '402': 'snow',
  '403': 'snow',
  '404': 'snow',
  '405': 'snow',
  '406': 'snow',
  '407': 'snow',
  '408': 'snow',
  '409': 'snow',
  '410': 'snow',
  '456': 'snow',
  '457': 'snow',
  '499': 'snow',

  '500': 'fog_haze_dust',
  '501': 'fog_haze_dust',
  '502': 'fog_haze_dust',
  '503': 'fog_haze_dust',
  '504': 'fog_haze_dust',
  '507': 'fog_haze_dust',
  '508': 'fog_haze_dust',
  '509': 'fog_haze_dust',
  '510': 'fog_haze_dust',
  '511': 'fog_haze_dust',
  '512': 'fog_haze_dust',
  '513': 'fog_haze_dust',
  '514': 'fog_haze_dust',
  '515': 'fog_haze_dust',

  '900': 'unknown',
  '901': 'unknown',
  '999': 'unknown',
};
```

类别到光照因子：

```ts
const LIGHT_CATEGORY_FACTOR: Record<WeatherLightCategory, number> = {
  clear: 1.00,
  partly_cloudy: 0.88,
  cloudy: 0.75,
  overcast: 0.55,
  light_rain: 0.45,
  moderate_rain: 0.36,
  heavy_rain: 0.25,
  snow: 0.35,
  fog_haze_dust: 0.35,
  unknown: 0.75,
};
```

---

## 13. 天气文字兜底

天气文字只做最后兼容，不是首选分类依据。

```ts
function getTextLightFactor(text?: string | null): number | null {
  if (!text) return null;

  if (text.includes('晴')) return 1.00;
  if (text.includes('少云')) return 0.90;
  if (text.includes('多云')) return 0.75;
  if (text.includes('阴')) return 0.55;
  if (text.includes('雾') || text.includes('霾') || text.includes('沙')) return 0.35;
  if (text.includes('暴雨') || text.includes('大雨')) return 0.25;
  if (text.includes('中雨')) return 0.36;
  if (text.includes('小雨') || text.includes('阵雨')) return 0.45;
  if (text.includes('雪')) return 0.35;

  return null;
}
```

---

## 14. 单样本光照因子

```ts
function getSampleLightFactor(sample: WeatherNowSample) {
  const cloudFactor = getCloudFactor(sample.cloud);

  const skyFactor =
    cloudFactor
    ?? getIconLightFactor(sample.icon)
    ?? getTextLightFactor(sample.text)
    ?? LIGHT_CATEGORY_FACTOR.unknown;

  const visibilityFactor = getVisibilityFactor(sample.visibilityKm);

  return clamp(
    skyFactor * visibilityFactor,
    0.25,
    1.00
  );
}
```

紫外线指数缺失时：

```ts
const uvFactor = 1.00;
```

禁止：

```text
用温度、湿度、气压、露点反推紫外线。
```

---

## 15. 单日光照特征生成

时段权重：

```ts
const SLOT_WEIGHT = {
  morning: 0.22,
  forenoon: 0.28,
  noon: 0.30,
  afternoon: 0.20,
} as const;
```

有效样本判断：

```ts
function isOfficialWeatherSample(sample: WeatherNowSample) {
  return sample.sourceKind === 'weather_now_sample';
}
```

```ts
function isUsableForLight(sample: WeatherNowSample, sunWindow: SunWindow) {
  if (!sample.obsTime || !sunWindow?.sunrise || !sunWindow?.sunset) {
    return true;
  }

  const obs = new Date(sample.obsTime).getTime();
  const sunrise = new Date(sunWindow.sunrise).getTime();
  const sunset = new Date(sunWindow.sunset).getTime();

  const toleranceMs = 30 * 60 * 1000;

  if (obs < sunrise - toleranceMs) return false;
  if (obs > sunset + toleranceMs) return false;

  return true;
}
```

缺失时段处理：

```text
重新归一化已有时段权重。
缺失时段降低可信度。
缺失时段不视为低光。
```

---

## 16. 最近十天光照字段生成

最近十天光照字段写入：

```text
recent-10d.json.plantFeatures
```

可信度权重：

```ts
const CONFIDENCE_WEIGHT = {
  high: 1.00,
  medium: 0.70,
  low: 0.40,
  none: 0,
} as const;
```

最近十天光照可信度：

```ts
function getRecent10dLightConfidence(validLightDayCount: number) {
  if (validLightDayCount >= 7) return 'high';
  if (validLightDayCount >= 4) return 'medium';
  if (validLightDayCount >= 1) return 'low';
  return 'none';
}
```

聚合结果写回：

```ts
recent10d.plantFeatures = {
  ...existingPlantFeatures,
  ...buildRecent10dLightPlantFeatures(days),
};
```

规则：

```text
保留原 plantFeatures 字段。
只追加光照字段。
不删除、不重命名已有字段。
```

---

## 17. 室内光照计算

光照算法优先消费：

```text
recent-10d.json.plantFeatures.weatherLightFactor10d
```

不在诊断时重复扫描单日文件。

```ts
function estimateIndoorLightHoursFromRecent10d(
  profile: GenusLightProfile,
  env: LightEnvInput,
  recent10d: Recent10dWeatherCache
) {
  const features = recent10d.plantFeatures;

  const facingBaseHours = getFacingBaseHours(env.facing, env.latitude);

  const lightEvidenceInsufficient =
    features.lightEvidenceInsufficient
    ?? recent10d.weatherEvidenceInsufficient
    ?? true;

  const weatherLightFactor =
    lightEvidenceInsufficient
      ? 1.00
      : features.weatherLightFactor10d ?? 1.00;

  const weatherConfidence =
    lightEvidenceInsufficient
      ? 'none'
      : features.lightConfidence ?? 'none';

  const daylightFactor = features.daylightFactor10d ?? 1.00;

  const outdoorEqHours =
    facingBaseHours
    * daylightFactor
    * weatherLightFactor;

  const indoorEqHours =
    outdoorEqHours
    * WINDOW_FACTOR[env.windowType]
    * DISTANCE_FACTOR[env.distanceBand]
    * OBSTRUCTION_FACTOR[env.obstruction]
    * DIRECT_SUN_FACTOR[env.directSun];

  return {
    indoorEqHours: Number(indoorEqHours.toFixed(1)),
    needRange: profile.freq,
    level: judgeLightLevel(profile.freq, indoorEqHours),
    confidence: mergeLightConfidence(weatherConfidence, env),
    debug: {
      facingBaseHours,
      daylightFactor,
      weatherLightFactor,
      weatherConfidence,
      lightEvidenceInsufficient,
      weatherEvidenceInsufficient: recent10d.weatherEvidenceInsufficient,
      windowFactor: WINDOW_FACTOR[env.windowType],
      distanceFactor: DISTANCE_FACTOR[env.distanceBand],
      obstructionFactor: OBSTRUCTION_FACTOR[env.obstruction],
      directSunFactor: DIRECT_SUN_FACTOR[env.directSun],
    },
  };
}
```

天气证据不足时：

```text
天气光照因子 = 1.00
天气可信度 = none
```

含义：

```text
天气侧不参与加减权；
室内问答侧仍可正常判断；
最终可信度下降。
```

---

## 18. 室内侧加减权

```ts
const FACING_BASE_HOURS_NORTH = {
  南: 5.5,
  东: 3.8,
  西: 3.6,
  北: 1.8,
  阳台: 6.2,
  无窗: 0,
  不知道: 3.5,
} as const;

const DISTANCE_FACTOR = {
  D0: 1.00,      // 0–0.5 米 / 0–1 步
  D1: 0.82,      // 0.5–1.5 米 / 2 步左右
  D2: 0.58,      // 1.5–3 米 / 3–5 步
  D3: 0.36,      // 3–5 米 / 6–8 步
  D4: 0.18,      // 5 米以上 / 9 步以上
  UNKNOWN: 0.60,
} as const;

const WINDOW_FACTOR = {
  落地窗: 1.15,
  标准窗: 1.00,
  小窗: 0.80,
  不知道: 0.90,
} as const;

const OBSTRUCTION_FACTOR = {
  无明显遮挡: 1.00,
  薄纱帘: 0.85,
  厚窗帘: 0.55,
  阳台遮挡: 0.75,
  楼栋遮挡: 0.65,
  植物看不到窗: 0.30,
  不知道: 0.85,
} as const;

const DIRECT_SUN_FACTOR = {
  有直射: 1.10,
  无直射: 0.90,
  不确定: 1.00,
} as const;
```

---

## 19. 结果判定

```ts
function judgeLightLevel(
  [minNeed, maxNeed]: [number, number],
  indoorEqHours: number
) {
  if (indoorEqHours < minNeed * 0.5) {
    return '严重不足';
  }

  if (indoorEqHours < minNeed) {
    return '不足';
  }

  if (indoorEqHours > maxNeed * 1.25) {
    return '偏强';
  }

  return '基本满足';
}
```

对于：

```json
{
  "way": "全日照/半日照",
  "freq": [5, 8],
  "unit": "小时/天"
}
```

含义：

| 估算有效光照 | 结果 |
|---:|---|
| `< 2.5 小时/天` | 严重不足 |
| `2.5–5 小时/天` | 不足 |
| `5–10 小时/天` | 基本满足 |
| `> 10 小时/天` | 偏强 |

---

## 20. 开发计划

### 阶段一：确认类型

需要确认或补齐：

1. `WeatherNowSample`
2. `WeatherCacheDay`
3. `DailyLightFeatures`
4. `Recent10dWeatherCache`
5. `Recent10dPlantFeatures`
6. `WeatherLightCategory`

### 阶段二：补齐单日光照特征

实现：

1. `getCloudFactor`
2. `getVisibilityFactor`
3. `getIconLightCategory`
4. `getIconLightFactor`
5. `getTextLightFactor`
6. `getSampleLightFactor`
7. `isOfficialWeatherSample`
8. `isUsableForLight`
9. `buildDailyLightFeatures`
10. `getDailyLightConfidence`

写入位置：

```text
days/{date}.json.dailyRollup.lightFeatures
```

### 阶段三：补齐最近十天光照字段

实现：

1. `buildRecent10dLightPlantFeatures`
2. `getRecent10dLightConfidence`
3. `weightedMean`
4. `weightedMeanBySlot`
5. `getDominantWeatherLightCategory`
6. `lightEvidenceInsufficient` 计算

写入位置：

```text
recent-10d.json.plantFeatures
```

保留已有字段：

```text
dayCount
missingDayCount
avgHumidity
minHumidity
maxHumidity
totalPrecipMm
rainyDays
highUvDays
dryAirDays
humidAirDays
maxTempC
minTempC
heatStressDays
coldStressDays
```

### 阶段四：接入光照算法

实现：

```ts
estimateIndoorLightHoursFromRecent10d(profile, env, recent10d)
```

消费字段：

```text
recent10d.plantFeatures.weatherLightFactor10d
```

证据不足时：

```text
weatherLightFactor = 1.00
confidence 降低
```

### 阶段五：测试

必须覆盖：

1. `recent-10d.json` 存在时，算法消费 `recent-10d.plantFeatures.weatherLightFactor10d`。
2. `quality = missing` 时不会产生低光误判。
3. `weatherEvidenceInsufficient = true` 时，天气因子为中性 `1.00`。
4. `plantFeatures.lightEvidenceInsufficient = true` 时，天气因子为中性 `1.00`。
5. `missingDayCount = 10` 不会被解释为低光。
6. `cloud` 存在时优先使用 `cloud`。
7. `cloud` 缺失时优先使用 `icon`。
8. `cloud` 和 `icon` 都缺失时才使用 `text`。
9. 未识别图标映射到 `unknown`，不能报错。
10. 图标、天气文字不得与云量重复强扣。
11. 能见度只做弱修正。
12. 质量和可信度不得直接乘到天气光照因子。
13. 缺失时段只影响可信度，并重新归一化已有时段权重。
14. 实际观测时间明显在白昼窗口外的样本不参与光照聚合。
15. 问诊模式使用 D-10 到 D-1，不使用 D0。
16. 最终输出仍是室内等效光照小时与属级光照需求比较。
17. 不新增顶层 `lightFeatures`。
18. 不删除或重命名现有 `plantFeatures` 字段。

---

## 21. 执行边界

### 不做

1. 不新建第二套最近十天聚合模型。
2. 不新增顶层 `lightFeatures`。
3. 不重构天气缓存结构。
4. 不删除 `plantFeatures`。
5. 不删除 `historicalDays`。
6. 不删除 `dailyObjectPaths`。
7. 不删除顶层 `weatherObjectPath`。
8. 不把缺失天数当成低光。
9. 不把天气证据不足当成低光。
10. 不用温湿度反推紫外线。
11. 不让图标、天气文字和云量重复强扣。
12. 不把问诊结果改成排序模型。
13. 不强制接入 LocationID 或 GeoHash。
14. 不声称光照因子是和风官方光照数据。

### 只做

1. 复用现有单日天气缓存。
2. 复用现有最近十天聚合文件。
3. 补齐单日光照特征。
4. 在 `plantFeatures` 内补齐最近十天光照字段。
5. 让光照算法消费 `plantFeatures.weatherLightFactor10d`。
6. 保持原始室内光照公式。
7. 补充测试与调试输出。
8. 保持问诊路径与结果项逻辑不变。

---

## 22. 可直接给 Codex 的任务摘要

```text
任务：基于现有 weather-cache/v1/recent-10d 聚合模型，在 plantFeatures 中补齐室内植物光照算法所需字段，并让光照算法消费 plantFeatures.weatherLightFactor10d。

背景：
- 项目已有 days/{date}.json 单日缓存。
- 项目已有 recent-10d.json 最近十天聚合文件。
- recent-10d.json 当前顶层字段包括 location、generatedAt、sourceKind、quality、weatherEvidenceInsufficient、weatherObjectPath、dailyObjectPaths、window、historicalDays、plantFeatures、meta。
- plantFeatures 当前已有 dayCount、missingDayCount、湿度、降水、温度等植物天气特征。
- 光照相关最近十天字段应追加到 plantFeatures，不新增顶层 lightFeatures。
- 单日样本包含 cloud、visibilityKm、icon、text、obsTime、slotName。
- 紫外线指数缺失时固定 uvFactor = 1.00。
- 云量优先；云量缺失时天气图标兜底；天气文字仅最后兼容。
- 图标分类依据来自和风官方图标代码，光照因子是青花植内部启发式参数。
- missing / partial / weatherEvidenceInsufficient 代表证据质量，不代表低光。

必须实现：
1. 补齐 days/{date}.json.dailyRollup.lightFeatures。
2. 在 recent-10d.json.plantFeatures 中追加光照字段。
3. plantFeatures 输出 weatherLightFactor10d、lightConfidence、lightEvidenceInsufficient、validLightDayCount、missingLightDayCount。
4. 光照算法消费 recent10d.plantFeatures.weatherLightFactor10d。
5. lightEvidenceInsufficient=true 或 weatherEvidenceInsufficient=true 时，天气因子使用中性 1.00，只降低 confidence。
6. cloud 存在时不使用 icon/text 重复强扣。
7. cloud 缺失时 icon 优先于 text。
8. 最终仍以 indoorEqHours 与属级 freq 比较，输出光照不足/基本满足/偏强。

不得做：
- 不要新增顶层 lightFeatures。
- 不要新建第二套 recent-10d 聚合模型。
- 不要重构缓存 schema。
- 不要删除 plantFeatures、historicalDays、dailyObjectPaths、weatherObjectPath。
- 不要用温湿度反推 UV。
- 不要把光照算法改成 ranking。
- 不要强制 LocationID 或 GeoHash。
- 不要声称 factor 是和风官方光照强度数据。

验收：
- recent-10d.json.plantFeatures 能输出光照字段。
- quality=missing 时不会产生低光误判。
- 有足够有效日时，算法使用 plantFeatures.weatherLightFactor10d。
- 证据不足时，算法降级为天气中性因子，并降低 confidence。
- 最终仍输出光照不足/基本满足/偏强 outcome。
```

---

## 23. 最终链路

```text
单日分时段采样
→ 单日光照特征
→ 最近十天 plantFeatures 光照字段
→ 室内等效光照小时
→ 属级光照需求比较
→ 光照结果项
```

核心边界：

```text
缺失不是低光；
部分数据不是低光；
天气证据不足不是低光；
云量优先；
图标兜底；
天气文字最后兼容；
紫外线缺失时中性；
plantFeatures 是最近十天植物天气特征容器；
光照算法是结果项生成器，不做原因排序。
```
