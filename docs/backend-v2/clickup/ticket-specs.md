# Phase Ticket 预创建规格

以下规格是 ClickUp ticket 的完整内容模板。当前 24 个 ticket 均已生成真实 ID；其中本文件末尾的三项 P1 补建 ticket 已通过用户 Chrome `default/main` 主 profile 创建并回读，状态以 ticket-index 与 tracker 心跳为准。

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

冻结用户植物一等公民、暂未识别状态、游客临时会话、同会话认领、归属校验和事实边界。

### 验收

- 长期数据均有 `user_id + user_plant_id`。
- 游客不能拥有用户植物。
- 同一会话登录后可以显式一次性认领。
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

## P2 / 统一身份 Principal

### 目的

实现多平台身份到统一 `user_id` 的解析、绑定、解绑、session 轮换和游客主体隔离。

### 验收

- 同一平台主体不能绑定多个用户。
- 用户可绑定多个平台。
- 解绑和失效 session 不能继续访问业务数据。
- 业务域不能自行解析平台身份。

## P2 / CMS 分类、百科和发布

### 目的

实现分类实体、产品身份、证据、候选池、展示百科补全、Qwen 禁区校验、CMS 审核和不可变 release。

### 验收

- 百度只产生候选。
- Qwen 不得输出分类、养护、安全和诊断字段。
- 身份未发布不得生成百科任务。
- 私有图片不能进入公共 release。
- release 发布成功后才能产生贡献奖励事件。

## P3 / 游客、试用、会员和奖励闭环

### 目的

打通游客能力、登录免费、24 小时试用、会员、积分等级、CMS 贡献奖励、奖励查询和兑换。

### 验收

- 游客能力不要求会员且不扣 AI 额度。
- 免费用户能使用有效、scope 匹配的奖励额度。
- CMS 新身份奖励 100 点、内容奖励 50 点，全局主题只发一次。
- 兑换使用 `Idempotency-Key`，并发不产生负余额。

## P4 / 盆土视觉和四类养护能力

### 目的

实现盆土短时证据以及浇水、施肥、光照、通风统一输出合同，并接入可奖励的到期检查事件。

### 验收

- 盆土证据有植物归属、采集时间和有效期。
- 湿土、证据不足和过期证据触发安全门。
- 视觉不自动记录浇水。
- 室外风速不直接等于室内通风。
- 养护输出版本稳定、中文语义完整。

## P4 / 固定/动态问诊与小青工具

### 目的

实现黄叶/萎蔫固定题包、动态虫害题包、诊断结果、建议确认、受控小青工具和固定题包奖励事件。

### 验收

- 诊断结果锁定题包和内容 release。
- 诊断不能直接写事实和计划。
- 小青只能访问当前用户植物上下文。
- 固定题包完成奖励按冻结窗口幂等。

## P5 / 真实 MySQL、API、安全和性能验收

### 目的

在真实测试环境验证数据库、HTTP、外部适配器、并发、重放、故障恢复、成本和安全边界。

### 验收

- 真实数据库读回通过。
- 真实 HTTP 不以 200 代替业务验收。
- 并发额度和积分不超发。
- 失败可重试且不半写。
- 敏感字段和内部 ID 不泄露。

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
- 入口：`contracts/plant-taxonomy.md`、`audits/P0-taxonomy-exit-gate.md`、`audits/P0-taxonomy-evidence-z8v0kmr96x.json`。

### 目的

对 200 条候选逐条建立 authority evidence、稳定 ID、版本、等级、父链、accepted/synonym、冲突与审核决定；代表性 P0 证伪 PASS 不得外推为身份准入 GO，未证明记录保持 `QUARANTINE/NOT_ADMITTED`。

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
