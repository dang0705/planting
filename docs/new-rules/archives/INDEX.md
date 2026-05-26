# docs/new-rules 索引

## 1. 定位

本文件是 `docs/new-rules/` 的轻量索引，用于让 main agent / subagent 精准定位新规则文档，避免全量读取整个目录。

`docs/new-rules/` 是诊断系统规则库，包含大量长文档。任何 agent 都不得默认全量读取本目录。

## 2. 读取原则

1. 默认只读本索引。
2. 不得全量读取 `docs/new-rules/`。
3. 每次任务默认最多读取 1～2 个最相关规则文档。
4. 如果需要读取超过 2 个规则文档，main agent 必须说明原因，并优先生成规则摘要。
5. 下游 agent 优先读取上游摘要和 handoff，不重复读取源规则文档。
6. 如果索引无法定位具体文档，subagent 应请求 main agent 补充摘要或指定路径，不得自行扫描整个目录。
7. 涉及规则冲突时，停止并请求 main agent 裁决。

## 3. 最高优先级入口

| 用途 | 优先读取 | 说明 |
|---|---|---|
| 极简执行摘要 | `docs/new-rules/AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md` | Codex 快速理解诊断系统规则时优先读取 |
| 总规范入口 | `docs/new-rules/AI_DIAGNOSIS_MASTER_SPEC_v2.md` | 总体结构、系统目标、最小交互协议 |
| 当前正式基线清单 | `docs/new-rules/当前正式基线文档清单_v1_2_修正版.md` | 判断哪些文件是正式基线 |
| 硬约束 | `docs/new-rules/diagnosis_hard_constraints_v2_4_20260404_121000.md` | 高风险诊断任务必须引用 |
| 术语 | `docs/new-rules/统一术语表_v1_4_完整最终版_标题版本已统一.md` | 术语冲突、中文主名、概念命名 |
| 开发阻断裁决 | `docs/new-rules/开发前阻断问题一次性收口裁决_v1.md` | 开发前范围收口与阻断判断 |

## 4. 任务域快速路由

| 任务域 | 优先读取 | 备选读取 | 常见触发词 |
|---|---|---|---|
| 总体规则 / 不确定读哪个 | `AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md` | `AI_DIAGNOSIS_MASTER_SPEC_v2.md`、`当前正式基线文档清单_v1_2_修正版.md` | 总规范、总入口、基线、overview |
| 诊断硬约束 | `diagnosis_hard_constraints_v2_4_20260404_121000.md` | `统一术语表_v1_4_完整最终版_标题版本已统一.md` | 硬约束、宪法、不能违反 |
| 运行时 / route / outcome / gate | `运行时模型_v1_5_完整最终版_标题版本已统一.md` | `决策流_v1_4_完整最终版_标题版本已统一.md`、`diagnosis_outcome_layer_v1_2_full_final.md` | runtime、route、outcome、gate、决策流 |
| outcome / 结论层 | `diagnosis_outcome_layer_v1_2_full_final.md` | `problem_taxonomy_v1_4_full_final.md`、`具体问题结论正向证据门槛规则_v1.md` | outcome、结论、最终结果、问题性结论 |
| 问诊 / 追问 / 停止策略 | `收益驱动停止策略_v1.md` | `question_copy_data_layer_governance_20260429.md`、`视觉候选症状追问承接与兜底确认规则_v1.md` | 问诊、追问、question、停止、follow-up |
| 视觉证据 / 多图 / prompt | `ai_visual_entry_data_structure_and_retention_spec_v1_4_full_consolidated.md` | `视觉prompt与追问关联守卫规则_v1.md`、`视觉多图业务融合改造计划_v1.md` | 视觉、visual、多图、prompt、证据 |
| 视觉模型 / HF / shadow compare | `视觉模型适配层与双模型多图融合代码落地审查_v1.md` | `HF_AutoTrain真实推理接入与标签映射规范_v1.md`、`shadow_compare数据留痕与HF灰度接入边界_v1.md` | HF、Qwen、双模型、shadow compare、灰度 |
| 症状模式 / symptom_class | `症状模式分流机制与运行时流程规范_最终完整版.md` | `SYMPTOM_CLASS_REVIEW_AND_UPDATE.md`、`症状模式落代码前提条件审查结论_v1.md` | symptom_class、症状模式、class_question_group |
| SQL / 表结构 / 数据映射 | `最终_SQL_制表方案_v1_3_完整最终版_开发收口版.md` | `第一版_SQL_表结构草案_v1_1_开发收口版.md`、`Taxonomy_Diagnosis_SQL_字段映射表_v1_1_完整最终版_标题版本已统一.md` | SQL、表结构、字段、schema、导入 |
| Taxonomy / 植物身份 / 属级养护 | `植物_Taxonomy_体系定义_v1_3_完整最终版_开发收口版.md` | `plant_identity_master_and_name_normalization_rules_v1.md`、`属级养护基线表设计_v1_1_full_reviewed_final_标题版本已统一.md` | taxonomy、植物身份、属级养护、genus |
| 准入 / 退役 / 最小知识库 | `准入与退役规则_v1_3_完整最终版_标题版本已统一.md` | `最小可用知识库_v1_3_完整最终版_标题版本已统一.md` | 准入、退役、MVP、知识库 |
| batch / report / 审计产物 | `diagnosis_batch_report_state_labeling_rule_20260429.md` | `diagnosis-replay.md` | batch、report、await_follow_up、conclusion |
| 文档一致性 / 审计报告 | `当前全部文档最高规格联动一致性总审查报告.md` | `当前正式基线文档清单_v1_2_修正版.md` | 文档一致性、总审查、基线冲突 |

## 5. 规则域索引表

| 规则域 | 文档路径 | 适用场景 | 关键词 | 推荐读取范围 | 风险等级 |
|---|---|---|---|---|---|
| Codex 极简规则 | `docs/new-rules/AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md` | 给 Codex 快速建立最低限度规则上下文 | codex, minimal, summary | 全文可读，但优先读摘要段 | 中 |
| 总规范 | `docs/new-rules/AI_DIAGNOSIS_MASTER_SPEC_v2.md` | 总体架构、最小交互、系统重构依据 | master spec, 总规范, 重构 | 只读目标和架构总则 | 高 |
| 正式基线清单 | `docs/new-rules/当前正式基线文档清单_v1_2_修正版.md` | 判断某文档是否正式基线 | 基线, 清单, A类, 正式 | 全文可读 | 中 |
| 诊断硬约束 | `docs/new-rules/diagnosis_hard_constraints_v2_4_20260404_121000.md` | 高风险诊断规则、架构审查、QA 审查 | hard constraints, 宪法, 约束 | 只读命中约束小节 | 高 |
| 统一术语 | `docs/new-rules/统一术语表_v1_4_完整最终版_标题版本已统一.md` | 术语冲突、中文主名、命名一致性 | terminology, 术语, 中文主名 | 只读相关术语 | 中 |
| 运行时模型 | `docs/new-rules/运行时模型_v1_5_完整最终版_标题版本已统一.md` | runtime、状态机、运行时对象、route/outcome 边界 | runtime, route, outcome, state | 只读命中小节；优先由 architect 摘要 | 高 |
| 决策流 | `docs/new-rules/决策流_v1_4_完整最终版_标题版本已统一.md` | 决策流程、输入归一、停止、输出资格 | decision flow, gate, stop, output | 只读流程/停止/输出相关小节 | 高 |
| 诊断结论层 | `docs/new-rules/diagnosis_outcome_layer_v1_2_full_final.md` | outcome、结果层、前端可见结论 | outcome, 结论层, final result | 只读 outcome 定义/边界 | 高 |
| 诊断目标分层 | `docs/new-rules/problem_taxonomy_v1_4_full_final.md` | 问题性结论空间、problem taxonomy | problem, taxonomy, 问题性结论 | 只读目标分层小节 | 高 |
| 正向证据门槛 | `docs/new-rules/具体问题结论正向证据门槛规则_v1.md` | 具体问题结论是否允许输出 | positive evidence, 具体问题, 门槛 | 全文或相关问题类型 | 高 |
| 收益驱动停止策略 | `docs/new-rules/收益驱动停止策略_v1.md` | 停止策略、追问收益、必答 gate | stop, follow-up, gate, benefit | 读停止策略相关小节 | 高 |
| 问诊文案治理 | `docs/new-rules/question_copy_data_layer_governance_20260429.md` | 题干、选项、帮助文案数据层治理 | question copy, 文案, option | 全文可读 | 中 |
| 视觉入口数据结构 | `docs/new-rules/ai_visual_entry_data_structure_and_retention_spec_v1_4_full_consolidated.md` | 视觉入口、证据留存、器官识别、产品辅助输入 | visual entry, evidence, retention | 只读证据结构/留存相关小节 | 高 |
| 视觉到运行时挂接 | `docs/new-rules/ai_visual_to_diagnosis_runtime_linkage_example_v1_1_full_reviewed_final_标题版本已统一.md` | 视觉结果如何进入诊断 runtime | visual to runtime, linkage | 读示例流程 | 高 |
| 视觉 prompt 与追问守卫 | `docs/new-rules/视觉prompt与追问关联守卫规则_v1.md` | 多图 prompt、追问承接、候选池收窄 | prompt, follow-up, candidate pool | 全文可读 | 高 |
| 视觉候选追问承接 | `docs/new-rules/视觉候选症状追问承接与兜底确认规则_v1.md` | candidate_retained、observed_evidence、兜底确认 | candidate_retained, question_queue | 全文可读 | 高 |
| 视觉池外候选留痕 | `docs/new-rules/视觉症状池外候选留痕与证据隔离规范_v1.md` | out-of-pool、proxy、证据隔离 | out_of_pool, proxy, evidence isolation | 全文可读 | 高 |
| 高特异性视觉证据 | `docs/new-rules/高特异性视觉证据快速收敛规则_v1_1_review增补修正版_给Codex.md` | 高特异证据、快速收敛、禁止越级直出 | high specificity, fast convergence | 全文可读 | 高 |
| 视觉多图融合 | `docs/new-rules/视觉多图业务融合改造计划_v1.md` | 多图业务融合、视觉链改造 | multi-image, visual fusion | 读目标/改造范围 | 高 |
| 视觉模型适配 | `docs/new-rules/视觉模型适配层与双模型多图融合代码落地审查_v1.md` | 双模型适配、Qwen/HF、聚合层 | adapter, dual model, Qwen, HF | 读已落地能力/审查结论 | 中 |
| HF 标签映射 | `docs/new-rules/HF_AutoTrain真实推理接入与标签映射规范_v1.md` | HF AutoTrain 标签、symptom_key 映射 | HF, AutoTrain, label mapping | 全文可读 | 中 |
| shadow compare | `docs/new-rules/shadow_compare数据留痕与HF灰度接入边界_v1.md` | 主链与对照链、HF 灰度、留痕 | shadow compare, HF, gray | 全文可读 | 中 |
| 症状模式流程 | `docs/new-rules/症状模式分流机制与运行时流程规范_最终完整版.md` | symptom_class、分流、运行时流程 | symptom_class, 分流, runtime | 只读命中小节 | 高 |
| 症状模式 Review | `docs/new-rules/SYMPTOM_CLASS_REVIEW_AND_UPDATE.md` | symptom_class 更新审查 | symptom_class, review | 全文可读 | 中 |
| 症状模式落代码审查 | `docs/new-rules/症状模式落代码前提条件审查结论_v1.md` | symptom_class 落代码前置条件 | 落代码, 前提条件 | 全文可读 | 中 |
| 症状模式数据说明 | `docs/new-rules/症状模式配套数据_final_candidate说明.md` | class_question_group、symptom_class 数据 | final_candidate, class_question_group | 全文可读 | 中 |
| 症状模式 block 收口 | `docs/new-rules/症状模式剩余block收口说明_v3.md` | context_only、primary_class_lock_allowed 收口 | block, context_only | 全文可读 | 中 |
| SQL 制表方案 | `docs/new-rules/最终_SQL_制表方案_v1_3_完整最终版_开发收口版.md` | 当前开发阶段 SQL 基线 | SQL, schema, table | 全文可读 | 高 |
| SQL 草案 v1.1 | `docs/new-rules/第一版_SQL_表结构草案_v1_1_开发收口版.md` | dev SQL 表结构草案 | SQL, table, dev | 只在制表时读 | 高 |
| SQL 字段映射 | `docs/new-rules/Taxonomy_Diagnosis_SQL_字段映射表_v1_1_完整最终版_标题版本已统一.md` | taxonomy / diagnosis 字段映射 | SQL mapping, fields | 只读字段映射表 | 中 |
| 数据映射导入 | `docs/new-rules/第一版_数据映射_导入脚本方案_v1.md` | 导入脚本、素材源映射 | import, mapping, plant_catalog | 只读导入原则 | 中 |
| Taxonomy 定义 | `docs/new-rules/植物_Taxonomy_体系定义_v1_3_完整最终版_开发收口版.md` | Taxonomy 主数据边界 | taxonomy, plant identity | 全文可读 | 中 |
| 植物身份命名 | `docs/new-rules/plant_identity_master_and_name_normalization_rules_v1.md` | canonical identity、alias、命名归一 | plant identity, alias | 全文可读 | 中 |
| Taxonomy 诊断挂接 | `docs/new-rules/taxonomy_diagnosis_linkage_rules_v1.md` | Taxonomy 到 Diagnosis 挂接 | taxonomy diagnosis linkage | 全文可读 | 高 |
| 属级养护基线表 | `docs/new-rules/属级养护基线表设计_v1_1_full_reviewed_final_标题版本已统一.md` | 属级养护基线落表与策略 | genus care profile | 只读定位/字段 | 中 |
| 属级养护联动分析 | `docs/new-rules/属级养护基线概念联动分析与文档增补建议_v1_重新生成版.md` | 属级养护与文档体系联动 | genus baseline linkage | 全文可读 | 中 |
| 属级养护审查报告 | `docs/new-rules/genus_care_profile_review_report.md` | genus_care_profile 数据审查 | genus care review | 全文可读 | 低 |
| parent_class_key 决策 | `docs/new-rules/parent_class_key_schema_decision_v1.md` | parent_class_key schema 是否做 FK | parent_class_key | 全文可读 | 中 |
| 准入退役 | `docs/new-rules/准入与退役规则_v1_3_完整最终版_标题版本已统一.md` | 对象是否进入系统、退役规则 | admission, retirement | 只读对象范围 | 中 |
| 最小知识库 | `docs/new-rules/最小可用知识库_v1_3_完整最终版_标题版本已统一.md` | MVP 知识库范围 | minimal KB, MVP | 只读范围判断 | 中 |
| 流程图说明 | `docs/new-rules/绿植诊断系统完整流程图说明_终极版_中文主导_v1_1_开发收口版.md` | 快速理解整体流程 | flowchart, process | 全文可读 | 低 |
| 批量报告状态 | `docs/new-rules/diagnosis_batch_report_state_labeling_rule_20260429.md` | batch/report/conclusion 中间态标注 | await_follow_up, report | 全文可读 | 中 |
| 视觉池直出例外 | `docs/new-rules/ai_visual_pool直出例外与formal_question_coverage边界_v1.md` | ai_visual_pool 直出例外、formal question coverage | ai_visual_pool, coverage | 全文可读 | 中 |
| 审查报告 | `docs/new-rules/当前全部文档最高规格联动一致性总审查报告.md` | 文档体系联动一致性审查 | 文档一致性, 总审查 | 仅文档审计读 | 低 |

## 6. 文件级补充索引

以下文件通常不作为第一优先级，除非任务明确命中：

| 文档路径 | 适用场景 |
|---|---|
| `docs/new-rules/第一版_SQL_表结构草案_v1.md` | 历史 SQL 草案对比 |
| `docs/new-rules/新增属级养护基线联动后文档体系最高规格一致性总审查报告_重新生成版.md` | 属级养护基线联动后总审查 |
| `docs/new-rules/ai_visual_pool直出例外与formal_question_coverage边界_v1.md` | ai_visual_pool 直出例外 |
| `docs/new-rules/视觉症状池外候选留痕与证据隔离规范_v1.md` | 池外视觉候选留痕 |
| `docs/new-rules/diagnosis_batch_report_state_labeling_rule_20260429.md` | batch/report 状态字段 |
| `docs/new-rules/AI_DIAGNOSIS_MASTER_SPEC_v2.md` | 总规范 |
| `docs/new-rules/AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md` | Codex 极简摘要 |
| `docs/new-rules/开发前阻断问题一次性收口裁决_v1.md` | 开发前阻断问题收口 |
| `docs/new-rules/当前正式基线文档清单_v1_2_修正版.md` | 当前正式基线清单 |

## 7. 与 subagent 的配合

### `architect_reviewer`

1. 先读本索引。
2. 只读命中的 1～2 个规则文件。
3. 高风险任务优先输出规则摘要给 implementer 和 qa。
4. 发现规则冲突时停止并请求 main agent 裁决。

### `implementer_deep`

1. 默认读 architect_reviewer 的实现边界和规则摘要。
2. 只有 Dispatch Plan 指定时才读取具体规则文件。
3. 不得自行全量读取 `docs/new-rules/`。

### `qa_reviewer`

1. 默认读 diff + 验收标准 + 上游规则摘要。
2. 只有需要核对规则原文时才读本索引和命中文档。
3. 不得全量读取 `docs/new-rules/`。

### `docs_keeper`

1. 维护规则文档时可读取目标文件全文。
2. 更新任何规则文件后，应同步本索引。
3. 用户要求完整文档时，不能只输出补丁片段。

## 8. Dispatch Plan 示例

```text
需要读取的规则文件:
- docs/new-rules/INDEX.md
- docs/new-rules/运行时模型_v1_5_完整最终版_标题版本已统一.md：只读 route/outcome/gate 相关小节
- docs/new-rules/diagnosis_outcome_layer_v1_2_full_final.md：只读 outcome 定义和前端可见结果边界
规则摘要:
- 运行时模型文档规定 route/outcome/gate 的运行时分层。
- outcome 层文档规定前端可见结果与运行时中间态不能混用。
- 下游 agent 不重复读取源文档，优先使用本摘要。
```
