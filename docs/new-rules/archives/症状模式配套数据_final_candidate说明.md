# 症状模式配套数据 final_candidate 说明

本批文件是基于：

- 《症状模式分流机制与运行时流程规范_最终完整版.md》
- `class_question_group_strategy_review_v2.*`
- `symptom_class_row_review_v2.csv`

联动升级后的 **final_candidate** 数据版本。

## 文件说明

### 1. class_question_group_strategy_final_candidate.xlsx / csv
作用：
- 作为 `symptom_class -> question_group` 的候选最终版
- 已补入最终版规范要求的关键字段：
  - `class_gate_type`
  - `class_switch_allowed`
  - `unknown_switch_policy`
  - `ai_locked_confirm_penalty`
  - `pseudo_symptom_allowed`
  - `role_semantic_validated`
  - `final_review_decision`
  - `final_review_note`

### 2. symptom_class_row_review_final_candidate.csv
作用：
- 作为 `symptom -> symptom_class` 的候选最终版 review 数据
- 已补入：
  - `primary_class_key`
  - `secondary_class_keys`
  - `class_mapping_type`
  - `visual_scoring_allowed`
  - `question_activation_allowed`
  - `explanation_only_allowed`
  - `class_conflict_note`
  - `audited_semantic_note`

## 当前定位

这批文件已经不是“初版 review”数据，而是：

```text
与最终完整版规范对齐后的候选最终版（final_candidate）
```

但仍建议在正式落库前再做一次：
- 真实 case 回放
- top1/top2 冲突抽检
- unknown 流程抽检
- AI 已锁定场景下的 confirm 题降权抽检

## 一句话结论

```text
最终完整版文档已经把规则收紧，
所以配套数据也必须同步升级到 final_candidate，
否则会出现“文档是 final，数据仍是旧 review 口径”的错位。
```
