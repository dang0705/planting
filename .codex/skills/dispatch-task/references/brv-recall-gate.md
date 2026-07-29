# ByteRover V4 Recall Gate

本文件定义 `dispatch-task` 在任务开始阶段如何查询、核验和下发 ByteRover 项目记忆。它只负责流程，不负责重新定义内容资格；内容资格唯一以 `AGENTS.md` 的 `BRV / ByteRover 内容边界` 为准。

## 1. 执行时机

执行顺序：

```text
Phase 1：解析用户 Prompt、任务事实与目标
Phase 1.5：ByteRover Recall Gate
Phase 2：Agent Assignment / Handoff
```

先明确任务目标、业务对象和预期变更，再生成 Query。不得先进行无边界检索，再用结果反推任务。

## 2. R0 — relevance decision

main 输出：

```text
brv_relevance:
- status: required / not_required / governance_audit
- reason:
- agents_boundary_ref:
- expected_answer:
- query_scope:
```

规则：

1. `required`：本次常规任务需要召回的知识已被 AGENTS 判定为允许查询。
2. `not_required`：AGENTS 判定不具备常规召回资格；不得为了 telemetry、流程完整性或“多一点上下文”调用 ByteRover。
3. `governance_audit`：任务本身是 ByteRover 审计、迁移、纠错、合并或清理。此时允许 List / Read / Query 全部已有 Topic，以识别错误、越界、过期或重复内容；被读取内容不得因此作为当前事实或取得继续保留资格。
4. `reason` 必须说明任务需要获得的具体答案，并引用 AGENTS 的资格裁决；泛化的“需要上下文”不是充分理由。
5. 本文件不得维护自己的允许/禁止知识清单。

## 3. R1 — Skill、项目目录和 Space

当 `status=required|governance_audit` 时，确认：

```text
brv_runtime:
- skill_detected:
- skill_version:
- project_root:
- space_bound:
- space_name:
- access_mode: read_write / read_only / unavailable
- binding_verified:
- auth_status:
- sync_capability: local_only / sync_available / sync_blocked
```

规则：

1. 读取当前安装的 ByteRover V4 Skill；具体脚本、参数和返回字段以该 Skill 为准。
2. 从当前项目根目录或子目录执行，使 resolver 解析正确 Space。
3. 首次使用、目录切换、绑定不确定或命中明显来自其他项目时，先检查当前 Space。
4. `space_mismatch` 必须停止该 Space 的所有 ByteRover 操作。
5. read-only 允许 Query / Read，不允许写操作。
6. 认证不是所有本地命令的通用前置条件；按当前 Skill 区分本地能力与同步/远端能力。不得把未认证自动等同于无法 Query。
7. 不得直接编辑或读取内部存储来绕过 resolver、Space 或权限。

## 4. R2 — 最小自然语言 Query

Query 应询问经 AGENTS 判定允许召回、且本任务实际需要的具体答案，而不是堆积关键词或充当代码搜索器。

```text
brv_query_plan:
- primary_query:
- follow_up_condition:
- max_follow_ups: 1
- expected_answer:
```

- 默认执行一轮聚焦 Query；首轮过宽或命中不足时允许一次更精确的 follow-up。
- 不机械固定执行中文、英文和代码标识三轮重复查询。
- 保存实际 Query 文本与命中 Topic path。
- `governance_audit` 可以结合 List / Read 覆盖未被 Query 命中的 Topic。

## 5. R3 — hits、引用与深读

至少检查当前 Skill 返回的命中、摘要和引用状态：

1. hit 是排序候选，不是完整事实。
2. 摘要不足以支撑判断时读取完整 Topic；涉及 round-trip 或结构治理时使用当前 Skill 支持的 raw read。
3. 多个 Topic 冲突时不得按排名自动裁决，必须回当前事实源。
4. 引用行为遵循当前 Skill 返回的 `should_cite` / `citation_block`，不得伪造。
5. 对 AGENTS 判定不得作为当前事实使用的 Topic，只能按治理线索处理，不得进入当前实现约束。

## 6. R4 — 当前事实源核验

事实优先级、允许作为当前事实的来源及冲突处理，直接执行 `AGENTS.md` 的知识治理边界，不在本文件重复定义。

召回结果分为：

```text
memory_constraints
historical_context
memory_leads
memory_conflicts
source_verified_facts
unverified_claims
governance_findings
```

只有经过当前事实源验证、且符合 AGENTS 内容资格的内容，才能进入 Implementation Contract 的约束区。治理审计中发现的越界 Topic 必须进入 `governance_findings`，不能进入 `memory_constraints`。

## 7. R5 — Recall Packet

```text
brv_recall_packet:
- status:
- runtime:
- queries:
- hits:
- citations:
- memory_constraints:
- historical_context:
- memory_leads:
- memory_conflicts:
- source_verified_facts:
- unverified_claims:
- governance_findings:
- risk_flags:
- blockers:
- fallback:
```

状态建议：

```text
not_required
governance_audit
queried_hit
queried_miss
read_only
skill_unavailable
space_unbound
space_mismatch
query_failed
source_conflict
completed
```

Query miss 不自动阻塞普通代码任务；只有任务的核心验收明确依赖 ByteRover 召回且该能力不可用时，才按实际影响报告 blocker。

## 8. R6 — 最小上下文下发

main 只下发与子任务直接相关、已经核验的约束和必要历史背景：

```text
byterover_context:
- space:
- query:
- relevant_topic_paths:
- verified_constraints:
- historical_context:
- conflicts_or_uncertainty:
- source_refs:
- prohibited_assumptions:
```

不得广播完整 Query JSON、无关 Topic、敏感认证信息、内部存储路径或未核验 claim。

## 9. 子 Agent 查询

subagent 默认不自行 Query。只有 handoff 明确提供以下字段时才允许：

```text
child_brv_allowed: true
child_brv_space:
child_brv_query:
child_brv_reason:
child_brv_scope:
```

child 不得扩大 scope，也不得执行写操作；main 已提供充分上下文时不得重复查询。

## 10. 不可用与降级

降级来源与事实优先级直接遵守 AGENTS，不在本文件重列来源清单。

- 不得把降级源伪称为 ByteRover 命中。
- `space_mismatch` 阻塞所有 ByteRover 操作。
- read-only 不阻塞召回，但可能在 Gate D1 形成写入 blocker。
- 不得恢复 V3 swarm、manifest-scoped recall、BM25 search 或直接 `.brv` 读取作为 fallback。

## 11. 完成条件

只有以下条件满足时，Recall Gate 才可标记 `completed`：

- relevance decision 已按 AGENTS 完成；
- 当前 Skill、项目目录和 Space 已确认；
- Query 聚焦于明确的长期项目答案；
- 相关 Topic 已按需深读；
- 关键 claim 已回当前事实源核验；
- 冲突、未核验内容及治理发现已显式分类；
- 下发内容是最小 verified context；
- 引用行为符合当前 Skill；
- 未使用本文件重新解释或绕过 AGENTS 内容边界。
