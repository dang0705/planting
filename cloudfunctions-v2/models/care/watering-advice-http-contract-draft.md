# `POST /api/v2/care/watering-advice` 合同草案（待用户确认后冻结）

归属 E06，ClickUp `z8v0kmr973`。路由已登记于 route-registry（`createWateringAdvice`，`guest_or_authenticated`，必须带 `Idempotency-Key`，请求 `WateringAdviceRequest`，响应 `CareCapabilityResponse`），但字段尚未冻结。本草案只提出字段，确认前不实现。

## 请求 `WateringAdviceRequest`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `target` | `{ kind: 'temporary_case', caseRef }` 或 `{ kind: 'user_plant', userPlantRef }` | 是 | 结果归属；游客只能用临时案例，长期植物需登录且归属本人 |
| `catalogTaxonRef` | string | 临时案例必填 | 读取 Tropicals 浇水基线；长期植物从档案取 |
| `location` | `{ latitude, longitude }` | 是 | 取太阳辐射；服务端保存前四舍五入到 0.01°（约 1km），不存精确坐标 |
| `window` | `{ orientation: 'N'\|'NE'\|'E'\|'SE'\|'S'\|'SW'\|'W'\|'NW', glassLayers: 'single'\|'double'\|null }` | 是 | 极简光照输入；玻璃层数可未知 |
| `lightReading` | `{ lux, measuredAt, source: 'meter'\|'camera_estimate' }` 或 null | 否 | 植物位置 Lux；缺失时植物位置光照为缺证据（窗口变宽或开放） |
| `soil` | `{ state: 'wet'\|'moist'\|'dry'\|'uncertain', scope: 'surface'\|'root_zone', observedAt }` 或 null | 否 | 当前盆土观察；缺失时只能依赖已确认的浇水记录 |
| `lastWatering` | `{ wateredAt }` 或 null | 否 | 可选“不知道”；不补今天 |
| `pot` | `{ isInnerPot, innerTopDiameterCm, innerBottomDiameterCm, innerHeightCm, hasDrainageHole: true\|false\|null }` 或 null | 否 | 水量估算所需；缺失时水量为缺证据 |
| `substrateMaterials` | V1 九类代码数组（`general`、`coco`、`ceramsite`、`peat`、`perlite`、`bark`、`sphagnum`、`gritty`、`coarse_sand`） | 否 | 配比未知；空数组表示未选 |
| `indoorClimate` | `{ temperatureC, relativeHumidityPercent, measuredAt }` 或 null | 否 | 室内实测；缺失时用策略兜底区间并标为估算 |

时间均为带 `Z` 的 UTC ISO 字符串，且不得晚于服务器当前时刻。未知字段拒绝（`VALIDATION_FAILED`）。

## 响应 `CareCapabilityResponse`

```json
{ "data": { "resultRef": "cres_…", "result": { /* care-capability-result/v1，详情 watering-assessment/v1 */ } } }
```

`result` 即 `assessMvpWatering` 的公开结果：`status`（ready / insufficient_evidence / temporarily_unavailable）、`confidence: low`、`recommendedActions`、`details.action`、`details.checkWindow`（检查盆土窗口与当地日期）、`details.amountMl`（建议浇入区间）、`details.missingEvidence`。不返回输入快照、策略版本、摘要或内部引用。

## 写入与幂等

- 只追加计算结果（临时结果存储或长期结果存储），不写浇水事实、计划或提醒；“我刚浇过水”走 `care/facts`。
- 同一 `Idempotency-Key` + 相同请求体 → 返回首次结果；不同请求体 → `IDEMPOTENCY_CONFLICT`。
- 无活动策略发布 → 200 + `temporarily_unavailable`（不是错误）；Provider 故障 → 对应时段缺段，仍返回可得的安全判断。

## 待确认问题

1. 坐标保存精度 0.01° 是否可接受。
2. 窗户朝向用 8 方位是否够（前端也可传角度）。
3. 是否需要支持“户外/阳台无玻璃”（`glassLayers: 'none'`）。
