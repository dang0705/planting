# 实现自有历史天气缓存：D-1 到 D-10 滚动窗口（低成本对象存储方案）

## 背景

当前青花植诊断依赖近 10 天环境上下文判断浇水、盆土干湿、闷根、低光、通风、温湿度胁迫等问题。

但和风天气时光机存在两个问题：

1. 只能补历史数据，无法覆盖今天；
2. 历史字段相对少，无法完整覆盖每日预报里的 `uvIndex`、`cloud`、`vis`、昼夜天气、昼夜风力等对植物诊断有价值的字段。

因此，不能只依赖和风时光机作为青花植的历史天气事实源。

本任务目标是：在 MVP 阶段，用低成本方案自建一个 D-1 到 D-10 的历史天气滚动窗口缓存。诊断链路只读自有缓存，不在用户请求时实时请求和风。

## 设计口径

这不是简单的“接口缓存”，而是青花植自己的：

```plain
weather history service / 自有历史天气缓存服务
```

核心职责：

```plain
定时采集和风天气数据
  ↓
沉淀地点级天气快照
  ↓
生成 D-1 到 D-10 滚动窗口 JSON
  ↓
诊断服务读取自有缓存
  ↓
病例保存天气特征快照，保证诊断可追溯
```

## 关键架构结论

MVP 阶段不建议把天气主体缓存放数据库。

天气数据特征是：

```plain
小体积
按 locationKey + 日期窗口读取
写入频率低
读多写少
查询模式固定
不需要复杂 SQL
不需要事务强一致
```

因此主缓存层应使用：

```plain
对象存储 / 云存储 JSON 文件
```

数据库只存元数据、索引、对象路径和病例引用，不作为天气窗口主体热缓存。

推荐分层：

```plain
L0：小程序本地缓存，仅做 UI 加速
L1：云函数内存 Map，热实例内加速
L2：对象存储 recent-10d.json，作为持久缓存主层
DB：只存 location registry / object path / diagnosis evidence reference
```

## 推荐目标架构

```plain
weather-ingestion 定时云函数
  ↓
调用 QWeather /v7/weather/10d
  ↓
写入 raw forecast snapshot
  ↓
按地点本地日期生成 daily archive
  ↓
生成 recent-10d.json
  ↓
写入对象存储


diagnose-http / weather-http
  ↓
先查云函数内存 Map
  ↓ miss
读取对象存储 recent-10d.json
  ↓
写入内存 Map
  ↓
返回给诊断逻辑
```

## 范围

### 必须做

*   新增或整理天气地点注册结构 `WeatherLocation`。
*   支持按业务真实地点注册 `locationKey` 与和风 `LocationID`。
*   新增定时采集任务，从和风每日预报接口获取 10 天预报数据。
*   将采集到的每日预报结果保存为 raw forecast snapshot。
*   按地点本地日期生成 D-1 daily archive。
*   维护 D-1 到 D-10 滚动窗口。
*   将滚动窗口物化为对象存储 JSON：`recent-10d.json`。
*   诊断链路通过自有服务读取 `recent-10d.json`，不直接请求和风。
*   在 `diagnose-http` 或独立 `weather-http` 中加入模块级内存 Map 缓存。
*   小程序端可做本地缓存，但只能做 UI 加速，不能作为服务端诊断事实源。
*   数据库只保存天气地点元数据、对象路径、生成时间、病例天气证据引用。
*   生成植物诊断友好的天气派生特征，例如：
    *   最近 3 / 7 / 10 天降水累计；
    *   连续阴雨天数；
    *   连续高温天数；
    *   连续低温天数；
    *   平均湿度 / 低湿天数；
    *   cloud / uvIndex 形成的低光 proxy；
    *   风速形成的通风 proxy；
    *   雨后盆土偏湿风险。
*   为每个天气窗口保留 `sourceKind` 与 `quality`。
*   诊断 session 使用天气时，保存 `DiagnosisWeatherEvidence` 快照，保证后续可追溯。
*   缓存缺失时，诊断不能阻塞；应返回天气证据不足或触发后台补抓。

### 不做

*   不把天气 daily 主体拆成数据库多行作为热缓存。
*   不在用户诊断请求中同步请求和风接口。
*   不启用 Redis、付费缓存、付费 CDN、云函数付费保活、升配等付费能力。
*   不批量抓取全国 / 全城市天气。
*   不缓存或批量下载 GeoAPI 全量数据。
*   不做长期天气数据仓库。
*   不做复杂天气分析后台。
*   不扩大到养护算法、问诊题包、outcome 权重重构。
*   不要求本任务一次完成实时天气 hourly 采样；实时采样可作为后续增强。

## 数据存储设计

### 1\. WeatherLocation 元数据，存数据库

```plain
type WeatherLocation = {
  locationKey: string
  qweatherLocationId: string
  cityName?: string
  timezone: string
  isActive: boolean
  lastUsedAt: string
  recentObjectPath?: string
  recentGeneratedAt?: string
  createdAt: string
  updatedAt: string
}
```

说明：

*   只保存业务真实使用过的地点。
*   不批量保存和风 GeoAPI 全量地点数据。
*   `timezone` 必须存在，后续按地点本地日期归档。

### 2\. 对象存储路径设计

建议路径：

```plain
weather-cache/
  v1/
    locations/
      {locationKey}/
        recent-10d.json
        manifest.json
        daily/
          2026-06-04.json
          2026-06-05.json
          2026-06-06.json
        raw/
          forecast-2026-06-14T00-00.json
          forecast-2026-06-14T06-00.json
```

诊断接口只读：

```plain
weather-cache/v1/locations/{locationKey}/recent-10d.json
```

### 3\. recent-10d.json 结构

```plain
type WeatherRecent10dCache = {
  locationKey: string
  timezone: string
  window: {
    from: string
    to: string
    days: 10
  }
  provider: 'QWeather'
  sourceKind: 'forecast_snapshot_archive' | 'mixed' | 'backfilled_limited'
  generatedAt: string
  daily: WeatherDailyArchive[]
}
```

单日结构建议：

```plain
type WeatherDailyArchive = {
  date: string

  tempMax?: number
  tempMin?: number
  humidity?: number
  precip?: number
  pressure?: number
  vis?: number
  cloud?: number
  uvIndex?: number

  textDay?: string
  textNight?: string
  iconDay?: string
  iconNight?: string

  windSpeedDay?: number
  windSpeedNight?: number
  windScaleDay?: string
  windScaleNight?: string

  plantFeatures: {
    wetSoilRiskFromRain?: 'none' | 'low' | 'medium' | 'high'
    dryAirLevel?: 'none' | 'low' | 'medium' | 'high'
    lowLightProxy?: 'none' | 'low' | 'medium' | 'high'
    heatStressLevel?: 'none' | 'low' | 'medium' | 'high'
    coldStressLevel?: 'none' | 'low' | 'medium' | 'high'
    ventilationProxy?: 'poor' | 'normal' | 'strong' | 'unknown'
  }

  quality: {
    completeness: 'complete' | 'partial' | 'backfilled_limited'
    sourceKind: 'forecast_snapshot_final' | 'observed_rollup' | 'historical_reanalysis' | 'mixed'
    missingFields?: string[]
  }
}
```

### 4\. DiagnosisWeatherEvidence，随病例保存

```plain
type DiagnosisWeatherEvidence = {
  diagnosisSessionId: string
  locationKey: string
  weatherWindowFrom: string
  weatherWindowTo: string
  weatherObjectPath: string
  featureSnapshot: Record<string, any>
  createdAt: string
}
```

目的：

*   后续即使天气缓存被清理，病例仍可追溯；
*   解释 outcome 时能说明当时使用了哪些天气特征；
*   避免历史天气缓存变化污染旧诊断结果。

## 读取策略

### 服务端读取

建议提供内部接口：

```plain
GET /internal/weather/recent?locationKey={locationKey}&days=10
```

逻辑：

```plain
1. 读取云函数内存 Map
2. 命中则直接返回
3. 未命中则读取对象存储 recent-10d.json
4. 写入内存 Map，TTL 建议 30 分钟
5. 返回天气窗口给诊断逻辑
```

### 云函数内存缓存

```plain
type MemoryWeatherCacheItem = {
  expiresAt: number
  data: WeatherRecent10dCache
}
```

建议 key：

```plain
weather:recent10:{locationKey}
```

注意：

*   云函数内存缓存只是 L1；
*   冷启动会丢；
*   多实例不共享；
*   不能作为持久层。

### 小程序端缓存

小程序端可以缓存同一用户最近一次读取的天气窗口，用于 UI 加速。

有效期：

```plain
当天内有效
跨天失效
locationKey 变化失效
```

小程序本地缓存不能作为服务端诊断事实源。

## 写入策略

### 定时采集

MVP 建议：

```plain
每 6 小时采集一次 /v7/weather/10d
每天 00:10–00:30，按地点本地日期定稿昨天 daily archive
每天定稿后重建 recent-10d.json
```

注意：归档必须按 `WeatherLocation.timezone`，不能按云函数服务器时区。

### 滚动窗口

每日定稿后：

```plain
生成 D-1 daily archive
保留最新 10 天 daily archive
重建 recent-10d.json
更新 manifest.json
更新 WeatherLocation.recentObjectPath / recentGeneratedAt
```

### 缺失与降级

如果 `recent-10d.json` 不存在或过期：

```plain
诊断不阻塞
返回 weatherUnavailable / weatherEvidenceInsufficient
后台触发补抓或下一轮定时任务修复
结果页说明天气证据不足
```

不要在用户请求中同步请求和风。

## sourceKind 与 quality 规则

必须区分数据来源，避免把预报快照伪装成严格历史实况。

```plain
forecast_snapshot_final：由每日预报快照定稿
observed_rollup：由实时天气采样聚合，后续增强
historical_reanalysis：由时光机补偿，字段有限
mixed：多个来源混合
```

MVP 第一阶段允许：

```plain
sourceKind = forecast_snapshot_archive
quality.sourceKind = forecast_snapshot_final
```

如果未来接入时光机补偿，缺字段必须标记：

```plain
quality.completeness = backfilled_limited
```

## 实施阶段

### Phase 1：MVP 最小闭环

*   WeatherLocation 元数据。
*   定时采集和风每日 10 天预报。
*   保存 raw snapshot。
*   生成 D-1 daily archive。
*   生成 recent-10d.json。
*   diagnose-http / weather-http 从对象存储读取 recent-10d.json。
*   云函数内存 Map 加速。
*   病例保存 weather feature snapshot。

### Phase 2：实时天气采样增强，后续任务

*   每小时采集 `/v7/weather/now`。
*   生成 observed daily rollup。
*   提升当天真实环境可信度。
*   `sourceKind` 可变为 `mixed`。

### Phase 3：时光机补偿，后续任务

*   每天 T+1 使用和风时光机补偿昨天历史数据。
*   保留 forecast snapshot 中时光机没有的字段。
*   标记 `backfilled_limited`。

## CheckList

- [ ] 定位当前天气数据读取链路。
- [ ] 确认诊断链路是否仍实时请求和风。
- [ ] 定义 `WeatherLocation` 元数据结构。
- [ ] 支持业务地点注册 `locationKey` 与和风 `LocationID`。
- [ ] 设计对象存储路径：`weather-cache/v1/locations/{locationKey}/recent-10d.json`。
- [ ] 实现和风每日 10 天预报定时采集。
- [ ] 保存 raw forecast snapshot。
- [ ] 按地点本地日期生成 D-1 daily archive。
- [ ] 每日重建 D-1 到 D-10 的 `recent-10d.json`。
- [ ] 生成或更新 `manifest.json`。
- [ ] 数据库只保存对象路径与元数据，不保存天气 daily 主体热缓存。
- [ ] 实现服务端读取 recent weather 的方法或内部接口。
- [ ] 在服务端加入模块级内存 Map 缓存。
- [ ] 设置内存缓存 TTL，建议 30 分钟。
- [ ] 诊断链路改为读取自有天气缓存，不在用户请求中同步请求和风。
- [ ] 缓存缺失时诊断不阻塞，返回天气证据不足或降级信息。
- [ ] 生成植物诊断需要的派生特征。
- [ ] 保存 `DiagnosisWeatherEvidence` 快照到病例或诊断结果上下文。
- [ ] 正确处理地点时区，不使用服务器时区生成归档日期。
- [ ] 保留 `sourceKind` 与 `quality`。
- [ ] 不引入 Redis、付费缓存、付费 CDN、云函数保活或升配。
- [ ] 不批量抓取全国 / 全城市天气。
- [ ] 不缓存 GeoAPI 全量数据。
- [ ] 补充最小测试：能生成 recent-10d.json。
- [ ] 补充最小测试：D-1 到 D-10 日期窗口正确。
- [ ] 补充最小测试：对象存储 miss 时诊断降级但不阻塞。
- [ ] 补充最小测试：内存缓存命中后不重复读对象存储。
- [ ] 运行 lint / 类型检查。
- [ ] 手动验证一次诊断能读取自有 weather window。
- [ ] 在任务结果中记录：对象路径、数据结构、采集频率、缓存 TTL、降级策略。

## 验收标准

1. 系统能为业务地点生成 D-1 到 D-10 的 `recent-10d.json`。
2. `recent-10d.json` 存放在对象存储 / 云存储，而不是数据库 daily 多行热缓存。
3. 数据库只保存地点元数据、对象路径和必要引用。
4. 诊断链路能通过自有缓存读取最近 10 天天气窗口。
5. 用户诊断请求中不再同步请求和风天气接口。
6. 服务端具备内存 Map 缓存，热实例可减少对象存储读取。
7. 缓存缺失时，诊断流程不阻塞，可降级为天气证据不足。
8. 天气窗口包含植物诊断需要的基础字段与派生特征。
9. 所有天气窗口包含 `sourceKind` 与 `quality`。
10. 日期窗口按地点本地时区计算。
11. 病例或诊断结果中保存天气特征快照，保证可追溯。
12. 未引入 Redis、付费缓存、付费 CDN、云函数付费保活或升配。
13. 未批量缓存 GeoAPI 全量数据。
14. lint / 类型检查通过。
15. 任务结果中必须记录优化前后诊断链路对和风的依赖变化。

## 风险与注意事项

### 1\. 不要把预报快照伪装成严格历史实况

MVP 第一阶段的数据本质是“每日预报快照归档”，不是严格的实况历史。字段上必须保留 `sourceKind` 和 `quality`，避免后续诊断解释变脏。

### 2\. 不要在诊断请求里临时补抓天气

这会拖慢接口，也会破坏 500ms 目标。天气应该提前物化，诊断只读自有缓存。

### 3\. 不要把天气窗口主体放数据库

数据库适合保存索引、对象路径、病例证据引用，不适合作为 MVP 阶段天气窗口热缓存主体。

### 4\. 不要无边界扩展地点

只为业务真实需要的地点生成缓存，不做全国城市天气仓库。

### 5\. D-1 到 D-10 不等于 D0

本任务只负责历史诊断窗口 D-1 到 D-10。若养护模式需要 D0 或未来 7 天，应另走 forecast cache，不要混在本任务里。

## Codex 执行提示

执行前优先读取最小必要上下文：

*   当前和风天气调用位置。
*   问诊 / 诊断读取天气数据的服务层。
*   云函数目录结构。
*   对象存储 / 云存储工具封装。
*   当前是否已有 `genus_care_profiles` 或天气特征层。
*   当前诊断结果是否保存 evidence snapshot。

不要全量扫描无关模块。不要扩大到问诊题包、outcome 权重、养护算法重构、支付、登录、图片识别等模块。

本任务的核心是：

```plain
用低成本对象存储 JSON 物化 D-1 到 D-10 天气窗口，
让诊断链路读自有缓存，
不再实时依赖和风。
```