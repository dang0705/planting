# 第七批代码落地：identify-http 视觉入口最小重构 v1

## 本批目标

把 `identify-http` 从旧的：

- 百度识别
- 直接找 `catalog match`
- 只写 `identify_sessions`

推进到第一版正式视觉入口最小实现：

- `visual_call_batches`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`
- `plant_identity_resolution_records`

同时继续保持旧前端在 `add-plant` 页面使用的响应结构不崩。

## 本批实际改动

文件：

- `cloudfunctions/layer/utils/identify-runtime.js`
- `cloudfunctions/identify-http/app.js`

## 本批实现口径

### 1. 仍保留百度作为名称候选输入

这一点没有变。

正式执行口径仍然是：

# **百度只负责给出候选名称，不负责植物身份真值。**

因此百度结果现在只作为：

- `recognizedName`
- `recognizedType`
- `confidence`
- `rawPayload`

的来源。

### 2. Taxonomy 匹配与最终身份状态分开

本批把识别结果分成三档：

- `matched`
- `weak_matched`
- `unresolved`

当前具体规则是：

- `matchScore >= 3`：`matched`
- `0 < matchScore < 3`：`weak_matched`
- 没有任何有效命中：`unresolved`

并且：

- `matchedPlant` 只对外返回强命中对象
- `weak_matched` 只进入 `candidates`
- 不再把弱命中直接伪装成前端的自动确认结果

这一步是本批最重要的行为变化之一。

## 新增的运行时持久化

### 1. `visual_call_batches`

每次 `identify-http` 成功识别后，都会生成一个视觉调用批次主记录：

- `trigger_source = identify_http`
- `round_id = identify_round_1`
- `image_count = 1`

### 2. `visual_raw_image_records`

记录单图原始调用结果：

- 图片引用
- 输入槽位类型
- 模型名
- 原始文本输出
- 原始结构化输出

本批默认：

- `input_slot_type = unknown`

原因：

- 当前 add-plant 入口只有“上传一张图”
- 还没有结构化器官槽位输入

### 3. `visual_normalized_image_results`

本批先做“最小标准化”：

- `analyzability_level`
- `clarity_level`
- `subject_completeness_level`
- `primary_organ_type`
- `organ_source`
- `route_hints_json`
- `route_primary_action`
- `long_tail_noise_flag`
- `pattern_derivation_status`

说明：

- 当前并没有真正做症状候选识别，所以：
  - `topk_symptoms_json = []`
  - `pattern_candidates_json = []`
- `pattern_derivation_status = not_applicable`

这符合第一版“对象先建起来，但不要假装完整症状引擎已经存在”的执行原则。

### 4. `visual_admission_records`

本批把“身份对象是否进入运行时正式层”也显式记录下来：

- `matched` -> `formally_admitted`
- `weak_matched` -> `candidate_retained`
- `unresolved` -> `explanation_retained`

并且：

- 只有 `matched` 会 `entered_runtime = 1`
- 其余情况保留为候选或解释层，不伪造正式身份结果

### 5. `plant_identity_resolution_records`

本批正式把识别名到 identity 的解析记录落库。

关键字段包括：

- `raw_recognition_name`
- `taxonomy_match_status`
- `identity_resolution_status`
- `matched_plant_identity_id`
- `is_current_primary_identity`
- `match_rule`
- `match_score`
- `match_reason`

当前规则：

- 强命中时：
  - `is_current_primary_identity = true`
- 弱命中 / 未命中时：
  - `is_current_primary_identity = false`

## 旧接口兼容策略

当前前端仍依赖返回：

- `sessionId`
- `name`
- `confidence`
- `type`
- `matchedPlant`
- `candidates`

本批保持了这些字段不变。

同时补出新字段：

- `visualCallBatchId`
- `taxonomyMatchStatus`
- `identityResolutionStatus`
- `routePrimaryAction`

这样前端现有壳可以继续跑，后续新链路也已经有正式字段可接。

## 行为层变化

### 1. 不再把弱匹配强行当成自动命中

旧行为里，`matches[0]` 会直接作为 `matchedPlant`。

本批改成：

- 只有强命中才进入 `matchedPlant`
- 弱命中只保留在 `candidates`

结果是：

- `add-plant` 页面对弱命中会更容易进入“用户手选候选”的分支
- 这比错误自动绑定植物更符合当前第一版保守策略

### 2. 旧 `identify_sessions` 暂时保留为兼容留痕

虽然本批已经把正式对象写入新表，但：

- `identify_sessions` 仍继续写

原因：

- 旧表当前还没正式清理
- 兼容留痕成本低
- 可以降低短期调试风险

但它已经不再是本批的主记录中枢。

## 本批验证

本地已完成：

- `node --check cloudfunctions/layer/utils/identify-runtime.js`
- `node --check cloudfunctions/identify-http/app.js`

结果：

- 两个文件均通过语法检查

本批未做：

- 云函数部署
- 真实调用联调
- dev 环境写库验收

## 当前结论

到本批结束，`identify-http` 的内部数据流已经从“旧单表留痕”升级为：

# **视觉批次 -> 原始记录 -> 标准化结果 -> 接纳记录 -> 身份解析记录**

同时对前端接口仍保留兼容响应。

这意味着：

- 视觉入口最小骨架已经真正落到代码
- 后续再推进 diagnosis 主链时，不需要再回头补 identify 的正式对象层

## 下一步建议

下一批直接进入：

- `diagnose-http`

优先切的点是：

1. `prior-repository` 对旧 `plant_catalog` 的依赖
2. 诊断会话如何读取新的 `current_plant_identity_id`
3. `route_primary_action` 与 outcome 三类的主链收口
