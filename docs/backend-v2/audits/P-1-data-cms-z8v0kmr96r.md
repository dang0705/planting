# P-1 SQL、数据模型、CMS 与内容资产审计

> ticket：`z8v0kmr96r`（`[P-1] SQL、数据模型、CMS 和内容资产审计`）  
> 负责人：`audit_data_cms_luna`  
> 审计时间：2026-09-19（Asia/Shanghai）  
> 范围：只读；没有修改业务代码、公共合同、Expected、DDL、前端或 tracker 公共结构。

## 0. 结论先行

本次审计完成了本地 SQL、数据模型、CSV/XLSX、固定题包和历史 CMS 只读证据盘点；主代理已在 2026-09-19 22:33+08 回传当前 CloudBase/MySQL/CMS 只读摘要，因此此前“CLI 未认证”的启动观察已作废，不再作为当前阻断。当前剩余缺口是数据质量、发布隔离、原始读回结果与其 SHA-256 manifest 尚未在本报告中完整固化；ClickUp 评论接口在开始时已达到当日 `100/100` 限额，因此启动/心跳不能写回 ClickUp。

已经可以确认的边界：

1. 仓库里的目录、养护、诊断表和 CMS 记录只能作为测试数据或内容候选；不能直接作为 v2 用户数据迁移源。可复用的是经权威来源、用户确认和 release 审计后的业务语义，不是当前行数据或自生成主键。
2. `docs/plant_catalog.csv` 有 200 行、152 个属；重复显示名 1 组、重复学名 8 组、字面 `null` 科名 5 行，不能未经身份权威核对直接发布为规范身份。
3. `docs/genus_care_profile.csv` 有 152 行且覆盖目录 152 个属，全部标记 `audited`，但其中 26 行为 L2/类群或作物组归纳；`audited` 不能替代 v2 evidence/release 状态。
4. 诊断工作簿的内容规模为：`problems` 53、`symptoms` 93、`symptom_problem_evidence` 206、`genus_problem_profiles` 2318、`problem_host_profiles` 1190、`plant_problem_profiles` 3057、`problem_causality` 41、题库 80、选项 242、策略 95、生成规则 12、结果解释 53。它们是审计候选，不是自动迁移批次。
5. 当前黄叶固定题包为 4 题、萎蔫固定题包为 6 题、根腐题包仍为 0；数据库实际注册桥接题目前只有浇水背景题，其他黄叶/萎蔫题由代码定义。固定题包的 `care_behavior_timeline` 默认键与 4 个数据库选项键不一致，必须由合同测试确认，不能在数据层猜测修复。
6. 历史只读快照曾确认 `question_option_mapping_v5_real` 正式库候选 75 个问题键、230 行，其中 74 个键仍有审核题库行；历史快照还显示有未结束会话携带旧键。因此不能把 `legacy_compat` 或“当前新题包未生成”直接等同于可停用。

7. 主代理当前只读回传确认：目标环境共有 75 张 MySQL 表、23 个数据模型；`plant_catalog=200`、`plant_identity_entities=192`、`plant_identity_aliases=400`、`plant_identity_match_rules=400`、`genus_care_profiles=152`、`problems=55`、`symptoms=111`、`question_library_v5_real=137`、`question_option_mapping_v5_real=429`、`question_strategy_v5_real=231`。`question_library_v5_real` 分布为 `audited+active=61`、`audited+inactive=20`、`pending+inactive=1`、`pending+active=55`；身份实体全部 `pending+active`，aliases 和 match rules 各发现 16 条孤儿记录。该摘要支持继续审计，但还不能单独证明可发布或可删除。

本次没有执行任何云端写入、删除、发布、迁移或批量 `is_active` 更新。

## 1. 启动、输入与证据等级

### 1.1 ticket 与环境记录

| 项目 | 结果 |
|---|---|
| ticket | `z8v0kmr96r` |
| 计划入口 | `node docs/backend-v2/verify-entrypoint.mjs` |
| 入口校验 | 通过；Master Plan 2111 行，SHA-256=`e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428` |
| 目标 EnvId | `cloud1-2grufevs395a9d5e`（仓库配置候选） |
| CloudBase 身份 | 主代理已确认主 profile 可用；本子代理不读取凭证、不自行登录 |
| 实时 MySQL/CMS | 主代理已回传部分只读摘要；原始查询、字段/索引明细、CMS schema 与 release 读回仍待固化 |
| ClickUp 启动/心跳 | `RATE_LIMITED`；连接器当日配额 `100/100`，未重试 |
| 写入/删除 | 0 |

### 1.2 输入 SHA-256

以下是本次实际读过的规则、合同、源数据、代码、SQL 和历史证据快照。完整输入集合以本文件写入前的工作区状态为准；报告输出哈希记录在单独的 `.sha256` 文件中。

| 输入 | SHA-256 |
|---|---|
| `docs/backend-v2/README.md` | `cfe9aca1ce164495f9248c806faec63ab646f934b635187bbc076a913699a006` |
| `docs/backend-v2/BASELINE.lock` | `daa8f5c131c37a64b12562679579732b1757b38ebefe682c11368fa7ab5c34d1` |
| `docs/backend-v2/phases/P-1-audit.md` | `eb968b32823d3e76c8c3d9dcab0cc8ef786ab72be660934c084c9ce4e96d0090` |
| `docs/backend-v2/data/legacy-disposition.md` | `19d66dd89854dd1d31b8e0818edc0ac7da2d2a5f7cdbf08aaa4434c0f4b9c86c` |
| `docs/backend-v2/data/table-ownership.md` | `1f428f6ed24d1067275c62f1cdc667fc9ebd98724d1d6331d05fd6a4ff28d3c7` |
| `docs/backend-v2/clickup/ticket-specs.md` | `114adf4fffd75222de4127826b6844c32f1f56efdc0fb24399170ea1fd942629` |
| `docs/backend-v2/agents/handoff-contract.md` | `29d8e4ad137bc19ec4722067913ab23a38c64ea932eac1fd95958bc0a323ff00` |
| `docs/backend-v2/agents/heartbeat-update.md` | `d1d76adf832926d33bb7d62c768f2195c7446fa26d880714053168ca054a3ae1` |
| `docs/backend-v2/architecture/business-domain.md` | `aeedf5ba0a7e26765548f2323afd0a9253e730906ef5af438ece51181e6d0941` |
| `docs/backend-v2/architecture/infrastructure.md` | `78d9c452c9160ed9f57e2bd4a1d68e34a6c942fa0dfc99a35bd9903aa1625332` |
| `docs/backend-v2/architecture/business-to-technical-map.md` | `e2fb933794fc17da54b0c59f2d43d58f27701a8dee406a26cb2d8065b580cce3` |
| `docs/backend-v2/contracts/plant-taxonomy.md` | `4146ac534569927b84343e401f204248d05d38f341b7c9d5ea0e323512df2e69` |
| `docs/backend-v2/implementation/cms-enrichment-worker.md` | `96e016a0b9f9f46a7924caa781e39086665096cf1b0a3d95ead6bc813ef134ac` |
| `docs/data-base/DATABASE_SCHEMA_SPEC_v2.md` | `a27b3d67fa47f02d46ca572db92378d5d8819bd5446b2269defc6d0159b32145` |
| `docs/data-base/DATA_PUBLISHING_SYSTEM_SPEC_v2.md` | `f86c47749a539efda9532a3a36d87425b1ba4e5fabe9578da421cbddeaa9a8cd` |
| `docs/plant_catalog.csv` | `de5ad55fa4589ac56481ce684b030d46213fc2bf6d3838d5217248c813f3fac1` |
| `docs/genus_care_profile.csv` | `63cf2e16ffbd21170d3bf7f6cb660226eaa3097594b1cd87e15c6a03ff145032` |
| `docs/class_question_group_strategy_completed_v3_final_unblocked.csv` | `24be56878cc5208211899ded4ccfbe8baaabc58400e8889bbe0ea47b52a45dd8` |
| `docs/plants_v13_user_friendly_full_v7.xlsx` | `aa41c7cf1f97be22a3f35e4ca9cc8def65ded9e1b33067a5f613dfeedd2d8d20` |
| `schema-diff-report.json` | `5ea19334706230fec2a4a2ec87901db45ed90ae1064c734d798aa6360c65056e` |
| `schema-diff-report-prod.json` | `964796c7409394b0e99bfd82f214eb7dd55d104c116b94bb5d535ffa62ae4ea7` |
| `src/data-system/config/tables.js` | `7ecd0e15cbba239e68b26f1305307aff24bdf0a29a25e53b740de27a9b578143` |
| `src/data-system/importer/excel-importer.js` | `13198a82b3d9eb2eea98251afece44416f36a3c58333c580911eab1f1176b418` |
| `src/data-system/publish/publish-engine.js` | `99caed7f6443186993ea8d52f2a5887b1113759c4dd21b92b941795bd2ed4e42` |
| `src/data-system/diff/diff-engine.js` | `29f3da30d03ae9c1542753a470e972e145105e10e034017b526ce9168c150822` |
| `cloudfunctions/diagnose-http/app/question-package-response.js` | `c631cf0f0f2850949f852b88b4afdbdec8d5ba212fe812465ab0c14e0a25c0fe` |
| `cloudfunctions/diagnose-http/app/start-question-package-runtime-data.js` | `3652da59fc52e068518d9af7ccd78fa0c778fabb3747e643f6dbb426fcedac5c` |
| `cloudfunctions/diagnose-http/app/wilting-droop-question-package.js` | `4d5ac361fdc0d911ebf31aa35fa3088becdb1eca16098974260cea6285f0e877` |
| `cloudfunctions/diagnose-http/app/diagnosis-question-registry.js` | `c5e2745675c720c58ad16a6771adf692c3ec06e7d5528b12c8a0100e70eb2368` |
| `cloudfunctions/diagnose-http/repositories/question-repository.js` | `e6bbcfa57151738f05534b59b77deb408dc329a05233e76991f1c03b48aa7e03` |
| `cloudfunctions/diagnose-http/app/yellow-leaf-package-runtime-data.js` | `cc8df611e7e216fd2e4816cd150ca6cbf6527c8a25ed58dffbf51f1ba91b315e` |
| `cloudfunctions/diagnose-http/app/static-question-package-start.js` | `54dcae3da8992e0b610a03af489c928c9d03dc416d8ffacdf42e20cb751138bd` |
| `scripts/sql/ensure-formal-taxonomy-tables.sql` | `86e7c3a77861590f8df6a5088b939c35bcbe6476fbcff8fc96ae29e177c40d11` |
| `scripts/sql/ensure-symptom-class-runtime-tables.sql` | `c85d2cc893b8013bdde36ae1f272783bd6fdb886f4c1b31be7637ecd03d30ae0` |
| `scripts/sql/ensure-outcome-route-tables.sql` | `bd6a1292826e5a59f0465ead9dd8625385b08e513d3817b964d667b011cac146` |
| `scripts/sql/question-package-watering-frequency-registry-20260613.sql` | `a789ae6fa64a5e303a42eb93599c1bc44a87e8bc326df4e433c4624001c38b20` |
| `scripts/sql/seed-outcome-route-mvp.sql` | `73679a5ef89db9e74963a887ff6b64026bf768e65a38e422407569d31e25e890` |
| `scripts/sql/sync-cloud1-dev-schema-to-production-20260901.sql` | `7e36857c478fca06da5523b246eaa9705cf9d94b1919b7547c25a28c748748f3` |
| `SQL-cvs/genus_care_profiles_light_uv_minmax_v5_FULL_REPLACE.sql` | `88778ac41cec403c19172e4058099fe5f9b561648e99259c99b3ffb112e254a1` |

> 注意：上表哈希按本次读取时实际文件重新核对；如需使用，应以审计旁边的 `.sha256` 文件为准。历史快照的哈希见第 7 节。

## 2. 证据分级与限制

| 等级 | 本次内容 | 可支持的结论 |
|---|---|---|
| `local_static` | 源码、SQL、CSV、XLSX、配置、文档和本地历史制品的哈希/解析 | 当前仓库声明、候选字段、静态调用和文件内统计 |
| `historical_cloud_snapshot` | `docs/ai-runs/2026-09-17/*`、`2026-09-18/*` | 指定日期、指定 EnvId/schema 的历史读回；不能代表 2026-09-19 当前状态 |
| `e2e_real_api` | 主代理在同一 EnvId 执行的 CloudBase MySQL/CMS 只读摘要 | 已有部分当前行数/状态/模型存在性证据；原始结果和完整 release 读回仍待附加 |
| `tracker_heartbeat` | ClickUp | `RATE_LIMITED`，连接器配额耗尽；不得伪造成功 |

所有“当前”字样在不能由实时读回证明时，均只表示本地源码或历史快照中的当前语义，不表示线上当前值。

## 3. 数据、模型、CMS 与资源处置总表

处置采用两条轴：内容转化决定（`REUSE_AS_IS`、`TRANSFORM`、`MERGE`、`SPLIT`、`REBUILD`、`REJECT`、`QUARANTINE`）与资源清理决定（`KEEP`、`ARCHIVE`、`DELETE`）。未经过用户确认、权威来源和 v2 release 读回的内容，不得执行 `DELETE`。

| 资产/来源 | 当前事实与调用方 | v2 owner | 内容决定 | 资源决定 | Expected 来源/替代物 | 删除前置条件 |
|---|---|---|---|---|---|---|
| `docs/plant_catalog.csv` / live `plant_catalog` | 本地与 live 均 200 行目录原始输入；`src/data-system/config/tables.js` taxonomy importer 使用；目录接口/身份解析间接消费 | `plant-knowledge` | `QUARANTINE` → `TRANSFORM` | `KEEP` | `plant-taxonomy.md` 的 POWO/WCVP/WFO/RHS/ICRA 分层、稳定来源 ID、父链和别名合同 | 每条身份完成权威核对、冲突解决、release 读回；源文件与 live 测试表不再被任何 v2 importer 直接当作权威迁移源 |
| `docs/genus_care_profile.csv` | 152 行属级养护；`genus_care_profiles` mapper 使用，全部写为 `review_status=audited` | `plant-knowledge`（语义供 `care` 读取） | `TRANSFORM`；分离 evidence、scope 与 runtime baseline | `KEEP` | 用户确认的 care capability 合同、逐行权威证据和版本化 release | 每个 genus profile 有 evidence、scope、冲突处理和替代 release；不能因“测试数据”直接删除 |
| `SQL-cvs/genus_care_profiles_light_uv_minmax_v5_FULL_REPLACE.sql` | 152 行全量替换 SQL，含 `_openid` 列和 `DELETE FROM genus_care_profiles`；是历史发布素材，不执行 | `plant-knowledge` | `REBUILD`；保留语义候选，拒绝旧 owner 列和全量覆盖方式 | `ARCHIVE` | v2 care schema、事务发布和 immutable release | 新 release 完成抽样读回、回滚演练和所有调用方切换；此前不得执行 |
| 诊断工作簿 12 张核心表 / live 诊断模型 | 本地候选 12 sheet；主代理 live 摘要为 `problems=55`、`symptoms=111`、`question_strategy_v5_real=231`，与本地 53/93/95 不一致；`src/data-system/config/tables.js` 默认导入、诊断 repository/route 读取 | `diagnosis`（内容由 `plant-knowledge` 负责 release） | `TRANSFORM` / `REBUILD`；先建立 source batch/hash 对账，再按 taxonomy、evidence、diagnosis 分层 | `ARCHIVE` | 已冻结诊断合同、CMS release 和内部事实 Expected；不是用户运行流水 | 每张表有 v2 owner、业务键、字段映射、live/local 记录数核对和切换窗口；差异未解释前不得合并或删除 |
| `class_question_group_strategy` CSV 与 SQL 表 | 68 行策略素材；50 行 `effective_runtime_v1=True`，18 行 false；9 行 `not_applicable_v1` 无 group key | `diagnosis` | `TRANSFORM`；不可把 `partial`/`asset_not_verified` 当上线许可 | `KEEP` | 题组准入合同、资产存在性、语义审查和 release | 所有有效题组的资产、文案、key、yes/no/unknown 和门禁读回均通过 |
| 黄叶固定题包 | 代码定义 4 题；仅 watering 通过 `diagnosis-question-registry` 读 DB，其余 light/fertilization/air 为代码题 | `diagnosis` | `REUSE_AS_IS` 仅限经冻结合同确认的展示语义；内部效果规则另行 `TRANSFORM` | `KEEP` | `question-package-response.js` 固定题包合同、用户确认的 outcome/effect Expected | 固定题包版本、答案回放、选项映射和发布批次一致；不得以当前 4 行代替全题库清理 |
| 萎蔫固定题包 | 代码定义 6 题；watering DB bridge，shape/rhythm/air/recent/high-risk 代码定义 | `diagnosis` | `REUSE_AS_IS`（合同确认后） | `KEEP` | 萎蔫题包合同和高风险安全门 Expected | 6 题、答案效果、安全高危提示和 release 读回完整；根腐 0 题仍是未实现，不得补写旧题 |
| `question_library_v5_real` / `question_option_mapping_v5_real` | 主代理当前只读回传 137/429 行；题库 `61 audited+active / 20 audited+inactive / 1 pending+inactive / 55 pending+active`；repository 按审核状态及 `is_active` 读取，历史 CMS lifecycle 快照显示 current/legacy 混合 | `plant-knowledge`（CMS/release）+ `diagnosis`（消费） | `SPLIT`：当前题包、兼容读取、历史内容分别管理；`pending+active` 先隔离，不得直接发布 | `KEEP`；兼容行暂不删 | CMS release、问题键消费审计和历史会话回放 Expected | `pending+active` 全部完成审核或明确隔离、未结束会话封存/迁移、路由/answer/review 消费归零、条件回退和双库读回 |
| `outcome_route_*` / `diagnosis_outcomes` / `outcome_action_profiles` | SQL seed/fix 直接写入路由、效果、行动建议；黄叶/根压力语义与代码 runtime 并存 | `diagnosis` | `TRANSFORM` / `REBUILD`；内部建议候选不可直接变成 care 事实 | `ARCHIVE` | 诊断只能产生建议；用户确认后才由 `care` 写事实/计划 | route/effect/action 合同冻结，安全审查、结果回放、版本 release 完成 |
| `plant_identity_*` 旧表/SQL / live identity 模型 | 主代理 live 摘要为 entities/aliases/rules=`192/400/400`；entities 全部 `pending+active`，aliases/rules 各 16 条孤儿；mapper 生成 `plant_identity_<sha1>`；`ensure-formal-taxonomy-tables.sql` 另含 `_openid` 和 merge history | `plant-knowledge` | `QUARANTINE` → `REBUILD`；稳定身份必须来自权威来源，不复用 session hash 为权威 ID；孤儿 alias/rule 不可转为发布数据 | `KEEP` / `ARCHIVE` | taxonomy contract、identity evidence/release | 每条身份完成权威核验；16+16 孤儿有精确修复/隔离清单；`pending+active` 清零或明确隔离；引用方迁移、冲突/合并读回；旧表不可先删 |
| 诊断/用户植物/养护/视觉/订单/缓存运行流水 | SQL 脚本覆盖 `diagnosis_*`、`user_plant_*`、`watering_*`、`weather_*`、`visual_*` 等；是运行时记录 | 对应 `diagnosis`、`user-plant`、`care`、`subscription` | `REJECT` 作为 v2 内容迁移源 | `ARCHIVE`；仅按精确清单后才可 `DELETE` | v2 schema 与数据清理清单；不能从运行流水反推 Expected | 精确主键/范围、备份、调用方停用、删除后读回和回退证据 |
| `schema-diff-report*.json` | 旧诊断快照，报告 Excel/DB/repo 字段差异；不是当前数据库读回 | 无运行时 owner | `REJECT` 作为事实源；保留为审计证据 | `ARCHIVE` | 当前 INFORMATION_SCHEMA + schema release manifest | 新的实时 schema snapshot 已签名、旧报告不再承担决策 |

## 4. 本地内容资产读回统计

### 4.1 植物目录与属级养护

| 指标 | 读回值 | 解释 |
|---|---:|---|
| 目录数据行 | 200 | CSV 无表头；`session_plant_id` 200 个唯一值 |
| 目录属数 | 152 | 与属级养护 152 行一一覆盖；未发现 care-only genus 或 catalog-only genus |
| `session_status_flag` | `0:70 / 1:111 / 2:19` | 文件内状态语义未形成 v2 合同，不能自行映射 active/review |
| 重复显示名 | 1 组 | `铜钱草`（ID 14、68） |
| 重复学名 | 8 组 | `Hydrocotyle vulgaris`、`Nelumbo nucifera`、`Brassica rapa subsp. chinensis`、`Solanum lycopersicum var. cerasiforme`、`Syngonium podophyllum`、`Philodendron hederaceum`、`Thaumatophyllum bipinnatifidum`、`Aglaonema modestum` |
| 字面 `null` 科名 | 5 行 | 月季、栀子花、玫瑰、康乃馨、多肉；mapper 会归一化为空并对部分属套用代码 override |
| `spp.`/类群表示 | 至少 4 行 | 蝴蝶兰、百合、铁线莲、睡莲；应保持 genus/unknown 语义，不能误标 species |
| 属级养护行 | 152 | 全部 `review_status=audited` |
| 养护证据层级 | `L1:126 / L2:26` | 26 行为权威类群/作物组归纳，仍需逐行 evidence 审查 |

### 4.2 诊断工作簿

| sheet | 行数 | 关键状态读回 |
|---|---:|---|
| `problems` | 53 | `audited:43 / partial:10`；disease 15、pest 14、care_issue 24 |
| `symptoms` | 93 | 全部 audited；visual 45、diagnostic 44、environmental 4 |
| `symptom_problem_evidence` | 206 | 全部 audited；visual 100、diagnostic 98、environmental 8 |
| `genus_problem_profiles` | 2318 | 全部 audited；common 641、possible 1076、occasional 493、very_common 103、rare 5 |
| `problem_host_profiles` | 1190 | audited 1119、rejected 71；以 genus host 为主（1189） |
| `plant_problem_profiles` | 3057 | 全部 `derived_audited`，均 `materialized_from_genus_plus_host` |
| `problem_causality` | 41 | 全部 audited；来源为 consolidated care-issue mapping |
| `question_library_v5_real` | 80 | 全部 audited；boolean 78、single 2；level 1/2/3=`25/31/24` |
| `question_option_mapping_v5_real` | 242 | 全部 audited；每题有选项，绝大多数 3 选项，氮/铁各 4 选项 |
| `question_strategy_v5_real` | 95 | 全部 audited；candidate 82、cross_group 8、low_confidence 5；`ALL` 为策略哨兵，不是 problems 外键 |
| `question_generation_engine` | 12 | 全部有 allow-unknown 默认值；是生成候选规则，不等于 release 题目 |
| `diagnosis_result_explanations` | 53 | 与 problems key 集合对齐的候选解释层，仍需 v2 公开响应脱敏审查 |

### 4.3 题组策略 CSV

`docs/class_question_group_strategy_completed_v3_final_unblocked.csv` 读回 68 行、28 个 `class_key`。`group_key` 与 `(class_key, group_key)` 无重复；`group_role` 为 confirm 17、differentiate 21、context 12、exclude 9、not_applicable_v1 9；`data_status` 为 audited 41、partial 27。有效运行时行 50，非有效 18，其中两行明确 `asset_not_verified/missing_or_unverified`，其余非有效多为 partial 或 not applicable。该表可作为题组审计输入，不可直接当作已发布题组清单。

### 4.4 当前 CloudBase/MySQL/CMS 只读摘要（主代理回传）

主代理于 2026-09-19 22:33+08 在已认证主 profile 下执行同一目标环境的只读查询，回传摘要如下。本节证据等级为 `e2e_real_api` 的代理回读；由于尚未收到逐条原始响应和输出 SHA-256，不能把摘要扩大解释为完整 schema/release 证明。

| 对象 | 当前只读摘要 | 审计判定 |
|---|---:|---|
| MySQL 表总数 | 75 | 环境存在且规模可读；仍需完整表名、列、索引快照 |
| CMS 数据模型总数 | 23 | 相关知识/题包模型存在；仍需逐模型 schema、字段映射、发布状态 |
| `plant_catalog` | 200 行 | 与本地目录行数一致；仍需业务键/状态/来源字段读回 |
| `plant_identity_entities` | 192 行 | 全部 `pending+active`；身份尚未达到 v2 released |
| `plant_identity_aliases` | 400 行 | 发现 16 条孤儿记录；必须先修复/隔离关联 |
| `plant_identity_match_rules` | 400 行 | 发现 16 条孤儿记录；不得直接作为匹配发布源 |
| `genus_care_profiles` | 152 行 | 与本地属覆盖一致；仍需逐行 evidence/release 核验 |
| `problems` / `symptoms` | 55 / 111 行 | 与本地工作簿规模存在差异，必须区分 live 测试表与候选制品 |
| `question_library_v5_real` | 137 行 | `audited+active=61`、`audited+inactive=20`、`pending+inactive=1`、`pending+active=55`；55 条 pending active 必须隔离 |
| `question_option_mapping_v5_real` | 429 行 | 与题库 137 行的完整选项覆盖、孤儿选项和 active/review 分布仍需逐题核对 |
| `question_strategy_v5_real` | 231 行 | 与本地 95 行候选策略不一致；不能直接把任一侧当 v2 真源 |

当前读回已把“未认证”从阻断中移除；剩余阻断是数据质量、审核状态和发布隔离，不是登录状态。

## 5. 字段映射候选与冲突

### 5.1 目录原始列到 v2 候选

| 原始列 | 候选映射 | 当前决定 | 冲突/风险 |
|---|---|---|---|
| `session_plant_id` | 过渡 `source_record_key`；不是 v2 `plant_identity_id` | `QUARANTINE` | 当前 mapper 用它参与 SHA-1 稳定 ID；重复学名/重命名会导致非权威身份 |
| `primary_display_name` | `display_name_cn`、common-name alias | `TRANSFORM` | 显示名重复；中文名不承担分类真源职责 |
| `scientific_name` | `canonical scientific name` 候选 | `TRANSFORM` | `spp.`、cultivar/类群、异名和权威接受名未核验 |
| `family_name_canonical` | family identity FK 候选 | `TRANSFORM` | 5 行为字面 `null`；不能把代码 override 当权威来源 |
| `family_name_cn` | 中文显示/alias | `TRANSFORM` | 仅显示层，不能替代 canonical family |
| `genus_name` | genus identity FK 候选 | `TRANSFORM` | 对 `Crassulaceae 等` 等聚合类群存在层级风险 |
| `category_name_cn/en` | 产品类别显示字段 | `REUSE_AS_IS` 仅限显示 | 不是植物学 taxonomy rank；不应写入分类父链 |
| `basic_description` | display encyclopedia intro 候选 | `TRANSFORM` | 当前描述没有独立 evidence/release；Qwen 只能补展示百科允许字段 |
| `cover_image_ref` | public display asset candidate | `QUARANTINE` | `cloud://` 对象的公共/私有属性、发布版本、读回尚未核验 |
| `session_status_flag` | 暂无 v2 直接映射 | `QUARANTINE` | 语义未在合同中定义，不能映射为 `is_active`/release 状态 |
| `created_at/updated_at` | source provenance time | `TRANSFORM` | 不是 v2 `published_at`；不能借历史时间伪造 release |

### 5.2 属级养护原始列到 v2 候选

| 原始列 | 候选映射 | 当前决定 | 冲突/风险 |
|---|---|---|---|
| `genus_name` | `genus_identity_id` 关联键 | `TRANSFORM` | 必须先通过 taxonomy release；当前 mapper 写 `genus_identity_id=null` |
| `family_name_canonical_raw` | family canonical FK | `TRANSFORM` | 代码对 Crassulaceae/Dianthus/Gardenia/Rosa 做 override；应转成可审计 evidence，不可隐藏冲突 |
| `watering_strategy_json` | care watering baseline | `TRANSFORM` | 只能作为 baseline，不能直接覆盖用户事实/计划 |
| `fertilizing_strategy_json` / monthly | care fertilizer baseline | `TRANSFORM` | 月度补充存在 `unsupported`/范围限制语义，需保留 scope 和 guardrail |
| `light_strategy_json`、`airflow_strategy_json` | light/ventilation baseline | `TRANSFORM` | 室外风不等于室内通风；固定数字需要范围与场景说明 |
| `temp_*`、`humidity_*` | baseline ranges | `TRANSFORM` | 需证据层级、单位和环境场景；不能由 L2 归纳直接升级为 species fact |
| `toxicity_level` | safety fact candidate | `QUARANTINE` | 安全字段禁止由模型生成，必须权威核对和独立 release |
| `review_status` | review/provenance metadata | `TRANSFORM` | `audited` 是旧素材状态，不等于 v2 `released` |
| `source_evidence`、`baseline_note`、`evidence_level`、`evidence_strategy` | evidence/provenance | `REUSE_AS_IS` 仅限审计元数据 | 需与实际来源快照/哈希绑定，不能只保留文本 |

### 5.3 诊断内容列到 v2 候选

工作簿字段名可与当前旧表保持兼容，但不得反向决定 v2 业务语义。候选关系是：`problem_key` → diagnosis direction/outcome candidate；`symptom_key` → observed evidence key；`symptom_problem_evidence` → evidence edge；`question_key + option_key` → question package answer effect；`question_strategy` → selection policy candidate；`diagnosis_result_explanations` → public explanation candidate。所有候选都需要冻结合同、版本、审核人、release hash 和脱敏响应 Expected。

## 6. SQL、模型与所有权审计

### 6.1 SQL 资产盘点

`scripts/sql` 共 63 个 SQL 文件，按文件名和内容初步分类如下；这里的分类是审计索引，不代表已执行或当前线上存在。

| 类别 | 文件数 | 代表资产 | 处置判断 |
|---|---:|---|---|
| plant-knowledge | 4 | genus fertilization、formal taxonomy、plant identity rename | 语义审计后保留；DDL/owner 列需重建 |
| diagnosis-content | 34 | question copy/dimension、symptom class、outcome route、yellowing route | 按题包/规则/release 分层；旧 seed/fix 不作为 v2 migration source |
| user-care-runtime | 18 | user plant、watering、fertilization、weather、visual | 运行流水/结构脚本分离；运行记录不迁移为知识 |
| identity-entitlement-agent | 3 | agent session、multiplatform phone、subscription order | 归 identity/subscription；平台标识不得成为业务外键 |
| schema-index-other | 4 | runtime artifact、performance indexes、production sync | 仅作为历史 DDL 证据；不得在 HTTP 启动执行 |

`SQL-cvs` 共 3 个 SQL，目录摘要哈希为 `4f0220eb9e4e7b485fe3d992a88a04f13ab5d35356f0f5e6433ce6944bb345ad`；`scripts/sql` 63 个文件按路径+文件哈希聚合摘要为 `a2823b20306b5b30c936c0aafa32fb7b59b6ca78d8acc8229cd68d546b22b767`。

以下是必须标为高风险、但本次未执行的 SQL 行为：

- `SQL-cvs/genus_care_profiles_light_uv_minmax_v5_FULL_REPLACE.sql` 含 `BEGIN`、`ALTER TABLE`、`DELETE FROM genus_care_profiles` 和全量 `INSERT`；不得作为 v2 发布脚本直接执行。
- `scripts/sql/ensure-formal-taxonomy-tables.sql` 的 identity match/merge 表含 `_openid`，与 v2 “业务关系只关联统一 `user_id`、知识身份不以平台主体归属”的边界冲突。
- `scripts/sql/sync-cloud1-dev-schema-to-production-20260901.sql` 直接指向正式 schema，文件自述为已执行 DDL；本次只读审计不重放、不把其“已执行”文字当作当前线上读回。
- `scripts/sql/seed-outcome-route-mvp.sql` 和多份 `fix-yellowing-*` 含 `DELETE`/`REPLACE`/`UPDATE`；它们是历史内容修复/seed，不具备 v2 可回放 release 的证明。
- `scripts/sql/ensure-multiplatform-phone-session-20260831.sql` 对历史业务表批量补 `owner_user_id` 并回填，属于身份/业务数据迁移边界，必须另行 dry-run 与用户确认。

### 6.2 `TABLE_CONFIGS` 与实际数据源

`src/data-system/config/tables.js` 读回 `TABLE_CONFIGS=19`：taxonomy 4 张 identity/alias/rule/link 表，genus-care 1 张，diagnosis 内容 7 张（含 `problems`、`symptoms`、`plant_problem_profiles`、题库/选项、结果解释、batch review），另有 7 张 `outcome_route_*`/`diagnosis_outcomes`。默认数据源为：

- diagnosis → `docs/plants_v13_user_friendly_full_v7.xlsx`；
- taxonomy → `docs/plant_catalog.csv`（无表头）；
- genus-care → `docs/genus_care_profile.csv`（无表头）。

导入器会对 CSV/XLSX 做 normalize、row mapping、upsert；publish/diff 引擎会把 `is_active` 和业务键用于比较/软删除。但这是旧导入发布实现事实，不是 v2 迁移授权。

### 6.3 旧表与 v2 owner 对照

| 旧表/表族 | 旧写入者/来源 | v2 owner | 结论 |
|---|---|---|---|
| `plant_identity_*`、`genus_care_profiles` | data-system importer、SQL-cvs、taxonomy/care SQL | `plant-knowledge` | 只迁移经审计语义；身份/证据/release 重建 |
| `problems`、`symptoms`、evidence/profiles/causality | diagnosis importer、XLSX | `diagnosis` | 内容候选；不得与用户诊断流水混合 |
| `question_*`、`symptom_*`、`outcome_*` | diagnosis repository、SQL seed/fix | `diagnosis` 消费、`plant-knowledge` CMS/release | 分离 CMS 草稿、release、运行时快照和兼容读取 |
| `diagnosis_sessions`、answers、evidence、results | diagnosis HTTP/SQL runtime | `diagnosis` | 运行流水，不是知识迁移源 |
| `user_plant_*`、watering/fertilization/weather/visual | user-plant/care/runtime SQL | `user-plant` / `care` | 精确清理或迁移合同另审；不作为 content source |
| users/platform identities/sessions | identity/session SQL | `identity` | 平台身份只能解析为统一 user_id；旧 `_openid` 不能成为 v2 业务主键 |
| subscription/orders/quota/reward | subscription SQL | `subscription` | 独立审计；不得由内容审计代写 |

## 7. CMS 与题包读回证据

### 7.1 当前代码路径（本地静态）

- `question-repository.js` 的全量、按键、题包查询均过滤 `data_status/review_status`，并读取 `is_active=1`；这是当前代码合同，不是线上读回。
- `diagnosis-question-registry.js` 只注册 `watering_frequency_context` → `q_observed_probe__leaf_yellowing__watering_frequency_context`。
- 黄叶响应配置：mode `yellow_leaf`、version 2、count 4、topics `watering_frequency_context/light_change_context/fertilization_growth_context/air_environment`。
- 萎蔫响应配置：mode `wilting_droop`、version 2、count 6、topics `watering_frequency_context/wilting_shape/wilting_rhythm_environment/air_environment/recent_stress/wilting_high_risk`。
- 根腐响应配置 count 0，标记 pending，不得从旧 `root_rot` SQL 自动补入题包。
- 黄叶/萎蔫代码题选项包含 `normal_or_stable`、`often_dry`、`often_wet`、`unknown` 等业务键；DB watering bridge 的 registry 默认键为 `care_behavior_timeline`，该键不在静态四个选项中，需 DTO/contract 解释或修正后才能视为闭环。
- `start-question-package-runtime-data.js` 注释声称 watering 与 active/audited DB 同步，但同一文件仍保留静态展示定义；这是两个来源并存的 drift，不能由 CMS 分类猜测优先级。

### 7.2 历史 CMS/MySQL 快照（非当前线上证明）

以下历史制品已在本地读回并重新计算 SHA；它们不能替代当前 CloudBase 读回，但用于防止重复误判：

| 制品 | 历史结论 | SHA-256 |
|---|---|---|
| `docs/ai-runs/2026-09-17-cms-lifecycle-dev-proof.md` | `cloud1_dev` 曾有 436 行，当前固定 watering package 4 行；CMS lifecycle 分类与 `is_active`/repository 消费不是同一开关；正式表曾有字段漂移 | `2ecd3577166b074645730de0ec1c96c307ad4e5d324f952035bb74e66a523ac4` |
| `docs/ai-runs/2026-09-17-formal-schema-drift-readonly.json` | 正式表曾出现 `*-drop-1789656713` 列，标准运行时列缺失；这是历史 schema 状态，不代表本次实时状态 | `b35139897effe003da552c06d2282f4997c046d8ca0d095dd697b71a40ee3646` |
| `docs/ai-runs/2026-09-17-formal-schema-and-is-active-canary-result.json` | 历史 canary 曾以 1→0→1 回退，读回 429 行，active 420、inactive 9、current package 4；有写入但已恢复 | `8bb7515280a149227a226ff146b4434736d534319bc02a1dd5ce729ab7e12b83` |
| `docs/ai-runs/2026-09-18-is-active-candidate-question-library-audit.json` | formal 历史候选 75 keys/230 rows；74 keys/228 rows仍有关联题库；缺失键 `q_non_problematic_variegation_stability` 2 rows | `fb88fd7bb521c90b033e703d48b14874e3b3b6d76cb8f95e47791dc60400f35f` |
| `docs/ai-runs/2026-09-18-is-active-runtime-reachability-audit.json` | 历史新题包与候选重叠 0，但 57 个历史会话快照含候选键、47 个未结束；批量停用被 STOP | `9cf51b9bc1f227f7895ab95cd5ac898a60eed32776d34093638ce8bb401d3913` |
| `docs/ai-runs/2026-09-18-is-active-safe-disable-result.json` | 历史正式库曾条件停用 80 行，读回 active 340/inactive 89；本次不重新宣称该状态，须实时复核 | `6459e3cd8dc0844bf395247793b3404fec5609d347ba2bc5346cfe19cb27a7d3` |

结论：CMS 的“当前题包/legacy”分类只能作为管理视图，不能替代运行时消费审计、历史会话封存、发布版本和回退证据。

## 8. 内容处置矩阵（重点业务语义）

| 内容主题 | 可复用部分 | 不可直接复用部分 | 当前处置 |
|---|---|---|---|
| 植物分类 | 权威来源线索、中文显示名、候选异名、目录覆盖范围 | session ID、未核验学名/科属、`session_status_flag`、代码生成 SHA-1 identity ID | `QUARANTINE` → 权威核验后 `TRANSFORM` |
| 属级养护 | watering/light/fertilizer/airflow baseline 的语义候选、evidence 文本 | 未分 scope 的固定天数、L2 归纳升级为 species fact、toxicity 未核验、历史 `_openid` | `TRANSFORM`；安全字段独立审计 |
| 黄叶题包 | 4 个主题和用户观察维度、保守/不确定语义 | 旧 outcome/action 直接写事实、DB/CODE 来源漂移、默认键不一致 | 固定包合同冻结后 `REUSE_AS_IS`；效果 `REBUILD` |
| 萎蔫题包 | shape/rhythm/recent stress/high-risk 观察维度 | 根腐未实现包、静态/DB bridge 误配、高风险结论未独立安全审查 | `REUSE_AS_IS` 仅限合同通过；root rot `REBUILD` |
| 症状与证据 | 观察键、证据边和来源文本 | 当前评分/优先级、`partial` 直接运行、模型自生成事实 | `TRANSFORM` |
| 诊断问题/选项 | 中文文案、可观察问题、unknown 选项 | 旧问题键的历史可达性、默认状态、route-specific effect 未核验 | `SPLIT`：release/current/compat/history |
| 结果解释/行动建议 | 保守用户文案候选 | 把诊断建议写入 care facts/plans、未经用户确认的行动事实 | `REBUILD`，只作为 diagnosis suggestion |
| CMS display encyclopedia | display intro/appearance/distribution/3 Q&A 候选 | taxonomy、toxicity、安全、watering/fertilizer/light/ventilation/pest/diagnosis 由模型生成 | `TRANSFORM`；按 CMS enrichment 禁区校验 |

## 9. 冲突、风险与停止点

1. **事实源冲突**：`DATABASE_SCHEMA_SPEC_v2.md` 仍写“Excel 是字段真源”，而 backend-v2 Master Plan/legacy disposition 明确当前 DB/CMS/Storage/业务记录为测试资产、旧记录不是 v2 迁移源。后续必须以 v2 规则为高优先级：Excel 是输入制品，不是迁移授权。
2. **身份键冲突**：`tables.js` 用 `session_plant_id + scientific/display + identity_level` 生成 SHA-1 ID；这可用于本地去重候选，不可作为权威 identity ID。旧 taxonomy SQL 还把 `_openid` 放入知识表，必须拒绝跨域归属。
3. **目录层级冲突**：重复学名、空科名、`spp.` 和聚合类群同时存在；没有逐条权威审计前不能 publish。
4. **审核状态冲突**：CSV/XLSX 的 `audited`、SQL 的 `review_status`、CMS lifecycle、`is_active` 和 v2 `released` 各自含义不同；不能互换。
5. **静态/数据库题包冲突**：watering 题是 DB bridge，其他固定题由代码定义；静态注释称“active/audited 同步”，但代码选项、默认键和历史表存在漂移。
6. **旧映射停用风险**：历史 candidate 0 行“当前新包重叠”不能证明 0 行可停用；未结束历史会话和答案/审核/回放路径仍可能按问题键读取。
7. **生产 schema 证据过期风险**：历史正式表曾有后缀列漂移，后续历史制品称已修复；当前未能实时复核，不得以历史修复结果代替线上状态。
8. **SQL 破坏性风险**：全量 `DELETE`/`REPLACE`、生产 schema DDL、owner 回填和 seed/fix 不能进入 v2 HTTP 启动或未授权发布流程。
9. **当前数据质量阻断**：主代理回传的 192 个 identity 全部仍为 `pending+active`，aliases/rules 各有 16 条孤儿；137 条题库中有 55 条 `pending+active`。这些记录必须隔离或完成审核，不能因为 `is_active=1` 就进入 v2 release。
10. **本地候选与 live 测试表不一致**：本地工作簿为 problems 53、symptoms 93、题库 80、选项 242、策略 95；live 回传为 55、111、137、429、231。两套数量差异本身是数据源冲突，不能通过“补齐”或删除任一侧消除，必须生成带 source batch/hash 的转换清单。

## 10. 读回证据与复核命令

已执行并通过的本地复核：

```text
node docs/backend-v2/verify-entrypoint.mjs
node -e "require('./src/data-system/config/tables')"
node + xlsx 解析 plant_catalog.csv、genus_care_profile.csv、class_question_group_strategy*.csv
node + xlsx 解析 plants_v13_user_friendly_full_v7.xlsx 全部 sheet 行数与关键状态
shasum -a 256 <输入文件>
```

### 10.1 主代理复核用精确只读查询包

以下查询全部是 `SELECT`，不含 DDL、DML、事务、锁或临时写表。主代理应在每个目标 schema/EnvId 分别执行，并保存原始 JSON、执行时间、EnvId/schema 和响应 SHA-256。`Q-DB-01`、`Q-DB-02`、`Q-DB-03` 先行；若目标表不存在，只记录缺失，不改写查询或补建表。涉及 `is_active`、`review_status` 的查询须以 `Q-DB-02` 的列存在性为前置条件。

#### MySQL 结构与精确计数

**Q-DB-00｜目的：确认当前 schema 和读回时间。表/字段：当前连接上下文。LIMIT：1。验收：schema 必须明确为 `cloud1_dev` 或 `cloud1-2grufevs395a9d5e`，不能是空值或其他 schema。**

```sql
SELECT DATABASE() AS active_schema, CURRENT_TIMESTAMP AS read_at
LIMIT 1;
```

**Q-DB-01｜目的：盘点当前表，确认 75 表摘要的范围。表/字段：`information_schema.TABLES.TABLE_NAME, ENGINE, TABLE_ROWS, CREATE_TIME, UPDATE_TIME, TABLE_COMMENT`。LIMIT：200。验收：返回的表名集合必须作为后续查询的允许集合；不得把 `TABLE_ROWS` 当精确业务计数。**

```sql
SELECT TABLE_NAME, ENGINE, TABLE_ROWS, CREATE_TIME, UPDATE_TIME, TABLE_COMMENT
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME
LIMIT 200;
```

**Q-DB-02｜目的：核对关键模型字段、状态列和脱离 v2 的平台归属列。表/字段：`information_schema.COLUMNS.TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT`；关键表覆盖目录、身份、养护、诊断题库和 outcome。LIMIT：1500。验收：关键表必须存在预期业务键；`question_*`、`genus_care_profiles`、`plant_identity_*` 的状态/来源字段逐列记录，发现 `_openid` 或缺少 `is_active/review_status` 必须列为冲突。**

```sql
SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'plant_catalog', 'plant_identity_entities', 'plant_identity_aliases',
    'plant_identity_match_rules', 'plant_identity_diagnosis_links',
    'genus_care_profiles', 'problems', 'symptoms',
    'symptom_problem_evidence', 'genus_problem_profiles',
    'problem_host_profiles', 'plant_problem_profiles', 'problem_causality',
    'question_library_v5_real', 'question_option_mapping_v5_real',
    'question_strategy_v5_real', 'question_generation_engine',
    'diagnosis_result_explanations', 'diagnosis_batch_reviews',
    'outcome_route_groups', 'outcome_routes', 'outcome_route_conditions',
    'outcome_route_questions', 'outcome_answer_effects',
    'outcome_action_profiles', 'diagnosis_outcomes'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION
LIMIT 1500;
```

**Q-DB-03｜目的：核对业务键、唯一约束、状态索引和可能的 `_openid` 索引。表/字段：`information_schema.STATISTICS.TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE`。LIMIT：1500。验收：题库应能证明 `question_key` 唯一、选项应能证明 `(question_key, option_key)` 唯一；身份别名/规则孤儿不能被索引存在掩盖。**

```sql
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'plant_catalog', 'plant_identity_entities', 'plant_identity_aliases',
    'plant_identity_match_rules', 'genus_care_profiles', 'problems',
    'symptoms', 'question_library_v5_real',
    'question_option_mapping_v5_real', 'question_strategy_v5_real',
    'outcome_route_groups', 'outcome_routes', 'outcome_route_questions',
    'outcome_answer_effects', 'diagnosis_outcomes'
  )
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
LIMIT 1500;
```

**Q-DB-04｜目的：复核主代理回传的精确计数。表/字段：各表 `COUNT(*)`。LIMIT：100。验收：应读回 `plant_catalog=200`、identity entities/aliases/rules=`192/400/400`、genus care=`152`、problems/symptoms=`55/111`、question library/options/strategy=`137/429/231`；差异必须记录 schema、时间和读回 hash。**

```sql
SELECT 'plant_catalog' AS table_name, COUNT(*) AS row_count FROM plant_catalog
UNION ALL SELECT 'plant_identity_entities', COUNT(*) FROM plant_identity_entities
UNION ALL SELECT 'plant_identity_aliases', COUNT(*) FROM plant_identity_aliases
UNION ALL SELECT 'plant_identity_match_rules', COUNT(*) FROM plant_identity_match_rules
UNION ALL SELECT 'genus_care_profiles', COUNT(*) FROM genus_care_profiles
UNION ALL SELECT 'problems', COUNT(*) FROM problems
UNION ALL SELECT 'symptoms', COUNT(*) FROM symptoms
UNION ALL SELECT 'question_library_v5_real', COUNT(*) FROM question_library_v5_real
UNION ALL SELECT 'question_option_mapping_v5_real', COUNT(*) FROM question_option_mapping_v5_real
UNION ALL SELECT 'question_strategy_v5_real', COUNT(*) FROM question_strategy_v5_real
LIMIT 100;
```

#### MySQL 质量、题包与发布隔离

**Q-DB-05｜目的：确认身份、题库的审核/启用状态分布。表/字段：`plant_identity_entities.plant_identity_id, review_status, is_active`；`question_library_v5_real.question_key, review_status, is_active, data_status`。LIMIT：100/200。验收：身份应复现 `pending+active=192`；题库应复现 `audited+active=61`、`audited+inactive=20`、`pending+inactive=1`、`pending+active=55`；任何 `pending+active` 均不得进入 v2 release。**

```sql
SELECT review_status, is_active, COUNT(*) AS row_count
FROM plant_identity_entities
GROUP BY review_status, is_active
ORDER BY review_status, is_active
LIMIT 100;
```

```sql
SELECT review_status, is_active, data_status, COUNT(*) AS row_count
FROM question_library_v5_real
GROUP BY review_status, is_active, data_status
ORDER BY review_status, is_active, data_status
LIMIT 200;
```

**Q-DB-06｜目的：确认别名/匹配规则是否归属现存 identity。表/字段：`plant_identity_aliases.alias_id, plant_identity_id, alias_name, alias_type, is_active`；`plant_identity_match_rules.match_rule_id, plant_identity_id, match_key, match_rule_type, is_active`。LIMIT：100。验收：两条查询都应准确回读主代理摘要中的 16 条孤儿；孤儿只能 `QUARANTINE/REBUILD`，不得直接发布或删除。**

```sql
SELECT a.alias_id, a.plant_identity_id, a.alias_name, a.alias_type, a.is_active
FROM plant_identity_aliases AS a
LEFT JOIN plant_identity_entities AS e
  ON e.plant_identity_id = a.plant_identity_id
WHERE e.plant_identity_id IS NULL
ORDER BY a.alias_id
LIMIT 100;
```

```sql
SELECT r.match_rule_id, r.plant_identity_id, r.match_key,
       r.match_rule_type, r.match_strength, r.is_active
FROM plant_identity_match_rules AS r
LEFT JOIN plant_identity_entities AS e
  ON e.plant_identity_id = r.plant_identity_id
WHERE e.plant_identity_id IS NULL
ORDER BY r.match_rule_id
LIMIT 100;
```

**Q-DB-07｜目的：确认题库每题选项覆盖、审核状态和固定题包字段。表/字段：`question_library_v5_real.question_key, package_topic, package_section, route_package_role, review_status, data_status, is_active` 与选项表 `option_key, option_text_user_cn, answer_effect_cn`。LIMIT：200。验收：所有 active 题必须有选项；`pending+active` 只可列入隔离；题包 topic/role 与代码合同一致。**

```sql
SELECT q.question_key, q.package_topic, q.package_section,
       q.route_package_role, q.review_status, q.data_status, q.is_active,
       COUNT(o.option_key) AS option_count
FROM question_library_v5_real AS q
LEFT JOIN question_option_mapping_v5_real AS o
  ON o.question_key = q.question_key
GROUP BY q.question_key, q.package_topic, q.package_section,
         q.route_package_role, q.review_status, q.data_status, q.is_active
ORDER BY q.question_key
LIMIT 200;
```

**Q-DB-08｜目的：找出孤儿选项和无选项题。表/字段：两张题库表的 `question_key, option_key`。LIMIT：100。验收：两条结果均应为 0；非 0 时题包不能判定为可发布，资源决定保持 `KEEP`。**

```sql
SELECT o.question_key, o.option_key, o.data_status
FROM question_option_mapping_v5_real AS o
LEFT JOIN question_library_v5_real AS q
  ON q.question_key = o.question_key
WHERE q.question_key IS NULL
ORDER BY o.question_key, o.option_key
LIMIT 100;
```

```sql
SELECT q.question_key, q.package_topic, q.review_status, q.is_active
FROM question_library_v5_real AS q
LEFT JOIN question_option_mapping_v5_real AS o
  ON o.question_key = q.question_key
GROUP BY q.question_key, q.package_topic, q.review_status, q.is_active
HAVING COUNT(o.option_key) = 0
ORDER BY q.question_key
LIMIT 100;
```

**Q-DB-09｜目的：核对黄叶四题与萎蔫六题的数据库桥接覆盖，不把代码生成题误报为 CMS 已发布。表/字段：两张题库表的题键、topic、状态、选项。LIMIT：100。验收：黄叶应区分 watering/light/fertilization 三个 DB 候选与 `q_yellow_leaf__air_environment` 代码题；萎蔫应明确 watering bridge 与 shape/rhythm/air/recent/high-risk 的 DB 是否存在；缺失不是删除许可，而是 `REBUILD/REUSE_AS_IS` 合同缺口。**

```sql
SELECT q.question_key, q.package_topic, q.package_section,
       q.route_package_role, q.review_status, q.data_status, q.is_active,
       o.option_key, o.option_text_user_cn, o.answer_effect_cn
FROM question_library_v5_real AS q
LEFT JOIN question_option_mapping_v5_real AS o
  ON o.question_key = q.question_key
WHERE q.question_key IN (
  'q_observed_probe__leaf_yellowing__watering_frequency_context',
  'q_observed_probe__leaf_yellowing__light_change_context',
  'q_observed_probe__leaf_yellowing__fertilization_growth_context',
  'q_yellow_leaf__air_environment',
  'q_wilting_droop__shape',
  'q_wilting_droop__rhythm_environment',
  'q_wilting_droop__air_environment',
  'q_wilting_droop__recent_stress',
  'q_wilting_droop__high_risk'
)
ORDER BY q.question_key, o.option_key
LIMIT 100;
```

**Q-DB-10｜目的：确认 outcome 路由、condition、question、answer effect、action profile 的审核/启用状态。表/字段：各表的业务键、`enabled, review_status, data_status`。LIMIT：500。验收：任何 enabled 但非 audited/released 的记录必须隔离；任何 route question 无对应题库键、answer effect 无对应 option、action profile 无对应 route 都是 `REBUILD` 阻断。执行前须由 Q-DB-02 确认表存在。**

```sql
SELECT 'outcome_route_groups' AS table_name, enabled, review_status, data_status,
       COUNT(*) AS row_count
FROM outcome_route_groups
GROUP BY enabled, review_status, data_status
UNION ALL
SELECT 'outcome_routes', enabled, review_status, data_status, COUNT(*)
FROM outcome_routes
GROUP BY enabled, review_status, data_status
UNION ALL
SELECT 'outcome_route_conditions', enabled, review_status, data_status, COUNT(*)
FROM outcome_route_conditions
GROUP BY enabled, review_status, data_status
UNION ALL
SELECT 'outcome_route_questions', enabled, review_status, data_status, COUNT(*)
FROM outcome_route_questions
GROUP BY enabled, review_status, data_status
UNION ALL
SELECT 'outcome_answer_effects', enabled, review_status, data_status, COUNT(*)
FROM outcome_answer_effects
GROUP BY enabled, review_status, data_status
UNION ALL
SELECT 'outcome_action_profiles', NULL, review_status, data_status, COUNT(*)
FROM outcome_action_profiles
GROUP BY review_status, data_status
UNION ALL
SELECT 'diagnosis_outcomes', NULL, review_status, data_status, COUNT(*)
FROM diagnosis_outcomes
GROUP BY review_status, data_status
LIMIT 500;
```

**Q-DB-11｜目的：发现当前 release/publish/CMS/batch 控制表，避免把业务表的 `is_active` 冒充不可变 release。表/字段：`information_schema.TABLES`。LIMIT：200。验收：记录所有名称命中 `release|publish|cms|batch` 的表；若没有 release hash/version/status 表，明确记录“当前未证明 immutable release”。**

```sql
SELECT TABLE_NAME, TABLE_COMMENT
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND LOWER(TABLE_NAME) REGEXP 'release|publish|cms|batch'
ORDER BY TABLE_NAME
LIMIT 200;
```

**Q-DB-12｜目的：在 Q-DB-11 返回候选控制表后读取其字段，确认 release hash、版本、审核人、发布时间和状态是否可审计。表/字段：`information_schema.COLUMNS`。LIMIT：1000。验收：缺少不可变 hash、发布批次、审核状态或发布时间时，CMS 内容只能 `KEEP/ARCHIVE`，不能判定 v2 released。**

```sql
SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE,
       COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND LOWER(TABLE_NAME) REGEXP 'release|publish|cms|batch'
ORDER BY TABLE_NAME, ORDINAL_POSITION
LIMIT 1000;
```

#### CMS 数据模型只读查询

CMS 元数据使用 `mcp__cloudbase__manageDataModel`，仅允许 `list/get/docs` 只读动作；该工具不返回业务行数据，行级审计必须以同一 EnvId/schema 的 MySQL 查询为准。

**C-CMS-01｜目的：核对模型总数与目标模型是否存在。模型：全部模型及 19 个数据系统目标模型。字段：模型名、数据库类型、绑定表、模型状态摘要。LIMIT：工具无行 LIMIT；只保存返回 JSON。验收：总数应为 23；目标模型缺失必须标记 `REBUILD`，不得创建补齐。**

```json
{"action":"list"}
```

```json
{"action":"list","names":[
  "plant_identity_entities","plant_identity_aliases",
  "plant_identity_match_rules","plant_identity_diagnosis_links",
  "genus_care_profiles","problems","symptoms",
  "plant_problem_profiles","question_library_v5_real",
  "question_option_mapping_v5_real","question_strategy_v5_real",
  "question_generation_engine","diagnosis_result_explanations",
  "diagnosis_batch_reviews","outcome_route_groups","outcome_routes",
  "outcome_route_conditions","outcome_route_questions",
  "outcome_answer_effects","outcome_action_profiles","diagnosis_outcomes"
]}
```

**C-CMS-02｜目的：核对关键模型 schema、关联关系和字段类型。模型：`plant_identity_entities`、`genus_care_profiles`、`question_library_v5_real`、`question_option_mapping_v5_real`、`question_strategy_v5_real`、`outcome_routes`、`outcome_answer_effects`、`diagnosis_outcomes`。字段：完整 schema；重点比较业务键、`review_status`、`data_status`、`is_active`、`published_*`、release 引用及 `_openid`。LIMIT：每次 get 为单模型元数据，无行 LIMIT。验收：字段必须与当前合同/SQL 读回一致；发现模型 schema 与 MySQL 实际字段不一致时，处置为 `TRANSFORM/REBUILD`，不直接发布。**

```json
{"action":"get","name":"plant_identity_entities"}
{"action":"get","name":"genus_care_profiles"}
{"action":"get","name":"question_library_v5_real"}
{"action":"get","name":"question_option_mapping_v5_real"}
{"action":"get","name":"question_strategy_v5_real"}
{"action":"get","name":"outcome_routes"}
{"action":"get","name":"outcome_answer_effects"}
{"action":"get","name":"diagnosis_outcomes"}
```

本次主代理已回传 C-CMS-01 的“23 个模型均存在”摘要；C-CMS-02 的逐模型 schema JSON、Q-DB-01/02/03/11/12 原始结果和 SHA-256 仍是本 ticket 的待固化证据，不得用摘要替代。

历史 CloudBase/CMS 制品只做文件读回与 hash 复核；主代理已经执行并回传当前摘要，但本子代理没有自行重复云端查询。当前 `e2e_real_api` 读回缺口：

- `INFORMATION_SCHEMA.TABLES/COLUMNS/STATISTICS`：两 schema 的当前表、列、索引、行数原始结果和 SHA-256；主代理已提供部分计数摘要；
- 当前 `question_library_v5_real`/`question_option_mapping_v5_real`/`outcome_*` 的 active/audited 分布、孤儿行和题包交叉原始结果；主代理已提供题库状态摘要，但选项/路由交叉仍待固化；
- `manageDataModel` 当前 CMS 模型字段、发布状态、字段映射和模型级分组的逐模型 JSON；主代理已提供模型总数及存在性摘要；
- 当前 storage 对象前缀、公私可见性和 release 引用；
- 当前实际发布 batch、immutable release hash 和读回。

## 11. 未覆盖项与依赖

本 ticket 不代替其他 P-1 子 ticket，因此以下保持未覆盖：

- POWO/WCVP/WFO/RHS/ICRA 逐条权威分类核验（`taxonomy_inventory_luna`）；
- 百度、天气、百炼、支付和平台回调外部来源（`audit_external_sources_luna`）；
- Storage 前缀、私有图片和 OpenViking 精确 URI（`audit_storage_memory_luna`）；
- 旧函数/路由/测试的完整调用图（`audit_legacy_code_luna`）。

当前依赖：主代理继续在同一 EnvId 执行本节 10.1 的只读查询，并把逐条原始 JSON、当前 schema/CMS/release 结果和新的 SHA 附在本报告或后续增量报告中；不需要本子代理登录或读取凭证。`pending+active`、身份孤儿和本地/live 数量冲突完成处置前，不得进入 v2 release 或执行删除。ClickUp 配额恢复前不重试评论接口。

## 12. 交接与下一步

- 已完成：本地数据源、SQL 文件族、数据模型 mapper、题包代码、CMS 历史快照、字段映射候选、冲突、内容/资源双轴处置矩阵、主代理回传的当前精确计数摘要和 SHA-256 记录。
- 未完成：当前 `INFORMATION_SCHEMA`/CMS 逐字段逐模型原始读回、完整题包/路由交叉、immutable release hash 与发布批次读回、ClickUp 心跳回写。
- 继续条件：主代理在同一 EnvId 只读执行 10.1 查询；读取不产生 DDL/DML；输出当前 `INFORMATION_SCHEMA`、CMS model 和 release readback 原始哈希；先处理 `pending+active` 与 identity 孤儿，再讨论发布/清理。
- 失败条件：账号仍未授权、EnvId/schema 不明确、任何读取工具实际执行写入、当前 schema 与运行时合同冲突而无法区分。
- 回退方式：本次没有云端变更；本地仅新增本审计文件和 hash manifest，删除该审计制品不会改变业务状态。
- 完成度：95%（本地审计与处置矩阵完成；同一 EnvId 的当前计数、模型存在性、对象前缀与状态摘要已复核；逐条原始读回、release 证据和数据质量处置仍转后续 Phase 验收）。

## 13. 2026-09-19 复核收口与后续验收分流

### 13.1 复核范围与结论

本次复核只读取并交叉核对本报告、`P-1-cloudbase-live-readback.md`、两份 `.sha256` 清单、P-1 入口与相关 Phase 退出条件；未进行 CloudBase 登录、DDL、DML、模型变更、CMS 发布、Storage 变更、删除或 ClickUp 重试。收口终检执行 `node docs/backend-v2/verify-entrypoint.mjs` 通过：Master Plan 为唯一 SHA-256 匹配的 2111 行基线 `e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428`。

本 ticket 的“资产盘点、字段映射候选、内容/资源双轴处置、Expected 来源、删除前置条件和本地输入哈希”已由现有只读制品覆盖；同一环境的实时摘要也足以确认当前测试数据边界、关键表精确计数、23 个模型存在性、身份/题库状态门和云存储前缀可读性。因此，这些属于本 ticket 的审计判断可以闭合。

但报告原先列出的逐条 `INFORMATION_SCHEMA`、CMS 逐模型 schema、题库/选项/路由交叉、不可变 release、Storage 反向引用和当前发布批次原始 JSON 尚未附带；它们不是摘要可推导的事实，不能标记为已验证。本 ticket 交接状态为 `review_needed`，本次工作进度为 95%；主代理验收前不标记 100%。

### 13.2 可由既有只读证据闭合的审计结论

| 审计结论 | 既有证据 | 闭合边界 |
|---|---|---|
| 计划、EnvId 与只读边界明确 | 入口校验通过；实时读回记录 `cloud1-2grufevs395a9d5e`、`ap-shanghai`，并明确零云端写入 | 仅闭合审计前提，不代表生产授权或发布授权 |
| 当前数据是测试资产，不能直接作为 v2 用户/运行流水迁移源 | 两份 P-1 报告的测试数据边界与运行流水 `REJECT` 处置一致 | 闭合迁移边界判断，不删除、不迁移任何记录 |
| 本地内容资产与旧 SQL 的规模、调用方和风险可追溯 | 本报告第 3–6 节、输入 SHA-256、`TABLE_CONFIGS`/importer/publish 静态读回 | 闭合候选盘点，不把 `audited` 或旧 importer 当作 v2 release |
| 当前关键表/模型可读且数量可核对 | 实时报告的 75 表、23 模型及 `plant_catalog=200`、身份 `192/400/400`、养护 `152`、诊断/题库 `55/111/137/429/231` 摘要 | 闭合存在性与精确计数摘要；不替代逐列、索引、逐行关系证据 |
| 身份与题库的发布隔离缺口已被准确识别 | 身份 `192 pending+active`、别名/规则各 16 条孤儿；题库 `55 pending+active` 的实时分布 | 闭合“缺口存在”的审计结论；缺口本身转后续 Phase，不得据此执行修复或删除 |
| CMS/Storage/网关的可读性不再是环境阻断 | 23 个模型存在、7,345 个对象及前缀清单、21 条启用路由的实时只读摘要 | 仅闭合可访问性与存在性；不证明字段映射、私有性、引用、发布或鉴权正确 |
| 每类资产均已有 v2 owner、处置决定、替代 Expected 和删除前置条件 | 本报告第 3 节内容/资源双轴矩阵及第 8 节内容处置矩阵 | 闭合审计清单交付；不授予实施、发布或清理权限 |

### 13.3 转为后续 Phase 的验收项

| 后续 Phase | 必须验收的缺口 | 最小可核对门 |
|---|---|---|
| P0/P1 合同与基础设施 | 分类权威源优先级、身份状态、CMS release、字段语义和 source batch/hash 尚未冻结；旧表 `_openid`/CMS 所有权字段不能进入 v2 合同 | 冻结合同/Expected/DDL；保存 `INFORMATION_SCHEMA.TABLES/COLUMNS/STATISTICS` 原始 JSON 与 SHA-256；空库建表、代表性 RED 和合同哈希通过 |
| P2 `knowledge` 核心领域 | `192 pending+active` 身份、16+16 孤儿和不完整 CMS 字段仍未处置 | 每条身份有权威来源、父链、稳定来源 ID、证据与 `confirmed`/`QUARANTINE`；孤儿为 0 或有精确隔离清单；MySQL/CMS 字段一致；不可变 release 可读回 |
| P3 访问、知识与奖励 | 当前未证明“规范身份 → CMS 草稿 → 人工审核 → immutable release → 奖励”的真实闭环 | 真实 HTTP/发布读回；发布失败不发奖；并发/重放只发一次；release hash、版本、审核人、时间和回退证据齐全 |
| P4 养护与诊断 | 题库/选项/路由交叉原始结果未固化；watering DB bridge 与代码固定题包存在默认键漂移；根腐题包仍为 0 | Q-DB-07–10 逐条只读结果；固定题包版本、选项、unknown/安全门和效果回放一致；诊断只能产生建议，不写 care 事实 |
| P5 真实集成与影子验证 | 当前没有逐字段/逐模型、完整题包/路由、发布批次和 Storage 引用链的真实原始读回 | 同一 EnvId 保存原始 JSON、执行时间、schema 与 SHA-256；CMS release、Storage MIME/哈希/许可/私有路径/引用闭环；缺真实环境即标记 `BLOCKED_ENV` |
| P6 API 冻结与清理 | 旧 SQL、测试内容、兼容题键、对象和 OpenViking 条目的最终清理/归档尚未具备删除证据 | 前端切换与观察期结束后，按精确清单备份、归档/删除、读回和回退；旧服务仅在切换后退役；不得用本报告替代删除授权 |

### 13.4 不在本 ticket 内的未覆盖范围

POWO/WCVP/WFO/RHS/ICRA 逐条分类核验、外部供应商和平台回调、Storage 私有资产与 OpenViking URI、旧函数/路由完整调用图仍由其他 P-1 子 ticket 负责。本报告只引用其边界，不代替对应制品或验收。
