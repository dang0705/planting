# `POST /api/v2/care/watering-advice` 合同 `watering-advice/v1`（已冻结）

归属 E06，ClickUp `z8v0kmr973`。路由已登记于 route-registry（`createWateringAdvice`，`guest_or_authenticated`，必须带 `Idempotency-Key`，请求 `WateringAdviceRequest`，响应 `CareCapabilityResponse`），字段由用户 2026-10-08 审阅确认后冻结。

## 请求 `WateringAdviceRequest`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `target` | `{ kind: 'temporary_case', caseRef }` 或 `{ kind: 'user_plant', userPlantRef }` | 是 | 结果归属；游客只能用临时案例，长期植物需登录且归属本人 |
| `catalogTaxonRef` | string | 临时案例必填 | 读取 Tropicals 浇水基线；长期植物从档案取 |
| `location` | `{ latitude, longitude }` | 临时案例必填；长期植物**不得提交**（提交 → 400） | 取太阳辐射；服务端保存前四舍五入到 0.01°（约 1km），不存精确坐标。MVP 重点覆盖腾讯云已存储气候档案的 20 个热门城市，其他位置不拒绝。长期植物改由服务端用档案城市的中心坐标（见下文「长期植物的坐标」，2026-10-10 用户裁决） |
| `window` | `{ orientation: 'N'\|'NE'\|'E'\|'SE'\|'S'\|'SW'\|'W'\|'NW', azimuthDeg?: 0～359.99, glassLayers: 'single'\|'double'\|'none'\|null }` | 是 | 极简光照输入。8 方位必填；前端界面默认预选“南”，后端不设默认。可选 `azimuthDeg` 为手机指南针读数（正北顺时针），提供时优先于方位并须与方位扇区一致。`none` 表示户外/开放阳台，跳过玻璃衰减；`null` 为玻璃未知 |
| `lightReading` | `{ lux, measuredAt, source: 'meter'\|'camera_estimate' }` 或 null | 否 | 植物位置 Lux；缺失时植物位置光照为缺证据（窗口变宽或开放） |
| `soil` | `{ state: 'wet'\|'moist'\|'dry'\|'uncertain', scope: 'surface'\|'root_zone', observedAt }` 或 null | 否 | 当前盆土观察；缺失时只能依赖已确认的浇水记录 |
| `lastWatering` | `{ wateredAt }` 或 null | 否 | 可选“不知道”；不补今天 |
| `pot` | `{ isInnerPot, innerTopDiameterCm, innerBottomDiameterCm, innerHeightCm, hasDrainageHole: true\|false\|null }` 或 null | 否 | 水量估算所需；缺失时水量为缺证据 |
| `substrateMaterials` | V1 九类代码数组（`general`、`coco`、`ceramsite`、`peat`、`perlite`、`bark`、`sphagnum`、`gritty`、`coarse_sand`） | 否 | 配比未知；空数组表示未选 |
| `primarySubstrateMaterial` | 九类代码之一或 `null`（2026-10-10 增补） | 否 | 主要材料＝体积占一半及以上；必须属于 `substrateMaterials`，否则 400 `VALIDATION_FAILED`；缺省/`null` 按各组分并集。规则见 `mvp-watering-policy-contract.md` §8.10 |
| `indoorClimate` | `{ temperatureC, relativeHumidityPercent, measuredAt }` 或 null | 否 | 室内实测；缺失时用策略兜底区间并标为估算 |

时间均为带 `Z` 的 UTC ISO 字符串，且不得晚于服务器当前时刻。未知字段拒绝（`VALIDATION_FAILED`）。

## 响应 `CareCapabilityResponse`

```json
{ "data": { "resultRef": "cres_…", "result": { /* care-capability-result/v1，详情 watering-assessment/v1 */ } } }
```

`result` 即 `assessMvpWatering` 的公开结果：`status`（ready / insufficient_evidence / temporarily_unavailable）、`confidence: low`、`recommendedActions`、`details.action`、`details.checkWindow`（检查盆土窗口与当地日期）、`details.amountMl`（建议浇入区间）、`details.missingEvidence`。不返回输入快照、策略版本、摘要或内部引用。

### 光照与室外辐射缺失码（2026-10-10 增补，用户经主代理确认）

结果为 `insufficient_evidence` 且植物位置光照不可用时，`details.missingEvidence` 在原有类别之后**追加**一个明确缺失码，让前端知道该补什么；原有类别不删除。两个码可同时出现（例如 Provider 不可用且未测 Lux）。

| 缺失码 | 何时出现 | 内部原因 | 前端建议 |
|---|---|---|---|
| `outdoor_radiation` | 室外辐射取不到：Provider 不可用（网络、超时、HTTP 错误、响应非法），或返回的序列里没有覆盖 Lux 测量时刻的时段 | 辐射为空；光照原因 `anchor_radiation` | 提示“暂时取不到天气数据，请稍后再试”；不要求用户重新测光 |
| `plant_light` | 植物位置 Lux 锚点不可用：未测 Lux（不论室外辐射是否可得），或有室外辐射时读数超过 30 天、测量时段太暗（GHI < 50 W/m²）、读数与室外不一致 | `light_reading`、`light_reading_stale`、`anchor_too_dark`、`anchor_inconsistent` | 提示“请在白天明亮时段、于植物位置重新测一次光照” |

- 只在 `status = insufficient_evidence` 时追加；`ready`（例如根区干可以浇水、湿土暂停）、`temporarily_unavailable` 与缺植物基线时不追加。
- 缺失码是稳定枚举，不含坐标、读数、时间或 Provider 错误原文。

### 长期植物的坐标（2026-10-10 用户裁决）

- `target.kind = 'user_plant'` 时，请求体不得携带 `location`（携带 → 400 `VALIDATION_FAILED`）。服务端读取该植物环境档案的 `location.cityRef`
  （`user-plant-environment-profile/v1`），在 weather 城市目录（`city_climate_profiles`，策略 `v0-city-outdoor`）取该城市中心坐标 `lat/lon`，
  四舍五入到 0.01° 后用于取室外辐射；输入清单记录 `location`（城市中心坐标）与 `cityRef`。
- 档案没有位置，或 `cityRef` 不在城市目录：不调用室外辐射 Provider；结果为 `insufficient_evidence` 时在 `details.missingEvidence` 追加缺失码
  **`plant_location`**（不追加 `outdoor_radiation`，因为并未尝试取辐射）；`plant_light` 规则不变。前端建议：提示“请先在植物档案里设置所在城市”。
  若盆土证据已足以给出安全结论（例如根区干 → 可以浇水），结果仍按原规则为 `ready`，不追加缺失码。
- 城市目录读取失败 → 503 `SERVICE_UNAVAILABLE`。
- 临时案例（`temporary_case`）不变：仍必须由请求提供 `location`。

| 缺失码 | 何时出现 | 前端建议 |
|---|---|---|
| `plant_location` | 长期植物档案无城市或城市不在目录，且结果为 `insufficient_evidence` | 提示去植物档案设置城市 |

## 写入与幂等

- 只追加计算结果（临时结果存储或长期结果存储），不写浇水事实、计划或提醒；“我刚浇过水”走 `care/facts`。
- 同一 `Idempotency-Key` + 相同请求体 → 返回首次结果；不同请求体 → `IDEMPOTENCY_CONFLICT`。
- 无活动策略发布 → 200 + `temporarily_unavailable`（不是错误）；Provider 故障 → 对应时段缺段，仍返回可得的安全判断。

## 已确认裁决（用户 2026-10-08）

1. 坐标保存精度 0.01°；MVP 重点覆盖 20 个已存档城市，其他位置照常计算。
2. 朝向 8 方位为必填，前端默认预选南向；用户不清楚时由前端用指南针取角度，作为可选 `azimuthDeg` 传入。
3. 支持户外/开放阳台：`glassLayers: 'none'`。
