# 养护事件（换盆、修剪、施肥、打药）规划与 v1 施肥逻辑审查

- 日期：2026-10-10；性质：**只读调研 + 规划，待用户审**。不写产品代码、不建 DDL、不改配置目录（配置项只给登记建议，由主代理裁决）。
- 起因：用户指出 v2 尚未涉及换盆、修剪、施肥、打药等园艺事件；v1 有施肥时间逻辑，需判断能否直接用。
- 证据：`.codex/backend-v2/evidence/E06-care-events-v1-fertilizing-audit-2026-10-10.json`。

## 1. v1 施肥逻辑现状（只读审查）

### 1.1 涉及代码与数据

| 位置 | 作用 |
|---|---|
| `cloudfunctions/layer/utils/fertilization-reminder-planner.js`（583 行） | 月表规则解析、条件问答、下次检查日期计算、诊断“暂缓施肥”护栏 |
| `cloudfunctions/layer/utils/fertilization-history.js` | 读 `user_fertilization_events`（施肥历史） |
| `cloudfunctions/plant-user-http/fertilization-reminder-{domain,service,storage,mapper}.js` | 提醒创建（pending 15 分钟）→ 确认（写手机日历）→ 完成/取消；表 `user_fertilization_reminder_events` |
| `cloudfunctions/layer/utils/plant-knowledge.js` | 从 `genus_care_profiles.fertilizing_monthly_strategy_json` 读属级月表（只认 `reviewStatus=audited` 且有来源） |
| `SQL-cvs/genus_fertilizing_monthly_audit_v1.json`（版本 `fertilizing_monthly_v1_2026_08_09_r3`） | 月表数据源：151 个属（148 audited、2 conflict、1 unsupported），其余属默认 `unsupported` |
| `cloudfunctions/diagnose-http/services/session-state-write-service.js` | 诊断命中“过湿根系压力”时**直接写** `user_plants.fertilization_guard_json`（暂缓 7 天） |
| 前端 `src/pages/index/components/FertilizationMonthlySheet.vue`、`fertilization-reminder-options.js` | 月表展示、`uni.addPhoneCalendar` 写日历 |

### 1.2 输入 → 规则 → 输出

- **输入**：
  - 植物属（genus，经身份 → 属级养护档案）；
  - 当前**日历月份**；
  - 肥料类型（`liquid` 液体肥 / `slowRelease` 缓释肥，二选一）；
  - 上次施肥日期及来源（`recorded` 记录 / `user_asserted` 用户自述 / 无）；
  - 条件问答（如“最近有长新叶吗”“现在是温暖生长季吗”）；
  - 植物健康状态（`danger` 拒绝）；
  - 诊断护栏。
- **规则**：
  1. 按“属 × 月份 × 肥料类型”查月表单元格，得到 `interval`（如每 2～4 周）、`pause`（暂停）、`avoid`（不建议）、`annual_count`、`event` 或 `unspecified`。
  2. 只有 `interval` 且有来源的单元格才“可靠”，才能排提醒。
  3. 单元格可带条件码，用户全部答“是”才放行；`container_context` 自动满足。
  4. 日期计算：
     - 有上次施肥时，取 [上次 + 最短间隔, 上次 + 最长间隔] 的中点；
     - 无上次施肥时，取今天 + 最短间隔；
     - 已到期则定为今天。
  5. 提醒固定在当天 09:00，写入手机日历。
- **输出**：`nextCheckDate`、最早/最晚日期、`dueNow`，规则快照（含来源名）。
- **科学依据**：属级月表来自 RHS、美国多所大学推广站（UMN、UMD、UGA、Iowa State、UF/IFAS 等），逐单元格有来源引用。**不是拍脑袋的固定天数**，但有以下局限：
  - 月份是**温带（英美）日历月**，scope 标为“温带室内盆栽参考”。中国从海南到东北气候差异大，“4～9 月生长期”不能直接套用，v1 用“现在是温暖生长季吗？”的问答兜底。
  - 只覆盖 151 个属；缓释肥大多为 `unspecified`（按产品标签）。
  - 生长判断靠用户自答，没有和环境数据（温度、光照）联动。

### 1.3 逐条评估：能否搬到 v2

| v1 要素 | v2 宪章检查 | 结论 |
|---|---|---|
| 属级月表数据（151 属、逐格来源） | 有依据、可审计；但来源是温带日历月，需加“本地生长季”判定；在 v2 里属于**植物知识**，只能作为证据进入 care，不能让 care 直连百科表 | **改造后复用**：作为 plant-knowledge 已发布知识（带版本和来源）供 care 读取 |
| 液体/缓释二分、`pause`/`avoid`/`interval` 语义 | 与 v2「事实 → 派生 → 建议」兼容 | **改造后复用**（枚举进入合同） |
| 条件问答（长新叶、温暖季…） | v2 建议需要证据，问答可作为“用户本次确认的观察”；但不应每次都问 | **改造后复用**：长新叶等改为可选观察输入；温暖季改由城市气候数据推断，没把握时才问 |
| 日期中点、首次取最短间隔、09:00 | 中点是工程取舍，无文献依据；09:00 写死 | **改造后复用**：v2 输出“检查窗口 [最早, 最晚]”与长期浇水一致，不给单点日期，也不写死 09:00 |
| `user_fertilization_events` / `user_fertilization_reminder_events` 表、`_openid` 归属 | 违反 v2：以 openid 归属、旧表 | **不建议复用**：施肥事实进 `care_facts`，提醒进 `care_proposals` / `care_plans` |
| 提醒 pending 15 分钟 → 写手机日历 | v2 已有“建议 → 用户确认 → 计划 + 日历字段”流程 | **不建议复用**：沿用 long-term-care §6～§9 |
| 诊断直接写 `fertilization_guard_json`（过湿根压 → 暂缓 7 天） | **违反**“诊断只产生建议，用户确认后才写”；7 天无来源 | **不建议直接复用**：改为诊断上下文/建议里的“近期不建议施肥”提示，作为派生证据，不写档案字段 |
| `healthStatus = danger` 一律拒绝 | 合理的保守规则，但 v2 没有 healthStatus 字段 | **改造后复用**：改为“近期诊断结果为根系/肥害类时不出施肥建议” |
| 规则内嵌在代码与 CMS 字段 | v2 要求参数走策略发布或知识发布 | **改造后复用**：算法版本 `care.fertilizing.algorithm_version`（已 pending）+ 知识发布 |

**总结**：v1 的**数据和语义**值得保留（有来源的属级月表、液体/缓释、暂停/避免）；**存储、提醒流程、诊断直写护栏和温带日历月假设**不能直接搬。

## 2. v2「养护事件」最小模型

### 2.1 原子事实（用户记录，不可修改）

复用 `care_facts` 表（`fact_type` 为 VARCHAR、无 CHECK 约束，新增类型不需要 DDL），仍走 `POST /api/v2/care/user-plants/{ref}/facts`，按 `factType` 分别校验载荷：

| factType | 必填 | 可选细节（全部可空） | 说明 |
|---|---|---|---|
| `watering` | occurredAt | amountMl | 已有 |
| `fertilizing` | occurredAt | `fertilizerForm`: liquid / slow_release / organic / unknown；`dilutionNote`（≤40 字） | 不收剂量数值，避免被误当处方 |
| `repotting` | occurredAt | `potAfter`（measured-pot-profile/v1 同结构）、`substrateAfter`（与档案 substrate 同结构）、`reason`: root_bound / soil_old / pot_broken / rescue / other | 换盆前尺寸取当时档案快照，由服务端写入载荷，客户端不提交 |
| `pruning` | occurredAt | `scope`: dead_leaves / shaping / pest_removal / root_trim / other | |
| `pest_treatment` | occurredAt | `agentName`（**必须在视觉诊断药剂允许名单内**，见 visual-diagnosis-plan D13）或 `method`: manual_removal / water_spray / isolation / other；`sourceDiagnosisRef`（可选） | 名单外药剂名 → 400；不收浓度与用量 |

- 归属：`user_id` + `user_plant_id`；归档植物 409、删除中 404（与浇水一致）。
- 补记窗口：浇水为 7 天。施肥、换盆、修剪、打药建议放宽到 30 天（用户常事后补记），需新增配置项（见 §4）。
- 幂等：沿用 `Idempotency-Key` + `source_command_ref` 唯一约束。
- 时间线：新增 `care_fertilizing`、`care_repotting`、`care_pruning`、`care_pest_treatment` 四种展示类型。在同一事务写 `care_outbox` 事件 `care.fact_recorded.v1`（统一一个事件类型，载荷带 factType），由现有 `care-outbox-dispatch` 派发到时间线。
  - 需要迁移：放开 `ck_care_outbox_event_type`，参照 029。
  - 摘要只带类型和枚举细节，不带备注原文。

### 2.2 对现有能力的联动

| 事件 | 联动 | 方式（事实 → 派生 → 建议） |
|---|---|---|
| 换盆 | 更新档案盆尺寸/基质 | **不由 care 直接改档案**：换盆事实提交成功后，响应提示“是否同步到档案”，用户确认后调用档案 PATCH（user-plant 域）。也可以做成同一请求内的显式选项 `applyToProfile: true`，由 care 经 user-plant 端口同事务写入（待拍板 D3） |
| 换盆 | 重置干燥周期 | 浇水建议把“最近一次换盆”当作新的起点：换盆后盆土状态未知，上次浇水不再作为干燥起点，要求重新观察盆土（派生规则，进入浇水策略版本） |
| 换盆 | 诊断上下文 | 近 N 天换盆 → 诊断上下文标记“移栽胁迫可能”（只作证据，不下结论） |
| 施肥 | 施肥建议 | 若首版做施肥建议，读最近一次施肥事实作为间隔起点（见 §3） |
| 施肥 | 诊断上下文 | 近 N 天施肥 → 肥害（烧根、叶缘焦枯）方向加权证据；长期无施肥 + 老叶黄化 → 缺素方向证据 |
| 打药 | 诊断复查 | 若打药带 `sourceDiagnosisRef`，生成一条“复查”建议（用户确认后成为计划），复查间隔取药剂名单中的标签间隔，名单没有就不生成 |
| 打药 | 安全间隔期 | 只提示“按产品标签安全间隔期”，不计算具体天数（无可靠统一来源）；可食用植物额外提示 |
| 修剪 | 诊断上下文 | 近期修剪 → 伤口/切口相关症状解释证据 |

- 所有联动都是**读事实做派生**，不反向改写事实。诊断方面只读取，不写入 care。
- 诊断上下文读取近 N 天事件：N 需要配置化，见 §4。

### 2.3 复用清单

- 表：`care_facts`（不改结构）、`care_outbox`（迁移放开事件类型）、`user_plant_timeline_projection`（新 `item_type`，无 CHECK 约束）。
- 代码：浇水事实的路由、幂等与归属锁复用为“按 factType 分派校验器”；时间线投影与派发复用 `project-care-timeline-event`。
- 奖励：`care.fertilizing_check_completed.v1` / `DUE_FERTILIZER_CHECK`（5 积分）已存在，只奖励“到期施肥条件检查”而非施肥次数；**记录施肥本身不发积分**（与 care-points 合同一致）。

## 3. 施肥建议首版做不做

**推荐：首版只做“记录事件 + 诊断上下文使用”，施肥建议放在依据审定后的下一版。**

理由：
1. v1 月表是温带日历月，直接用会给南方用户“1～3 月暂停”、给北方暖气房用户错误节律。这需要先定“本地生长季”判定（城市气候 + 室内温度），而 weather 城市气候数据现已就绪，可以支撑。
2. v2 的浇水建议已证明“证据不足就明说”，施肥建议同样需要品种绑定 + 生长季证据。现在先积累施肥事实，后续建议才有间隔起点。
3. 首版做记录，改动面小（复用 care_facts），并且马上能服务诊断（肥害/缺素/移栽胁迫）。

若做施肥建议，所需依据与参数（全部 pending，进配置目录前需用户审定）：
- **知识**：属级月表迁入 plant-knowledge 发布，并把“月份”改写为“生长阶段”（生长期/半休眠/休眠）。来源沿用 RHS 与推广站，conflict 的 2 个属不发布。
- **本地生长季**：按城市月均温推断（例如月均温低于某阈值视为生长停滞；阈值需文献依据），室内暖气场景以室内温度实测覆盖。
- **肥料类型**：液体肥给检查窗口；缓释肥只提示“按标签”，不排间隔（v1 数据大多 unspecified）。
- **禁忌**：近期换盆（通常建议换盆后一段时间不施肥，天数需来源）、近期诊断为根系问题/肥害、休眠期。
- **输出**：沿用 `care-capability-output` 的 `fertilizing` 能力：可施肥窗口 + 禁忌 + 复查时间，确认后才成为计划。

## 4. 配置目录登记建议（全部 pending，由主代理裁决）

| 建议 id | 含义 | 建议值 / 状态 | 理由 |
|---|---|---|---|
| `care.facts.non_watering_backfill_max_days` | 非浇水事件最长补记天数 | 建议 30，pending | 用户常事后补记换盆/施肥 |
| `care.facts.pest_treatment.agent_allowlist_ref` | 打药事件药剂名单引用 | 复用 `diagnosis.visual_gen.agent_allowlist_ref`，pending | 与诊断同一名单，避免两份 |
| `diagnosis.context.recent_care_event_days` | 诊断上下文回看天数（按事件类型） | pending（需园艺依据） | 移栽胁迫、肥害的时效 |
| `care.watering.repotting_resets_drying` | 换盆后重置干燥起点 | 建议 hard_rule true，待审 | 盆土与盆器都变了 |
| `care.fertilizing.algorithm_version` | 施肥建议算法版本 | 已存在，保持 pending | |
| `care.fertilizing.post_repotting_pause_days` | 换盆后暂缓施肥天数 | pending（需来源） | |
| `care.fertilizing.growth_season_rule` | 本地生长季判定（城市月均温阈值） | pending（需来源） | 替代温带日历月 |
| `plant-knowledge.fertilizing_monthly.release` | 属级施肥月表知识发布 | pending | v1 151 属迁入 |

## 5. 需要用户拍板的点（含推荐）

| # | 问题 | 推荐 |
|---|---|---|
| D1 | 首版范围 | 只记录换盆/修剪/施肥/打药事件 + 时间线 + 诊断上下文；施肥建议下一版 |
| D2 | 事实类型命名 | `fertilizing`、`repotting`（DDL 注释已有）、新增 `pruning`、`pest_treatment` |
| D3 | 换盆是否同步档案 | 默认不自动改；提交换盆时可勾选“同步到档案”（同一请求显式选项），未勾选则只记事实 |
| D4 | 打药药剂名 | 只能从诊断药剂允许名单选，或选“非药剂方式”；不收用量/浓度 |
| D5 | 补记窗口 | 非浇水事件 30 天 |
| D6 | 换盆后浇水 | 重置干燥起点，要求重新观察盆土 |
| D7 | v1 属级月表 | 改造后复用：迁入 plant-knowledge 发布，月份改生长阶段，本地生长季由城市气候推断 |
| D8 | v1 诊断直写“暂缓施肥” | 废弃，改为诊断/建议中的提示证据 |
| D9 | 记录事件是否给积分 | 不给（与积分合同一致），只保留到期施肥检查 5 积分 |
| D10 | 时间线事件 | 统一 `care.fact_recorded.v1` 一个事件类型（载荷带 factType），需迁移放开 care_outbox 检查约束 |
