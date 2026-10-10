# 长期植物档案完整度读取与激励合同（草案，待用户审）

- 所属票据：E03 / `z8v0kmvfu1`「[E03][P2] 长期植物档案完整度读取与激励」；起草：2026-10-10。
- 状态：**草案，待用户审**。不实现、不建 DDL、不登记路由、不进入 contract-registry。
- 候选规则版本：`user-plant-profile-progress/v1`（配置目录 `user-plant.profile_progress.policy`，pending，待主代理裁决）。
- 依据：
  - v1 前端：`src/utils/plant-profile-completeness.js`、`src/pages/index/components/PlantProfileCompleteness.vue`（只读调研，未改动）。
  - v2 档案：`docs/backend-v2/contracts/user-plant-environment-profile.md`（分组 `measuredPot`/`substrate`/`location`/`lighting`/`ventilation`、§3 首株奖励）。
  - v2 浇水：`cloudfunctions-v2/models/care/watering-advice-http-contract.md`（缺证据代码 `plant_baseline`、`substrate_materials`、`application_reference`、
    `drainage_conditions`、`current_soil_or_pot_evidence`、`plant_light`、`outdoor_radiation`、`plant_location`、`plant_timezone`）。
  - v2 养护摘要：`cloudfunctions-v2/models/care/long-term-care-contract.md` §4 `profileReadiness`。
  - 配置目录：`user-plant.profile.minimum_completeness`（confirmed）、`subscription.points.first_profile`（confirmed，20 积分）。

## 1. 目标（一句话）

告诉用户「这株植物的档案还差什么、补上之后浇水建议会准多少」，并把「补档案」变成可感知的进度，而不是一个空洞的百分比。

打个前端比方：v1 像表单的「必填项打勾」；v2 改成「每补一项，就解锁浇水建议里的一个能力」，进度条的每一段都对应一个看得见的好处。

## 2. 计分项与权重

计分原则：**只按“对浇水建议准确度的贡献”加权**，只计服务端已存储的档案事实；单次请求临时提交的数据（如植物位置实测 Lux、盆土观察）不计分。

| code | 中文名 | 权重 | 何时算“已完成” | 缺失时浇水建议的真实影响 | 编辑入口 `editTarget` |
|---|---|---:|---|---|---|
| `catalog_binding` | 品种已确认 | 30 | 已绑定 Tropicals 品种（`catalogTaxonRef` 非空） | 没有浇水基线，建议**一律**返回 `insufficient_evidence`（`plant_baseline`）——这是最大的短板 | `identity`（身份确认接口） |
| `measured_pot` | 盆的尺寸与排水 | 25 | 已存 `measuredPot`：上口/下底/高度至少一项非空，且 `drainageAvailable` 非空 | 无法估算单次浇水量区间（`application_reference`）；排水未知时无法给安全提示（`drainage_conditions`） | `measuredPot` |
| `location` | 所在城市 | 20 | 已设置 `location`（含 `cityRef`） | 拿不到室外辐射与时区（`outdoor_radiation`、`plant_location`、`plant_timezone`），干燥窗口只能放宽 | `location` |
| `substrate` | 盆土配方 | 15 | 已设置 `substrate`，`materials` 至少一项 | 干燥存量按回退值计算，区间更宽（`substrate_materials`）；填了主材料区间更窄 | `substrate` |
| `lighting` | 主窗朝向 | 5 | 已设置 `lighting.windowFacing` | **当前算法不消费**（诚实说明）：朝向只作为光照解释与后续季节性修正的预留输入 | `lighting` |
| `ventilation` | 通风情况 | 5 | 已设置 `ventilation` | **当前浇水算法不消费**；后续诊断（闷根、叶片干尖）使用 | `ventilation` |

- 合计 100；`percent` = 已完成项权重之和（整数，0～100，不需要钳制）。
- **不计分**：昵称（与准确度无关）、身份状态本身（`unidentified` 也能得到部分建议，真正影响的是品种绑定）、
  植物位置 Lux（每次求建议时实测、档案不存，见决策点 D3）、种植日期（v1 有，v2 浇水不消费）。
- 权重是产品口径，不是物理模型：它表达“补哪项最值”，不承诺准确度提升的百分比。

## 3. 读取接口形态（推荐：嵌入，不新开接口）

```ts
/** 单株读取 GET /api/v2/user-plants/{userPlantRef}、档案保存 PATCH 响应中新增。 */
export type ProfileCompletenessDto = {
  /** 0～100 整数。 */
  percent: number
  /** 展示档位：<50 starter，50～79 good，80～99 great，100 complete（阈值见配置目录候选值）。 */
  level: 'starter' | 'good' | 'great' | 'complete'
  /** 已完成项，按权重降序。 */
  doneItems: ProfileProgressItemCode[]
  /** 未完成项，按权重降序；每项带中文原因与补上后的好处。 */
  missingItems: Array<{
    code: ProfileProgressItemCode
    /** 该项权重（前端可显示“+25%”）。 */
    weight: number
    /** 缺失的影响，例如「还不知道盆有多大，浇水量只能给很宽的范围」。 */
    reason: string
    /** 补上的好处，例如「补上后可以告诉你大概浇多少毫升」。 */
    benefit: string
    /** 前端跳转目标：档案分组名或 identity。 */
    editTarget: 'identity' | 'measuredPot' | 'location' | 'substrate' | 'lighting' | 'ventilation'
  }>
  /** 下一步最推荐补的项（未完成项中权重最高者；全部完成为 null）。 */
  nextRecommended: ProfileProgressItemCode | null
}
export type ProfileProgressItemCode = 'catalog_binding' | 'measured_pot' | 'location' | 'substrate' | 'lighting' | 'ventilation'
```

- 单株读取与档案保存响应：增加 `completeness`（完整对象）。
- 列表每项：只增加 `completenessPercent: number`（卡片上画环），不带明细，避免列表变重。
- 归档植物照常返回；`deleting` 不可见（沿用 404）。
- 不返回：规则版本号、首次完成时间、内部分组版本、奖励发放状态、积分数值。`reason`/`benefit` 文案由服务端规则版本固定，前端不得自行拼接权重。
- 备选：单独 `GET /api/v2/user-plants/{ref}/profile-completeness`。不推荐：多一次请求，且与单株数据可能不同步（同一份档案读两次）。

## 4. 与养护摘要 `profileReadiness` 的统一

- 现状：care 摘要返回 `profileReadiness: { hasMeasuredPot, hasCatalogBinding }`（已冻结合同）。
- 推荐：保留这两个字段不改名（避免破坏已冻结合同），但改为由**同一个**完整度评估器派生：
  `hasMeasuredPot = doneItems 含 measured_pot`、`hasCatalogBinding = doneItems 含 catalog_binding`。
  注意：现状 `hasMeasuredPot` 只看“有没有 measuredPot 行”，统一后要求“至少一项尺寸 + 排水非空”，是**口径收紧**（见决策点 D4）。
- 可选：care 摘要另加 `completenessPercent`，让养护页与花园卡片显示同一个数字。

## 5. 激励设计

### 5.1 首株有效档案奖励（已冻结，不变）

- 判定仍按 `user-plant-profile/v1` 五项（身份三态任一、盆、位置、光照、通风），每个 `user_id` 终身一次，20 积分。
- 与本完整度**是两把尺子**：首株奖励不要求品种绑定和盆土配方，所以可能出现“奖励已拿到，完整度 55%”。
  推荐在 `missingItems` 文案层面引导，不在响应中暴露奖励状态（奖励状态归 subscription）。

### 5.2 里程碑 60% / 100%（只设计，不实现）

- 候选事件：`user_plant.profile_progress_milestone.v1`，`occurrenceRef = profile_milestone:{userPlantRef}:{60|100}`，每株每档位终身一次；
  降回再升不再发；奖励发出不收回（与首株奖励一致）。
- 积分值：`subscription.points.profile_milestones` **pending**，不设默认值。
- 防刷：按株发放会诱导“建很多植物刷积分”。推荐二选一（待用户裁决 D5）：每个用户最多前 N 株发放，或按用户每日上限。
- 需要先修订 `reward-events.md`（新事件类型）与 subscription inbox 唯一键，才能实现；推荐放到 P3 奖励闭环一起做。

## 6. 版本化

- 计分项、权重、档位阈值、文案作为一个不可变规则版本 `user-plant-profile-progress/v1`；同一次请求只用一个快照。
- 调整权重 = 发布新版本；百分比是**读时现算**、不落库，所以换版本后所有植物立即按新口径显示，无需回填；里程碑事件（若实现）按发事件时的版本锁定。
- 是否需要运行期配置化（数据库发布）还是代码常量：见决策点 D6。

## 7. v1 对比与优化理由

| 维度 | v1（前端 `plant-profile-completeness.js`） | v2 草案 | 优化理由 |
|---|---|---|---|
| 计算位置 | 前端本地计算 | 服务端读时计算、随单株/列表返回 | 多端一致；规则改了不必发小程序版本 |
| 权重依据 | 经验分：城市 45、通风 15、盆 15、光照 10、身份 10、种植日期 5 | 按浇水建议的真实依赖：品种 30、盆 25、城市 20、盆土 15、朝向 5、通风 5 | v1 品种只占 10，但 v2 没有品种就完全给不出建议；通风 15 在浇水里并不使用 |
| 必填项 | 城市为“必填”，缺了直接不合格 | 无硬必填，用 `nextRecommended` 引导 | 不让用户卡在一项上；先补收益最大的 |
| 盆 | 上口、高度均 > 0，基质非 unknown，排水 true/false 才算 | 尺寸至少一项 + 排水非空；盆土拆为独立一项 | 与用户 2026-10-10 纠偏“盆型 = 尺寸”一致；盆土单独计分，填了就有回报 |
| 光照 | 用户确认的光照环境（含玻璃等细项） | 只看主窗朝向，权重 5，并诚实标注当前算法不消费 | 光照细项已删除；植物位置 Lux 改为每次求建议时实测 |
| 缺失说明 | 只列缺失项名 | 每项给 `reason`（缺了会怎样）+ `benefit`（补了有什么好处）+ `editTarget` | 让用户知道“为什么要填” |
| 档位 | ≥90 完整、≥80 较完整、≥70 不完整、其余“不合格” | starter / good / great / complete | “不合格”带负面情绪，新手第一次打开就是不合格 |
| 激励 | 无（只有文案“越高越准”） | 首株奖励沿用；60%/100% 里程碑待定 | 把进度和可感知的奖励挂钩 |
| 种植日期 | 计 5 分 | 不计 | v2 浇水不消费，避免为凑分填写 |

## 8. 需要用户拍板的点（含推荐）

| # | 问题 | 选项 | 推荐 |
|---|---|---|---|
| D1 | 权重口径 | A 按浇水准确度（本草案）；B 沿用 v1 经验分 | **A** |
| D2 | 接口形态 | A 嵌入单株/保存响应 + 列表只给百分比；B 独立接口 | **A** |
| D3 | 植物位置 Lux 是否计分 | A 不计（档案不存，每次求建议时测）；B 新增“最近一次光照实测”存储后计分（需 DDL 与新合同） | **A**，第一期不计 |
| D4 | `profileReadiness.hasMeasuredPot` 口径收紧 | A 统一为“尺寸至少一项 + 排水非空”；B 保持“有记录即可” | **A**（与首株奖励的 pot 判定一致） |
| D5 | 60%/100% 里程碑 | A 推迟到 P3，并限每用户前 N 株；B 推迟且按每日上限；C 不做 | **A**，N 与积分值待定 |
| D6 | 规则版本载体 | A 代码常量 + 配置目录登记 `user-plant-profile-progress/v1`，改版随发布；B 运行期策略发布（数据库 release + 回滚） | **A**：权重变化频率低，文案需与前端联调，运行期发布收益小 |
| D7 | 档位阈值与命名 | 50/80/100，starter/good/great/complete | 推荐如上，前端可只用 `percent` 自绘 |

## 9. 不覆盖

- 不实现评估器、不改响应、不改 OpenAPI；不定义 subscription 侧里程碑积分记账；不涉及前端 `src/**`。
