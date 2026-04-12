# 最终 SQL 制表方案 v1.3（完整最终版，开发收口版）

> 说明：
>
> - 本文件用于作为当前开发阶段可直接引用的正式 SQL 制表基线。
> - 本版只收口真正阻断开发的问题，不继续扩概念。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **先支撑 dev 可落地**

---

# 一、当前正式分层

## 1. Taxonomy 主数据层
- `plant_identity_entities`
- `plant_identity_aliases`
- `plant_identity_match_rules`
- `plant_identity_merge_history`
- `genus_care_profiles`

## 2. Diagnosis 静态业务层
- `problems`
- `symptoms`
- `question_templates`
- `question_option_sets`
- `diagnosis_result_explanations`
- `plant_problem_profiles`

## 3. Taxonomy 到 Diagnosis 挂接层
- `plant_identity_diagnosis_links`

## 4. 运行时与监督层
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`
- `visual_call_aggregate_results`
- `visual_supervision_records`

---

# 二、第一阶段正式挂接键裁决

## 2.1 属级养护基线挂接键
正式裁决：

# **第一阶段 `genus_care_profiles` 的正式业务挂接键 = `genus_name + family_name_canonical`**

### 说明
- `family_name_canonical` 是第一阶段归一科名字段
- 展示字段可保留中文 / 英文
- 但业务 join key 只使用归一字段

---

# 三、运行时对象最小持久化策略

## 3.1 必须持久化到 SQL
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`

## 3.2 建议持久化到 SQL
- `visual_call_aggregate_results`
- `visual_supervision_records`

## 3.3 默认不强制持久化到 SQL
以下运行时对象第一版可先放内存 / cache / trace，不要求立即建表：

- `normalized_input`
- `observed_evidence_set`
- `hypothesis_pool`
- `outcome_pool`
- `question_queue`
- `stop_state`
- `diagnostic_trace`

### 说明
第一版目标是：
# **先跑通 dev 链路**
而不是一次性把全部运行时对象 SQL 化。

---

# 四、视觉调用批次主记录方案

## 4.1 正式新增主记录表
正式裁决：

# **第一版必须新增 `visual_call_batches`**

### 中文主名
视觉调用批次主记录表

### 最小职责
承载：
- `visual_call_batch_id`
- `session_id`
- `trigger_source`
- `round_id`
- `batch_status`
- `image_count`
- `created_at`
- `updated_at`

---

# 五、AI 入口新增治理字段正式冻结

## 5.1 `plant_identity_resolution_records`
正式冻结关键字段：

- `taxonomy_match_status`
- `identity_resolution_status`
- `matched_plant_identity_id`
- `is_current_primary_identity`
- `match_rule`
- `match_score`
- `match_reason`
- `superseded_by_resolution_id`
- `superseded_reason`
- `superseded_at`

## 5.2 `visual_normalized_image_results`
正式冻结关键字段：

- `route_primary_action`
- `top1_stability_score`
- `top3_stability_score`
- `long_tail_noise_flag`
- `pattern_derivation_status`

## 5.3 `visual_supervision_records`
正式冻结关键字段：

- `question_correction_scope`

---

# 六、状态字段边界裁决

## 6.1 `taxonomy_match_status`
只表示：

# **某条原始识别名对 Taxonomy 的命中结果**

典型值：
- `matched`
- `weak_matched`
- `unresolved`

## 6.2 `identity_resolution_status`
表示：

# **该解析记录在进入当前会话身份裁定后的最终状态**

它不等于 Taxonomy 静态属性。

---

# 七、`route_primary_action` 第一阶段正式枚举

正式裁决：

- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

### 删除
- `hold_for_review`

### 原因
当前系统没有人工审核状态机，一人维护阶段不引入该复杂度。

---

# 八、route hint 与事实层落位顺序裁决

正式裁决：

# **只要条目已被 `formally_admitted`，就先进入 `observed_evidence_set`。**
# **route hint 只改变后续流程优先级，不改变事实层先落位。**

---

# 九、一句话总裁决

**当前 SQL 制表方案已经足以支撑 Codex 进入 dev 建表阶段；其余更复杂的持久化哲学与扩展状态机，全部延后。**
