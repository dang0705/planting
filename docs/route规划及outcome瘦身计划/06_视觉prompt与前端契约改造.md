# 视觉 prompt 与前端契约改造

本文档包依据以下材料整理：

- 当前代码压缩包：`Archive 2.zip`
- 项目规则压缩包：`rules.zip`
- 诊断运行时粗文档：`diagnosis-runtime-code-logic.md`
- 本次会话中关于“主动瘦身、养护类主轴、outcome 路径规划、gate 守卫、LLM prompt 职责边界”的讨论结论

权威优先级：**当前代码 > 项目 rules > 已有运行时说明 > 本次设计讨论**。如果后续实施时发现文档和代码冲突，必须以代码为准，并同步修正文档。


## 一、prompt 改造结论

改成 outcome route 模式后，视觉 prompt 需要改，但不能改成：

```text
让 LLM 输出主 outcome 或可见候选 outcome。
```

正确方向是：

```text
LLM 负责把图片中可见信息结构化，提供 route 入口和 gate 所需的判别特征。
规则引擎负责决定 outcome、route、gate 和最终输出。
```

## 二、当前 prompt 职责

当前 prompt 主要位于：

```text
cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js
buildSymptomLabelerPromptPayload()，约第 368 行
buildSymptomLabelerPrompt()，约第 416 行
```

当前视觉解析位于：

```text
cloudfunctions/diagnose-http/utils/diagnosis-parser.js
parseStructuredVisualResult()，约第 252 行
```

当前配置中的响应 schema 主要包括：

```json
{
  "normalized_organ": "leaf",
  "image_quality_grade": "good|medium|poor",
  "analyzability": "high|medium|marginal|low",
  "symptom_candidates": [],
  "out_of_pool_symptom_candidates": [],
  "route_hints": []
}
```

当前设计优点：

1. 不让模型直接诊断。
2. 不让模型推测不可见历史。
3. 不让模型给治疗建议。
4. 输出症状候选，便于后端正式准入。

不足：

1. 对 route gate 帮助不够。
2. 缺少路径判别特征。
3. 缺少“图片看不出来，需要问什么”的结构化信息。
4. `route_hints` 粒度较粗。

## 三、新增字段建议

### 1. `visual_discriminators`

中文名：视觉判别特征。

作用：记录图片中可见、能帮助 route 分流的形态信息。

示例：

```json
{
  "visual_discriminators": [
    {
      "dimension_key": "tissue_loss",
      "value_key": "not_visible",
      "confidence_band": "medium",
      "visible_basis_cn": "当前图中没有明显穿透孔洞或组织缺失"
    },
    {
      "dimension_key": "spot_boundary",
      "value_key": "unclear_boundary",
      "confidence_band": "medium",
      "visible_basis_cn": "斑块边缘不够清晰，无法仅凭图片区分晒伤或叶斑"
    }
  ]
}
```

推荐维度：

| dimension_key | 中文含义 | 用途 |
|---|---|---|
| `tissue_loss` | 组织缺失 | 区分孔洞、虫咬、机械伤、叶斑脱落。 |
| `spot_boundary` | 斑点边界 | 区分叶斑、晒伤、机械伤。 |
| `surface_coating` | 表面覆盖物 | 区分霉层、白粉、灰尘、非问题。 |
| `distribution_scope` | 分布范围 | 区分局部异常和整株养护问题。 |
| `leaf_age_position` | 新叶/老叶位置 | 区分自然老叶、缺肥、积水、光照。 |
| `visible_pest_trace` | 可见虫害痕迹 | 区分虫害路径和非虫害路径。 |
| `water_soaked_appearance` | 水渍感 | 辅助叶斑、水肿、软腐方向。 |
| `sun_exposure_pattern` | 受光面模式 | 辅助晒伤路径。 |
| `growth_shape` | 生长形态 | 辅助徒长/弱光路径。 |

### 2. `missing_info_for_path`

中文名：路径缺失信息。

作用：说明图片无法判断、需要问诊补充的信息。

示例：

```json
{
  "missing_info_for_path": [
    {
      "dimension_key": "soil_moisture",
      "reason_cn": "图片无法判断盆土内部是否长期潮湿，需要问用户浇水后土壤干湿情况"
    },
    {
      "dimension_key": "progression",
      "reason_cn": "单张图片无法判断斑点是否正在扩大或变多"
    }
  ]
}
```

推荐维度：

| dimension_key | 中文含义 | 对应 route |
|---|---|---|
| `soil_moisture` | 土壤干湿 | 积水/缺水分流。 |
| `watering_frequency` | 浇水频率 | 积水/缺水/根系压力。 |
| `progression` | 是否扩散 | 叶斑/旧伤/虫害分流。 |
| `recent_light_change` | 最近光照变化 | 晒伤/弱光分流。 |
| `pest_backside_check` | 叶背虫害检查 | 虫害路径。 |
| `stem_base_condition` | 茎基部状态 | 烂根风险/积水路径。 |
| `new_leaf_condition` | 新叶状态 | 自然老叶/养护问题分流。 |

### 3. 可选：`visible_absence`

中文名：可见层面的未见。

谨慎使用。

允许表达：

```text
当前图中未见明确虫体/网状物/壳状物。
```

禁止表达：

```text
没有虫害。
没有烂根。
没有真菌。
```

因为图片未见不等于诊断排除。

## 四、禁止 prompt 输出的内容

### 1. 禁止输出主 outcome 或可见候选 outcome

禁止字段：

```json
{
  "outcome_key": "overwatering_root_pressure"
}
```

原因：这会绕过 route/gate 设计。

### 2. 禁止推断不可见历史

禁止：

```text
用户最近浇水过多。
长期通风差。
病害正在扩散。
根系已经腐烂。
土壤有异味。
```

这些必须由问诊或用户补充获得。

### 3. 禁止给处理建议

视觉阶段不能输出：

```text
建议剪叶。
建议喷药。
建议换盆。
```

行动建议必须由后端 routeDecision 中的 `primaryOutcome`、`secondaryOutcomes`、`visibleOutcomes` 和 actionProfile 决定。

## 五、后端视觉解析改造

### 1. `utils/diagnosis-parser.js`

新增解析函数：

```js
function normalizeVisualDiscriminators(items = [])
function normalizeMissingInfoForPath(items = [])
```

`parseStructuredVisualResult()` 返回新增字段：

```js
{
  ...existing,
  visualDiscriminators,
  missingInfoForPath
}
```

### 2. 视觉 adapter

涉及文件：

```text
cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js
```

改造动作：

- 不丢弃新增字段。
- 对字段做长度限制和枚举校验。
- 中文说明保留，但不得进入用户最终结果，除非后端审查后使用。

### 3. `services/visual-diagnosis-service.js`

改造动作：

1. `buildVisualDecisionStreamSummary()` 增加：

```js
visualDiscriminators
missingInfoForPath
```

2. `buildVisualAggregateResult()` 增加：

```js
aggregate_visual_discriminators
aggregate_missing_info_for_path
```

3. 如果视觉归一化结果表支持扩展字段，新增持久化；否则先在 runtime aggregate 中透传。

## 六、route planner 如何消费视觉新增字段

### 1. 选择下一问题

示例：

```text
missing_info_for_path 包含 soil_moisture
+ 候选 outcome 包含积水/缺水
→ 优先问土壤干湿分流题
```

### 2. 辅助 route 入口

示例：

```text
visual_discriminators.visible_pest_trace = possible
+ 叶片有孔洞
→ 虫害 route 进入候选，但必须问叶背/虫体确认
```

### 3. 辅助阻断

示例：

```text
visible_absence: no visible tissue loss
→ 不进入孔洞/结构损伤 route
```

注意：只能作为辅助，不能替代正式证据和问诊。

## 七、公开响应契约改造

当前结果归一化主要位于：

```text
src/utils/diagnose-flow.js
normalizeDiagnosisResult()
```

当前前端结果页：

```text
src/pages/diagnose/follow-up.vue
```

### 1. 后端新增响应字段建议

```json
{
  "outcomeType": "problem_cluster",
  "finalResult": {
    "outcomeMode": "primary_with_secondary",
    "primaryOutcome": {
      "outcomeKey": "overwatering_root_pressure",
      "displayNameCn": "积水/根系压力",
      "summaryCn": "主要更像积水或根系压力。",
      "whyCn": "叶片发黄，同时你确认盆土长期潮湿。"
    },
    "secondaryOutcomes": [],
    "visibleOutcomes": ["overwatering_root_pressure"]
  },
  "actionAdvice": {
    "todayActions": [],
    "threeDayActions": [],
    "sevenDayObserve": [],
    "avoidActions": []
  },
  "routeDecision": {
    "mode": "multi_outcome_route",
    "visibleOutcomeKeys": ["overwatering_root_pressure"],
    "primaryOutcomeKey": "overwatering_root_pressure",
    "secondaryOutcomeKeys": [],
    "activeRouteGroupKeys": ["yellowing_care_split_group"],
    "decisionCause": {
      "decisionCauseKey": "wet_soil_confirmed",
      "decisionCauseText": "用户确认盆土长期潮湿。"
    }
  }
}
```

用户态可以不返回完整 `routeTrace`，或者只在开发态返回。

### 2. 前端归一化建议

`src/utils/diagnose-flow.js` 新增：

```js
function normalizeVisibleOutcomes(raw = [])
function normalizePrimaryOutcome(raw = {})
function normalizeSecondaryOutcomes(raw = [])
function normalizeRouteDecision(raw = {})
function normalizeActionAdvice(raw = {})
```

`normalizeDiagnosisResult()` 增加字段：

```js
primaryOutcome
secondaryOutcomes
visibleOutcomes
outcomeMode
routeDecision
actionAdvice
```

同时保留旧字段兼容：

```js
rankings
topProblem
finalResult
nextSteps
whatToAvoid
```

### 3. 前端展示建议

`src/pages/diagnose/follow-up.vue` 结果区域优先显示：

```text
primaryOutcome.displayNameCn
secondaryOutcomes[].displayNameCn
visibleOutcomes[].displayNameCn
finalResult.summaryCn
finalResult.whyCn
actionAdvice.todayActions
actionAdvice.threeDayActions
actionAdvice.avoidActions
```

不要展示：

```text
routeKey
gateKey
ranking finalScore
内部 topProblem
```

## 八、前端最小改动策略

第一阶段前端可几乎不改。

原因：后端仍可把 `primaryOutcome` 和 `visibleOutcomes` 映射到现有 `finalResult`、`nextSteps`、`whatToAvoid`，保持旧页面兼容。

最小改动：

1. `normalizeDiagnosisResult()` 接收 `finalResult.primaryOutcome`、`finalResult.secondaryOutcomes`、`finalResult.visibleOutcomes`。
2. 结果页不依赖 `topProblem`。
3. 开发态可展示 route debug。

第二阶段再把结果页改成行动建议结构。

## 九、测试重点

### prompt 测试

1. LLM 不输出 outcome。
2. LLM 不推断土壤内部、根系、气味、历史浇水。
3. LLM 能输出缺失信息：土壤干湿、是否扩散、叶背检查等。
4. LLM 输出的可见未见不被后端当作诊断排除。

### 前端契约测试

1. `await_follow_up` 时仍只显示一个问题。
2. final outcome 时能显示行动建议。
3. uncertain 时不显示具体最高问题。
4. non_problematic 时不显示治疗建议。
5. 旧字段存在时不崩溃，新字段缺失时可 fallback。
