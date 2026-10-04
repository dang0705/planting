# 诊断知识发布控制 P2 合同草案

- **状态：** P2 整体仍未冻结；主代理已接受最小状态转换方向，但上位 P1 合同措辞与 011 迁移尚未批准、实现或验收。本文件不是已冻结合同，也没有对应的 RED/GREEN 证据。
- **计划入口：** `docs/backend-v2/README.md` → `BASELINE.lock` → `phases/P2-core-domains.md`。当前唯一完整计划源仍是根目录 Master Plan。
- **范围：** 仅规定诊断知识审核撤销、活动包回滚/禁用和历史回放的边界，以及供未来实现使用的 Schema/事务门。不得由本文件直接修改 P1 锁定合同、009/010 DDL、CloudBase/CMS 或产品实现。
- **依赖：** [诊断知识持久化合同](diagnosis-knowledge-persistence.md)、[CMS 人工审核交换合同](diagnosis-cms-review-exchange.md)、009/010 现有表结构。

## 1. 已有硬锁与必须协调的上位 P1 语句

Master Plan 要求诊断发布包不可变，含来源、适用性、禁忌、兼容版本及 SHA-256；持久化合同要求审核撤销不可变、发布和撤销不能竞态、回滚只指向同范围仍有效的旧包、历史结果固定原 release。以下 P1 原句尚未覆盖新的“当前批准正被活动包使用时，撤销必须失败”及“无安全回退时保留指针行但禁用”的表达。P1 文件当前仍锁定；这里仅列出未来须经主代理批准的最小改词，不在本轮改写。

| P1 文件与现句 | 建议替换文本 | 需要协调的原因 |
|---|---|---|
| `contracts/diagnosis-cms-review-exchange.md:33`：“撤销后不得凭该批准创建新发布；已在线发布包如何退出服务由单独的发布撤回合同确定，不能在审核请求中暗改活动指针。” | “撤销后不得凭该批准创建新发布；若该批准正被同范围当前活动 release 使用，审核撤销必须失败且不写撤销事实，调用方须先通过独立授权的 rollback 或 disable 命令移走该活动 release，再重试撤销。审核撤销命令本身不修改 release 或活动指针。” | 把先解除活动引用、再追加撤销的顺序写清；不让审核命令隐式改指针。 |
| `contracts/diagnosis-knowledge-persistence.md:24`：“每个包范围至多一个活动指针；切换只能指向同范围、已审核、未撤回的完整发布。” | “每个包范围至多保留一条活动指针行；启用时该行必须指向同范围、完整且其批准未撤销的 release，禁用时该行的 `release_internal_id` 为 `NULL` 且其 CAS 版本仍有效。禁用状态拒绝新的诊断知识选择，不影响使用固定 `releaseRef` 的历史回放。” | 当前句只允许指向 release，无法表达仍保留 CAS 版本的显式禁用状态。 |
| `contracts/diagnosis-knowledge-persistence.md:25`：“动作（激活/回滚）”及“新版本” | “动作（激活/回滚/禁用）；禁用审计的 `new_release_internal_id` 为 `NULL`，`previous_release_internal_id` 指向被停用包；激活与回滚的 `new_release_internal_id` 必须非空。” | 审计需要区分安全旧版回滚与无目标禁用，并使空目标可审计。 |
| `contracts/diagnosis-knowledge-persistence.md:54`：“撤回知识用新发布及指针切换表达。历史结果保存当时的 release 引用与摘要，回放使用当时的不可变包；对已知危险内容可停止继续展示，但不得静默改写当时记录。” | “常规内容更正须创建新的完整 release 并按预期指针版本切换；需要移走当前活动包时，存在同范围且符合既有回滚资格的安全旧 release，就按既有 rollback 原子切换；无安全回退时，须用独立受权 disable 命令将指针行的 `release_internal_id` 置空。上述操作均不改写 release 包体或摘要；历史结果按固定 `releaseRef` 回放，不依赖当前活动指针。” | 保留普通更正的“新 release”语义，使用既有回滚处理安全回退，并补齐无安全回退例外。 |

这些替换句之间仍须按 Master Plan 的冲突门复核，尤其“撤回知识”与“撤出一个活动包”的业务术语是否一致。未批准前，不能把本文件当作对 P1 的自动补充。

## 2. 发布状态转换

| 操作 | 前置条件 | 原子结果 | 不变量 |
|---|---|---|---|
| `review revoke` | 目标为已批准审核；读取该候选 bundle 当前活动指针及 release | 若当前活动 release 的审核引用等于目标审核，拒绝且不写撤销行；否则只追加撤销事实 | 撤销命令不改 release 或活动指针；已成功撤销的审核不得再创建新 release |
| `rollback` | 当前 bundle 有活动 release；目标为同范围、较早且满足既有回滚资格的 release；CAS 版本相等 | 在一个事务中切换现有指针至目标、版本加一、追加 `rollback` 审计 | 不创建新 release；不改任何历史 package 内容或摘要 |
| 常规内容更正 | 新候选、审核及发布准入均有效；CAS 版本相等 | 按已冻结发布合同插入新 release、切换指针、追加发布审计 | 不以 rollback 冒充内容更正；历史 release 保留 |
| `disable` | 受权操作者；当前指针行存在、`release_internal_id` 非空、CAS 版本相等；没有符合既有规则的安全回退目标 | 一个事务内：旧活动 release 的 `release_state` 置为 `withdrawn`；指针行保留且 `release_internal_id = NULL`、`version = version + 1`；追加 `action_kind = 'disable'` 且 `new_release_internal_id = NULL` 的审计 | package 身份、候选/审核引用、版本、`package_json`、`package_sha256` 不变；失败时全部回滚 |

若存在至少一个符合既有 rollback 资格的同范围旧 release，disable 命令必须失败关闭并要求走 rollback；它不能代替操作者选择安全版本。对相同 `commandRef`、命令字段及受控操作者摘要，禁用重放返回原审计结果、不再次递增版本；同 `commandRef` 异 bundle、异预期版本、异理由或异操作者摘要返回冲突。已禁用指针不能被新的禁用命令再次递增；只能用后续合格发布命令重新启用。服务端从已验证的操作者上下文派生 `operator_ref_hash`，请求体不得自报操作者或内部主键。

### 新诊断与历史回放

- 新诊断只能从该 bundle 的启用指针选择完整 release。无指针行或 `release_internal_id IS NULL` 均失败关闭；不能回退到“最新 release”、其他 bundle、CMS 草稿或模型生成内容。
- 历史结果已经保存固定 `releaseRef` 和摘要时，回放直接解析那一不可变 release，不依赖活动指针；即使它当前为 `withdrawn`，其包体及摘要仍可读取用于历史回放。
- disable 不创建空内容 release，不删除旧 release，不覆盖历史结果。
- 读取当前活动包必须同时确认 `release_internal_id IS NOT NULL` 且所指 release 的 `release_state = 'published'`；不能把指针行存在或 `activated_at_ms` 非空当成当前可服务证明。

## 3. P2 控制命令结构 Schema 草案

建议独立 `diagnosis-knowledge-release-disable.v1.schema.json`，只检查请求形状，不检查权限、当前状态或事务条件：

| 字段 | 类型 / 约束草案 | 说明 |
|---|---|---|
| `protocolVersion` | 固定版本字符串，具体字面值待接口命名裁决 | 未知版本拒绝；不得从 CMS review 协议推断。 |
| `commandRef` | 非空字符串，长度不超过审计列允许范围 | 禁用命令幂等引用。 |
| `bundleCode` | 非空稳定代码，长度不超过 DDL 范围 | 受影响兼容包范围。 |
| `expectedPointerVersion` | JSON 整数，`0..4294967295` | 必须与当前指针版本完全相等；溢出时拒绝且无副作用。是否规定首版起始值不在此 Schema 自行冻结。 |
| `reasonZh` | 非空中文理由，最大长度不超过 500 | 审计理由。 |

Schema 使用 `additionalProperties: false`。禁止请求包含 `operatorRef`、`operator_ref_hash`、任何内部 ID、`releaseInternalId`、`releaseState` 或 `newReleaseRef`；这些由受控服务端解析或由事务决定。Schema 通过不证明操作者获权、存在活动包、安全回退缺失、版本 CAS 成功或 MySQL 原子提交。

具体 `protocolVersion` 字符串和公开冲突/失败码必须在 API 合同冻结时定值；此草案不制造接口路由或成功响应字段。

## 4. P2 DDL 与 Repository 事务门

不修改 P1 已锁定 `009_diagnosis_knowledge.sql` / `010_diagnosis_review_revocations.sql`。若通过审批，建议新增按 manifest 顺序排列的 `011_diagnosis_release_disable.sql`；它必须只增量表达禁用状态，不重写 P1 文件或其摘要。

011 的最小结构需求：

1. `active_diagnosis_knowledge_releases.release_internal_id` 改为可空；唯一 bundle 指针行与 `version` 保留。`NULL` 是明确禁用状态，而非缺数据；禁用 CAS 成功后版本严格加一。
2. `diagnosis_release_activation_audit.new_release_internal_id` 改为可空，`action_kind` 加 `disable`；一致性约束要求：disable 时 `new_release_internal_id IS NULL` 且 `previous_release_internal_id IS NOT NULL`；activate/rollback 时新 release 非空。
3. `disable` 更新前必须确认当前 `release_internal_id` 与 `expectedPointerVersion`；`release_state` 仅允许从 `published` 到 `withdrawn`，不得回写 package 字段、摘要或重新发布已撤回行。
4. 保持 009 的 `activated_at_ms` 原义：它只记录最近一次成功激活时间，disable 时不更新；disable 发生时间以同事务 `diagnosis_release_activation_audit.created_at_ms` 为准。011 不新增或重命名时间列。
5. 011 要纳入 `docs/backend-v2/schema/manifest.json` 且顺序在 010 后；重放全量空库时验证迁移顺序、列/检查/外键和统一列注释。不得改写 009/010 的原文件或基线摘要。

Repository 的单事务责任：验证操作者权限；锁定并重读当前状态；执行预期版本比较；将当前 release 标记 withdrawn；CAS 更新指针为 NULL 并将版本加一，但不改变该行 `activated_at_ms`；追加含操作者摘要、bundle、旧 release、预期版本、理由、命令引用的 disable 审计，以 `created_at_ms` 记录禁用时刻。任一步失败全部回滚；提交结果不明时按既有合同用新连接按幂等引用只读对账，不盲目重试。

来源主张快照沿用独立发布包草案的引用闭合边界：快照只按 `(sourceCode, claimCode, revisionNo)` 精确三元组去重；多个 `claimLink` 可以复用这一快照，不得把链接行重复误判为快照重复。

审核撤销、发布和 rollback/disable 必须串行化并在获得事务锁后再次检查当前审核/指针关系，确保不存在“目标批准已撤销但其 release 仍被启用指针服务”的已提交状态。具体数据库锁序应由 Repository 实现确定并用双连接测试证明，不在本草案冻结具体锁表或隔离级别。
