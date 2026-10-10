# 用户植物环境档案合同（草案，待用户审）

- 所属票据：E03 / `z8v0kmr9mj`；起草：2026-10-10（用户裁决 B：按 `profile-update-contract-draft.md` 冻结，含首株奖励事件接线）。
- 状态：**草案，待用户审**。不实现、不建 DDL；冻结后替代 `profile-update-contract-draft.md` 的待冻结部分。
- 入口：沿用已实现的 `PATCH /api/v2/user-plants/{userPlantRef}`（`profile-patch/v1` 已冻结昵称 + 实测盆器），本合同把请求扩展为 `profile-patch/v2`。
- 依据：`profile-update-contract-draft.md`、`docs/backend-v2/contracts/care-environment-foundation.md`、`schema/003` 的 `user_plant_profiles` / `user_plant_care_contexts`、
  配置目录 `user-plant.profile.minimum_completeness`（confirmed：requiredFields = identityStatus、pot、location、lightingEnvironment、ventilationEnvironment）、
  `subscription.points.first_profile`=20、`reward-events.md`（`user_plant.profile_completed.v1`，每个 `user_id` 终身一次）。

## 1. 请求扩展（profile-patch/v2 草案）

在 v1（`version`、`nickname`、`measuredPot`）基础上新增四个可选分组；**省略 = 不改**，**显式 null = 清除该分组**（每组逐一冻结，见 Q1）。

```ts
export type ProfilePatchV2 = {
  version: number
  nickname?: string
  measuredPot?: MeasuredPotInput           // 已冻结 measured-pot-profile/v1
  potShape?: {                              // 盆型与材质（养护干燥速度用）
    shape: 'round' | 'square' | 'hanging' | 'other' | null
    wallMaterial: 'plastic' | 'glazed_ceramic' | 'terracotta' | 'cement' | 'fabric' | 'other' | null
  } | null
  substrate?: {                             // 基质（与浇水建议现有枚举一致）
    materials: Array<'general' | 'coco' | 'ceramsite' | 'peat' | 'perlite' | 'bark' | 'sphagnum' | 'gritty' | 'coarse_sand'>
    primaryMaterial: 同上枚举 | null
  } | null
  location?: {                              // 位置：只存城市级引用，不存经纬度原值
    cityRef: string                         // 来自 weather 城市目录的公开引用
    placement: 'indoor' | 'balcony_enclosed' | 'balcony_open' | 'outdoor'
  } | null
  lighting?: {                              // 光照：与 MVP 光照输入一致，用户可理解的选项
    windowFacing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'none'
    glassLayers: 0 | 1 | 2 | 3
    distanceBand: 'on_sill' | 'within_1m' | 'one_to_three_m' | 'beyond_3m'
    obstruction: 'none' | 'partial' | 'heavy'
    source: 'user_selected'
  } | null
  ventilation?: {                           // 通风：不等同室外风速
    airExchange: 'closed' | 'occasional' | 'frequent'
    localAirflow: 'none' | 'fan' | 'ac' | 'heater' | 'natural_draft'
    directBlowing: boolean | null
  } | null
}
```

- 客户端不得提交 DLI、透射率、持水倍率、完整度、首次完成时间或任何派生值；这些由服务端按已发布版本计算。
- 未知键一律 400；数据库 JSON 列不是自由输入合同。

## 2. 落库与版本（推荐）

- `nickname / measuredPot / potShape / substrate` → `user_plant_profiles.pot_profile_json`；`location / lighting / ventilation` → `user_plant_care_contexts`。
- 公开协议只用**聚合版本**（`user_plants.version`）；子表版本仅内部使用，不出现在请求/响应中。
- 同事务：幂等占位 → 归属锁 → 版本比对 → 子表写入 → 聚合版本 +1 → 完整度判定 →（必要时）奖励事件 → 公开读回 → 幂等完成。

## 3. 完整度与首株奖励事件接线

1. 每次保存后按 `user-plant-profile/v1` 判定：五项 requiredFields 全部“有合法值”即完整（身份允许 `unidentified`）。
2. 某株**首次**变完整时写入 `profile_completed_at_ms`（之后不覆盖、不清空，即使用户后来清除了某项）。
3. 若这是该 `user_id` 的**第一株**完整档案：同事务调用已存在的 `user_plant_outbox` 仓储写 `user_plant.profile_completed.v1`（`occurrenceRef` = 植物公开引用，`producer_policy_version` = 完整度策略版本），积分由 subscription 消费后按 `subscription.points.first_profile`=20 记账；user-plant 不计算、不写余额。
4. 游客认领来的植物：认领本身不触发奖励（硬规则 `guest_claim.retroactive_points=false`），认领后用户在登录态补全档案才按上述规则判定。
5. 删除后再建再补全：不再触发（终身一次，由 subscription inbox 业务唯一键兜底）。

## 4. 公开读回

单株读取的 `profile` 扩展为对应分组的公开投影；列表项同样带 `profile`（与单株一致）。不返回完整度规则版本、首次完成时间、子表版本或任何内部字段。

## 5. 需要用户拍板

- Q1：“显式 null = 清除该分组”是否接受？还是不允许清除、只能覆盖？推荐允许清除（与昵称空字符串清除一致）。
- Q2：位置只存城市级 `cityRef` + 摆放类型，不存经纬度——是否足够？推荐足够（天气按城市取）。
- Q3：光照选项（朝向 8 向 + 无窗、玻璃层数、距离档、遮挡档）是否与前端已有的光照测量实验对齐？前端实验文件尚未进入后端合同，需你确认取舍。
- Q4：“完整”是否要求 `measuredPot` 三项尺寸都有值，还是有盆型/材质即可？推荐：`pot` 视为完整需“实测盆器任一尺寸非空 + 排水状态非空”。
- Q5：首株奖励在“首次变完整”那一刻发，即使之后用户清除了某项也不收回——是否同意？推荐同意。
- Q6：`profile-patch/v2` 与已冻结 v1 并存还是直接替换？推荐 v2 向下兼容 v1 字段，路由按同一 Schema 校验，不保留两套。
