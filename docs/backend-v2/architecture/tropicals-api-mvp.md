# 植物目录与百科：CloudBase SQL 主读

> 当前运行时基线：植物目录搜索和百科详情均以 CloudBase SQL 为主读；Tropicals 实时 API 只保留为可选同步、来源核对或后续能力。表关系、行数和外键以 [植物目录数据模型](plant-catalog-data-model.md) 及 `qinghuazhi_v2_test` 只读核对为准。文件名沿用既有链接名称。

## 架构裁决

- **百科详情的运行时主读是 CloudBase SQL**，库 `qinghuazhi_v2_test`，主表 `tropicals_species_encyclopedia_ref`。分类、俗名、生长季是同一参考层里的分表，用 `taxon_id` 软关联，不合并，也不另起一套目录。性状表 `tropicals_trait_ref` 在库里是空的；部分档位已经落在百科行上。
- **详情定位用 slug，由 `scientificName` 生成，不必是已存储的 API 字段。** 规则：去掉引号、标点及其他符号，把剩余空白折成单个连字符，再转为小写（kebab-case）。例：`Monstera deliciosa 'Thai Constellation'` → `monstera-deliciosa-thai-constellation`。该 slug、Tropicals API 的 id/slug、数据集 `taxon_id`、`plant_taxa.id`、`plant_identities` 的内部 id 属于不同命名空间，禁止当成同一个主键。
- **缺 API 字段不是本次切换的阻断项。** `nameEn` 元数据、COL、价格等实时 API 才有、SQL 百科行没有的字段，不阻止把百科详情主读改到 SQL。展示以表内已有列和许可允许的媒体引用为准。
- **展示百科与结构化性状证据必须分流。** 百科正文、养护难度、温湿范围长文、病虫害描述等展示投影不得直接进入 Care / Diagnosis / Safety。来源表中的 `water_frequency_tier`、`light_requirement_tier`、`humidity_preference`、`optimal_temperature_range_c`、`tropicals_growth_season_knowledge` 等结构化字段只能作为 `Structured Trait Evidence`：先保留来源与原始证据，再由 `plant-knowledge` 做归一、冲突检查、置信度与审核，发布为不可变 `Internal Care Knowledge / Reference Profile` 后，Care 才能消费。当前 `tropicals_trait_ref=0` 且百科表没有 `substrate_preference`，因此植物级 cultivation reference 仍是明确数据缺口；不得在架构图里把它画成已具备。22 条 `watering_baseline_policy` 继续作为基线策略，但 `[min_days,max_days]` 在 `watering-decision-model/v1` 中解释为标准参考条件下的 `[minDryUnits,maxDryUnits]`，不是直接的自然日浇水命令。
- **Tropicals 实时 API 降级。** 它只保留为可选同步、来源核对或后续能力，不是百科详情的运行时主路径，也不是目录搜索的目标数据源。首页客户端直连是代码现状，不是目标。
- **目录搜索的目标是已经在库里的 `plant_search_*` SQL 投影，不是再造一套，也不是「这些表不存在」。** 2026-10-03 精确计数：`plant_search_documents` 271,384 行（均可搜；可选中 270,613；带百科 271,267；挂上 V2 身份 182；挂上 V2 分类 294）。`plant_search_terms` 按来源为俗名 782,025、百科 664,028、分类 541,603、青花植别名 389、青花植身份 191。词条硬外键指向文档；文档到 `plant_taxa` / `plant_identities` 的外键可空。搜索全集不是 PlantIdentity 全集。俗名仍不是唯一键，同一中文名的多个分类都要留下，不能同名直选，也不能升格为已发布身份。已发布身份的 [公开搜索合同](../contracts/plant-knowledge-public-search.md) 继续只做 `displayNameZh` 与 `acceptedScientificName` 的字面前缀，不搜百科正文；它约束的是已发布身份搜索，不否定 `plant_search_*`。
- 内部 PlantIdentity/Taxon、发布状态、归属和安全知识仍是内部业务事实源。`plant_taxa.authority_source` 只能是 POWO、WCVP、WFO、RHS_ICRA，Tropicals 不是权威来源。`plant_taxon_tropicals_links`（精确 161，ACTIVE，其中主链接 148）才是分类内部 id 与 Tropicals `taxon_id` 的审计桥。未映射不把外部行写成内部身份。106 条逐条准入只约束内部身份 seed/发布，既不因百科 SQL 只读而取消，也不作为百科详情 SQL 主读的前置门。规范身份当前精确 192 行（ACTIVE 191），禁止按搜索文档规模去物化。

## 当前实现与目标差异

| 能力 | 当前代码事实 | 架构目标 / 尚未完成 |
|---|---|---|
| 百科详情 | 首页选中结果后仍读 Tropicals 目录详情。[tropicals.js](../../../src/api/tropicals.js) 直连 `https://tropicals.cn/api/v1`，归一学名、别名、科属、简介/形态和封面引用。 | plant-knowledge 按学名派生 slug 读取 `qinghuazhi_v2_test.tropicals_species_encyclopedia_ref`，需要时再按 `taxon_id` 读分类、俗名和 `v_tropicals_taxon_localized`。这条 SQL 主读尚未实现，文档不得写成已完成。 |
| 植物搜索 | 首页 [PlantSearchToolbar](../../../src/components/PlantSearchToolbar.vue) 启用 useTropicals；输入经约 300 ms 防抖和 AUTOCOMPLETE_MIN_CHARS 门槛后走实时自动补全。浇水目录等入口仍走内部默认植物列表。Cloud Functions v2 公开搜索仍只查已发布 PlantIdentity 的名称前缀。 | **目标检索面是 `plant_search_documents` / `plant_search_terms`，表已经在库里。** 首页改读该投影尚未完成，因此自动补全仍是现状缺口，不是目标。已发布身份公开搜索合同保持不变，也不把 27 万搜索文档写成身份。 |
| API 与密钥 | 客户端用 `VITE_TROPICALS_API_KEY` 直连名称解析、自动补全和详情。 | 实时 API 不是运行时主读。仅当以后做可选同步或补源时，才经 Provider Registry/Adapter，密钥以 `credential_ref` 注入。后端代理目前未实现，也不是百科详情或搜索投影切换的前置。 |
| 身份映射 | 没有 Tropicals API 代理。按 Enter 新建用户植物时没有把已选结果传入表单。库内桥 `plant_taxon_tropicals_links` 已有 161 条 ACTIVE 链接，不是从零设计的空位。 | `ensurePlantIdentity` 只在需要规范身份时解析或写入 `plant_taxa` / `plant_identities`，并用桥表记下 `tropicals_taxon_id`。搜索命中和百科 slug 都不能直接确认用户植物。学名派生 slug 只用于百科读路径。 |
| 媒体与许可 | 前端展示不等于逐图许可、统一署名或媒体代理已完成。 | SQL 展示文本仍按数据集/来源条款署名。图片逐项遵守来源方许可。数据集许可、API 服务协议和图片许可分开，不能互相推定。 |

## 目标边界

百科详情的目标调用顺序是：uni-app → plant-knowledge → CloudBase SQL（`tropicals_species_encyclopedia_ref`，需要分类、俗名或中文名时再按 `taxon_id` 读参考层与 `v_tropicals_taxon_localized`）→ 展示 DTO。请求路径上不调用 Tropicals 实时 API。

目录搜索的目标调用顺序是：uni-app → `GET /api/v2/plant-knowledge/catalog/search` → plant-knowledge → `plant_search_terms` / `plant_search_documents`。合同见 [plant-catalog-search/v1](../contracts/plant-catalog-search.md)。可选带出已挂上的 ACTIVE PlantIdentity 公开引用；没有挂上仍然只是搜索命中。已发布身份名称搜索继续走原公开搜索合同，不并进这 27 万行的身份集合。

身份运行时读 `v_plant_identity_runtime`（ACTIVE 身份 → 分类 → 主 Tropicals 链接 → 本地化分类 → 百科 → 媒体）。用户植物确认身份走 `user_plants.confirmed_identity_internal_id`。两条都不是目录搜索。

实时 API 若启用，只作为把数据同步进参考层、核对来源，或以后单独立项的能力。官方文档中的名称解析、自动补全、按 API slug/id 取详情、API Key、评估试用与商用协议，只在那条可选链路上适用。[公开数据集](https://tropicals.cn/datasets)与[实时 API](https://tropicals.cn/docs/api)仍是不同许可入口。API 文本若被同步使用，按 CC BY 4.0 保留 Tropicals.cn 署名与授权链接；图片不能由 API Key、文本许可或数据集许可推定商用权利。

## 落地顺序

1. 把百科详情运行时主读改到 `tropicals_species_encyclopedia_ref`，用学名派生 slug 定位；分类与俗名按 `taxon_id` 连接。缺 API 专有字段不阻断。
2. 把目录搜索改读已有的 `plant_search_*`。不要新建第三套检索表，也不要删除或禁止这套投影。首页 Tropicals 自动补全保持为待替换的现状。
3. 把首页客户端直连视为待退役的现状，而不是要补齐的目标主路径。可选同步再单独立 Provider 与许可门。
4. 内部身份继续走权威来源、父链、歧义、人工审核、release 和公开读回。`ensurePlantIdentity` 与 `plant_taxon_tropicals_links` 只服务这一小集合。106 条 seed 只作用于这条内部发布门。
5. 验收双通道隔离：展示百科正文与病虫害文本不得进入养护或诊断规则；结构化性状证据必须经过 `plant-knowledge` 审核发布后才能进入 `Internal Care Knowledge / Reference Profile`。浇水消费的是已发布 Baseline / Reference Profile / 环境与当前盆土证据，不得运行时直读百科行做自由推断。

当前可确认的代码事实仍是首页 PlantSearchToolbar 的 Tropicals 自动补全和 API 详情读取。SQL 百科主读、对 `plant_search_*` 的调用、身份 crosswalk 的产品路径与图片许可治理都还不是已完成项。库表本身已经存在，见数据模型文档。
