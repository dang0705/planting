# 青花植后端 v2 实施资料导航

本文件是本次重构的唯一发现入口（Implementation Entry）。它负责告诉 agent 从哪里开始读、下一层读什么以及哪些内容暂不读取；它不是计划正文，也不允许复制计划正文。

根目录的 Master Plan 是唯一计划正文（Canonical Master Plan）。本目录的所有子文件只能把正文拆成可按需读取的实施资料，不能新增、删改或重新解释业务语义。

## 唯一基线

- 文件：[青花植后端v2底层架构重构计划_融合闭环终版.md](/Users/jay/WebstormProjects/planting/青花植后端v2底层架构重构计划_融合闭环终版.md)
- 基线标题：`backend-v2 整体重构计划：多版本交叉验证完整版`
- 基线 SHA-256：`0cb3e338bdb7af499599926de0b895e9e146d9f64eacd3cd1a7295cd224e2f30`
- 基线行数：658
- 入口角色：上下文优先按 planting OpenViking 分层召回；只有各层均无法提供当前任务所需内容时，才定向读取本目录特定实现章节。禁止全目录读取。
- 正文角色：只有根目录 Master Plan 可以作为完整计划正文；`BASELINE.lock` 是其机器可核对的锁，不是第二份计划。

## 入口核对

开始任何实施任务前，运行：

```bash
node docs/backend-v2/verify-entrypoint.mjs
```

该命令只读核对 Master Plan 的标题、行数、SHA-256、导航入口和进度数据；失败时必须停止并报告 `BLOCKED_PLAN_BASELINE`，不得自行修复或选择其他版本。

## 渐进式读取顺序

```text
Master Plan
→ architecture/ 架构模块
  → configuration-variable-catalog.md 按领域定位关键变量
  → configuration-variable-catalog.json 仅在字段核验时读取机器事实
→ contracts/ 业务与接口合同
→ api/ 具体路由与 OpenAPI 骨架
→ data/ 数据、状态与处置
→ implementation/ 实施细节
→ testing/ 测试与验收
→ phases/ 当前阶段
→ clickup/ 任务绑定
→ tracker/ 可视化追踪
```

Master Plan 保留完整目标、架构、边界、Phase、风险和完成标准；本目录只承载实施时需要按模块读取的细节。

## 渐进式披露纪律

1. 先读本文件和 `BASELINE.lock`。
2. 按 ticket 的 Phase 与模块，只打开一个直接子入口（例如 `phases/P1-contracts-identity-foundation.md`）。
3. 子入口只列出下一层文件名；只有验收标准明确需要时，才继续读取其中一个具体文件，并记录扩展原因。
4. 不得为了“了解全局”递归读取全部目录；未读取范围必须写在任务开始和交接记录中。
5. 入口、Master Plan、架构、合同、Expected 或 ticket 状态冲突时，停止实现，交由主代理裁决。
6. 涉及业务数值、阈值、期限、上限、预算、版本、Provider、超时或重试时，先在中文变量目录定位单项，再按该项 `sourceRefs` 深读；禁止一次性深读全部变量引用。

## 当前实施状态

### 当前目标的执行约束

- 完成范围仍是本入口所指向的完整后端 v2 任务；10 条分类证据样本只是本轮验证证据格式与回放方法的检查点，不是 P1 分类准入完成标准，也不把原定 106 条任务缩减成 10 条。
- 106 条候选的来源匹配、父链、来源制品哈希由[分类权威来源回放脚本](audits/taxonomy-authority-replay.mjs)批量核对；[原始行证据脚本](audits/taxonomy-approved-raw-rows.mjs)已具备全量生成能力，命令见[回放说明](implementation/taxonomy-authority-replay.md)。官方原始行哈希目前只固化了 10 条样本；未取得并读回本批 106 条输出前，不得声称全量验收。模型不逐条撰写机械审计长文。29、73、98、123 四条争议记录独立隔离，仅它们及脚本报告的真实来源冲突交由模型作身份语义和人工裁决建议，不阻断其余 106 条。
- 派工先选实际开放的功能纵向链路：明确 HTTP 入口、真实 MySQL 写入/读回及适用的 CloudBase 测试环境验收，再做该链路所需的 MVP 健壮性。发布指针、额度故障恢复等局部生产级加固，若不是当前链路的必要条件，不得抢占切片优先级；已有代码或边界文档不等于链路闭环。
- 独立业务切片可并行，但每个代理须绑定明确的 ticket、独占改动边界与验收产物；先复用仍在工作的具名代理。先从本入口定位并仅读当前任务所需章节；适用 skill 主文件仍须完整读取，无关引用不展开。批量匹配、状态差异、哈希、计数和固定格式核对交给脚本，模型只处理脚本报告的异常与业务裁决。遵守用户此前指定的子代理模型档位，不擅自降档；通过减少机械性模型调用控制成本。心跳、交接和审计只在事实变化、可验证里程碑、阻断或验收时写简短证据，不为时钟或页面进度重复生成长文，也不因旧心跳单独唤起代理。
- ClickUp 与本地 H5 的状态必须以远端读回和可验证产物为依据。维护任务配置周期为 30 分钟，但当前处于暂停状态；未恢复前没有自动同步，不得声称已生效，也不得擅自恢复。恢复后先用脚本处理机械差异，只有状态变化、冲突、失败或裁决才唤起模型；完整目标仍须逐项验收。

当前执行目标按[首版运行边界](phases/first-release-scope.md)排序：先提供第一次解决植物问题的能力，再取得“临时使用 → 显式创建或绑定用户植物 → 再次养护或问诊”的真实主旅程证据，随后支持复访与付费价值。首个真实平台登录选择微信小程序。完整目标架构和后续任务保持不变，但架构节点不自动生成独立功能切片；仅实际开放的主旅程及关键跨域风险要求端到端验收。独立领域可并行开发，也不得以内部模块数量替代真实 HTTP、MySQL 与 CloudBase 测试环境读回。优先测量数据库建连、查询与请求时延；连接复用、超时和并发预算必须依据实测及已确认的容量配置实施，不因局部质量评分提前扩张加固。

Tropicals 分类和俗名数据只作为植物身份候选来源。2026-09-27 对 v2 测试库的只读核对：409,880 条分类记录、1,204,618 条俗名记录；俗名按 `taxon_id` 关联的孤儿记录为 0，409,870 个分类记录有中文名，但 911,061 个不同中文名称中有 66,712 个对应多个分类记录。抽样还发现亚种、栽培品种被统一标作 `species`。因此候选搜索必须保留重名的多个结果，不能同名直选；行数与关联完整不等于权威来源、父链或人工准入审核，正式身份写入仍保持关闭；MVP 产品覆盖率和数据归档哈希仍未验证。

**首版发布裁决已确认：自动 CMS 扩种、CMS 拓百科及其贡献奖励暂缓；基础百科以 CloudBase SQL `qinghuazhi_v2_test.tropicals_species_encyclopedia_ref` 为运行时主读，Tropicals 实时 API 只保留为可选同步/来源/后续能力。** 2026-10-03 实库精确读回：百科 271,810 行、分类 409,880 行、俗名 1,204,618 行、`tropicals_growth_season_knowledge` 47,131 行、`watering_baseline_policy` 22 条 active、`plant_search_documents` 271,384 行、`plant_identities` 192 行（ACTIVE 191）；`tropicals_trait_ref` 仍为 0 行。展示百科不能直接进入 Care/Diagnosis，但结构化性状可作为证据，经 plant-knowledge 来源保留、归一、审核并发布成 Internal Care Knowledge / Reference Profile 后再被消费。诊断知识 CMS 审校与版本发布不暂缓。Care 模型结构已更新：光照走 DNI/DHI/GHI → 太阳几何 → 窗面 Direct/Diffuse → PPFD → DLI；室内环境实测优先、估算必须明示；浇水走 Baseline → EnvironmentDemand / CultivationRetention / PersonalCalibration → DryUnit/DryProgress → Soil Safety Gate。Watering 禁止消费 `indoorEqHours`、`dryDownFactor` 或 `rootZoneMoistureIndex` 作为一级决策链；当前未冻结的是具体敏感度、阈值和真实链路验收，而不是模型职责。

- P-1 资产审计、P0 决策/证伪和既有 P1 合同/Schema 已通过对应出口门；当前 P2 改为纵向切片优先。公开植物只读链路、用户植物的测试会话读取，以及创建后 MySQL 落库、GET 读回和同键重试，均已在 CloudBase v2 测试环境验收，证据见 `audits/v2-user-plant-cloudbase-read-2026-09-27.md` 与 `audits/v2-user-plant-create-2026-09-27.md`。真实平台登录、会话签发和能力快照生成仍未验收，不能用测试夹具替代。已登录用户临时植物合同现已冻结为独立 UserPrincipal backing case，016/017 已形成迁移设计；TTL 策略、真实 MySQL 执行/约束读回、HTTP 接线和 Expected 仍未完成前，该路径不得宣称运行验收通过。
- 植物分类人工裁决已形成 106 条本地未激活种子候选，但逐条权威证据与父链尚未完成正式准入；4 条待转换记录独立隔离和复核，不作为 106 条首版准入的前置条件。active release 保持 `STOP`，正式开放须经 P1 准入和 P2 数据库发布验收。该局部门禁不阻断 `identity`、`subscription`、`user-plant` 与 `foundation`。
- P2 Foundation 已开始首个 TDD 切片；进度和未覆盖范围以 `implementation/foundation-request-chain.md` 与对应 ticket 心跳为准，不以模块存在冒充整项完成。
- 测试环境的独立数据库、两条 HTTP 云函数和对应网关路由已建立；CMS/Storage 新写路径尚未验收。2026-10-03 实时读回已确认 Tropicals 分类 409,880、百科 271,810、俗名 1,204,618、生长季知识 47,131，以及 22 条 active 浇水基线；这些仍是外部参考/性状证据，不等于内部规范身份、Internal Care Knowledge 或可发布安全事实。正式身份与结构化性状进入运行时仍须各自通过审核/release。
- ClickUp：29 个任务均已创建；定时维护任务当前暂停，不存在自动核对或同步承诺。恢复后须先核实实际调度周期，并以逐项远端读回状态为准。
- 前端：不在本阶段范围。

## 执行进度入口

唯一计划正文仍为上述根目录 Master Plan。当前步骤、票据、验收环节及下一动作以 `.codex/backend-v2/task-progress.json` 为准；每小时自动化只同步该记录，禁止读取本目录或源码。原周期及维护职责以统一计划第七节为准。
