# Phase Ticket 预创建规格

以下规格是 ClickUp ticket 的完整内容模板。当前 27 个 ticket 均已生成真实 ID；其中本文件中的三项 P2 补建 ticket 已通过用户 Chrome `default/main` 主 profile 创建并逐项回读，状态以 ticket-index 与 tracker 心跳为准。

## P-1 / 遗留资产审计

### 目的

盘点旧函数、路由、表、CMS 模型、Storage 对象、测试、外部供应商和 OpenViking 条目，明确哪些可清理、哪些只能审计复用、哪些需要从权威来源重建。

### 验收

- 形成七类审计清单。
- 每项有真实调用方、v2 owner、处置决定、Expected 来源和删除前置条件。
- 测试运行数据与内容资产被明确区分。
- 所有清单具有 SHA-256 和读回证据。

### P-1 子 ticket 拆分

以下五个子 ticket 共享 P-1 的退出门，但各自有独立负责人、允许路径、输入哈希和审计制品；不得由一个代理代替其他代理完成：

| Agent | 子任务目的 | 独立验收制品 |
|---|---|---|
| `audit_legacy_code_luna` | 识别旧函数、路由、测试及可复用原子依赖 | 代码/调用图、KEEP/TRANSFORM/REBUILD/DELETE 建议和 SHA-256 |
| `audit_data_cms_luna` | 区分测试数据、内容资产、模型结构和可复用语义 | 数据/CMS 清单、字段映射候选、内容处置矩阵和 SHA-256 |
| `audit_external_sources_luna` | 固定百度、和风天气、云百炼、支付及平台回调事实源边界 | 外部来源注册表、超时/失败/费用边界和证据哈希 |
| `audit_storage_memory_luna` | 区分私有图片、公共内容、OpenViking 旧知识和删除对象 | 存储前缀清单、OpenViking URI 清单、精确处置证据 |
| `taxonomy_inventory_luna` | 审计植物科属种、别名、权威来源和隔离记录 | 逐条身份审计报告、冲突清单、权威快照和 release 准入结论 |

每个子 ticket 的标题、目的、验收和负责人必须分别回填 ClickUp；在 ClickUp 连接可用前，只保留本表，不生成虚假 ticket ID。

## P0 / TypeScript、Node 22 与 CloudBase 构建证伪

### 目的

证明 TypeScript → CommonJS → `scf_bootstrap` → CloudBase Node.js 22 的最小 HTTP 函数可构建、启动、处理请求并安全访问配置。

### 验收

- `tsc --noEmit` 严格通过。
- 构建产物为 `dist/server.cjs`。
- 本地和 CloudBase 目标运行时监听 9000。
- 部署包不含源码和开发依赖。
- 凭证不进入代码、日志和响应。

## P0 / 植物分类权威来源与身份审计证伪

### 目的

验证 POWO/WCVP、WFO、RHS/ICRA 的来源版本、稳定标识、父链、别名和冲突处理能够支撑 Phase 1 全量审计。

### 验收

- 科、属、种、种下、杂交、栽培品种、异名和 `spp.` 均有代表样本。
- 无法证明的记录可进入 `QUARANTINE`。
- 来源版本和证据哈希可回放。
- 权威来源冲突不会被模型自动裁决。

## P0 / 关键产品参数与成本边界冻结

### 目的

把 Master Plan 已列为 P0 前置、但原有 P0 ticket 未覆盖的产品数值与运营边界形成可审计决策，禁止实现阶段自行填默认值。

### 验收

- 冻结 24 小时试用的 AI 点数、有效期和能力目录。
- 冻结免费用户植物数量、奖励 AI 额度能力范围、积分兑换档位及三个月有效期口径。
- 冻结贡献奖励主题键、全局唯一获奖者、撤销和冲正边界。
- 冻结规范 CloudBase EnvId、Storage 上传方式、支付平台范围和数据保留期限。
- 冻结性能、数据库连接和第三方成本数值目标。
- 对[首版运行边界](../phases/first-release-scope.md)逐项记录用户已确认、执行建议待确认或待决状态；VPD、多图/生成式解释、小青只读试运行、完整施肥与积分运行延后等不得仅凭会话助手建议视为冻结决定。
- 每项均记录候选方案、成本/风险证据、最终值、影响域、回退条件和用户确认状态；未经确认不得伪装为已冻结。
- 输出中文决策登记册及 SHA-256；未确认项必须精确阻断其依赖能力，不能阻断无关任务。

## P0 / 外部能力合同与可靠事件证伪

### 目的

为 CloudBase 匿名身份、游客能力、外部供应商、网关和可靠奖励事件建立最短可执行证伪卡，确保进入 P1 前每张卡均得到明确 `GO` 或 `STOP`。

### 验收

- 冻结游客盆土视觉范围、游客会话认领以及匿名 UID/设备/IP 不得成为 `user_id` 的边界。
- 冻结百度识别、和风天气、Qwen、支付回调、Storage 和 CloudBase Agent 的 owner、认证、超时/重试、幂等、费用、隐私、日志和失败隔离合同。
- 冻结 CMS 队列、租约、预算和背压，以及 Qwen 精确模型、Prompt hash、输入输出 Schema 和内容禁区。
- 证伪 CloudBase MySQL 事务/唯一约束、`/api/v2` 网关路由和 outbox/inbox 丢失、重放、乱序、并发路径。
- 每张证伪卡只有 `GO` 或 `STOP`；真实外部环境缺失时不得用 mock 或 HTTP 200 宣称通过。
- 输出证伪登记册、可回放证据和 SHA-256；失败只阻断对应能力，不扩大为无关模块阻断。

## P1 / 用户植物、身份和游客认领合同

### 目的

冻结用户植物一等公民、暂未识别状态、游客及已登录用户主动选择的临时案例、同会话显式归属/绑定、归属校验和事实边界。已登录临时案例是本 ticket 的 P1 增量验收项，须按[合同补充门](../contracts/authenticated-ephemeral-plant-case.md)独立冻结，不能借用游客凭证。

### 验收

- 长期数据均有 `user_id + user_plant_id`。
- 游客不能拥有用户植物。
- 同一会话登录后可以显式一次性认领。
- 已登录用户可主动临时使用而不写已有植物；直接保存时须选择本人目标植物，DTO/DDL/状态机/事务/Expected 独立覆盖且真实读回。
- 跨用户、过期、重复和同键异参请求被拒绝或幂等返回。
- 认领不把建议转为事实/计划，也不追溯积分。

## P1 / 统一 AI 额度和奖励事件合同

### 目的

冻结试用、会员、CMS、等级和兑换额度的统一 grant、预占、分配、结算、释放、积分账本、等级投影和奖励事件。

### 验收

- 会员每周期 2,000 点且不结转。
- 会员、试用和奖励额度可按能力范围区分。
- 多 grant 预占和释放准确。
- 积分账本不可变，等级奖励每级只发一次。
- outbox/inbox 重放不重复入账。

## P1 / 诊断知识来源、园艺原因及 Outcome/Action 合同（待建 ClickUp）

### 目的

为黄叶、萎蔫与动态虫害问诊冻结“症状入口”和“园艺原因”两条分类轴，逐项定义可追溯来源、Outcome 结论、Action 行动、适用植物与禁忌条件、映射、DTO、数据字典和不可变发布/回滚合同。该 P1 增量门由 `diagnosis` 负责语义，复用 `plant-knowledge` 的 CMS 编辑发布通道；未创建真实 Phase-P1 ticket、确定负责人和冻结 Expected 前，不得进入对应知识运行实现。原有 P1 已验收部分不因此失效。

### 验收

- 旧黄叶/萎蔫题包、症状、虫害候选和行动文本逐项标记保留/转换/重建，旧测试记录不成为 v2 知识发布源。
- 原因目录至少可表达非生物性养护/环境、生物性害虫、病原相关病害、混合和待判定；症状词不自动提升为病因。
- Outcome/Action 具有稳定代码、中文语义、来源定位/版本、适用植物、支持/反驳条件、禁忌、复查与人工审核状态；多对多映射和兼容发布包可校验、回滚、回放。
- 独立 Expected 覆盖同症状多原因、同原因不同症状、证据不足/冲突、禁忌动作、撤回与跨 release 引用；明确 CMS 展示百科 Qwen Worker 不得写入诊断知识。
- 对应 DTO/DDL 变更先设计、再按 TDD 与空库 MySQL 读回验证；本票据只在真实 ClickUp 创建并回读后才允许启动实施。

## P2 / 统一身份 Principal

### 目的

实现多平台身份到统一 `user_id` 的解析、绑定、解绑、session 轮换和游客主体隔离。

### 边界与依赖

- 模块：`identity`；负责 agent：`identity_terra`；已创建 ClickUp：`z8v0kmr970`。
- 依赖 P1 Principal/Capability、公共 HTTP 合同、`schema/001_identity.sql` 和 P2 foundation 的受控 Repository/事务能力；不实现用户植物、积分、会员、CMS 或诊断业务。
- 平台凭证验证与平台主体解析只在 identity 域；业务域只能接收已解析的 `user_id` 与 Principal，不得读取、猜测或返回 OpenID 等平台主体标识。

### Expected 与 TDD

- Expected 来源：Master Plan 的 P2 identity 并行域、`contracts/principal-and-capability.md`、P1 身份 DDL 不变量和公开 HTTP 合同；不从现有实现反推。
- 先落盘 `unit_fake` 的绑定/解绑/轮换/冲突 RED，再实现；随后以 `unit_real_data` 验证 Repository SQL、唯一约束、事务回滚与脱敏读回。真实 HTTP/CloudBase 身份验证属于后续 `e2e_real_api`，不得以 mock 或 200 代替。

### 详细验收

- 同一 `(platform, platform_subject_id)` 只能绑定一个 `user_id`；同一用户可绑定多个平台，竞争绑定必须由唯一约束和事务安全拒绝。
- 绑定、解绑、session 轮换和撤销均有明确幂等键/版本规则：同键同参返回同一公开结果，同键异参返回 `409 IDEMPOTENCY_CONFLICT`，重复解绑不恢复访问。
- Repository 是 identity SQL 的唯一入口；写操作在事务内完成身份绑定、session 失效与审计/outbox 记录，失败回滚后读回不得留下半绑定或可用旧 session。
- 解绑、过期、撤销或轮换后的 session 不能解析为可访问 Principal；跨用户、非法平台、过期凭证和缺失字段均按公开错误合同拒绝。
- 成功与错误响应、结构化日志、审计/outbox 仅使用公开业务语义；不得暴露数据库主键、平台主体标识、session/追踪 ID、凭证、SQL 或内部状态。
- 测试覆盖正常路径、归属/权限、空值/非法输入、并发/重复提交、失败恢复、持久化读回和公开响应脱敏，并保留 RED 证据与测试层次标记。

## P2 / CMS 分类、百科和发布

### 目的

实现分类实体、产品身份、证据、候选池、展示百科补全、Qwen 禁区校验、CMS 审核和不可变 release。

### 边界与依赖

- 模块：`plant-knowledge`；负责 agent：`knowledge_terra`；已创建 ClickUp：`z8v0kmr971`。
- P1 taxonomy 人工裁决已冻结为 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`，当前 `seedEligible=106`。4 条待转换记录完成 canonical、稳定 ID、身份层级、父链和证据哈希重建并复核后，才允许提升为 110；active release 仍为 `STOP`。因此正式发布、百科补全、贡献奖励真实输入和依赖 active taxonomy 的对外读取继续受阻，但 Repository、事务、幂等、隔离读和发布基础设施可继续实现与测试。
- 依赖 `contracts/plant-taxonomy.md`、P1 taxonomy 准入证据、`schema/002_plant_knowledge.sql`、P2 foundation 事务/outbox；不实现用户植物、会员积分账本或诊断建议。

### Expected 与 TDD

- Expected 来源：Master Plan P2 plant-knowledge 域、植物分类合同和 P1 taxonomy 准入硬门；任何未批准候选均是负向 Expected。
- 先为候选隔离、身份状态迁移、release 指针、私有资产拒绝和 outbox 去重写 RED；再实现最小逻辑。Repository/事务/读回使用 `unit_real_data`，真实 CMS/供应商调用仅能作为后续 `e2e_real_api` 证据。

### 详细验收

- 百度识别只产生候选，不能直接创建 active 身份或发布；Qwen 仅可补全展示百科，且不得输出分类、养护、安全或诊断字段。
- CMS 发布基础设施可被诊断域复用，但诊断的园艺原因、Outcome、Action、映射须由诊断域单独审核并生成兼容发布包；展示百科补全草稿不能跨域进入该包。该子项依赖新增 P1 诊断知识合同，不能据现有 CMS 表或草稿宣称已验收。
- Repository 是分类、产品身份、证据、候选池、CMS 作业和 release SQL 的唯一入口；状态迁移、不可变 release 创建、active 指针切换与 outbox 写入在同一事务内，失败回滚后读回无半发布。
- 发布请求有版本/幂等语义：同键同参重放返回同一公开 release 结果，同键异参 `409 IDEMPOTENCY_CONFLICT`；并发发布不能产生多个 active 指针或重复奖励事件。
- 未发布/隔离身份不得生成百科任务、catalog/identify/CMS/care/diagnosis/Agent 查询或奖励；私有图片及原始供应商响应不得进入公共 release。
- release 持久化读回必须证明 SHA、单 active 指针、版本固定和回退审计；仅在发布事务成功后写入可去重的贡献奖励 outbox，消费者失败可重试但不得重复产生业务事件。
- 公开响应、日志与错误不得暴露内部主键、来源原文、供应商凭证、Prompt、模型原文、追踪 ID 或未授权用户数据；测试覆盖正常、权限、非法输入、幂等、失败恢复、读回与脱敏。

## P2 / 订阅、积分与 AI 额度核心实现

### 模块与负责人

- 模块：`subscription`；负责 agent：`subscription_terra`（`gpt-5.6-terra`）。
- ClickUp：[订阅、积分与 AI 额度核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mh)；已创建并逐项回读。
- 依赖：P1 `contracts/care-points-and-ai-quota.md`、`contracts/reward-events.md`、`schema/005_subscription.sql`、P2 identity Principal 与 P2 foundation 事务/幂等/outbox；不实现支付、CMS 发布或端上页面。

### 任务目的与边界

实现已冻结合同内的 grant、AI 额度预占/分配/结算/释放、积分不可变账本、等级投影、兑换与奖励 inbox；业务域不得自行写余额或积分，外部支付和真实 Provider 调用留给后续阶段。

### Expected 与 TDD

- Expected 来源：P1 额度与奖励合同、P1 DDL、Master Plan P2/P3 边界；不以旧表或旧业务代码作为实现真相。
- 先写 `unit_fake` 正常/权限/非法/并发重放 RED，再实现；以 `unit_real_data` 验证 Repository 事务、唯一约束、余额守恒和读回。真实 MySQL/API 并发回放由 P5 `e2e_real_api` 验收，不得以 mock 或 HTTP 200 冒充。

### 详细验收

- 仅已解析 Principal 可读取或操作其 `user_id` 的权益、额度、积分和兑换；跨用户、游客越权、无 scope/过期 grant、非法金额和缺失请求字段均拒绝且不泄露内部数据。
- Repository 是 subscription SQL 唯一入口；预占、分配、结算、释放、积分账本、等级投影、兑换终态和 inbox/outbox 在明确事务边界内写入，失败回滚后读回不得有负余额、悬挂预占或半写事件。
- 所有写操作具备幂等键/业务唯一约束：同键同参重放返回同一公开结果，同键异参 `409 IDEMPOTENCY_CONFLICT`；并发预占/兑换/奖励不超发、不重复扣减、不重复升级。
- 积分账本不可变，等级奖励每级仅一次；outbox/inbox 消费可重放、乱序和失败恢复，但业务事件按唯一事件键至多生效一次。
- 公开响应、日志、审计和错误均脱敏：不得返回数据库主键、账本内部流水、session/追踪 ID、Provider 凭证或未授权余额明细。
- 测试明确标注 Expected 来源及 `unit_fake`/`unit_real_data`/`e2e_real_api` 层级，并覆盖正常、权限/归属、空值非法、重复/并发、失败恢复、持久化读回和脱敏。

## P2 / 用户植物核心实现

### 模块与负责人

- 模块：`user-plant`；负责 agent：`user_plant_terra`（`gpt-5.6-terra`）。
- ClickUp：[用户植物核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mj)；已创建并逐项回读。
- 依赖：P1 `contracts/user-plant.md`、`contracts/guest-session-claim.md`、`schema/003_user_plant.sql`、P2 identity Principal 与 P2 foundation 事务/幂等/outbox；不实现养护事实、诊断建议、积分奖励或前端。

### 任务目的与边界

实现登录用户的用户植物、档案、生命周期、环境、资产引用和时间线，落实 `user_id + user_plant_id` 长期归属与已冻结游客认领合同。临时识别/问诊上下文不得伪造为用户植物。

### Expected 与 TDD

- Expected 来源：P1 用户植物/游客认领合同、P1 DDL、Master Plan P2 user-plant 域；旧记录仅可帮助识别字段形状，绝不是迁移或行为 Expected。
- 先写 `unit_fake` 的创建、更新、归属、版本冲突、游客认领和失败回滚 RED；随后以 `unit_real_data` 验证 Repository SQL、事务、唯一约束和读回。真实 HTTP/MySQL 并发闭环留给 P5 `e2e_real_api`。

### 详细验收

- 只有已解析的登录 `user_id` 可以创建、读取、更新、归档自己的 `user_plant_id`；跨用户、无效/不存在植物、游客直接创建长期植物和平台主体冒充均拒绝。
- Repository 是用户植物、档案、环境、资产引用和时间线 SQL 的唯一入口；创建/更新/认领在事务内完成归属和必要 outbox，失败回滚后读回不得出现孤儿资产、半认领或跨用户可见记录。
- 关键写操作采用 `Idempotency-Key`、唯一约束和/或版本号：同键同参重放返回同一公开结果，同键异参 `409 IDEMPOTENCY_CONFLICT`，并发编辑返回合同规定的版本冲突且不覆盖他人更新。
- 同会话游客登录后仅能按合同显式一次性认领；过期、跨会话、跨用户、重复或同键异参认领被拒绝或幂等返回，且不把建议转为养护事实、不追溯积分。
- 时间线只记录已授权的用户植物业务事件；资产仅保存受控引用，公开响应、日志、错误和 outbox 不得包含数据库主键、平台主体标识、session/追踪 ID、私有对象路径或未授权数据。
- 测试覆盖正常、归属/权限、空值非法、重复/并发、失败恢复、持久化读回和脱敏，并标注测试层级和未覆盖的真实 API 边界。

## P2 / 共享基础设施实现

### 模块与负责人

- 模块：`foundation`；负责 agent：`foundation_terra`（`gpt-5.6-terra`）。
- ClickUp：[共享基础设施实现](https://app.clickup.com/t/90182453517/z8v0kmr9mk)；已创建并逐项回读。
- 依赖：P1 `contracts/http-api.md`、OpenAPI 路由骨架、配置/Provider 架构、`schema/006_reliable_events.sql`；为 P2 五域提供受控共享边界，不承载领域决策、不新增万能服务层。

### 任务目的与边界

实现 Node.js 22 HTTP 请求链的可复用协议能力：请求大小/类型限制、Principal 注入、DTO/AJV、公开错误、Repository 事务封装、幂等记录、可靠 outbox、公开响应脱敏和结构化审计。它不拥有 identity、用户植物、知识、订阅或养护领域规则，也不执行未授权 CloudBase 部署、DDL、迁移或供应商写入。

### Expected 与 TDD

- Expected 来源：Master Plan 固定请求链、P1 公共 HTTP 合同、配置目录中已确认的 foundation 项和可靠事件 schema；`pending` 配置只能阻断对应能力，不能私设默认值。
- 先写 `unit_fake` 的协议/幂等/outbox RED，再实现；`unit_real_data` 验证事务、唯一约束、失败回滚与公开读回。真实 CloudBase 网关、MySQL 与 HTTP 路径留给 P5 `e2e_real_api`，不得以本地 200 代替。

### 详细验收

- 每个请求按固定顺序执行：大小/类型限制 → 身份认证 → 平台身份解析为统一 `user_id` → 用户植物归属校验 → DTO → 用例 → 领域规则 → Repository/事务 → 脱敏响应、结构化日志和审计事件；缺少适用步骤必须显式说明而非静默跳过。
- DTO/AJV、公开错误与响应封套和 OpenAPI 路由登记一致；非法 Content-Type/超限 body/缺失字段/未知字段/无效 Principal 均在进入领域或 SQL 前按合同拒绝。
- Repository 事务边界支持原子业务写入、幂等记录与 outbox 同事务持久化；事务失败读回无业务半写、无已确认幂等结果、无孤儿 outbox。Repository 不能承载领域 SQL 的旁路。
- 共享幂等规则强制同键同参重放为同一公开结果、同键异参 `409 IDEMPOTENCY_CONFLICT`；并发请求不重复提交领域命令或 outbox，消费者失败可重试且业务事件按唯一键去重。
- outbox 仅记录脱敏事件载荷和可审计状态；投递失败、重复、乱序和重启恢复均可观察、可回放，且不泄露凭证、内部主键、Prompt、模型原文、SQL、session/追踪 ID。
- 测试覆盖正常、权限、非法输入、重复/并发、失败恢复、事务读回、响应/日志脱敏；每项声明 Expected 来源、替换边界和未覆盖的真实 CloudBase/API 验收。

## P3 / 游客、试用、会员和奖励闭环

### 目的

首版打通游客/登录用户的临时植物能力、显式归属/绑定、24 小时试用、会员和 AI 额度；登录临时路径须先经过 P1 增量合同门。CMS 贡献奖励随实际发布的扩种实验验收。积分、等级、奖励查询和兑换继续属于目标架构，运行入口延后并保留独立后续验收。

### 验收

- 游客能力不要求会员且不扣 AI 额度。
- 游客先登录后才可保存；已登录用户可选择临时或长期，临时结果不得自动写入任何已有植物，显式绑定与并发重放可读回。
- 免费用户能使用有效、scope 匹配的奖励额度。
- CMS 新身份奖励 100 点、内容奖励 50 点，全局主题只发一次。
- 首版不发放积分或等级 AI 额度，也不开放兑换；后续兑换开放时使用 `Idempotency-Key`，并发不产生负余额。

## P4 / 盆土视觉和四类养护能力

### 目的

以“先事实、后推导、再建议”为强制顺序，先实现带来源、空间范围、单位、时间、新鲜度、置信度和哈希的原子环境事实，再实现不可变输入快照与 VPD、光照暴露、空气交换、基质干燥特征、环境干燥需求、预计干湿周期等派生环境指标，最后接入盆土短时证据以及浇水、施肥、光照、通风统一输出合同和可奖励的到期检查事件。

### 验收

- 盆土证据有植物归属、采集时间和有效期。
- 原子环境事实、输入快照、派生环境指标三层分离；算法变化不得改写原子事实，所有派生结果可按 `inputSnapshotHash + algorithmRelease` 回放。
- 室外天气不得冒充室内实测；温度与相对湿度时间/空间范围不可比较时不得计算 VPD。
- 植物基准周期只作为预计干湿周期起点，最终浇水建议仍经过最近浇水事实与盆土证据安全门。
- 湿土、证据不足和过期证据触发安全门。
- 视觉不自动记录浇水。
- 室外风速不直接等于室内通风。
- 养护输出版本稳定、中文语义完整。

## P4 / 固定/动态问诊与小青工具

### 目的

首版实现黄叶/萎蔫固定题包、动态虫害题包、诊断结果和建议确认；小青以受控只读解释为实验。丰富解释与行动建议作为新版本实验，固定题包积分事件和小青正式写工具保留为目标态后续任务。

### 验收

- 诊断结果锁定题包和内容 release。
- 症状入口不等于园艺原因；Outcome 与 Action 各自从 CMS 已审核的兼容 release 读取，并可回溯具体来源、适用植物、证据与禁忌。未发布或撤回知识不得成为可见结论/行动。
- 同症状多原因、混合/未知、证据冲突、禁忌动作和版本回放均由独立 Expected 与持久化读回验证；生成式模型不得补造未发布的病虫害或治疗知识。
- 黄叶、萎蔫、虫害的代表样本均须输出有证据边界、分步骤的可执行检查或处理、明确暂不做的动作及可复查条件；证据不足时不得确定病因，且不依赖生成式实验过关来满足基础内容底线。
- 诊断不能直接写事实和计划。
- 小青只能访问当前用户植物上下文。
- 诊断增强候选以相同样本对照现行版本的行动质量、Token、供应商成本、单动作预占与实际扣点；未通过成本和额度门时保持关闭。
- 后续固定题包完成奖励开放时按冻结窗口幂等；首版不发积分。

## P5 / 真实 MySQL、API、安全和性能验收

### 目的

在真实测试环境验证数据库、HTTP、外部适配器、并发、重放、故障恢复、成本和安全边界。

### 验收

- 真实数据库读回通过。
- 真实 HTTP 不以 200 代替业务验收。
- 并发额度和积分不超发。
- 失败可重试且不半写。
- 敏感字段和内部 ID 不泄露。
- 黄叶、萎蔫和虫害诊断的可见 Outcome/Action 在真实 HTTP + MySQL/CMS 发布读回中能回溯来源主张、适用条件与锁定 release；撤回后新会话不再使用，历史结果仍可按原版本回放。

## P6 / OpenAPI 冻结与精确清理

### 目的

冻结前端接入所需 API 文档，核对所有旧资源处置结果，并按精确清单清理测试资源和过期 OpenViking 条目。

### 验收

- OpenAPI、DTO、AJV Schema 和路由清单一致。
- 所有旧资产有最终 KEEP/ARCHIVE/DELETE 结果。
- 删除前有替代物、回退和读回证据。
- OpenViking 删除使用精确 URI。
- 结论只能是后端服务验收通过，不能宣称前端验收。

## P1 / 公共 HTTP 合同与 OpenAPI 路由骨架（z8v0kmr9ge）

### 模块与负责人

- 模块：`foundation`；负责 agent：`root`。
- ClickUp：[公共 HTTP 合同与 OpenAPI 路由骨架](https://app.clickup.com/t/90182453517/z8v0kmr9ge)。
- 入口：`contracts/http-api.md`、`api/README.md`、`cloudfunctions-v2/test/p1-api-skeleton.spec.ts`。

### 目的

冻结 `/api/v2` 具体路由登记、Principal/安全级别、DTO/AJV、公开错误、幂等/并发、服务签名和由登记表生成的 OpenAPI 3.1 P1 骨架；真实业务实现和 CloudBase/API/数据库集成留在后续阶段。

### 验收

- 路由登记表为唯一事实源，至少 35 条具体 method/path，无通配符或重复路由。
- 每条路由具备 owner、Phase、security、请求/响应合同、幂等方式和错误集合。
- `public`、`guest_or_authenticated`、`authenticated`、`service` 边界与固定请求处理顺序可检查。
- 成功响应 `{data: ...}`、错误响应 `{error:{type,message}}` 固定，禁止内部 ID、SQL、Prompt、模型原文、token 和追踪 ID。
- 状态改变接口支持同键同参幂等、同键异参 `409 IDEMPOTENCY_CONFLICT` 和版本冲突。
- 服务签名校验 `key_id/timestamp/nonce/body_sha256/scope/signature`，失败统一 `PRINCIPAL_INVALID`。
- OpenAPI 3.1 与登记表逐路由一致，含扩展字段、默认错误响应和 manifest SHA-256。
- `npm --prefix cloudfunctions-v2 test -- test/p1-api-skeleton.spec.ts`（`unit_real_data`）通过并保留历史 RED 证据。
- 未授权 CloudBase 控制面、网关、函数、MySQL/CMS/Storage、部署、DDL、迁移、凭证和真实供应商写入。

## P1 / 植物分类与身份准入硬门（z8v0kmr9gm）

### 模块与负责人

- 模块：`plant-knowledge`；负责 agent：`taxonomy_gate_terra + root`。
- ClickUp：[植物分类与身份准入硬门](https://app.clickup.com/t/90182453517/z8v0kmr9gm)。
- 入口：`contracts/plant-taxonomy.md`、`audits/P1-taxonomy-human-decision-2026-09-20.md`、`audits/P1-taxonomy-human-approval-2026-09-20.json`、`audits/taxonomy-approval-2026-09-20/seed-manifest.json`、`implementation/taxonomy-transform-pending-rebuild.md`。

### 目的

对 200 条候选逐条建立 authority evidence、稳定 ID、版本、等级、父链、accepted/synonym、冲突与审核决定；代表性 P0 证伪 PASS 不得外推为身份准入 GO，未证明记录保持 `QUARANTINE/NOT_ADMITTED`。

人工裁决已冻结为 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`。当前 106 条只获准进入本地未激活 seed；来源记录 29、73、98、123 必须完成独立身份重建和复核后才能把 `seedEligible` 提升到 110，active release 在独立验收前始终为 `STOP`。

### 验收

- 200 条候选逐条 manifest 含来源、稳定 ID、acceptedScientificName、rank、parent chain、版本、时间、证据哈希和审核决定。
- family/genus/species/种下/hybrid/cultivar/species_group 等等级规则和父链校验可回放；缺父链不得 ACTIVE。
- POWO/WCVP 403 不得冒充分类证据；RHS `NO_VERSION_PUBLISHED` 不得用访问时间替代版本。
- 重复科学名、别名、Brassica 冲突和无法证明记录均有人工可追溯决定，禁止模型自动择一。
- 分类实体四态与产品身份三态、百科和养护/安全/诊断知识分层不可互写。
- 只有证据完整、冲突裁决、父链有效且未隔离的记录进入不可变 active release；具备 SHA、单指针和回退记录。
- 隔离 v2 空库导入与持久化读回证明隔离记录不会被 catalog/identify/CMS/care/diagnosis/Agent 查询。
- 缺证据、断父链、冲突、重复、伪造版本和跨 release 读取均有负向 Expected/RED；通过 manifest/sidecar 核验。
- 失败时保留 STOP 原因、影响能力和恢复条件，不自动发布或发奖励。
- 29、73、98、123 的新 authority key、原始制品 SHA、来源版本、完整父链、中文规范展示名和名称关系逐条闭环；两条栽培品种缺可版本化 RHS/ICRA 登记证据时必须失败关闭。
- 未授权 CloudBase、MySQL/CMS/Storage、云函数、网关、DDL、迁移、部署、删除、凭证和真实供应商写入。

## P1 / 业务策略与统一 Provider 配置架构（z8v0kmr9gn）

### 模块与负责人

- 模块：`foundation`；负责 agent：`root + config_business_luna + provider_config_terra`。
- ClickUp：[业务策略与统一 Provider 配置架构](https://app.clickup.com/t/90182453517/z8v0kmr9gn)。
- 入口：`architecture/configuration-and-providers.md`、`architecture/configuration-variable-catalog.md`、`architecture/configuration-variable-catalog.json`；只有目录项要求时才继续读取其 `sourceRefs`。
- 当前闸门：`audits/P1-configuration-architecture-exit-gate.md`，结论为 `ARCHITECTURE_GO / IMPLEMENTATION_STOP`。

### 目的

在业务实现前冻结部署/密钥、Provider 运行配置和领域业务策略三分层，盘点变量与 provider，统一 ProviderConfig/Registry/Adapter 合同，确保版本、审批、回滚、last-known-good、credential_ref、请求快照、失败关闭和安全降级可审计。

### 验收

- 每个功能实现前先通过配置化裁决门：只有真实变化概率与运营/安全/成本/兼容/回滚收益明显大于类型、校验、发布、测试和运维复杂度时才配置化；最终裁决由主代理写入唯一目录。
- 162 项业务/治理变量与 12 个首批 Provider 档案逐项记录来源、owner、用途、状态、当前值或待冻结原因、失败/阻断范围、Phase、真实 ClickUp ticket 和 Expected，并有 SHA-256/读回。
- 三层边界及引用规则明确；部署/密钥层只提供 `credential_ref`，不能覆盖业务策略。
- 不可配置硬规则至少覆盖游客/user_id、user_plant 归属、身份隔离、脱敏、幂等/唯一约束、用户确认写事实和 CloudBase Agent 边界。
- ProviderConfig/Registry/Adapter 字段、scope、timeout/deadline、retry、quota/cost、fallback、redaction 及中文注释冻结。
- 配置版本含 `configVersion/effectiveAt/contentSha256/approvalRef/status/lastKnownGoodRef/rollbackRef`，以不可变版本和单指针发布。
- 请求只解析一次不可变 configuration snapshot，后续 adapter/日志/审计只引用 snapshot hash。
- 凭证只允许 `credential_ref`；缺敏感配置 fail closed，日志/响应/测试/ClickUp 不含 secret 或 URL query key。
- timeout、重试、未知结果、额度、预算、provider 不可用和不安全 fallback 均有失败关闭/安全降级规则，禁止静默切换。
- 百度、分类权威源、百炼问诊、百炼百科、和风、微信支付、平台通知、CloudBase Auth/Storage/CMS/Agent/MySQL 均有独立配置档案；任一 `P1_PENDING` 字段都不得由 Adapter 自行补默认值。
- 已冻结 CMS Worker 单并发、最多三次和真实模型预算 0；AI 产品动作按小青文本、文本诊断、单图和多图逐项登记，不使用一个泛化预算掩盖差异。
- schema、registry、adapter、快照、版本、回滚和脱敏有 `unit_real_data`/source-contract 测试与审计门，所有关键类型/字段有中文注释。
- 未授权 CloudBase、云函数、网关、MySQL/CMS/Storage、部署、DDL、迁移、密钥绑定、provider 切换和真实供应商请求。
