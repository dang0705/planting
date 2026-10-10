# 长期植物档案完整度合同

- 合同版本：`user-plant-profile-completeness/v1`；计分规则版本：`user-plant-profile-progress/v1`（类型化策略发布 `user-plant` / `profile_progress`）。
- 所有者：`user-plant`；所属票据：E03 / `z8v0kmvfu1`「[E03][P2] 长期植物档案完整度读取与激励」。
- 冻结：2026-10-10 用户审定（草案 `models/user-plant/profile-completeness-contract-draft.md` 按推荐采纳，且「必须可配置」；
  同日用户追加：植物位置 Lux 存档并计入完整度）。本合同替代该草案。
- 机器事实源：
  - 规则正文 `cloudfunctions-v2/models/user-plant/profile-progress-policy.v1.json`（取值依据 `profile-progress-policy.v1.md`）；
  - 正文 Schema `cloudfunctions-v2/models/user-plant/profile-progress-policy.v1.schema.json`；
  - 配置目录 `user-plant.profile_progress.policy`（confirmed）。
- 关联：`user-plant-environment-profile.md`（档案分组，含 `plantLight`）、`long-term-care-contract.md` §4（`profileReadiness`）、
  `watering-advice-http-contract.md`（缺证据码）、`subscription.points.profile_milestones`（pending，第三阶段）。

## 1. 计分项（v1 正文）

计分原则：只按「对浇水建议准确度的贡献」加权；只计服务端已存的档案事实。合计 100。

| code | 中文名 | 权重 | 何时算已完成 | 缺失时浇水建议的影响 | `editTarget` |
|---|---|---:|---|---|---|
| `catalog_binding` | 品种已绑定 | 30 | 存在 Tropicals 品种绑定（`user_plant_catalog_bindings`） | 没有浇水基线，建议一律「证据不足」（`plant_baseline`） | `catalogBinding` |
| `measured_pot` | 盆的尺寸与排水 | 25 | 已存 `measuredPot`：上口/下底/高度至少一项非空，且 `drainageAvailable` 非空 | 无法估算浇水量（`application_reference`）；排水未知（`drainage_conditions`） | `measuredPot` |
| `substrate` | 盆土配方 | 15 | 已设置 `substrate` | 干燥存量按回退值，区间更宽（`substrate_materials`） | `substrate` |
| `location` | 所在城市 | 12 | 已设置 `location` | 取不到室外日照与时区（`plant_location`） | `location` |
| `plant_light` | 植物位置光照实测 | 10 | 已存 `plantLight`，且 `当前时刻 − measuredAt ≤ luxAnchorMaxAgeDays 天` | 植物位置光照缺证据（`plant_light`），干燥窗口变宽 | `plantLight` |
| `ventilation` | 通风情况 | 5 | 已设置 `ventilation` | 当前浇水算法不消费；后续诊断使用 | `ventilation` |
| `lighting` | 主窗朝向 | 3 | 已设置 `lighting` | 当前浇水算法不消费（如实说明） | `lighting` |

- 用户 2026-10-10 追加 Lux 计分：草案权重为城市 20、朝向 5；Lux 的 10 分从这两项调出（城市 −8、朝向 −2）。
  理由：Lux 直接决定植物位置光照证据；朝向不参与计算；城市仍高于 Lux，因为没有城市连 Lux 都无法换算成全天光照。
- Lux 有效期**不新造参数**：复用浇水策略 `care/mvp_watering` 活动发布中的 `luxAnchorMaxAgeDays`（当前 30 天）。
  完整度与浇水建议在同一口径下判定「过期」，过期即该项未完成。
- 不计分：昵称、身份状态本身、种植日期、品种身份确认（`confirmedIdentityRef`，与品种绑定是两件事）。

## 2. 计算

- `percent` = 已完成项权重之和（整数 0～100）。
- `level`：取 `levels` 中 `minPercent ≤ percent` 的最高档：`starter`（0）、`good`（50）、`great`（80）、`complete`（100）。
- `doneItems` / `missingItems` 按权重降序，权重相同按正文顺序。
- `nextRecommended` = `missingItems[0].code`；全部完成为 `null`。
- **读时现算、不落库**：Lux 会随时间过期，所以同一份档案隔天读取可能少 10 分；换规则版本后所有植物立刻按新口径显示，无需回填。

## 3. 公开读

```ts
export type ProfileCompletenessDto = {
  percent: number
  level: 'starter' | 'good' | 'great' | 'complete'
  doneItems: ProfileProgressItemCode[]
  missingItems: Array<{ code: ProfileProgressItemCode; weight: number; reason: string; benefit: string; editTarget: ProfileEditTarget }>
  nextRecommended: ProfileProgressItemCode | null
}
export type ProfileProgressItemCode = 'catalog_binding' | 'measured_pot' | 'substrate' | 'location' | 'plant_light' | 'ventilation' | 'lighting'
export type ProfileEditTarget = 'catalogBinding' | 'measuredPot' | 'substrate' | 'location' | 'plantLight' | 'ventilation' | 'lighting'
```

| 接口 | 新增字段 |
|---|---|
| 单株读取 `GET /api/v2/user-plants/{userPlantRef}` | `completeness: ProfileCompletenessDto` |
| 档案保存 `PATCH /api/v2/user-plants/{userPlantRef}` 成功响应 | `completeness: ProfileCompletenessDto`（幂等重放时按重放时刻现算） |
| 列表 `GET /api/v2/user-plants` 每项 | `completenessPercent: number` |

- 归档植物照常返回；删除中/已删除仍 404。
- `reason` / `benefit` 由规则正文固定，前端直接展示，不自行拼接。
- **不返回**：规则版本号、发布引用、Lux 有效期天数、首次完成时间、奖励状态、积分值。
- **规则不可用**（无活动发布、记录不可信、浇水策略不可用或读取失败）：上述字段**省略**，接口仍 200（不让详情页因进度条失败）；不使用源码默认值。

## 4. 与养护摘要 `profileReadiness` 统一

`GET /api/v2/care/user-plants/{userPlantRef}/summary` 的 `profileReadiness` 字段名不变，改由同一组判定函数派生：

- `hasMeasuredPot` = `measured_pot` 项已完成（**口径收紧**：原为「有 measuredPot 记录即可」，现要求至少一项尺寸 + 排水非空）；
- `hasCatalogBinding` = `catalog_binding` 项已完成。

两项判定不依赖规则发布（是否完成是事实判断，权重才是规则），所以策略不可用时摘要照常返回。

## 5. 激励

- 首株有效档案奖励（`user-plant-profile/v1`，20 积分，每个 `user_id` 终身一次）**不变**，与完整度是两把尺子；响应不暴露奖励状态。
- 60% / 100% 里程碑：推迟到第三阶段（用户 D5）。候选事件 `user_plant.profile_progress_milestone.v1`，每株每档位终身一次、发出不收回，
  需先修订 `reward-events.md` 并约束每用户株数；积分 `subscription.points.profile_milestones` 保持 pending。本合同不产生任何事件。

## 6. 可配置性与版本

- 规则以类型化策略发布：独立 TypeScript 类型 + AJV Schema + 不可变 release + 正文 SHA-256 + 活动指针（`business_policy_releases` /
  `active_business_policy_releases`，`domain_code='user-plant'`、`policy_code='profile_progress'`、`schema_version='user-plant-profile-progress/v1'`）。
  `domain_code` 沿用既有 user-plant 发布的连字符写法。
- 正文校验：7 个计分项各出现一次、权重为正整数且合计 100；档位固定 4 档、`minPercent` 严格递增、首档 0、末档 100；文案非空。
  元数据（生效/过期/验证时间、版本、摘要）任一不可信 → 视为不可用。
- 同一请求只锁定一份快照（规则正文 + 当时的 `luxAnchorMaxAgeDays`）。
- 发布到数据库由主代理执行；本合同与正文文件不代表已发布。回退 = 活动指针切回上一版本。

## 7. 错误

不新增错误类型；完整度不可用时省略字段，不改变各接口原有错误集合。
