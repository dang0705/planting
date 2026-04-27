# AI Diagnosis Codex 极简执行摘要

> 只给 Codex 读这一份。  
> 目标：用最少阅读量，锁死诊断系统改造边界，避免跑偏。

---

## 1. 唯一入口 / 唯一中心

### 前端唯一诊断入口
```text
src/components/DiagnosePopup.vue
```

### 后端唯一诊断决策中心
```text
cloudfunctions/diagnose-http
```

### 禁止
- `pages/diagnose/diagnose.vue` 再长出一套主诊断流程
- 前端 `utils` 或 `components` 内重写评分引擎
- `identify-http` 输出最终排序结论

---

## 2. 新体系是唯一真源

运行时必须以新体系为准：

- `problems`
- `symptoms`
- `symptom_problem_evidence`
- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`
- `problem_causality`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`
- `diagnosis_result_explanations`

### 旧体系处理原则
旧体系只能通过 adapter 兼容。  
禁止旧规则继续主导最终诊断。

---


## 2.1 新增：symptom_class（症状模式）层

AI visual symptom 不得直接跳到 problem / question。  
必须先经过：

```text
AI visual symptom
→ symptom_class
→ class-gated candidate problems
→ class-gated question groups
→ fine-grained ranking
```

### 最少要求
- 新增 `symptom_class` / `症状模式` 概念
- question selector 必须先按 class 收敛，再按 problem 精排
- 黄叶类必须单独走 `yellowing_mode`
- follow-up 不能跨 class 发散乱问


## 3. 先做 diff，再改引擎

改代码前，必须先完成：

1. `data-diff report`
2. `key alias map`
3. `backfill plan`
4. `repository 输出结构定义`

### 迁移顺序
```text
旧数据
→ diff
→ backfill / upsert
→ repository 对上统一输出新结构
→ 再切换新引擎
```

禁止因为旧数据不齐，就删新逻辑或让前端兜底。

---

## 4. 推荐新增目录

在 `cloudfunctions/diagnose-http/` 下新增：

```text
domain/
repositories/
mappers/
services/
constants/
```

### 最少需要这些文件

- `domain/diagnosis-engine.js`
- `domain/evidence-scoring.js`
- `domain/prior-scorers.js`
- `domain/causality-scorer.js`
- `domain/question-selector.js`
- `domain/result-formatter.js`

- `repositories/problem-repository.js`
- `repositories/symptom-repository.js`
- `repositories/prior-repository.js`
- `repositories/question-repository.js`
- `repositories/causality-repository.js`

- `mappers/legacy-rule-adapter.js`
- `mappers/data-diff-builder.js`
- `mappers/data-backfill-builder.js`
- `mappers/public-id-mapper.js`

- `constants/key-alias-map.js`

---

## 5. 最终评分公式

### 视觉证据分
```text
EvidenceScore_visual(p)
=
Σ [
  VisualConfidence(s)
  × association_strength(s,p)
  × signal_reliability(s)
  × edge_reliability(s,p)
]
```

### 问诊证据分
```text
EvidenceScore_question(p)
=
Σ [
  AnswerValue(q,a)
  × MappingStrength(q,a)
  × association_strength(mapped_symptom,p)
  × signal_reliability(mapped_symptom)
  × edge_reliability(mapped_symptom,p)
]
```

### 总证据分
```text
TotalEvidenceScore(p)
=
EvidenceScore_visual(p)
+ 1.25 × EvidenceScore_question(p)
```

### genus 修正
```text
GenusFactor(p) = 0.6 + 0.4 × genus_compatibility
```

### host 修正
```text
HostFactor(p) = 0.8 + 0.2 × host_compatibility
```

### penalty
- `no` 必须扣分
- `unknown` 不加分不减分

### causality
- 只做二阶段增强
- 不参与首轮主排序

### 最终总分
```text
FinalScore(p)
=
HostAdjustedScore(p)
- PenaltyScore(p)
+ CausalityBoost(p)
```

---

## 6. question system 必须参与主链路

问诊不是外挂，必须进入总分。

### 必须支持
- `yes`
- `no`
- `unknown`

### unknown 规则
- `value = 0`
- 不加分
- 不减分
- 同组连续 `unknown >= 2` 自动切组

### follow-up 去重规则
如果 AI 已高置信识别某 visual symptom：

```text
区分题 > 排异题 > 上下文题 > 重复确认题
```

高置信 symptom 的同义重复题，不得排第一优先级。

---

## 7. 候选空间规则

首轮候选不能只来自 `plant_problem_profiles`。

必须来自：

```text
evidence 命中的 problem
∪ genus prior problem
∪ host prior problem
∪ 必要的 causal-linked problem（仅二阶段）
```

`plant_problem_profiles` 只能作为 prior cache，不是唯一白名单。

---

## 8. problem_role 过滤规则

### 允许作为最终 top1
- `root_cause`
- `secondary_issue`（若有）

### 不允许直接作为 top1
- `result_state`
- `aggregate_cluster`
- `predisposing_factor`

### 输出层拆分
- `finalResult`：只放 root cause
- `contributingFactors`：放 predisposing_factor
- `intermediateStates`：放 result_state / aggregate_cluster

---

## 9. 最小前后端交互

前端只拿当前交互所需最小字段。

### 必做接口
- `POST /diagnosis/start`
- `POST /diagnosis/answer`
- `GET /diagnosis/result`
- `GET /diagnosis/history`
- `POST /diagnosis/feedback`

### 前端允许拿
- `diagnosisSessionId`
- `roundId`
- 当前 `questions`
- 当前 `options`
- 当前结果摘要
- 用户级 explanation
- 历史摘要

### 前端禁止拿
- 完整规则表
- 完整 question strategy
- score 明细
- raw candidate list
- 内部 key / 权重 / 图谱

### 协议原则
- 外部只暴露 `questionId / optionId / problemId / resultId`
- 内部 `problem_key / symptom_key / question_key` 不直接下发

---

## 10. 会话与安全边界

### `/diagnosis/answer` 必须校验
- `diagnosisSessionId` 有效
- `roundId` 匹配当前轮
- `questionId` 属于当前 session / 当前轮
- `optionId` 属于该 `questionId`

### 禁止
- 旧轮答案重放
- 同一题重复累加得分
- 跨 session 提交题目

### 植物上下文锁定
创建 session 后锁定：
- `plantId`
- `genus`
- `family`
- `category`

中途切植物必须新建 session。

---

## 11. 补图规则

follow-up 阶段必须二选一：

### 模式 A
禁止补图，只允许答题

### 模式 B
允许补图，但必须：
- 重跑 identify
- 重建 visual symptoms
- 清空旧 follow-up 题组
- 重新开本轮诊断

禁止把：
```text
旧 visual + 新图 + 已答 follow-up
```
直接混算。

---

## 12. 历史结果必须快照化

最终结果落库时，必须保存：

- final result
- contributing factors
- intermediate states
- explanation
- asked questions
- chosen answers
- version metadata

历史详情页只读快照，不重新跑引擎。

---

## 13. 版本元数据必存

每次 final result 持久化时，至少保存：

- `diagnosis_engine_version`
- `data_bundle_version`
- `question_system_version`
- `result_explanation_version`
- `legacy_adapter_version`（若有）

---

## 14. 前端职责边界

### `DiagnosePopup.vue` 只负责
- 上传图片
- 调 start
- 展示题目
- 提交 `questionId + optionId`
- 展示结果

### 禁止
- 自己算分
- 自己选题
- 自己做 symptom 映射
- 自己二次排序

---

## 15. 实施顺序（Codex 按此执行）

### Step 1
锁死入口与评分中心

### Step 2
建立 `domain / repositories / mappers / services / constants`

### Step 3
完成：
- data diff
- alias map
- backfill builder
- repository 新结构输出

### Step 4
实现首轮评分：
- visual evidence
- genus / host 修正
- preliminary result

### Step 5
实现问诊：
- question selector
- yes/no/unknown
- 去重规则
- 二轮评分

### Step 6
实现结果解释与 role filter

### Step 7
接好最小前后端协议接口

### Step 8
最后再收口前端 UI 和历史页

---

## 16. 最终 Review 只检查这些

- [ ] DiagnosePopup 是否唯一主入口
- [ ] diagnose-http 是否唯一评分中心
- [ ] 是否先做 diff/backfill 再切引擎
- [ ] repository 是否只向上暴露新结构
- [ ] 旧规则是否只通过 adapter 被消费
- [ ] visual/question/genus/host/penalty/causality 是否都纳入
- [ ] unknown 是否落地
- [ ] follow-up 去重规则是否落地
- [ ] candidate space 是否没被 plant_problem_profiles 截断
- [ ] role filter 时机是否正确
- [ ] 历史是否快照化
- [ ] 前端是否没拿到完整规则和分数细节

---

## 17. 一句话执行原则

```text
入口唯一、评分中心唯一、新体系为准、先补数据再改引擎、问诊正式入链、前端拿最少、后端保留全部。
```
