# outcome 多候选收敛式路径规划设计：概念、目的、数据与运行时

本文档依据以下材料整理：

- 当前代码压缩包：`Archive 2.zip`
- 项目规则压缩包：`rules.zip`
- 诊断运行时粗文档：`diagnosis-runtime-code-logic.md`
- 本次会话中关于“主动瘦身、养护类主轴、ranking 到 route、多候选 outcome 收敛、gate 守卫、LLM prompt 职责边界”的讨论结论

权威优先级：**当前代码 > 项目 rules > 已有运行时说明 > 本次设计讨论**。如果后续实施时发现文档和代码冲突，必须以代码为准，并同步修正文档。

---

## 一、核心修订口径

本项目的 outcome 路径规划不应理解为：

```text
视觉证据 → 选择一个 outcome → 沿着该 outcome 的固定路径走到终点
```

正确口径是：

```text
视觉证据 → 形成多个候选 outcome → 通过 route group、route、gate 和问诊回答不断增强、削弱、阻断 → 收窄到 1～3 个前端可见 outcome → 输出处理方向和行动建议
```

因此，本项目采用的模型名称是：

```text
多候选 outcome 收敛式路径规划
```

它的目标不是一开始锁定唯一答案，而是在不确定的真实养护场景中保留合理候选，再用最少的高价值问诊把候选集合收窄。

---

## 二、为什么要做多候选 outcome 收敛

当前系统的终局逻辑偏向：

```text
哪个 problem 分数最高，就尝试输出哪个。
```

这在具体病害很多时会带来问题：

1. 结果容易随少量问诊证据漂移。
2. 问诊问题看起来像为了提高某个分数，而不是为了区分用户能理解的处理方向。
3. 输出守卫压力越来越大，需要不断阻止宽泛证据越级到具体问题。
4. 养护类问题本身高度重叠，例如黄叶可能来自积水、缺水、弱光、自然老叶、缺肥或环境变化。

多候选收敛模式把问题改成：

```text
当前还有哪些处理方向可能成立？
哪个问题最能区分这些方向？
哪些候选已经被反证阻断？
哪些候选只适合作为伴随观察方向？
是否已经能把前端可见范围收窄到 1～3 个？
```

这更适合当前的产品目标：主攻室内绿植常见养护问题，输出问题簇或处理方向，而不是追求大量具体病虫害病名。

---

## 三、核心概念

### 1. 候选 outcome：`candidateOutcome`

中文定义：**当前仍可能成立的处理方向、问题簇、非问题判断或不确定方向**。

代码建议名：`candidateOutcome` / `candidateOutcomeKey`。

当前过渡期可继续复用：`problemKey`。

重要边界：

- outcome 不是具体病原名。
- outcome 不是 LLM 直接输出的结论。
- outcome 必须能绑定一组相容的行动建议。
- outcome 在运行时可以同时存在多个候选。
- outcome 可以分为主方向、伴随观察方向、内部候选和已阻断候选。

### 2. 候选 outcome 集合：`candidateOutcomeSet`

中文定义：**本轮运行时维护的候选 outcome 状态集合**。

建议结构：

```js
{
  candidateOutcomes: [
    {
      outcomeKey: 'overwatering_root_pressure',
      state: 'active',
      displayEligible: true,
      closureEligible: false,
      routeKeys: ['yellowing_wet_soil_route'],
      supportEvidenceKeys: ['yellowing_leaf'],
      weakenEvidenceKeys: [],
      blockerEvidenceKeys: [],
      missingGateKeys: ['soil_moisture_confirmation_gate'],
      nextQuestionKeys: ['q_soil_moisture_recent'],
      actionConflictGroup: 'watering_stop'
    }
  ],
  visibleOutcomeKeys: [],
  primaryOutcomeKey: null,
  secondaryOutcomeKeys: []
}
```

建议状态枚举：

| 状态 | 中文含义 | 说明 |
|---|---|---|
| `active` | 活跃候选 | 有证据支持，尚未闭合，也未被阻断。 |
| `strengthened` | 已增强 | 问诊或证据增强了该方向。 |
| `weakened` | 已削弱 | 有反向证据，但不足以排除。 |
| `blocked` | 已阻断 | 关键反证命中，不应继续前端展示。 |
| `display_eligible` | 可展示 | 通过展示 gate，可作为前端 1～3 个方向之一。 |
| `closure_eligible` | 可闭合 | 通过闭合 gate，可作为主方向或伴随方向输出。 |
| `uncertain_candidate` | 不确定候选 | 证据不足或冲突，适合进入不确定说明。 |

### 3. 分流路径组：`routeGroup`

中文定义：**同一入口场景下，用来区分多个候选 outcome 的路径组**。

代码建议名：`routeGroupKey`。

示例：黄叶入口不是一个 outcome，而是一个分流路径组。

```text
routeGroup：黄叶养护分流
  ├─ outcome：积水/根系压力
  ├─ outcome：缺水压力
  ├─ outcome：光照不足/生长偏弱
  ├─ outcome：自然老叶代谢
  └─ outcome：缺肥/长期养护不足
```

route group 的价值是：

1. 承认同一视觉入口可能打开多个处理方向。
2. 让下一题服务于“区分候选”，而不是服务于单个最高分问题。
3. 使前端可以解释“为什么问这个问题”。

### 4. 路径：`route`

中文定义：**某个候选 outcome 的可达证据路径**。

代码建议名：`routeKey`。

一个 outcome 可以有多条 route；一个 route group 可以包含多个 outcome 分支。

例如：

```text
outcome：积水/根系压力
  route A：黄叶 + 盆土长期潮湿
  route B：萎蔫 + 土仍湿
  route C：茎基部发软/异味 + 潮湿
  route D：土表小飞虫 + 盆土潮湿
```

这些 route 的入口症状不同，但最终处理建议相容，因此可以收敛到同一个 outcome。

### 5. 门：`gate`

中文定义：**候选 outcome 或 route 能否展示、增强、阻断、闭合、转不确定的判断条件**。

代码建议名：`gateKey`。

典型 gate 类型：

| gate 类型 | 中文含义 | 示例 |
|---|---|---|
| `entry_gate` | 入口门 | 正式证据中有黄叶或萎蔫。 |
| `split_gate` | 分流门 | 盆土久湿支持积水，盆土干透支持缺水。 |
| `confirmation_gate` | 确认门 | 用户确认盆土长期潮湿。 |
| `display_gate` | 展示门 | 有正式证据支持且无关键反证，可前端展示。 |
| `blocker_gate` | 阻断门 | 用户明确说土完全干透，阻断积水路径。 |
| `conflict_gate` | 冲突门 | 同时出现补水与停水方向，需要继续分流。 |
| `closure_gate` | 闭合门 | 支持证据足够且无冲突，可以作为主方向或伴随方向。 |
| `uncertain_gate` | 不确定门 | 信息不足且无法继续问，输出不确定。 |
| `action_safety_gate` | 行动安全门 | 多个可见 outcome 的建议不得互相打架。 |

### 6. 路径决策：`routeDecision`

中文定义：**本轮 route planner 对候选集合、下一题、可见方向和输出状态的综合判断**。

建议字段：

```js
{
  mode: 'multi_outcome_route',
  candidateOutcomeStates: [],
  activeRouteGroupKeys: [],
  visibleOutcomeKeys: [],
  primaryOutcomeKey: null,
  secondaryOutcomeKeys: [],
  requiresFollowUp: false,
  nextQuestionKeys: [],
  gateResults: [],
  blockedOutcomeKeys: [],
  conflictingOutcomePairs: [],
  routeTrace: [],
  fallbackPolicy: null,
  decisionCause: {},
  lowConfidenceOverride: null
}
```

### 7. 前端可见 outcome：`visibleOutcome`

中文定义：**可以公开展示给用户的候选处理方向**。

前端可见 outcome 不等于最终唯一答案。它可以是：

- 一个主方向；
- 一个主方向 + 伴随观察方向；
- 证据不足时的 1～3 个待排查方向；
- 不确定结果下的保守观察方向。

展示 gate 必须保证：

1. 有至少一个正式证据支持。
2. 没有关键 blocker。
3. 不制造无依据恐慌。
4. 不泄漏内部 ranking 的最高问题。
5. 不给出互相冲突的行动建议。

---

## 四、最重要的设计原则

### 原则 1：先候选集合，后收窄展示

错误理解：

```text
第一轮选择一个 outcome，然后所有问诊都服务于它。
```

正确理解：

```text
第一轮形成多个候选 outcome，问诊负责区分、增强、削弱、阻断，最终把前端可见方向收窄到 1～3 个。
```

### 原则 2：同一个 outcome 允许由多条 route 到达

这是正确设计，不是异常。

原因：outcome 是处理方向，不是唯一病因证明。只要最终行动建议一致或相容，就可以收敛。

### 原则 3：同一个入口可以打开多个 outcome

例如黄叶、萎蔫、生长慢、焦边都不是单一答案，而是入口场景。

```text
黄叶入口 → 积水 / 缺水 / 光照不足 / 自然代谢 / 长期养护不足
萎蔫入口 → 缺水 / 积水烂根风险 / 高温应激 / 移栽适应
焦边入口 → 空气干燥 / 缺水 / 晒伤 / 肥盐压力 / 水质压力
```

### 原则 4：下一题服务于区分候选 outcome

问题选择优先级应是：

1. 能区分相反处理动作的问题，例如补水 vs 停水。
2. 能排除高风险方向的问题，例如根系压力、严重虫害。
3. 能闭合当前最强候选方向的问题。
4. 能降低不确定性的通用补充问题。

### 原则 5：按处理动作相容分组，不按症状相似分组

错误分组：

```text
黄叶 = 一个最终处理方向
```

原因：黄叶可能需要补水，也可能需要停水，也可能需要增光，也可能需要避光，也可能无需处理。

正确分组：

```text
缺水压力
积水/根系压力
光照不足
晒伤/强光刺激
自然代谢/非问题
```

判断标准：

```text
同一个 outcome 下，核心行动建议不能互相打架。
```

### 原则 6：视觉只能提供路径输入，不能直接决定前端可见 outcome

保留当前正式证据准入机制：

```text
视觉原始结果 → 正式观察证据 → candidateOutcomeSet / routeGroup 入口
```

不能变成：

```text
LLM 看图 → outcomeKey → 输出
```

### 原则 7：ranking 只能辅助候选，不得直接决定结果

ranking 可以告诉系统“哪些方向更值得进入候选集合”，但不能绕过 gate。

最终判断应是：

```text
ranking 选候选
routeGroup 组织分流
route/gate 管理增强、削弱、阻断
visible gate 决定前端可见方向
action safety gate 决定公开建议
```

---

## 五、MVP outcome 建议

### 总体范围

第一阶段建议控制为：

```text
8～12 个可输出 outcome
内部 active outcome 通常不超过 5～7 个
前端可见 outcome 通常 1～3 个
最终主方向 0～1 个
伴随观察方向 0～2 个
```

### 推荐 outcome 池

| outcomeKey | 中文名称 | 类型 | 是否可前端展示 | 说明 |
|---|---|---|---|---|
| `overwatering_root_pressure` | 积水/根系压力 | 养护问题簇 | 是 | 停水、通风、查盆底、必要时查根。 |
| `underwatering_dehydration_pressure` | 缺水压力 | 养护问题簇 | 是 | 补水、观察恢复、调整浇水节奏。 |
| `low_light_growth_weakness` | 光照不足/生长偏弱 | 养护问题簇 | 是 | 逐步增光，避免突然暴晒。 |
| `strong_light_sunburn_stress` | 晒伤/强光刺激 | 养护问题簇 | 是 | 避强光、缓苗、剪重伤叶。 |
| `yellowing_care_differential` | 黄叶养护分流 | route group / 中间节点 | 否或谨慎 | 用于分流，不应直接给冲突处理建议。 |
| `weak_growth_or_leggy_growth` | 生长偏弱/徒长 | 养护问题簇 | 是 | 增光、修剪、调整肥水节奏。 |
| `leaf_tip_burn_environment_stress` | 叶尖焦枯/环境压力 | 养护问题簇 | 是 | 检查湿度、水质、肥料、缺水、强光。 |
| `leaf_spot_cluster_basic` | 叶斑类问题 | 问题簇 | 是 | 停止喷水、通风、隔离、剪重症叶，暂不细分病原。 |
| `pest_trace_cluster_basic` | 疑似虫害痕迹 | 问题簇 | 是 | 隔离、查叶背、擦拭/冲洗、观察活动虫体。 |
| `structural_damage_old_injury` | 结构损伤/旧伤 | 非病害问题簇 | 是 | 若不扩散，通常观察即可。 |
| `natural_senescence_non_problematic` | 自然代谢/老叶更新 | 非问题性 | 是 | 不过度处理，观察新叶。 |
| `variegation_or_normal_color_non_problematic` | 正常斑纹/艺斑/新叶嫩色 | 非问题性 | 是 | 不误判为病斑或缺素。 |
| `out_of_scope_or_unmappable_visual_abnormality` | 范围外/暂不支持异常 | 不确定类 | 是 | 说明当前池外，建议补图/观察。 |
| `uncertain_insufficient_or_conflicting_evidence` | 证据不足或冲突，不确定 | 不确定类 | 是 | 保守建议，避免强行诊断。 |

第一版强推荐可输出 outcome：

```text
1. 积水/根系压力
2. 缺水压力
3. 光照不足/生长偏弱
4. 晒伤/强光刺激
5. 叶尖焦枯/环境压力
6. 叶斑类问题
7. 疑似虫害痕迹
8. 结构损伤/旧伤
9. 自然代谢/非问题
10. 正常斑纹/艺斑/非问题
11. 不确定
```

`黄叶养护分流` 建议作为 route group 或中间节点，因为黄叶内部存在补水、停水、增光、避光、无需处理等冲突动作。

---

## 六、典型 route group 设计

### 1. 黄叶养护分流组

`routeGroupKey`：`yellowing_care_split_group`

入口：正式证据中存在黄叶、叶片发黄、老叶黄、新叶淡黄等黄化信号。

候选 outcome：

| 候选 outcome | 支持路径 | 关键分流问题 |
|---|---|---|
| 积水/根系压力 | 黄叶 + 盆土久湿 | 最近盆土是不是一直湿，浇水后很久不干？ |
| 缺水压力 | 黄叶 + 土长期干透/久未浇水 | 最近是否很久没浇水，盆土明显干？ |
| 光照不足/生长偏弱 | 黄叶 + 长期弱光/新叶淡小 | 平时是否放在离窗较远或光线很弱的位置？ |
| 自然代谢/老叶更新 | 仅底部少量老叶黄，新叶正常 | 是否只有底部少量老叶发黄，新叶正常？ |
| 不确定 | 信息冲突或不足 | 无法继续问时输出保守建议。 |

关键原则：黄叶不是最终处理方向，除非文案只做完全保守提示，否则不应作为最终主 outcome。

### 2. 萎蔫/发软分流组

`routeGroupKey`：`wilting_care_split_group`

候选 outcome：

| 候选 outcome | 支持路径 | 关键分流问题 |
|---|---|---|
| 缺水压力 | 萎蔫 + 土干透 | 叶片发软时，土是干透还是仍湿？ |
| 积水/根系压力 | 萎蔫 + 土仍湿/茎基部软 | 叶片发软时，土是湿的还是干的？茎基部是否发软？ |
| 晒伤/高温应激 | 突然强光、高温后萎蔫 | 最近是否突然暴晒或放到高温位置？ |
| 不确定 | 水分状态冲突 | 输出保守建议并建议补图/检查盆土。 |

### 3. 叶尖焦枯/卷边分流组

`routeGroupKey`：`tip_burn_environment_split_group`

候选 outcome：

| 候选 outcome | 支持路径 | 关键分流问题 |
|---|---|---|
| 叶尖焦枯/环境压力 | 干燥、空调暖气、水质、轻度肥盐压力 | 是否靠近空调、暖气或环境很干？ |
| 缺水压力 | 焦尖 + 叶片发软 + 土常干 | 是否经常等到叶片发软才浇水？ |
| 晒伤/强光刺激 | 受光面焦斑/发白 | 最近是否突然搬到强光或暴晒处？ |
| 不确定 | 多因素重叠 | 建议保守调整环境，不急于喷药。 |

### 4. 叶斑/斑块分流组

`routeGroupKey`：`leaf_spot_or_patch_split_group`

候选 outcome：

| 候选 outcome | 支持路径 | 关键分流问题 |
|---|---|---|
| 叶斑类问题 | 斑点扩散、水渍状、边缘发黄发黑 | 最近这些斑点是否在扩大或变多？ |
| 晒伤/强光刺激 | 斑块集中受光面，近期强光变化 | 最近是否突然搬到强光或暴晒处？ |
| 结构损伤/旧伤 | 撕裂、摩擦、稳定不扩散 | 这个缺口或斑块最近有没有继续变大或变多？ |
| 正常斑纹/艺斑 | 规律斑纹、品种特征、新叶嫩色 | 这类斑纹是否从新叶展开时就存在且边界稳定？ |
| 不确定 | 图像证据宽泛 | 输出不确定或叶斑类保守建议。 |

### 5. 孔洞/缺损分流组

`routeGroupKey`：`hole_or_tissue_loss_split_group`

候选 outcome：

| 候选 outcome | 支持路径 | 关键分流问题 |
|---|---|---|
| 疑似虫害痕迹 | 孔洞 + 虫体/虫粪/新鲜缺口/继续变多 | 缺口附近是否有虫、虫粪或继续变多？ |
| 结构损伤/旧伤 | 缺口固定、撕裂、摩擦伤 | 最近是否搬动、擦碰、修剪或被宠物碰过？ |
| 叶斑类问题 | 病斑坏死后脱落 | 斑点是否先变黑褐再破洞？ |
| 不确定 | 信息不足 | 不直接默认虫咬。 |

---

## 七、典型 outcome 的多 route 设计

### 1. 积水/根系压力

`outcomeKey`：`overwatering_root_pressure`

核心建议：停水、通风、查盆底、观察根/茎基部，严重时脱盆查根。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `yellowing_wet_soil_route` | 黄叶 + 盆土久湿路径 | 黄叶类正式证据 | 用户确认盆土长期潮湿 | 最近盆土是不是一直湿，浇水后很久不干？ |
| `wilting_wet_soil_route` | 萎蔫 + 土仍湿路径 | 萎蔫/发软 | 土仍湿且叶片发软 | 叶片发软时，土是湿的还是干的？ |
| `soft_base_wet_soil_route` | 茎基部发软/异味路径 | 茎基部异常或用户回答 | 发软/异味 + 潮湿 | 茎基部是否发软、有异味？ |
| `soil_gnat_wet_soil_route` | 土表小飞虫 + 潮湿路径 | 土表小飞虫 | 盆土长期潮湿 | 土表是否潮湿且有小飞虫？ |
| `high_risk_host_overwater_route` | 高风险植物频繁浇水路径 | 发财树/金钱树/多肉等 | 高频浇水 + 异常表现 | 这类植物最近是否频繁浇水？ |

阻断 gate：

```text
用户确认土长期干透，且没有盆底积水/异味/软茎 → 阻断积水路径，转向缺水或不确定。
```

### 2. 缺水压力

`outcomeKey`：`underwatering_dehydration_pressure`

核心建议：补水、观察恢复、后续调整浇水节奏。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `wilting_dry_soil_route` | 萎蔫 + 土干路径 | 萎蔫/发软 | 土明显干透 | 叶片发软时，土是干透还是仍湿？ |
| `yellowing_dry_soil_route` | 黄叶 + 长期缺水路径 | 黄叶 | 久未浇水或土干 | 最近是否很久没浇水，盆土明显干？ |
| `leaf_tip_dry_stress_route` | 焦边 + 缺水压力路径 | 焦边/卷叶 | 干燥、缺水、恢复慢 | 最近是否经常干透到叶片发软？ |

阻断 gate：

```text
用户确认盆土长期潮湿 → 阻断缺水路径，转积水/根系压力或不确定。
```

### 3. 光照不足/生长偏弱

`outcomeKey`：`low_light_growth_weakness`

核心建议：逐步增加散射光，避免突然暴晒。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `weak_growth_low_light_route` | 生长弱 + 弱光路径 | 生长慢、新叶小、叶色淡 | 长期弱光 | 平时是否放在离窗较远或光线很弱的位置？ |
| `leggy_growth_low_light_route` | 徒长 + 弱光路径 | 节间拉长、枝条细弱 | 长期弱光 | 新枝是否越来越细长、叶间距变大？ |

### 4. 晒伤/强光刺激

`outcomeKey`：`strong_light_sunburn_stress`

核心建议：移到明亮散射光，避免中午直晒，剪除严重坏死叶。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `sun_exposed_patch_route` | 受光面斑块路径 | 局部浅褐/焦斑 | 最近强光/突然换位 | 最近是否突然搬到强光或暴晒处？ |
| `new_position_sunburn_route` | 换位置后晒伤路径 | 焦斑/叶片发白 | 换位后出现 | 问题是否在换位置后几天出现？ |

阻断 gate：

```text
完全无强光变化，且斑点持续扩散 → 转叶斑类或不确定。
```

### 5. 叶尖焦枯/环境压力

`outcomeKey`：`leaf_tip_burn_environment_stress`

核心建议：检查空气湿度、水质、肥料、缺水、强光，不急于喷药。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `dry_air_tip_burn_route` | 干燥焦尖路径 | 叶尖焦枯/卷边 | 空气干、靠空调/暖气 | 是否靠近空调、暖气或环境很干？ |
| `fertilizer_salt_tip_burn_route` | 肥盐焦尖路径 | 焦尖/焦边 | 最近施肥或水质硬 | 最近是否施肥偏多或用水水质偏硬？ |
| `dry_soil_tip_burn_route` | 缺水焦尖路径 | 焦尖 + 叶片发软 | 土经常干透 | 是否经常等到叶片发软才浇水？ |

### 6. 叶斑类问题

`outcomeKey`：`leaf_spot_cluster_basic`

核心建议：隔离、通风、停止喷水、剪重症叶，观察扩散，不强行细分真菌/细菌。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `spreading_spot_route` | 斑点扩散路径 | 不规则斑块、黑褐斑 | 斑点扩大/增多 | 最近这些斑点是否在扩大或变多？ |
| `water_soaked_spot_route` | 水渍状斑点路径 | 水渍感/边缘发黄 | 水渍、扩散 | 斑点边缘是否发黄、发黑或像水浸过？ |
| `spray_humidity_spot_route` | 喷水潮湿环境路径 | 叶斑候选 | 经常喷水/通风差 | 最近是否经常往叶面喷水或通风较差？ |

阻断 gate：

```text
斑块稳定不扩散，且明显在受光面或撕裂位置 → 转晒伤/结构损伤。
```

### 7. 疑似虫害痕迹

`outcomeKey`：`pest_trace_cluster_basic`

核心建议：隔离、查叶背和茎节、擦拭/冲洗、观察活动虫体。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `visible_pest_trace_route` | 可见虫害痕迹路径 | 小虫、网、黏液、壳状物 | 用户确认 | 叶背或茎节是否看到小虫、网、黏液或壳状物？ |
| `holes_with_pest_trace_route` | 孔洞 + 虫害痕迹路径 | 孔洞/缺损 | 有新鲜虫咬或虫体 | 缺口附近是否有虫、虫粪或继续变多？ |
| `sticky_residue_route` | 黏液/蜜露路径 | 黏液、发亮 | 黏液和虫体 | 叶片是否发黏，叶背是否有虫？ |

阻断 gate：

```text
缺口固定不扩散，且无虫体/虫粪/黏液/网 → 转结构损伤。
```

### 8. 结构损伤/旧伤

`outcomeKey`：`structural_damage_old_injury`

核心建议：如果不扩散，通常观察即可；避免误喷药。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `stable_hole_old_injury_route` | 稳定孔洞/旧伤路径 | 孔洞、撕裂、缺口 | 不扩散、无虫害痕迹 | 这个缺口最近有没有继续变大或变多？ |
| `mechanical_tear_route` | 机械撕裂路径 | 线性撕裂/折伤 | 移动/摩擦/人为碰伤 | 最近是否搬动、擦碰、修剪或被宠物碰过？ |

### 9. 自然代谢/非问题

`outcomeKey`：`natural_senescence_non_problematic`

核心建议：少量老叶黄化可摘除，观察新叶，不要过度处理。

| routeKey | 中文路径 | 入口证据 | 关键 gate | 典型问题 |
|---|---|---|---|---|
| `lower_old_leaf_yellowing_route` | 底部老叶自然黄化路径 | 下部老叶少量黄 | 新叶正常、不扩散 | 是否只有底部少量老叶发黄，新叶正常？ |
| `post_purchase_adjustment_route` | 环境变化适应路径 | 少量掉叶/黄叶 | 刚换环境，整体稳定 | 是否刚买回家或最近换了环境？ |

---

## 八、运行时算法

### Step 1：建立正式证据上下文

输入：

```text
observedEvidenceSet
answerEffects
derivedEvidenceSet
diagnosisDirections
symptomClassRuntime
plantContext
visualRouteContext
rankingsForAudit
```

输出：`routeEvidenceContext`。

关键要求：route 只能消费已经进入运行时的正式证据，不能使用视觉原始结果直接得出 outcome。

### Step 2：生成候选 outcome 集合

候选来源：

1. 当前 ranking 的 `candidateProblemKeys`。
2. 诊断方向映射到 outcome。
3. route 表的 `entry_symptom_keys` 命中。
4. 植物属级/类别高风险基线。
5. 用户问诊回答产生的正向或反向 effect。

注意：这一步不是最终诊断，也不是前端展示结果。

### Step 3：展开 route group

根据入口症状和诊断方向打开 route group：

```text
yellowing_care_split_group
wilting_care_split_group
tip_burn_environment_split_group
leaf_spot_or_patch_split_group
hole_or_tissue_loss_split_group
```

每个 route group 负责管理一组可能互相竞争或需要分流的 outcome。

### Step 4：展开 route

对每个候选 outcome 读取启用 route：

```text
outcome_routes where outcome_key in candidateOutcomeKeys and enabled=1
```

根据入口条件筛出候选 route，并写入 `candidateOutcomeStates`。

### Step 5：评估 gate

对每个候选 outcome / route 执行 gate：

```text
entry gate
split gate
confirmation gate
display gate
blocker gate
conflict gate
closure gate
uncertain gate
action safety gate
```

结果可能是：

```text
active
strengthened
weakened
blocked
display_eligible
closure_eligible
uncertain_candidate
```

### Step 6：选择下一道问题

优先级：

1. 能区分相反处理动作的问题。
2. 能排除高风险 outcome 的问题。
3. 能让当前最强候选通过展示或闭合 gate 的问题。
4. 能降低不确定性的通用补充问题。
5. route 数据缺失时，回退旧 ranking follow-up。

示例：当候选同时包含“积水/根系压力”和“缺水压力”时，下一题应优先问盆土干湿，而不是先问具体病斑形态。

### Step 7：收窄前端可见 outcome

前端可见候选应满足：

```text
有正式证据支持
未被 blocker gate 阻断
通过 display gate
通过 action safety gate
不泄漏内部最高 ranking
最多 1～3 个
```

### Step 8：输出主方向、伴随方向或不确定

输出可以分为：

```text
主方向：0～1 个
伴随观察方向：0～2 个
不确定方向：必要时 1 个
```

当多个候选建议冲突且无法继续问时，不应强行选一个，而应输出不确定 + 保守建议。

---

## 九、冲突处理规则

### 1. 同 outcome 多 route 命中

处理：合并证据，提高可信度。

示例：

```text
黄叶 + 土湿
萎蔫 + 土湿
发财树 + 高频浇水
```

都支持 `overwatering_root_pressure`，应提高该 outcome 的展示或闭合资格。

### 2. 多 outcome 同时命中且建议相容

可以同时进入前端可见集合，但要分层展示。

示例：

```text
主方向：积水/根系压力
伴随观察方向：土表小飞虫风险
```

用户核心动作都是控水、通风、处理土表环境，可以同时展示。

### 3. 多 outcome 同时命中且建议冲突

必须问分流题，不能硬输出。

示例：

```text
缺水压力：需要补水
积水/根系压力：需要停水
```

如果无法分清，输出不确定和保守建议，不给互相冲突的行动指令。

### 4. 中间节点不能当最终处理方向

例如 `yellowing_care_differential`：

```text
黄叶只是入口，不是最终处理方向。
```

除非它的公开建议被设计成完全保守且不冲突，否则不能作为主方向输出。

---

## 十、公开结果结构建议

公开给用户的不是 route trace，而是处理方向和行动建议。

### 1. 单主方向示例

```json
{
  "outcomeMode": "primary_only",
  "primaryOutcome": {
    "outcomeKey": "overwatering_root_pressure",
    "outcomeNameCn": "积水/根系压力",
    "outcomeType": "problem_cluster",
    "resultTitleCn": "更像积水或根系压力",
    "whyCn": "叶片发黄/发软，同时你确认盆土长期潮湿。",
    "confidenceLevel": "medium"
  },
  "secondaryOutcomes": [],
  "todayActions": ["先暂停浇水", "放到通风散射光处", "检查盆底是否积水"],
  "threeDayObserve": ["观察叶片是否继续发软", "检查土壤是否逐步变干"],
  "avoidActions": ["不要继续频繁浇水", "不要立刻重肥", "不要在不通风处闷养"]
}
```

### 2. 主方向 + 伴随观察方向示例

```json
{
  "outcomeMode": "primary_with_secondary",
  "primaryOutcome": {
    "outcomeKey": "overwatering_root_pressure",
    "outcomeNameCn": "积水/根系压力",
    "resultTitleCn": "主要更像积水或根系压力"
  },
  "secondaryOutcomes": [
    {
      "outcomeKey": "soil_gnat_risk_observation",
      "outcomeNameCn": "土表小飞虫风险",
      "displayRole": "watch",
      "whyCn": "如果土表确实有小飞虫，通常也和盆土长期潮湿有关。"
    }
  ],
  "todayActions": ["先控水", "加强通风", "检查土表和盆底"],
  "avoidActions": ["不要继续闷湿", "不要在没有虫体证据时直接大范围用药"]
}
```

### 3. 不确定 + 可排查方向示例

```json
{
  "outcomeMode": "uncertain_with_candidates",
  "primaryOutcome": null,
  "visibleOutcomes": [
    {
      "outcomeKey": "overwatering_root_pressure",
      "outcomeNameCn": "积水/根系压力",
      "displayRole": "possible"
    },
    {
      "outcomeKey": "underwatering_dehydration_pressure",
      "outcomeNameCn": "缺水压力",
      "displayRole": "possible"
    }
  ],
  "resultTitleCn": "目前还不能安全判断是缺水还是积水",
  "whyCn": "叶片发软可以由缺水或根系压力造成，但当前盆土干湿信息不足或互相冲突。",
  "safeActions": ["先检查表层以下 2～3cm 盆土干湿", "不要在未确认前连续大量浇水", "放到通风散射光处观察"],
  "neededInfoCn": ["盆土现在是干透还是仍湿", "盆底是否积水", "茎基部是否发软或有异味"]
}
```

内部可保留：

```json
{
  "activeRouteGroupKeys": ["yellowing_care_split_group"],
  "routeTrace": [],
  "gateResults": [],
  "rankingsForAudit": []
}
```

用户侧不展示 routeTrace、gateResults、rankingsForAudit。

---

## 十一、和当前守卫的关系

route/gate 不是替代所有守卫，而是把一部分守卫前移。

| 当前守卫 | 多候选 route 模式下的位置 |
|---|---|
| 黄叶必须分流 | 黄叶 route group 的 split gate。 |
| 孔洞不能默认虫咬 | 孔洞 route group 的 pest trace gate / structural gate。 |
| 宽泛斑块不能直出具体问题 | 叶斑/斑块 route group 只能展示叶斑类、晒伤、结构伤、不确定等粗方向。 |
| 用户否定方向不能乱跳 | blocker gate / exclude effect。 |
| 不确定不能泄漏 topProblem | result-formatter 继续保留。 |
| 视觉原始结果不能直接输出 | observed-evidence 准入层继续保留。 |
| 多个可见 outcome 行动建议冲突 | action safety gate 阻止同时展示，必要时输出不确定。 |

---

## 十二、给 Codex 的硬约束

1. 不得把 route 改造成“第一轮锁定一个唯一 outcome”。
2. 必须维护 `candidateOutcomeStates` 或同等运行时结构。
3. route group 必须支持一个入口症状打开多个候选 outcome。
4. 下一题选择必须优先服务候选收窄，而不是服务某个最高 ranking。
5. 前端可见 outcome 最多 1～3 个。
6. 多个前端可见 outcome 的行动建议不得互相冲突。
7. LLM 不得直接输出主 outcome 或可见候选 outcome。
8. ranking 不得直接决定主方向、伴随方向或可见候选。
9. 不确定结果不得泄漏内部最高 ranking。
10. 视觉原始结果必须先进入正式观察证据，才能参与候选 outcome 和 route 计算。
