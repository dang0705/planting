# 城市气候适配度公开读取合同（weather）

- 合同版本：`weather-city-climate-fit/v2`（2026-10-09 自 v1 升级，见文末「版本变更」）
- 负责域：`weather`
- 范围：户外城市自然气候相对适配（ClimateFitPolicy `v0-city-outdoor`）；不是室内实测环境，不是 Care Knowledge 发布包。
- 真相源：已灌库表 `city_climate_profiles` / `plant_city_climate_fit_cache`；v1 `HOT_CITY_WEATHER_LOCATIONS` 单点经纬度；线上 scratch `city-climate-fit-http` 行为经冒烟核对后迁入本域。
- 旧入口映射：`/city-climate-fit-http/profile|fit|recommend` → 下列 `/api/v2/weather/city-climate/...`。现网旧函数在网关与调用方切完前保持不动。

## 入口

均为公开、只读、无个性化、无需幂等键。

1. `GET /api/v2/weather/city-climate/profiles`  
   列出全部城市气候剖面。
2. `GET /api/v2/weather/city-climate/profiles/{cityCode}`  
   读取单个城市剖面。`cityCode`：2–64 位，仅小写字母、数字、`_`、`-`。
3. `GET /api/v2/weather/city-climate/fit?cityCode=&plantId=`  
   读取某城 × 植物的适配缓存。`plantId` 取值为百科分类引用 `taxon_id`（与 plant-knowledge `plant-encyclopedia-read/v1` 的 `catalogTaxonRef` 同一命名空间，例如 `https://tropicals.cn/species/nageia-nagi`）：非空字符串，最长 512 个 Unicode 码点，不裁剪、不改写、按字节精确匹配。不再接受 `plant_id` / `encyclopedia_id` 别名，也不接受百科表自增主键；仅传别名视为缺少 `plantId`（400）。
4. `GET /api/v2/weather/city-climate/recommendations?cityCode=&top=`  
   按 overall 降序推荐；overall 相同时按 `plantId`（taxon_id）升序，保证次序确定。`top` 默认与上限以生效策略 `weather/public_read` 为准，当前省略默认 10、允许 1–50 的整数（用户 2026-10-10 裁定；绝对上限 50；策略不可用时 503 `SERVICE_UNAVAILABLE`）。缓存行若在百科表中找不到对应分类引用，则无法给出公开 `plantId`，不进入推荐结果。

策略版本固定读取 `policyVersion=v0-city-outdoor`。经纬度必须与 v1 热门城目录一致（重庆 `29.5630, 106.5516`）。

## 成功 DTO

响应信封为 `{ data: ... }`。

### CityClimateProfile

| 字段 | 类型 | 来源 |
|---|---|---|
| cityCode | string | city_code |
| displayName | string | display_name |
| lat | number | lat |
| lon | number | lon |
| timezone | string | timezone |
| source | string | source |
| window | `{ start, end }` | window_start / window_end |
| dayCount | number \| null | day_count |
| policyVersion | string | policy_version |
| monthly | array \| object \| null | monthly_json |
| dailyStats | object \| null | daily_stats_json |

列表：`{ data: { items: CityClimateProfile[] } }`。单城：`{ data: CityClimateProfile }`。

### CityClimateFit

| 字段 | 类型 |
|---|---|
| cityCode | string |
| plantId | string（百科分类引用 taxon_id；缓存表按内部 encyclopedia_id 存储，读取时联表映射，内部 id 不出现在响应中） |
| policyVersion | string |
| overall | number \| null |
| temperatureMatch | number \| null |
| humidityMatch | number \| null |
| lightMatch | number \| null |
| primaryBottleneck | string \| null |
| riskFlags | array（来自 risk_flags_json，非法 JSON 视为 []） |

fit 成功：`{ data: { policyVersion, profile: CityClimateProfile, fit: CityClimateFit } }`。

### CityClimateRecommendationItem

在 CityClimateFit 上附加：

| 字段 | 类型 |
|---|---|
| name | string \| null |
| scientificName | string \| null |
| coverImage | `TropicalsCoverImage \| null`（`{ url, source }`，与 `plant-encyclopedia-read/v2`「封面图」节同一 DTO 与规则；不再输出相对路径 coverImageRef） |
| careDifficulty | string \| null |

推荐成功：`{ data: { policyVersion, cityCode, profile, count, recommendations: CityClimateRecommendationItem[] } }`。

## 错误

- 参数非法：400 `VALIDATION_FAILED`，`请求参数不合法`
- 城市剖面不存在：404 `NOT_FOUND`，`城市气候剖面不存在`
- 适配缓存不存在：404 `NOT_FOUND`，`城市气候适配缓存不存在`
- 数据库异常 / 行损坏：500 `INTERNAL_ERROR`，`服务暂时不可用`

禁止返回密钥、原始 SQL、平台身份。本接口不写库。

## Expected 与验收

L3 `unit_fake`：真实 HTTP + 冻结路由 + 请求链 + Repository，仅替换 MySQL。覆盖 Happy（列表/单城/fit/推荐）、非法参数、缺城、缺缓存、SQL 失败泛化 500。交付须注明 TDD 路径与 RED/GREEN 证据。

## 版本变更

### v2（2026-10-09，用户裁决）

- 不兼容变更：`plantId` 从百科表自增主键 `encyclopedia_id`（number）改为百科分类引用 `taxon_id`（string），与 plant-knowledge 统一，不再对外暴露数据库自增主键。
- 查询参数 `plantId` 同步改为 taxon_id；移除 `plant_id` / `encyclopedia_id` 别名。
- 推荐同分次序键由内部 `encyclopedia_id` 改为公开 `plantId`（taxon_id）升序；缓存行缺百科联表时不进入推荐。
- 库结构与缓存数据不变：`plant_city_climate_fit_cache.encyclopedia_id` 仍为内部关联键，读取时经 `tropicals_species_encyclopedia_ref.id → taxon_id` 映射。
- 联表后缺少 taxon_id 的 fit/推荐行视为行损坏（500）。
- 推荐项 `coverImageRef`（相对路径）替换为 `coverImage: { url, source } | null`：用户 2026-10-09 裁决封面全部公开、每图须有来源，规则见 `plant-encyclopedia-read/v2`「封面图」。v2 在同日尚未部署前一并定稿，故不另起 v3。
