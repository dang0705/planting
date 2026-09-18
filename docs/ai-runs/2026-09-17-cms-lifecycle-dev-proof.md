# CMS 生命周期分类与 `is_active` 方案复核：最小验证

日期：2026-09-17  
环境：`cloud1-2grufevs395a9d5e` / schema `cloud1_dev`  
目标表：`question_option_mapping_v5_real`  
执行边界：先增加 CMS 管理分类字段完成无业务影响的观察；本记录同时复核原定的 `is_active` 停用方案，但截至本记录末尾未写入 `is_active`。

## 原定方案复核结论

用户原定方案是：收集当前固定题包运行时实际消费的映射，保留这些记录；其余记录通过 `is_active` 进入停用/废弃范围。此前新增的 `cms_lifecycle` 仅是本轮为了在不改变运行时行为的前提下标记 `current_package` 与 `legacy_compat` 的辅助分类字段，不能替换 `is_active`，也不能被当作原定方案已经执行。

当前复核确认：

- `question-repository.js` 读取映射时按 `data_status` 与 `review_status` 审核过滤，没有直接使用 `is_active`。
- 只读查询显示 `cloud1_dev` 中满足这两个审核条件的映射共有 252 条；此前确认的当前固定题包是其中 4 条，不能把“当前固定题包 4 条”直接等同于“全库只有 4 条运行时可读记录”。
- `src/data-system/diff/diff-engine.js` 会在存在该列时过滤 `is_active=0` 的行。
- 发布与回滚引擎会把 `is_active` 当作删除/恢复的软状态处理。
- 因此，把全部 `legacy_compat` 行设为 `is_active=0` 仍属于可能影响同步、发布和回滚行为的业务变更；当前数据中正式表有 416 条 `legacy_compat` 且仍为启用，尚未执行停用。

## 本轮集中只读审计

本轮已一次完成并行只读检查：模型 schema、开发/正式物理表 schema、生命周期与启用状态分布、审核可读范围、当前固定题包行、按问题键的可读分布，以及全部 416 条待评估启用候选的原始值快照。原始快照保存在 [is-active-readonly-audit.json](./2026-09-17-is-active-readonly-audit.json)；`mutation_performed=false`，可用于后续逐行回退核对。

消费者链路也已补齐到源码：`static-question-package-start.js` 和 `manual-symptom-question-start-fast-path.js` 会通过 `diagnosis-question-registry.js` 加载已注册的浇水题；`diagnosis-answer-runner.js` 与 `diagnosis-engine.js` 在没有完整会话快照时仍会调用选项映射仓储。因此，不能只依据 CMS 标签把其余行判定为“完全未消费”。

另对源码中出现的题包问题键做了只读交叉查询：浇水题的 4 条映射确认为当前固定题包行；施肥背景和光照背景各有 4 条审核且启用的历史映射，但当前固定题包的选项由代码定义。它们是否仍被旧的无快照路径消费，需要在停用前单独验证。交叉查询原始结果见 [is-active-source-package-overlap.json](./2026-09-17-is-active-source-package-overlap.json)。

### 正式表字段漂移阻断

正式 schema 的物理表存在多列带 `-drop-1789656713` 后缀的字段，例如 `data_status-drop-1789656713`、`review_status-drop-1789656713`、`updated_at-drop-1789656713`；开发 schema 仍使用标准字段名。正式表样例行显示这些后缀列仍保存原值，但标准 `data_status` / `review_status` 列不存在。由于运行时代码查询标准字段名，在该映射关系澄清前，不能把正式表当作与开发库等价的运行时目标，也不能进行 `is_active` canary。完整只读证据见 [formal-schema-drift-readonly.json](./2026-09-17-formal-schema-drift-readonly.json)。

`cloudfunctions/diagnose-http/db/schema-resolver.js` 明确把 production 映射到正式 schema、development 映射到 `cloud1_dev`。对同一条 `question-repository.js` 查询合同做双库只读试跑：开发库成功返回；正式库因缺少标准 `option_text_user_cn`（以及同类标准字段）失败。该结果把当前状态定为 **BLOCKED_ENV：先修复或确认正式字段映射，暂不执行 `is_active` 写入**。

索引只读核对也显示，正式库的 `idx_qom_status` 已指向 `data_status-drop-1789656713`，开发库则指向标准 `data_status`。因此不能直接通过改 `is_active` 绕过字段漂移；下一步应先对齐正式表字段与运行时代码的映射，并保留这些后缀列中的原值。

## 基线（变更前）

| 指标 | 值 |
| --- | ---: |
| 总行数 | 436 |
| 当前固定题包命中行数 | 4 |
| `data_status='audited' AND review_status='audited'` | 252 |
| `is_active=1` | 420 |
| 原业务列 CRC32 总和 | 967762591916 |
| 原业务列 CRC32 异或 | 1886790964 |
| 运行时字段 SHA-256 | `0ce32c58a8f2a45149b1b9631eb92e3b5ccc80fd551a8adba5c287ea781d5f19` |

## MCP 执行记录

### 1. 增加可空分类列

```sql
ALTER TABLE `cloud1_dev`.`question_option_mapping_v5_real`
ADD COLUMN `cms_lifecycle` VARCHAR(32)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
COMMENT '仅供CMS管理分类，不参与运行时筛选'
AFTER `review_status`
```

MCP：`manageMysqlDatabase(action="runStatement")`  
结果：`success=true`，`statementType=ALTER`。

读回：`cms_lifecycle` 为 `varchar(32)`、可空、无默认值；原有业务列未改变。

### 2. 标记当前固定题包

```sql
UPDATE `cloud1_dev`.`question_option_mapping_v5_real`
SET `cms_lifecycle`='current_package'
WHERE `question_key`='q_observed_probe__leaf_yellowing__watering_frequency_context'
  AND `data_status`='audited'
  AND `review_status`='audited'
  AND (`cms_lifecycle` IS NULL OR `cms_lifecycle`<>'current_package')
```

结果：`rowsAffected=4`。

### 3. 标记其余开发库记录

```sql
UPDATE `cloud1_dev`.`question_option_mapping_v5_real`
SET `cms_lifecycle`='legacy_compat'
WHERE `cms_lifecycle` IS NULL
```

结果：`rowsAffected=432`。

## 变更后读回

| 分类 | 行数 |
| --- | ---: |
| `current_package` | 4 |
| `legacy_compat` | 432 |
| 空值 | 0 |

业务行为不变量复核：

| 指标 | 变更前 | 变更后 |
| --- | ---: | ---: |
| 总行数 | 436 | 436 |
| 运行时可读行数 | 252 | 252 |
| 启用行数 | 420 | 420 |
| 原业务列 CRC32 总和 | 967762591916 | 967762591916 |
| 原业务列 CRC32 异或 | 1886790964 | 1886790964 |
| 运行时字段 SHA-256 | `0ce32c58a8f2a45149b1b9631eb92e3b5ccc80fd551a8adba5c287ea781d5f19` | `0ce32c58a8f2a45149b1b9631eb92e3b5ccc80fd551a8adba5c287ea781d5f19` |

正式 schema 读回仍为 429 行、运行时可读 256 行、启用 420 行；本次没有写入正式表。

## 回退

优先回退分类值，保留列以避免再次触发表结构发布：

```sql
UPDATE `cloud1_dev`.`question_option_mapping_v5_real`
SET `cms_lifecycle`=NULL
WHERE `cms_lifecycle` IN ('current_package','legacy_compat')
```

只有在另行批准并完成模型验证后，才考虑 `DROP COLUMN`；本验证没有执行该操作。

## 正式表分类准备

正式 schema `cloud1-2grufevs395a9d5e` 已执行同构变更与分类：

- `ALTER`：`success=true`、`statementType=ALTER`
- 当前题包分类：`rowsAffected=4`
- 其余记录分类：`rowsAffected=425`

正式表读回结果：`current_package=4`、`legacy_compat=425`、空值 `0`；总行数 `429`；运行时可读行数 `256`；启用行数 `420`；原业务列 CRC32 异或为 `3958667979`，与正式表分类前的读回值一致。

## 模型映射与 CMS 页面读回

通过 CloudBase 控制台的数据模型配置，为正式模型增加了 `cms_lifecycle` 字段映射：

- 字段名称：生命周期分类
- 字段标识：`cms_lifecycle`
- 类型：文本 / 单行文本
- 长度上限：32 字节
- 是否必填：否
- 是否唯一：否
- 是否主展示列：否
- 描述：仅供CMS管理分类，不参与运行时筛选

保存后，`manageDataModel(action="get", name="question_option_mapping_v5_real")` 读回 `totalFields=17`、`userFieldsCount=9`，并返回上述字段。CMS 页面刷新后显示“生命周期分类 cms_lifecycle”列，真实数据行能够读回 `legacy_compat` 值；本次没有改动权限、主展示列、运行时状态字段或其他业务字段。

字段缓存更新期间控制台曾提示通过 SDK 读取新增字段可能短暂不可用；等待缓存完成后，CMS 页面读回正常。分类值的回退仍为将 `cms_lifecycle` 设为 `NULL`，不删除物理列、不删除模型、不重建表。

## 安全下一步：只读消费核对

未修改 `is_active`。对正式表执行只读查询后确认：

- 总行数：429
- `current_package`：4
- `legacy_compat`：425
- `is_active=1`：420

4 条当前固定题包记录均属于同一个已确认的固定题包，且全部保持启用；其选项为 `normal_or_stable`、`often_dry`、`often_wet`、`unknown`。该查询没有写入、删除或更新任何数据。

CMS 表格已能显示分类字段及真实值。当前筛选下拉仍只加载部分旧字段，尚未出现新增分类字段，因此不把“按分类筛选”记为已验收；这属于 CMS 筛选控件缓存/能力待确认，不影响本次只读核对，也没有触发任何业务状态变更。

## `is_active` 变更前的只读安全审计

在考虑任何 `is_active` 写入前，已并行完成模型、物理 schema、分布、当前题包和空值检查：

- 模型读回成功：`totalFields=17`、`userFieldsCount=9`；分类字段为可空文本，长度 32。
- 物理列读回：`cms_lifecycle` 为 `varchar(32)`、可空；`is_active` 为 `tinyint`、可空。
- 分类分布：当前题包 4 条且全部启用；历史兼容 425 条，其中 416 条启用、9 条停用；无空分类、无未知分类。
- 当前固定题包 4 个选项全部读回，分别为 `normal_or_stable`、`often_dry`、`often_wet`、`unknown`，且 `is_active=1`。
- 若将历史兼容整组设为停用，预计会影响 416 条当前启用记录；该影响尚未执行。

源码核对显示，当前问答选项映射读取路径在 `cloudfunctions/diagnose-http/repositories/question-repository.js` 中按 `data_status` 与 `review_status` 做审核过滤，没有发现把 `is_active` 作为映射读取条件的路径。因此 `is_active` 不能直接假定为“废弃开关”；在继续前必须完成全量消费者追踪，并先定义仅针对确认未消费记录的可回退小批量方案。

## 本轮正式表修复与 `is_active` 单行回退验证（2026-09-17）

本轮先修复正式表字段漂移，再进行单行试写。正式表原有 18 个 `*-drop-1789656713` 列均与标准字段同类型，执行一次可反向 `ALTER TABLE ... CHANGE COLUMN` 恢复标准列名；未改行值、主键、业务键或模型结构。

MCP 读回结果：

- 标准字段全部恢复：`canonical_columns_present=18`。
- 正式库运行时查询成功，返回 `q_anthracnose_concentric / no`，包含 `option_text_user_cn`、`answer_effect_cn`、`data_status`、`review_status`。
- `idx_qom_status` 已指向 `data_status`；主键、业务键唯一索引、CloudBase `_id` 索引仍存在。
- 行数保持 `429`，`id` 与 `_id` 均为 `429` 个不同值。

随后对正式库 `id=4` 做条件单行试写：

- 候选：`q_spider_red_dots_visible / yes`，`legacy_compat`，`data_status=audited`，`review_status=pending`。
- `is_active`：`1 → 0`，MCP 返回 `rowsAffected=1`，读回成功。
- 运行时资格查询返回 `candidate_runtime_eligible=0`；当前固定题包 4 条仍全部 `is_active=1`。
- 按原始 `row_hash` 条件回退：`0 → 1`，MCP 返回 `rowsAffected=1`，再次读回为 `is_active=1`。
- 回退后正式表恢复 `total=429`、`active=420`、`inactive=9`；无净业务数据变更。

因此，正式表字段漂移已修复，MCP 的 `is_active` 条件写入和回退链路已验证；尚未执行 416 条历史兼容记录的批量停用。批量动作仍需先决定是否让运行时查询显式加入 `is_active=1`，并完成开发库/正式库同步差异评估。

## 运行时 `is_active` 契约（2026-09-17）

根据已确认的既定方案，问答映射只有 `is_active=1` 才允许进入运行时消费。先改独立 SQL 契约测试，旧实现按预期 RED；随后只在三条问答映射查询路径加入条件：全量预加载、按问题读取、题包关联读取。

- 目标测试：`node test/unit/backend/diagnose-http/repositories/question-repository-schema.mjs`，RED 后 GREEN。
- 回归测试：`node test/unit/run-all.mjs --filter=diagnose-http`，`51/51` 通过。
- 函数包审计：`diagnose-http` 为 `PASS`；定向 oxlint 无错误，仅有原有告警。
- MCP 只读 SQL：开发库和正式库 `data_status=audited AND review_status=audited AND is_active=1` 均为 `252` 条；当前固定题包 `4` 条全部启用。

正式库仍有 4 条 `yellowing_progression_speed` 历史动态题选项为 `audited + is_active=0`。部署新运行时契约后，它们会从动态映射查询中消失；这属于已识别的业务行为变化，需在批量停用前单独确认，不得按“当前固定题包未使用”直接忽略。

本轮只修改本地运行时源码和测试，未部署云函数，未批量修改 `is_active`。完整证据见 `docs/ai-runs/2026-09-17-runtime-is-active-contract.json`。

## 开发库单条 `is_active` 真实回退试验与路由交叉核对（2026-09-17）

为验证新的 `is_active=1` 查询条件不会误伤固定题包，在 `cloud1_dev` 对 `id=4`（`q_spider_red_dots_visible / yes`）执行了带原始 `row_hash` 条件的单行试验：

- 更新 `is_active: 1 → 0`，MCP 返回 `rowsAffected=1`。
- 带 `is_active=1` 的读回返回 `0` 行；固定浇水题仍返回 `4` 条启用选项。
- 按同一 `id + question_key + option_key + row_hash` 条件回退 `0 → 1`，MCP 返回 `rowsAffected=1`。
- 最终开发库恢复 `total=436`、`active=420`、`inactive=16`，行哈希未变化。

同一开发库只读验证还确认：`yellowing_progression_speed` 的停用映射不会被新的 SQL 查询返回，但代码生成的合成选项仍能提供四个相同业务键，因此该历史题的最小回退路径成立。

正式库的 `outcome_route_questions` 当前启用问题键与映射表交叉后，发现 `22` 条审核且启用映射，其中 `4` 条为当前固定浇水题，另有 `18` 条属于旧路由题。它们仍由路由配置引用，不能把全部 `legacy_compat` 行直接设为 `is_active=0`。跨表核对必须显式使用 `COLLATE utf8mb4_0900_ai_ci`，否则 MCP 返回 MySQL 1267 排序规则冲突。

因此当前唯一安全结论是：查询契约和单条回退链路已验证；正式批量停用仍停止在路由兼容决策之前，不得把“近期没有新快照”当作“绝对未消费”。详细只读证据见 [is-active-consumer-audit.json](./2026-09-17-is-active-consumer-audit.json)。

## 候选白名单的第二道只读门禁（2026-09-18）

为避免把“未被当前启用路由引用”误判为“可以停用”，从正式库固化了一份候选快照：[2026-09-18-is-active-candidate-whitelist-readonly.json](./2026-09-18-is-active-candidate-whitelist-readonly.json)。候选规则为 `legacy_compat + is_active=1 + data_status=audited + review_status=audited`，并排除所有当前启用且审核通过的 `outcome_route_questions` 引用。

MCP 只读返回：候选 `230` 条、`75` 个问题键；正式库与开发库均存在且仍为 `is_active=1`，当前两边 active 集合差异为 `added=0、removed=0、updated=0`。候选快照行数组 SHA-256 为 `92270e8ab962c9fa848ce5bfd7d6cebcbf3ced83296152ee0a79e2c55e6c37c6`，用于后续条件回退校验。

源码静态交叉核对发现 75 个问题键中有 `31` 个仍出现在产品云函数源码的固定规则、问题包主题或问题行映射中，涉及候选 `97` 行；详见 [2026-09-18-is-active-candidate-source-consumer-audit.json](./2026-09-18-is-active-candidate-source-consumer-audit.json)。这 `97` 行不能直接纳入停用批次。

历史运行快照交叉核对又发现候选中有 `25` 个问题键、`74` 行出现在 `57` 个历史诊断会话快照中。历史出现证明这些记录曾被运行时消费，不能因为当前路由表没有引用就直接停用；其余候选也仍需按源码、回放和同步链继续收敛，当前不构成正式批量授权。明细见 [2026-09-18-is-active-candidate-history-audit.json](./2026-09-18-is-active-candidate-history-audit.json)。

将候选与当前审核通过的问题库再做只读关联后，`75` 个候选问题键中有 `74` 个仍存在于 `question_library_v5_real`，覆盖 `228` 条映射；只有 `q_non_problematic_variegation_stability` 的 `2` 条映射没有对应的当前审核题库行。由于运行时按问题键读取审核映射，这 `228` 条仍具备动态消费路径，不能批量停用。明细见 [2026-09-18-is-active-candidate-question-library-audit.json](./2026-09-18-is-active-candidate-question-library-audit.json)。

复用的运行时审计进一步确认，动态选题、答案校验、复核加载和历史回放均按问题键读取或验证映射；历史快照已确认候选中 `25` 个问题键、`74` 行曾被 `57` 个会话消费。因此当前可证明的零业务影响停用子集为 `0` 条，不能执行批量 `is_active=0`。

本轮只完成了候选快照和只读门禁，没有执行正式库或开发库的批量 `is_active` 更新，也没有部署本地运行时过滤改动。若未来进入写入，必须先选定单问题键、单会话做前后对照，锁定两边同一批次，保留完整旧行快照，并使用业务键加旧哈希条件回退；只改正式库会产生 `added=230`，批准发布后可能重新启用这 `230` 行。

## 运行时可达性纠偏与死代码审计（2026-09-18）

上面的“源码命中、题库存在、历史出现”只能证明曾经或可能被使用，不能直接证明当前新问诊会生成并消费这些问题键。本轮按真实入口、题包快照、答案提交和审核读取路径重新核对，结论如下：

- 当前黄叶、萎蔫入口输出固定题包；数据库实际读取的题目是浇水题，其余题目由代码生成。
- 当前虫害入口输出 `q_specific_pest__*` 代码生成题，不生成旧的 `q_spider_webbing_visible`、`q_thrips_silver_streaks`、`q_gnat_*` 等候选键。
- 正式候选仍是 `230` 行、`75` 个问题键；与当前新题包自动生成集合重叠为 `0` 行。
- 这不能推出“候选数据可以停用”：正式 `runtime_snapshot_json` 仍有 `57` 个会话保存候选旧键，其中 `47` 个是 `awaiting_follow_up` 且未结束。它们继续作答、答案重算和审核时仍会按问题键读取映射，而读取条件包含 `is_active=1`。
- 因此数据库批量 `is_active=0` 仍然是 STOP；本轮没有数据库写入，也没有部署本地过滤改动。完整审计见 [2026-09-18-is-active-runtime-reachability-audit.json](./2026-09-18-is-active-runtime-reachability-audit.json)。

可以高置信判定为当前生产请求链不可达的，是 `question-selector.js`、`question-selector-helpers.js`、`question-selector-coverage.js` 这组三个旧自动选题模块：当前产品云函数没有导入链，只有历史批量测试引用；`runDiagnosisRound()` 也不再输出这套 selector 生成的问题列表。本轮已在本地删除这三个生产模块，并同步移除仅依赖它们的旧批量测试检查；完成 `diagnose-http` 全量 `node --check` 和函数包完整性检查，未部署代码。

`pest-question-package.js`、`question-package-topic.js`、`context-required-problem-guard.js`、答案提交、审核和历史回放读取逻辑不属于死代码，不能因为当前新题包不生成旧键就删除。当前的安全边界是：先清理已确认不可达的 selector 代码，保留旧映射和兼容读取；待 `47` 个未结束会话有明确封存/迁移方案后，再逐键做可回退停用。

## 首批确认未消费映射关闭（2026-09-18）

根据用户确认的既定方案，本次没有把全部历史兼容映射批量关闭，而是重新执行了逐键门禁。只选择同时满足以下条件的记录：

- `cms_lifecycle='legacy_compat'`、`is_active=1`、`data_status='audited'`、`review_status='audited'`；
- 不在启用且审核通过的 `outcome_route_questions`；
- 不在启用且审核通过的 `outcome_answer_effects`；
- 不出现在任何正式 `diagnosis_sessions.runtime_snapshot_json`；
- 不出现在 `diagnosis_follow_up_answer_events.question_key` 或 `dirty_question_key`；
- 不命中当前云函数源码中的问题键引用。

正式库只读门禁得到 **26 个问题键、80 条映射**。先保存每行 `id + question_key + option_key + row_hash` 快照，再执行带原值条件的更新：

```sql
UPDATE question_option_mapping_v5_real
SET is_active=0
WHERE <id + question_key + option_key + row_hash + is_active=1 条件>
```

MCP 返回 `statementType=UPDATE`、`rowsAffected=80`。读回确认：这 80 条中 `still_active=0`、`subset_with_active_route_or_effect=0`；正式表总行数仍为 `429`，启用 `340`、停用 `89`；当前固定黄叶浇水题 4 条仍全部启用。没有修改开发库，没有删除数据，没有删除问题键。

行级快照和可回退 SQL 见 [2026-09-18-is-active-safe-disable-snapshot.json](./2026-09-18-is-active-safe-disable-snapshot.json)，写入及读回证据见 [2026-09-18-is-active-safe-disable-result.json](./2026-09-18-is-active-safe-disable-result.json)。

本次数据库状态已按“确认未消费才关闭”的方案推进；运行时 `is_active=1` 过滤契约仍需在实际绑定的线上函数中单独核对和发布，不能把本地源码改动当成已部署事实。

## is_active 运行时过滤契约发布（2026-09-18）

- 已核对正式网关实际绑定的三个诊断函数：`diagnose-http`、`diagnosis-question-start-http`、`diagnosis-answer-http`；没有发现第四个相关入口。
- `question-repository.js` 的三处映射读取已加入 `data_status='audited' AND review_status='audited' AND is_active=1`，分拆产物检查和函数包完整性检查通过。
- 三个函数均已更新并收敛到 `Active / Available`：`diagnose-http` 2026-09-18 05:29:53，`diagnosis-question-start-http` 05:29:50，`diagnosis-answer-http` 05:29:55。
- 无登录态的真实网关最小请求已到达函数：专用 question 返回 `UNSUPPORTED_QUESTION_PACKAGE_MODE`，专用 answer 返回 `UNSUPPORTED_ANSWER_MODE`，主兼容入口返回登录校验 `401`；未创建诊断会话。
- 正式 `question_option_mapping_v5_real` 当前 429 行，其中 340 行启用、89 行停用；首批确认未消费的 80 行仍全部停用，当前固定题包 4 行保持启用。回滚快照仍在，未执行回滚。
- 开发库对应 80 行仍启用，后续任何数据模型发布前必须先阻断环境差异或完成单独审计的开发库对齐，本轮不自动修改开发库。
