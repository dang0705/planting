# P1 用户植物、身份与游客认领合同：领域需求审计

> ClickUp ticket：`z8v0kmr96y`  
> 负责 agent：`p1_user_plant_terra`  
> 审计时间：2026-09-20（Asia/Shanghai）  
> 范围：P1 领域审计、guest-session-claim/v1 合同、003 user-plant DDL、专项 Vitest Expected 与本地制品核验；未涉及公共 DTO/types/schema、API route registry、Master Plan、配置目录、前端、CloudBase 资源或 ClickUp。  
> 本地结论：`CONTRACT_AND_SCHEMA_CONSISTENCY_IMPLEMENTED / REAL_MYSQL_AND_HTTP_PENDING`。本报告不替代真实 API、身份、MySQL 事务或云存储验收。

## 1. 结论先行

1. 用户植物必须是长期植物个体数据的唯一中心：长期养护、诊断、事实、计划、提醒、时间线、私有资产和受控小青上下文都必须以 `user_id + user_plant_id` 归属。用户级权益账户、公共知识及游客临时会话是明确例外。
2. 游客不能拥有用户植物。游客只能在短期临时会话内持有识别候选、固定题包结果、独立浇水建议及受限盆土视觉证据；登录后必须由用户显式选择“新建植物”或“已有植物”并执行一次性认领。
3. 认领只补充归属：不能将候选、问诊结果、浇水建议、提醒、通知或模型输出改写为植物事实、养护计划或已执行行为；也不能对游客时期的行为追溯积分、等级、AI 额度或 CMS 贡献奖励。
4. 身份状态允许“暂未识别”，这是正确的风险控制，而不是数据缺陷。身份不足时宁停在未知或属级，不能错误确认到物种。候选必须保留在识别会话，只有用户明确确认后才成为当前已确认身份。
5. 当前 `user-plant/v1`、`guest-session-claim/v1` 与合同登记册已冻结公开引用、24 小时未绑定会话保留、单一认领编排、案例整体认领、跨域派生归属和身份历史 `superseded` 语义。P1-UPC-01 至 P1-UPC-05 均已闭合；本轮已补齐游客认领三表唯一事实源、目标一致性、processing lease 与事务回滚 Expected，真实 MySQL/API 验收仍待后续阶段。

## 2. 本次读取边界与 Expected 来源

本审计先通过 `node docs/backend-v2/verify-entrypoint.mjs`，结果为入口基线通过（2199 行、当前 SHA-256 `1a8382b83eb7720425f201afef9920e148e8eda3b15618e112516839fac10357`）。

按渐进式披露只读取以下与本 ticket 直接相关的材料：

| 材料 | 用途 |
|---|---|
| `docs/backend-v2/README.md`、`BASELINE.lock` | 唯一计划源、阅读纪律和当前阶段核对 |
| `phases/P1-contracts-identity-foundation.md`、`clickup/ticket-specs.md` | 本 ticket 目的与验收条件 |
| `contracts/user-plant.md`、`contracts/guest-session-claim.md` | 公开引用、生命周期、最低认领条件 |
| `data/state-machines.md`、`data/table-ownership.md` | 状态定义和跨域写入边界 |
| `architecture/business-domain.md`、`contracts/care-capability-output.md` | 用户植物一等公民边界与稳定养护输出 |
| `testing/test-matrix.md`、`testing/{real-api,real-mysql}.md` | 后续测试门与真实边界 |
| `decisions/P0-external-capability-cards.md`、`decisions/P0-product-cost-boundaries.md`、`contracts/contract-registry.json` | 已冻结的游客/匿名主体、免费用户、存储边界与合同文件版本/哈希 |
| Master Plan 第 1、6、8、9、10、13、16 章相关段落 | 原始业务规则、表所有权、状态机、路由和验收场景 |

未读取：旧前端、旧 HTTP 函数实现、旧迁移、完整历史文档、OpenViking 资源及任何凭证。它们不是本轮合同 Expected 的来源。

## 3. 必须冻结的领域不变量

### 3.1 稳定的 `user_plant_id`

`user_plant_id` 是一株真实植物在青花植中的稳定公开引用；它不因昵称、图片、环境、生命周期状态或已确认植物身份变化而改变。删除后不得复用，且 `deleted` 不能恢复或继续写入。

同时必须明确区分两类标识，避免“内部主键永不公开”的规则被破坏：

| 位置 | 应使用的标识 | 规则 |
|---|---|---|
| 公开 API、事件载荷、跨服务合同 | 不透明的 `user_plant_id` | 只可作引用，调用方不得推导排序、数量或内部数据库键。 |
| 数据库、Repository、关联约束 | 内部 `BIGINT UNSIGNED` 主键 | 不进入公开响应、日志、错误、URL 或前端状态。 |

`user-plant/v1` 已明确公开值格式为 `upl_...`，并以 `user_plant_internal_id` 表示内部关联键。后续 DDL 必须将该映射、两个唯一约束和 Repository 映射落为真实结构；这是正常 P1 DDL 工作，不得让内部键进入公开 DTO。

### 3.2 一等公民边界

以下持久化对象必须具有同一个 `user_id + user_plant_id` 归属边界，并在每一次读写校验二者：

- 用户植物档案、生命周期、身份历史、养护环境、私有资产和时间线投影；
- 已确认的养护事实、养护建议、计划、提醒、天气快照与尚未过期的盆土证据；
- 已绑定用户植物的诊断会话、答题、证据与结果；
- 受控的小青植物上下文。

明确例外：公共植物知识/CMS 发布内容、统一用户级权益/积分/AI 额度账户，以及尚未认领的游客临时会话。例外不能通过伪造 `user_plant_id` 绕过归属校验。

所有长期个体化子表应使用复合归属约束或等价的数据库保证，防止“正确的用户 + 他人的植物”或“正确的植物 + 他人的子记录”被写入。跨聚合删除使用 `RESTRICT`；资产、事实和历史不能因级联删除而误删。

### 3.3 植物身份：暂未识别、候选待确认、已确认

| 状态 | 允许表达 | 禁止表达 |
|---|---|---|
| `unidentified`（暂未识别） | 没有足够可信的规范身份；仍可建立用户植物并记录档案/环境。 | 将百度候选、商品名或猜测物种伪装为规范身份。 |
| `candidate_pending`（候选待确认） | 识别会话保留候选、来源、版本、置信/弱匹配信息，等待用户选择。 | 候选直接成为当前已确认规范身份，或驱动确定性养护/诊断事实。 |
| `confirmed`（已确认） | 用户确认后的规范植物身份引用及身份历史。 | 覆盖历史确认；权威身份更新只能以新版本/重定向保留历史。 |

已确认植物重新识别时，旧的已确认规范身份必须继续可追溯；新的候选只在识别会话中待确认。Master Plan 还出现 `confirmed → candidate_pending → confirmed / superseded`，但当前简化状态清单没有定义 `superseded` 的数据语义。

`user-plant/v1` 已明确：`candidate_pending` 仅表示存在待用户确认候选，候选不写成当前身份；重新识别时旧确认身份通过身份历史保留。`superseded` 只用于身份历史记录，表示旧确认被后续确认或权威重定向替代，不是用户植物当前身份状态。最终 DDL 必须按这个边界实现。

### 3.4 游客主体、临时会话与一次性认领

CloudBase 匿名主体、设备 ID、IP、UA 和客户端静态签名都不是 `user_id`。它们最多帮助风险控制。游客临时会话必须是独立的短期 claim context，登录后由 `identity` 解析出统一 `user_id`，不能把匿名主体静默升级成正式用户。`guest-session-claim/v1` 已冻结未绑定临时会话保留 24 小时，失败或隔离记录最多保留 7 天；服务端时钟是唯一时效依据。

认领的最小前置条件：

1. 请求已登录，且 `identity` 已解析出统一 `user_id`；
2. 请求持有同一临时会话的有效证明；
3. 临时会话为 `completed` 且尚未过期；
4. 用户显式选择“创建新用户植物”或“绑定本人已有用户植物”；
5. 已有植物目标必须属于该 `user_id`，且不是 `deleting/deleted`；
6. 命令有 `Idempotency-Key`，服务端保存规范化请求载荷哈希；
7. 只在全部归属补充成功后转为 `claimed`，失败不留下半绑定。

已冻结或应纳入 Expected 的重复语义：

| 情形 | 期望结果 |
|---|---|
| 同一会话、同一幂等键、同一规范化载荷 | 返回首个成功或首个确定失败的原结果，不重复创建植物或绑定。 |
| 同一会话、同一幂等键、不同载荷 | `409` 冲突，不修改既有记录。 |
| 已成功认领后使用不同幂等键再次认领 | 明确拒绝“已认领”；不得允许更换目标植物。该规则须与单条临时结果的认领范围一并冻结。 |
| 会话已过期 | 拒绝；不得通过匿名 UID、设备/IP 或客户端时间绕过。 |
| 目标植物属于其他用户 | 拒绝且不泄露目标是否存在。 |
| 事务/内部调用失败 | 回滚或保留可恢复的未认领状态；不得暴露一部分已绑定、一部分未绑定。 |

### 3.5 案例整体认领范围

一个游客会话可包含多个 `guest_plant_case_ref`，但每个游客植物案例只表达一株临时植物。识别、固定题包、独立浇水建议和盆土视觉等临时对象都必须引用其所属案例。

认领命令以 `guestPlantCaseRef` 为粒度：同一案例下的所有临时对象整体获得派生归属；MVP 不允许部分对象认领。一次游客流程涉及多株植物时必须先拆成多个案例，分别显式认领。这样既让游客阶段的每一项诊断/养护行为都有机会在登录后关联用户植物，又不会把不同植物错绑到同一长期个体。

## 4. 建议、计划、事实和奖励的隔离

认领后的语义不能升级：

| 对象 | 认领后仍然是什么 | 不能自动成为 |
|---|---|---|
| 识别候选 | 候选/待确认信息 | 已确认规范身份 |
| 固定题包输出、诊断输出 | 结果和行动候选 | 事实、计划或提醒 |
| 独立浇水顾问输出 | 建议 | 已浇水事实或计划完成 |
| 盆土视觉 | 有效期内的证据 | 已浇水或“土壤状态永真”的事实 |

只有用户另行确认实际行为发生，`care` 才能创建不可变 `plant_facts`。用户确认建议用于未来执行时，`care` 才创建计划和提醒；计划完成并由用户确认实际执行后，才创建唯一事实。重复确认必须返回原结果。

游客行为被认领后也**不得**补发：档案完整度奖励、盆土检查奖励、固定题包完成奖励、等级奖励、AI 额度、积分或 CMS 贡献奖励。认领只是归属补充，不是新的可奖励行为；后续登录态下满足独立业务唯一键的实际行为才可进入奖励事件。

## 5. 归属、时效、幂等与安全边界

1. 公共响应、错误和普通日志不得出现匿名 token、平台主体、内部 session/追踪 ID、内部数据库键、私图 URL 或完整临时对象载荷。
2. 对于用户植物读写，按 `user_id + user_plant_id` 双键校验；仅验证一个键不足以防越权。
3. 未绑定游客会话的 24 小时有效期和服务端时间是唯一认领时效来源，客户端时间、设备、IP、UA 不能续期或充当所有权。
4. 认领前后资产都必须处于受限私有边界；资产先验证、后绑定。跨用户、跨植物、过期或隔离资产一律拒绝。
5. 认领失败不得删除临时证据；在有效期内可按幂等规则重试。到期后由生命周期规则清理，不能为了“补认领”而无限保留私图。
6. 养护能力对外继续使用版本化统一结果外壳：`capabilityType`、`contractVersion`、`status`、`confidence`、`evidenceSummary`、`recommendedActions`、`generatedAt`、`validUntil`、`details`。算法、输入来源或 `details` 演进不得破坏已发布合同版本。

## 6. 域所有权与必须解决的冲突

| 编号 | 冲突/缺口 | 影响 | 必须冻结的解决方案 | 当前结论 |
|---|---|---|---|---|
| P1-UPC-01 | 认领入口和写者 | `user-plant` 是唯一认领编排者，拥有 `guest_plant_cases` 与 `guest_claim_commands`；其他域仅写各自临时对象表。 | 新建目标植物与案例认领投影在 `user-plant` 的同一 MySQL 事务提交；其他域通过带用户范围、服务签名的内部 Query API 派生归属。 | `CLOSED` |
| P1-UPC-02 | 时效与游客持有边界 | 高熵 `guest_session_ref` 绑定经验证的匿名主体和服务端持有证明；未绑定会话 24 小时，失败/隔离记录最多 7 天。 | 客户端时间、设备、IP、UA 不可续期或替代持有证明。 | `CLOSED` |
| P1-UPC-03 | 身份三态与 `superseded` | 当前投影只有 `unidentified / candidate_pending / confirmed`；候选留在识别会话。 | `superseded` 仅为身份历史/分类重定向记录，不进入当前身份状态。 | `CLOSED` |
| P1-UPC-04 | 公开/内部植物标识映射 | 公开 `user_plant_id` 固定为高熵 `upl_...`；内部关联使用 `BIGINT UNSIGNED` 的 `user_plant_internal_id`。 | 公开 DTO、日志、错误和 URL 禁止内部数值键。 | `CLOSED` |
| P1-UPC-05 | 同会话多临时对象的认领粒度 | 会话可含多个单株 `guest_plant_case_ref`；案例下的所有临时对象整体认领。 | MVP 不支持部分认领；多株植物必须拆为不同案例。 | `CLOSED` |

结论：五项合同缺口已关闭。`guest-session-claim/v1` 中“同一临时结果只能成功认领一次”的表述，应在实现 DTO/测试中按“同一游客植物案例及其对象集合”解释；这不是所有权冲突，不阻断进入 Expected/DDL。

## 7. 公共合同边界与已完成的认领制品

### 7.1 DTO / API 合同

主代理已冻结基础领域语义；以下仍须作为可执行 DTO/API 文档、Expected 和测试输入固化，本审计不创建它们：

- `UserPlantPublicRef`：公开 `user_plant_id` 的不透明格式与不可枚举要求；
- `UserPlantIdentitySnapshot`：当前身份状态、已确认规范身份公开引用、候选会话公开引用、历史版本语义；
- `GuestSessionPrincipal`：短期游客会话公开引用、状态、服务端到期时间；严禁原始匿名凭证出现在 DTO；
- `GuestClaimCommand`：临时会话公开引用、目标模式（新建/已有）、已有植物公开引用或新建档案最小数据、待认领临时对象公开引用、`Idempotency-Key`；
- `GuestClaimResult`：认领命令公开引用、目标用户植物公开引用、已绑定对象的白名单摘要、可重放结果；
- 统一错误：未登录、会话无效/过期、会话已认领、目标越权、同键异参、状态冲突和内部可重试失败；公开消息不得泄露对象存在性。

### 7.2 状态机

除既有生命周期外，需要逐转换冻结发起角色、前置条件、幂等键、事务/补偿边界、审计、失败响应、是否可重试、过期处理以及对事实/积分/额度的影响：

- 用户植物：`active ↔ archived`，`active/archived → deleting → deleted`；
- 用户植物身份：`unidentified → candidate_pending → confirmed`，以及重新识别和 `superseded` 的确切语义；
- 游客临时会话：`active → completed/failed/expired`，`completed → claimed`；
- 认领命令：建议独立记录 `requested → processing → completed/failed`，使同键重放可回读；
- 临时资产/临时证据：验证、绑定、到期、隔离、清理及“认领后归属更新、不改变业务语义”。

### 7.3 表与所有权

当前所有权表已列出 `user_plants`、`profile`、`care_contexts`、`identity_history`、`assets`、`timeline_projection`、`temporary_care_sessions` 与 `temporary_diagnosis_sessions`。本轮只冻结并实现 `003_user_plant.sql` 中游客会话、案例、认领命令和成功事实的关系；其他域表仍按各自 ticket 验收。

| 所属域 | 待冻结表/关系 | 关键要求 |
|---|---|---|
| `identity` | 统一用户、平台绑定、登录 session、游客 Principal 映射 | 匿名主体绝不等于 `user_id`；同一平台主体最多绑定一个用户。 |
| `user-plant` | 用户植物、档案、环境、身份历史、资产绑定、认领命令/认领投影 | 公开引用与内部主键分离；复合归属约束；目标已有植物必须归属当前用户。 |
| `care` | 临时养护会话、盆土证据、建议、事实、计划、提醒 | 临时记录可被受控认领，但建议/证据不自动升级事实。 |
| `diagnosis` | 临时问诊会话、答案、结果、证据 | 认领只补充归属；结果保持结果。 |
| 受控基础设施 | 审计事件、幂等记录、outbox/inbox（如采用） | 同键同参可回放、同键异参冲突、失败可补偿且不重奖。 |

本轮已补充游客认领所需的外键/唯一约束、复合归属约束、`UNIQUE(user, case, idempotency_key)`、规范化载荷哈希、认领后目标不可更换的数据库关系、processing lease 不变量和空库静态 Expected；真实空库读回、软删除/清理索引与 API 仍待后续验收。

### 7.4 Expected 与测试

公共 Expected 不得从旧实现反推。本轮专项已以 Master Plan、已冻结合同和本报告的冲突解决结果，写出以下 guest claim RED/GREEN 场景；其余领域场景仍由对应 ticket 负责：

1. 同一游客会话认领到新建用户植物成功，临时结果/建议只补归属；
2. 认领已有植物时，目标必须属于当前 `user_id`；
3. 跨用户、过期会话、已删除植物、隔离资产均拒绝；
4. 同键同参回放原结果；同键异参返回冲突；不同键二次认领不允许换目标；
5. 任一绑定步骤失败时无半绑定，或具有可审计且可自动补偿的明确恢复路径；
6. 认领后不新增 `plant_facts`、计划、提醒、积分、等级或 AI grant；
7. `unidentified`、`candidate_pending`、`confirmed` 与重新识别历史正确；
8. 不透明公开 `user_plant_id` 不泄露内部 `BIGINT UNSIGNED` 主键；
9. 算法版本变化时，养护能力的既有 `contractVersion` 输出保持兼容。

测试层次必须标识 `unit_fake`、`unit_real_data` 或 `e2e_real_api`。最终认领验收至少要求真实身份、真实 MySQL 事务、写后读回和脱敏公开响应；缺少真实库只能标 `BLOCKED_ENV`，不能以 mock 或 HTTP 200 宣称通过。

## 8. 后续验收边界与不应做的事

1. 公共 DTO/API、状态机和路由仍由主代理按已冻结合同独立验收；本轮不修改公共 types/schema 或 API registry。
2. 认领实现必须保持本合同的单一 user-plant 编排、三表关系和同一 MySQL 事务边界，不能借用旧 `plant-user-http` 的混合职责。
3. 后续才进行真实 MySQL 与 HTTP 认领回放、Storage 验证/绑定/清理和 CloudBase 匿名身份验证；静态 Vitest 不得冒充这些证据。
4. 未通过真实证据前，不部署、不迁移云端数据、不删除旧资源、不把测试数据作为 v2 迁移源。

本报告保留旧系统仅作为原子依赖候选的结论：独立浇水与用户植物入口之间“完成后可绑定”的产品意图应在 v2 的临时会话认领中重建；旧实现不能绕过 v2 合同直接复用。

## 9. 本轮认领一致性制品与本地证据

### 9.1 已冻结事实

- `guest_claim_commands` 是命令和唯一公开 `claim_ref` 来源；同一 `(user_internal_id, guest_plant_case_internal_id, idempotency_key)` 只允许一条规范化命令。
- `guest_case_claims` 是不可变成功事实，不重复保存 `claim_ref`；以唯一案例键和唯一命令键保证一次成功，并以复合外键核对命令的案例、用户和最终植物。
- `guest_plant_cases.claimed_user_internal_id + claimed_user_plant_internal_id` 是可重建当前 owner 投影；成功事实以复合外键要求它与案例投影完全一致，投影不能单独产生认领结论。
- `proof_version` 只记录服务端实际验证的游客持有证明版本；请求体不接受该字段。processing lease 由 owner hash、过期时间和递增 `attempt_count` 组成，过期可由同一命令恢复。
- existing target 的 requested/final target 必须一致；new target 只能在同一事务中新建后写回。命令、用户植物、案例投影和成功事实提交失败时一起回滚。

### 9.2 可执行 RED/GREEN 与验证范围

- 专项：`cloudfunctions-v2/test/p1-guest-session-claim.spec.ts`，层次 `unit_real_data`，读取真实合同/003 DDL；正式测试转入默认回归前的历史 RED 探针为 8/8 失败，补齐制品后 GREEN 为 8/8。
- 已通过：`npm --prefix cloudfunctions-v2 run typecheck`；`npm --prefix cloudfunctions-v2 test -- --run test/p1-total-ddl.spec.ts`；专项 `test:red`。
- `docs/backend-v2/schema/manifest.json` 已同步 `003_user_plant.sql` SHA-256 `2e8494c23e7bd7a26871e2031b934ab2746a89b2d7af5ca4a9abbd469cc5c6b2`。
- 未覆盖：真实 CloudBase MySQL 建表/并发/回读、真实 HTTP 身份与 proof 传输、Storage 绑定清理；这些结论必须标为 `BLOCKED_ENV` 或后续 `e2e_real_api`，不能由本专项静态测试替代。
