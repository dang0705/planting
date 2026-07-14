# ByteRover V4 Record Governance

本文件仅在 `brv_memory_impact=true` 或 ByteRover 专项治理任务中读取，用于约束 Record plan、执行所有权、治理操作和验收。

`AGENTS.md` 的 `BRV / ByteRover 内容边界` 是内容资格的唯一裁决来源。本文件不得重新列举、扩大或缩小允许/禁止知识类型；具体命令、Topic Schema、Vocabulary、元素和枚举以当前安装的 ByteRover V4 Skill 为准。

## 1. 适用前提

main 必须先完成：

```text
content_eligibility:
- eligible: true / false
- agents_boundary_ref:
- verification_basis:
- durability_reason:
- future_recall_risk:
```

规则：

1. `eligible` 只能依据 AGENTS 裁决；本文件中的 workflow、示例或 Topic 能力不得成为放宽依据。
2. `eligible=false` 时必须 `no_record`；治理任务中如涉及既有 Topic，只记录治理发现与建议操作，不得据此自动更新、保留或删除。
3. 候选来自代码或行为变更时，必须在实现、main review 和所需 QA 完成后 Record。
4. 候选不来自代码实现、但已由 AGENTS 判定具有记录资格时，不要求存在代码变更；仍必须完成来源、范围和冲突核验。
5. “能否从源码定位”不得在本文件中作为独立的允许或禁止条件；是否可记录完全由 AGENTS 裁决。

## 2. V4 职责分层

```text
用户 Prompt：表达查询、记录、更新或治理意图
Agent：判断内容资格、处理冲突、设计 Topic 与 record plan
ByteRover Skill：提供当前操作协议和 Vocabulary
确定性脚本：校验、持久化和治理
Space：项目、权限、共享与同步边界
```

禁止把确定性脚本当作自动语义判断器。

## 3. 运行环境

Record 前确认：

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

- 从当前项目根目录或子目录执行。
- Space 未绑定、错误或无写权限时不得写入，也不得切换到其他可写 Space 规避。
- 认证不是所有本地写入的通用前置条件；是否需要认证由当前 Skill 与本次同步/远端验收决定。
- 不得直接编辑 `.brv`、context tree、Desktop 数据库、缓存、manifest、index、sidecar 或任何推测的内部存储。
- Skill 或 Vocabulary 无法确认时不得凭记忆拼接结构。

## 4. memory candidate 与 record plan

候选格式：

```text
memory_candidate:
- candidate_type:
- durable_claim:
- eligibility_basis:
- why_future_agent_needs_it:
- source_refs:
- uncertainty:
- suggested_recall_terms:
```

main 批准：

```text
record_plan:
- operation: create / update / link / move / merge / synthesize / prune_candidate / no_record
- topic_path:
- title:
- summary:
- reason:
- task:
- form: simple / rich
- content_outline:
- facts:
- files:
- keywords:
- tags:
- related:
- source_verification:
- validation_queries:
- destructive_change:
- destructive_approval:
```

要求：

- `eligibility_basis` 必须引用 AGENTS 内容边界，不得在本文件自造知识类别。
- 候选与已执行操作分开记录。
- path、结构、facts、related、disclosure 等按当前 Skill/Vocabulary 生成。
- `files` 字段只用于记录来源证据；其内容资格仍由 AGENTS 裁决。
- 核心 claim 必须逐项列出当前来源与不确定性。
- 任何超出获批 plan 的内容都必须退回 main 重新批准。

## 5. Topic 编写

本文件不复制 ByteRover Vocabulary。`record_owner` 必须读取当前安装的 Skill，并完成以下项目级检查：

1. Topic path 稳定且语义单一；优先更新已有 canonical Topic。
2. 人类可读内容使用项目要求的语言，机器字段保持 Skill 规定的格式。
3. 不手写引擎维护字段。
4. 内容可独立理解，并与获批 `record_plan` 的语义和范围一致。
5. 离散事实、决策、流程、规则、文件证据使用与当前 Vocabulary 匹配的结构，而不是全部扁平塞入单一事实元素。
6. Topic 全部内容再次通过 AGENTS 内容资格检查；结构合法不代表内容合法。

## 6. 安全与 disclosure

- 具体 disclosure、visibility 与 public-by-contract 行为以当前 Skill/Vocabulary 为准。
- disclosure、visibility 或其他共享设置不得改变 AGENTS 已作出的内容资格裁决。
- `record_plan` 必须显式检查 title、summary、prose、facts 和 metadata 的披露风险。
- 无法确定安全边界时，不写入并报告 blocker。

## 7. 写入前查重与源 Topic 阅读

1. Query 检查是否已有 canonical Topic；治理审计还应结合 List / Read。
2. update、move、merge、link、synthesize 或 prune 前读取完整源 Topic；需要 round-trip 时使用 raw read。
3. 检查 related 目标、stale/superseded 状态、冲突事实和近义重复。
4. 已有 canonical Topic 优先 update；只需关系变更时使用 link；路径不合理使用 move；真正重复才 merge；需要新上位概念时才 synthesize。
5. snippet 不足时 Read，不凭摘要覆写。

## 8. 治理操作

具体能力和参数以当前 Skill 为准。项目流程要求：

- **Record / Update**：执行后 readback 与 Query 验收。
- **Link**：确认目标存在并验证关系结果。
- **Move**：确认旧/新路径、引用影响与 canonical 入口。
- **Merge**：先裁决冲突并保留全部仍有效的独有内容。
- **Synthesize**：必须可追溯到源 Topic 和当前事实源，不得自由总结。
- **Dream**：只产生候选，不得写成已执行结果。
- **Prune / Delete**：必须用户明确批准。
- **可能不可逆吸收或移除独有内容的 Merge / Synthesize**：按破坏性操作申请用户批准。

无损 Move、Link 或保留全部有效内容的治理，由 main 在批准的 plan 内执行；如果当前 Skill 将具体操作标记为破坏性，则以更严格门禁为准。

## 9. 批量 Record

- batch 只减少执行开销，不降低逐项语义审核。
- 检查每项 succeeded / failed；部分成功不得标记整体 completed。
- 失败项逐条修正、重试或报告 blocker。
- 批量后按计划 readback，并运行代表性 Query。

## 10. 执行所有权

1. 实现者、探索者、用户或 main 可以提出候选。
2. main 负责内容资格裁决、冲突处理、批准 plan、指定 `record_owner` 及申请破坏性批准。
3. `record_owner` 必须理解获批语义、处于正确项目目录、读取当前 Skill 并具备目标 Space 权限。
4. main 可以做结构检查、重复/related 治理、readback、Query 验收与 docs/BRV 对账；不得创造事实、扩大 plan 或自行解释 AGENTS 边界。
5. main 是默认 `record_owner`；不得为角色形式把明确语义转交给不掌握上下文的 Agent。

## 11. Record Acceptance

### 11.1 执行结果

- 操作返回成功；batch 无未处理失败项。
- Space、Topic path 和实际操作与 plan 一致。
- 没有写入错误 Space，也没有越过获批 scope。

### 11.2 Readback

使用当前 Skill 读取完整 Topic，检查：

- Topic 结构通过当前 Skill/Vocabulary 校验；
- 内容与获批 plan 和当前事实源一致；
- related 与来源证据有效；
- 未手写引擎字段；
- disclosure 符合意图；
- 全部内容仍符合 AGENTS 内容边界。

### 11.3 Query

按 `validation_queries` 验证：

- canonical Topic 能回答预期长期项目问题；
- stale、错误或重复 Topic 不污染答案；
- 引用行为符合当前 Skill；
- 不依赖 V3 BM25、abstract、overview 或 manifest 语义。

### 11.4 当前事实源复核

最终关键 claim 继续按 AGENTS 知识治理边界回当前事实源验证。本文件不重列事实源优先级。

## 12. 状态与 Completion Receipt

```text
not_required
planned
recorded
governed
read_only
skill_unavailable
space_unbound
space_mismatch
partial_failure
validation_failed
awaiting_destructive_approval
sync_blocked
blocked
completed
```

至少记录：

```text
docs_impact:
docs_status:
brv_memory_impact:
brv_status:
brv_skill_version:
brv_space:
brv_space_access:
brv_binding_verified:
brv_record_owner:
brv_record_operations:
brv_topics_changed:
brv_batch_failures:
brv_readback_verified:
brv_validation_queries:
brv_query_hits:
brv_citations_used:
brv_related_verified:
brv_sync_status:
brv_destructive_approval:
brv_blockers:
```

`brv_topics_changed` 只列实际完成的操作，候选不得混入。

## 13. Blocker

以下情况不得标记 `completed`：

- AGENTS 内容资格尚未得到明确裁决，或候选不符合其裁决结果；
- Skill 不可用、版本/Vocabulary 无法确认；
- Space 未绑定、错误或无所需权限；
- record/batch 部分失败；
- readback、related、Query 或当前事实源复核失败；
- 新旧事实冲突未裁决；
- disclosure 风险无法确认；
- 所需破坏性批准未取得；
- 本次任务明确要求同步/远端验收，而认证或同步状态不满足；
- 实际写入超出获批 `record_plan`。
