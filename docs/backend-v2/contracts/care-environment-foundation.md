# 养护原子环境事实与确定性派生合同

- 合同版本：`care-environment-foundation/v2`
- 所有者：`care`
- 核心原则：先事实、后确定性推导、再建议。

## 1. 定位

浇水、施肥、光照、通风和部分诊断消费同一组可追溯环境证据，但不得共享某个能力的最终判断。系统先保存原子环境事实，再锁定不可变输入快照，由版本化确定性算法生成派生值，最后交给具体 Care 能力。

```text
原子环境事实
→ 不可变输入快照
→ 确定性派生
→ 植物级 Reference / 已审核知识
→ 能力决策
→ 稳定输出合同
```

AI 不负责证明输入事实真假，也不重新计算已经可由代码确定的太阳几何、VPD、DLI、时间差等量。算法变化不得改写历史事实；新算法只能基于历史输入快照追加新的派生记录。

## 2. 原子环境事实

每条观察只表达一个最小事实。

| 原子因素 | 示例 | 最低来源边界 |
|---|---|---|
| 光照环境配置 | 窗向、窗面倾角、距窗、遮挡、窗帘、补光时段 | 用户配置或可信测量 |
| 空气温度 | 室内、plant-zone 或 outdoor 温度 | 必须声明空间范围 |
| 相对湿度 | 与温度同时间/空间范围的 RH | 不得跨空间拼接 |
| 空气运动 | 密闭/开窗/循环风/直吹，或室内风速 | 用户配置或室内证据 |
| 盆器 | 实际种植内盆材质、尺寸、形状 | 用户植物档案 |
| 基质 | 介质类型、比例/粗细、保水/通气先验 | 用户植物档案 |
| 排水 | FREE_DRAINING / LIMITED / NO_DRAINAGE 等 | 用户配置或观察 |
| 盆土表面 | wet / moist / dry / uncertain | 用户检查或短时视觉 |

原子事实至少保留：`observationRef`、`factorType`、`sourceScope`、`sourceKind`、`sourceRef`、规范值、单位、观察时间、有效期、置信度、证据哈希。

字段语义保持明确：`unitCode` 是规范单位；`observedAt` 和 `validUntil` 是 UTC 毫秒观察时刻与证据有效期限；`confidence` 是证据置信度，不代替来源和有效期。不可变输入快照使用 `inputSnapshotHash` 校验输入清单，派生记录使用 `algorithmRelease` 锁定算法发布版本，不能只保存展示文字。

### 空间范围硬规则

- 天气 Provider 证据保持 `outdoor`。
- 室外温湿度不得直接标记成 `indoor` 或 `plant_zone`。
- 室外风速不得直接标记成室内空气运动。
- 当前盆土表面视觉不得标记成“根区已湿/已干”。

## 3. 输入快照

一次计算锁定一个不可变输入快照，包括：

- 当前植物作用域：Persistent 或 Ephemeral；
- Care Context 版本；
- Internal Care Knowledge / Reference Profile release；
- 天气辐射与逐时天气快照；
- 原子观察引用；
- 最近已确认养护事实；
- Soil Evidence；
- 请求级配置快照；
- 规范化输入清单 SHA-256。

一次请求开始后不得无声替换证据。新证据必须创建新快照。

长期原子环境、Snapshot、`care_environment_derivations` 与 `care_decision_derivations` 归属 `user_id + user_plant_id`。Ephemeral 不创建假的长期用户植物，也不写这些长期派生表：游客和已登录用户主动临时使用都归属于统一的 `ephemeralPlantCaseRef` 语义，把同语义的输入清单、算法/Prompt release、环境派生与决策派生嵌入 `temporary_care_results` 并随案例 TTL 管理。两类 Ephemeral backing case 的证明方式不同，不得把已登录 UserPrincipal 套用游客匿名 proof。

## 4. 确定性派生类型

### 4.1 `estimated_indoor_environment`

当存在室内/plant-zone 实测时优先使用实测。缺少实测时，可由：

```text
室外逐时 T/RH
+ 室内外空气交换程度
+ 房间太阳热输入
+ 建筑热惯性
→ Estimated Indoor Temperature / RH
```

输出必须明确：`estimated=true`、输入来源、算法 release、置信度。它不是室内实测。

### 4.2 `air_vpd`

只允许使用时间和空间范围一致的 Indoor T/RH 或 Estimated Indoor T/RH。

```text
Air VPD = es(T) × (1 - RH/100)
```

不得直接用 outdoor T/RH 生成“室内 VPD”。

### 4.3 `window_plane_irradiance`

```text
DNI / DHI / GHI
+ 经纬度 / 日期时间
+ 太阳高度 / 方位
+ 窗面朝向 / 倾角 / AOI
→ Window Plane Direct / Diffuse
```

MVP 核心不加入地面反射。是否有直射由太阳位置、窗面几何与遮挡决定，禁止使用固定朝向经验表替代几何。

### 4.4 `light_exposure`

窗面 Direct/Diffuse 继续经过外部遮挡/天空可见度、玻璃、窗帘/室内遮挡和植物位置传播，得到：

```text
PPFD(t)
DLI
peakPPFD
直射持续时间
confidence
```

Watering 一级只消费 DLI；其他指标可用于光照能力与强光风险，不能重复乘到浇水中。

### 4.5 `air_movement_proxy`

用户不必输入专业风速。可把密闭、普通室内、开窗/缓慢循环、循环扇等低门槛输入映射到版本化的有效空气运动代理。物理代理与最终浇水敏感度分层，不能把代理值直接解释成“蒸腾增加百分比”。

### 4.6 `environmental_drying_demand`

浇水使用：

```text
DLI
+ Plant VPD Ratio
+ AirMovement Proxy
→ bounded EnvironmentDemand
```

温度、RH、朝向、peakPPFD、directDuration 不作为额外重复权重。

### 4.7 `cultivation_retention`

盆器、实际种植内盆材质、排水、基质、栽培方式归约为相对保水能力。它表达的是栽培系统相对于 Reference Profile 的水分保存趋势，不是精确实验室持水率。

- 多孔盆材质影响盆壁蒸发/整体干燥，不直接修改植物蒸腾。
- `NO_DRAINAGE` 是安全条件，不能只做普通倍率。
- 陶粒垫底不能直接解释成排水增强。

### 4.8 环境派生与决策派生的边界

`care_environment_derivations` 只承载环境/栽培侧派生：Estimated Indoor、Air VPD、Window Plane、Light Exposure、AirMovement Proxy、EnvironmentDemand、CultivationRetention。

以下结果**不得**伪装成环境指标，统一进入 `care_decision_derivations`：

- `growth_activity_state`：消费植物知识、环境历史和植物事实，表达植物当前生长活跃状态估计；
- `personal_calibration`：消费高质量真实干湿循环残差，表达个体模型校准；
- `dry_progress`：消费 Baseline、EnvironmentDemand、CultivationRetention、PersonalCalibration 和最近实际浇水 Fact，表达本轮浇水决策时间轴。

三者都必须保留算法/Prompt release、输入快照、结果 Schema、证据引用、置信度与结果哈希；不得写回覆盖原子事实。`growth_activity_state` 只选择条件性 baseline，不额外修改 EnvironmentDemand。DryUnit / DryProgress 的完整规则由 `watering-decision-model/v1` 定义。

## 5. 外部性状与 Internal Care Knowledge

Tropicals 等外部参考数据必须分为两条投影：

```text
原始外部数据
├─ 展示白名单 → Encyclopedia DTO
└─ Structured Trait Evidence
    → 来源/原始值保留
    → 归一与冲突检查
    → 人工/规则审核
    → Internal Care Knowledge release
    → Reference Profile
```

Care 运行时不得直接查询展示百科字段生成建议。当前数据库已有 `water_frequency_tier`、温湿度/光照结构化字段与 `tropicals_growth_season_knowledge`；`tropicals_trait_ref` 当前为空，现有百科表也没有 `substrate_preference`，因此植物级 cultivation reference 尚不能宣称数据完备。

## 6. 与浇水的关系

浇水不读取 facing/windowType/distance，也不使用 `indoorEqHours`。统一关系是：

```text
Light Model → DLI
Indoor Environment → Air VPD
Air Movement → Air proxy
Cultivation Model → CultivationRetention
Growth Activity → 选择 Baseline
Plant Facts → 最近实际浇水 / 历史干湿循环
Soil Evidence → 最终 Safety Gate
```

具体 DryUnit / DryProgress 与 Soil Gate 见 `watering-decision-model/v1`。

## 7. 版本与失败关闭

- 原子事实类型、空间范围和“派生不得覆盖事实”是不可配置硬规则。
- 派生算法、Reference Profile、映射曲线、上下界与新鲜度通过类型化不可变 release 管理。
- 缺必需输入时返回 `insufficient_evidence`；不得以 outdoor 值冒充 indoor 值补齐。
- 无可用算法或 Reference Profile release 时对应能力返回 `temporarily_unavailable` 或明确 fallback，不使用源码隐式常量。
- 派生失败不得写 Plant Fact、Plan 或 Reminder。
- 原子事实、输入快照和历史派生保持只追加；重新计算生成新派生记录，不覆盖旧结果。
