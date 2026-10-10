# 用户植物环境档案合同

- 合同版本：`user-plant-environment-profile/v1`（请求 Schema `profile-patch/v2`）
- 所有者：`user-plant`；所属票据：E03 / `z8v0kmr9mj`。
- 冻结：2026-10-10 用户审定（草案 `environment-profile-contract-draft.md` 按推荐通过）。本合同替代 `models/user-plant/profile-update-contract-draft.md`
  的待冻结部分，并把 `models/user-plant/profile-http-contract.md` 的请求从 `profile-patch/v1` 升级为 `profile-patch/v2`（v1 字段语义不变，合并为一套校验）。
- 入口：`PATCH /api/v2/user-plants/{userPlantRef}`（operationId `updateUserPlant`，`required_header_and_version`）。
- 依据：配置目录 `user-plant.profile.minimum_completeness`（confirmed）、`subscription.points.first_profile`、`reward-events.md`（`user_plant.profile_completed.v1`，每个 `user_id` 终身一次）、
  `schema/003_user_plant.sql` 的 `user_plant_profiles` / `user_plant_care_contexts`、weather `city_climate_profiles`。

## 1. 请求（profile-patch/v2）

唯一机器事实源：`cloudfunctions-v2/models/user-plant/profile-patch.v2.schema.json`。

```ts
export type ProfilePatchV2 = {
  /** 旧聚合版本（user_plants.version）。 */
  version: number
  /** v1：昵称；省略保留，空字符串清除；最多 80 个 Unicode 码点；不接受 null。 */
  nickname?: string
  /** v1：完整实测盆器（measured-pot-profile/v1）；省略保留；不接受 null。 */
  measuredPot?: MeasuredPotProfile
  /** 基质；省略保留，null 清除。materials 1～9 项不重复；primaryMaterial 必须属于 materials 或为 null。 */
  substrate?: { materials: SubstrateMaterial[]; primaryMaterial: SubstrateMaterial | null } | null
  /** 位置：只存城市级引用与摆放类型，不存经纬度；省略保留，null 清除。 */
  location?: { cityRef: string; placement: 'indoor' | 'balcony_enclosed' | 'balcony_open' | 'outdoor' } | null
  /** 光照：用户可理解的选项；省略保留，null 清除。 */
  lighting?: {
    windowFacing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'none'
  } | null
  /** 通风：不等同室外风速；省略保留，null 清除。 */
  ventilation?: { airExchange: 'closed' | 'occasional' | 'frequent'; localAirflow: 'none' | 'fan' | 'ac' | 'heater' | 'natural_draft'; directBlowing: boolean | null } | null
  /** 植物位置最近一次 Lux 实测（2026-10-10 用户追加）；省略保留，null 清除。只存最近一次，新值覆盖旧值。 */
  plantLight?: { lux: number; measuredAt: string; source: 'meter' | 'camera_estimate' } | null
}
type SubstrateMaterial = 'general' | 'coco' | 'ceramsite' | 'peat' | 'perlite' | 'bark' | 'sphagnum' | 'gritty' | 'coarse_sand'
```

- 除 `version` 外至少提供一项；未知键、错误枚举、客户端提交 DLI/透射率/持水倍率/完整度/首次完成时间等派生值一律 `400 VALIDATION_FAILED`。
- `location.cityRef` 必须是 weather 城市目录（`city_climate_profiles.city_code`，策略版本 `v0-city-outdoor`）中存在的城市代码；不存在返回 `400 VALIDATION_FAILED`。
  城市目录读取失败返回 `503 SERVICE_UNAVAILABLE`。
- `plantLight`（2026-10-10 用户追加「Lux 存档」）：`lux` 为非负数（与浇水建议 `lightReading.lux` 同口径）；`measuredAt` 为带 Z 的 UTC 时间
  （与浇水建议同一格式与往返校验），晚于服务端当前时刻 → 400；`source` 为 `meter`（照度计）或 `camera_estimate`（相机估算）。
  服务端不因读数“已过期”拒绝保存；是否仍有效由读取方按浇水策略 `luxAnchorMaxAgeDays`（当前 30 天）判定，不新造参数。
- 与草案的差异：光照分组去掉恒为 `user_selected` 的 `source` 字段（只有一个取值，不承载信息）。
- **2026-10-10 用户纠偏（不兼容变更）**：
  - 「盆型」= 尺寸（上口/下底/高度 + 排水），即 `measuredPot`，不是形状。删除 `potShape` 分组（`shape` 枚举与 `wallMaterial` 一并删除；盆壁材质另由待验证票 `z8v0kmvewm` 处理，不进档案）。
  - 新版光照只收「朝向 + 城市」（城市在 `location`），外加植物位置的 Lux 实测（浇水建议请求 `lightReading`；同日追加：最近一次读数另存为档案分组 `plantLight`，见下）。`lighting` 分组只剩 `windowFacing`，删除 `glassLayers`、`distanceBand`、`obstruction`。
  - 提交已删除的字段 → 400（未知键）。数据库不做 DDL：`pot_profile_json.potShapeProfile` 及 `light_environment_json` 中的旧键不再读写、不再公开。

## 2. 落库与版本

- `nickname`、`measuredPot`、`substrate` → `user_plant_profiles`（`pot_profile_json` 中 `measuredPot` / `substrateProfile` 键；刻意不用裸名 `substrate`，避免与旧 JSON 同名历史键混淆）；
  `location` → `user_plant_care_contexts.location_json`，`lighting` → `light_environment_json`，`ventilation` → `ventilation_environment_json`，
  `plantLight` → 迁移 030 新增的 `plant_light_lux` / `plant_light_measured_at_ms` / `plant_light_source` 三列（三列同空或同不空，CHECK 约束兜底）。
  未设置的环境分组以 JSON `null` 存储；本合同不写 `cultivation_method`（固定占位 `unspecified`，不公开）。
- 公开协议只使用聚合版本 `user_plants.version`；子表版本只在内部递增，不出现在请求或响应。
- 同一事务：幂等占位 → 归属锁（锁植物与用户行）→ 版本比对 → 子表写入 → 聚合版本 +1 → 完整度判定 →（必要时）奖励事件 → 公开读回 → 幂等完成。任一步失败整体回滚。
- 原 JSON 中未开放的历史键（例如旧专业参数）继续原样保留，不透传。

## 3. 完整度与首株奖励事件

1. 每次保存后按已发布 `user-plant-profile/v1` 判定，五项全部满足即完整：
   - `identityStatus`：三态任一（允许暂未识别）；
   - `pot`（盆型 = 尺寸）：已存 `measuredPot`，且 `drainageAvailable` 非空、三项尺寸至少一项非空；不要求任何形状或材质；
   - `location` / `lightingEnvironment` / `ventilationEnvironment`：对应分组已设置（非 null）。
2. 某株**首次**变完整时写入 `profile_completed_at_ms`；之后**不覆盖、不清空**，即使用户再清除某项（用户审定：奖励发出后清空不收回）。
3. 若该 `user_id` 此前没有任何一株（含已归档、删除中）完整档案，则同一事务写入一条 `user_plant_outbox` 事件 `user_plant.profile_completed.v1`：
   `eventId=evt_…`（服务端高熵）、`userRef`、`userPlantRef`=`aggregateRef`=该植物、`occurrenceRef=first_profile:{userRef}`、
   `producerPolicyVersion=user-plant-profile/v1`、`occurredAt`=完成时刻、`payload={ "profileVersion": "user-plant-profile/v1" }`、`payloadHash`=规范化 SHA-256。
   积分由 subscription 消费后按 `subscription.points.first_profile` 记账；user-plant 不计算、不写余额。每个用户终身一次由本域判定 + subscription inbox 业务唯一键双重兜底。
4. 游客认领本身不触发奖励（硬规则 `user-plant.guest_claim.retroactive_points=false`）；认领后在登录态补全档案按上述规则判定。

## 4. 公开读回

单株读取、列表与本接口的成功响应中，`profile` 在 v1（`nickname`、可选 `measuredPot`）基础上增加已设置的 `substrate`、`location`、`lighting`、`ventilation`、`plantLight`
（`plantLight` 返回 `{ lux, measuredAt, source }`，`measuredAt` 统一为带毫秒的 UTC 文本，不附有效标记；有效与否见完整度合同 `user-plant-profile-completeness.md`）；
未设置的分组省略（不返回 null）。不返回完整度版本、首次完成时间、子表版本、`cultivation_method` 或任何内部字段。
有环境分组但没有档案行时，`profile.nickname` 为空字符串。

## 5. 错误集合

请求阶段：`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`、`SERVICE_UNAVAILABLE`；
用例阶段：`USER_PLANT_NOT_FOUND`、`USER_PLANT_VERSION_CONFLICT`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`。

## 6. 与 care 浇水建议的衔接（已核对现状，待 care 合同跟进）

- **现状（2026-10-10 核对）**：`POST /api/v2/care/watering-advice` 对长期植物仍从**请求体**读取 `location.latitude/longitude`（long-term-care/v1 U2，`src/care/http/watering-advice-request.ts`），
  care 侧 `mysql-user-plant-care-context-reader.ts` 只读昵称、实测盆器与品种绑定，**不读** `user_plant_care_contexts`。
- **用户审定方向**：长期植物取天气时使用档案 `location.cityRef` 对应城市的中心坐标（`city_climate_profiles.lat/lon`），不再依赖前端传坐标。
- **落地方式**：需要 care 合同（long-term-care/v1）修订——长期植物请求禁止再提交 `location`、care 只读上下文增加 `cityRef → 城市中心坐标`、档案无位置时的返回语义。
  该修订属于 care 域，本合同不实现，列为后续待办。

- **2026-10-10 补充（Lux 存档）**：care 只读上下文同时读取 `plantLight`；长期植物浇水建议请求未带 `lightReading` 时，使用档案中仍在
  `luxAnchorMaxAgeDays` 内的读数，过期按 `plant_light` 缺失处理（见 `watering-advice-http-contract.md`「长期植物的 Lux 存档」）。
