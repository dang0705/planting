# 业务到技术映射清单

本清单承接 README 中的业务领域架构与后端基础设施架构：业务语义由前者定义，技术落点由后者承载。完整目标架构按首版范围与各 Phase 的合同、验收门逐步开放；目标节点出现在映射中不代表已经运行或验收。

| 业务节点 | 应用服务 | 领域核心 | 数据/事件 | 验收入口 |
|---|---|---|---|---|
| 统一用户与访问主体 | identity | Identity Domain | users/platform_identities/user_sessions/service_replay_nonces；不创建 principal_mappings | P1 合同门 / P2 identity |
| 植物业务入口与临时/长期选择 | identity 解析主体；user-plant（UserPlantApp）编排入口与晋升 | Principal 与 User Plant Core | guest_plant_cases / authenticated_ephemeral_plant_cases / user_plants / promotion / binding | 首版核心；合同与 016/017 DDL 设计已冻结，真实 MySQL/HTTP/Expected 未通过前不宣称运行验收 |
| 运行时植物上下文（Runtime Plant Context） | 既有业务用例按能力只读组装与消费；user-plant 校验长期植物归属 | 临时与长期上下文统一只读视图 | 临时案例输入与有效证据 / 归属校验后的用户植物身份、配置、事实与状态投影 | P1 上下文合同；P3 消费路径真实验收 |
| 用户植物与显式晋升 | user-plant（UserPlantApp） | User Plant Core | user_plants / promotion 与必要结果认领 | P2 user-plant；同会话认领合同 |
| 植物分类与内部目录 | plant-knowledge | 只读已发布 PlantIdentity/Taxon；发布仍受内部证据与人工准入控制 | plant_taxa / plant_identities release | P1 identity audit；SQL 百科行或 Tropicals 命中不跳过准入 |
| 百科详情运行时主读 | plant-knowledge（目标；当前未实现） | 按学名派生 slug 只读展示百科；不是内部身份，养护/病虫害列不进入规则 | `qinghuazhi_v2_test.tropicals_species_encyclopedia_ref`；slug 例 `monstera-deliciosa-thai-constellation` | 2026-10-03 裁决。缺 nameEn/COL/价格不阻断。代码仍是首页 API 直连 |
| 离线分类与俗名 | plant-knowledge 读已有表 | 参考层分表，`taxon_id` 软关联；俗名不是唯一键 | tropicals_taxon_ref / tropicals_vernacular_name_ref / encyclopedia / growth_season | 不合并成一张植物表；不升格为已发布身份 |
| 目录搜索投影 | plant-knowledge（合同已冻结，首页代码未接） | `plant-catalog-search/v1`；可重建；搜索全集 ≠ PlantIdentity 全集 | plant_search_documents / plant_search_terms；词条硬外键指向文档，文档到 taxa/identities 可空 | `GET /api/v2/plant-knowledge/catalog/search`；首页仍是 Tropicals autocomplete |
| Tropicals 实时 API（已降级） | 当前首页 uni-app 直连；不是目标主路径 | 仅可选同步、来源核对或后续能力 | /names/resolve、/species/autocomplete、/species/{slug|id} 不在百科详情运行时路径 | 客户端密钥直连待退役；后端代理不是详情切换的前置 |
| 外部标识到内部身份 crosswalk | plant-knowledge（目标能力，未实现） | 仅将有证据的外部标识映射到内部候选/已发布身份；不自动发布或确认 userPlant | 目标映射证据、来源版本、歧义/审核状态；没有已冻结的表或 Schema | 映射合同冻结后单独验收；未映射不把百科行写成内部身份 |
| CMS 自动扩种与生成式拓百科 | plant-knowledge | 内部身份/内容治理，不替代 SQL 百科只读 | enrichment/release / 贡献审核与奖励 | 首版延后；不作为百科详情 SQL 主读的前置 |
| 积分和等级 | subscription | Reward Domain | care_point_ledger | P3/P4 目标态；首版运行延后 |
| AI 额度 | subscription | Entitlement/Reward Domain | ai_quota_* | P2/P5 quota |
| 养护 | care | Care Domain | facts/plans/soil evidence；environment observations/snapshots/derivations；care decision derivations；temporary care | P4：DLI/Indoor/VPD/GrowthActivity/DryProgress + Soil Gate |
| 诊断 | diagnosis | Diagnosis Domain | sessions/results | P4 diagnosis |
| 症状入口 → 园艺原因 → Outcome/Action | diagnosis 拥有内容语义与结果归约；plant-knowledge 复用 CMS 编辑发布通道 | Diagnosis Domain | 来源证据 / 原因目录 / Outcome / Action / 审核映射 / 兼容 release；结果锁定版本 | P1 诊断知识来源增量合同 / P2 CMS 发布基础设施 / P4 诊断内容底线 / P5 真实回放 |
| 诊断生成式丰富解释 | diagnosis + subscription | 诊断证据账本与 AI 额度合同 | versioned prompt/schema/cost policy；按单一 productActionId 归集成本与额度 | P4 受控实验；动作级成本/额度上限、真实成本对照与回退门 |
| 小青 | CloudBase Agent | 受控工具合同 | signed internal API | P4 agent |
| 领域业务策略 | 各所属应用服务 | 各领域规则 | typed policy release / active pointer | P1 config contract + 各 Phase |
| 第三方 Provider 配置 | shared foundation + 对应 Adapter | 不承载领域规则 | provider config release / request snapshot | P1 config contract / P5 real API |
| 密钥与签名材料 | CloudBase 受控环境/凭证系统 | 不进入领域 | credential_ref / rotation audit | P0 security / P5 real API |
| 业务关键变量目录 | 各变量所属业务域；共享层只做机械校验 | 类型化不可变策略或不可配置硬规则 | configuration-variable-catalog / typed release | P1 configuration gate |

机器门禁：业务节点覆盖率 100%；每条关系必须有 owner、API/事件、表和 Expected；共享层不得承担业务事实。任何新业务常量必须先进入关键变量目录并完成状态分类。

身份 crosswalk 与百科详情 SQL 主读、目录搜索投影分开：Tropicals API id/slug、学名派生的目录 slug、离线数据集 taxon_id 与青花植内部 taxon_key、plant_taxa、plant_identities 处于不同命名空间，禁止直接等值。库内审计桥是 `plant_taxon_tropicals_links`（硬外键只指向 `plant_taxa`，Tropicals 一侧是 `taxon_id` 软键）。未映射的百科行或搜索命中只能展示，不能写成内部身份。内部规范身份的 `authority_source` 只能是 POWO、WCVP、WFO、RHS_ICRA，仍须完整父链、名称歧义与人工准入。公开数据集 CC-BY、可选实时 API 的服务/商用条款、图片来源许可分开核验。详见 [植物目录数据模型](plant-catalog-data-model.md)。
