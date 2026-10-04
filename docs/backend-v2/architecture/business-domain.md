# 业务领域架构实施说明

> 产品与架构方向：**Everything is for your plant**。`user_plant_id` 是长期个体数据的稳定中心；临时服务仍可独立完成，并通过用户明确的创建或绑定选择进入这株植物的长期记录。目标业务图完整保留，首版只调整运行深度。

## 用户植物一等公民

长期养护、诊断、事实、计划、提醒、时间线、资产和小青上下文必须同时归属于 `user_id + user_plant_id`。

游客可以产生临时识别候选、固定问诊结果和浇水建议，但没有 `user_plant_id`。已有 `user_id` 的登录用户也可以主动选择临时植物，不必把帮别人识别或问诊的结果写进自己的花园。游客在同一会话登录后，或已登录用户在临时使用后，明确选择新建或已有植物，才能一次性认领；认领只增加归属，不把建议变成事实，也不追溯奖励。

植物业务入口先判断主体：游客首次只能进入临时植物；已有 `user_id` 的用户再选择临时使用或绑定长期植物。临时体验结束后若选择保存，再进入创建或绑定用户植物；没有 `user_id` 的主体须先登录。游客路径已有冻结的认领合同；已登录用户的临时案例还须完成[独立合同补充门](../contracts/authenticated-ephemeral-plant-case.md)，不能借用游客匿名证明。详细条件门与领域下钻见[最新版分层业务架构](business-domain-layers.md)，首版各节点的运行状态见[首版运行边界](../phases/first-release-scope.md)。

## 业务事实链

```text
访问主体
→ 统一用户
→ 用户植物
→ 植物身份 / 个体档案 / 养护环境
→ 原子环境事实 / 天气 / 盆土证据
→ 不可变输入快照 / 确定性派生
→ Internal Care Knowledge / Reference Profile
→ 浇水 / 施肥 / 光照 / 通风
→ 诊断结果与建议
→ 用户确认
→ 计划 / 提醒或实际事实
→ 时间线 / 小青上下文
```

## 原子环境事实是养护基石

业务域固定遵循“先事实、后推导、再建议”：光照环境、空气温度、相对湿度、空气运动、盆器、基质、排水和盆土表面状态先作为带来源、空间范围、时间、单位、置信度与哈希的原子事实保存；随后由版本化确定性算法生成 Estimated Indoor Environment、Air VPD、窗面 Direct/Diffuse、PPFD/DLI、空气运动代理、环境干燥需求与栽培保水能力等派生值。植物级基线、GrowthActivity 与 Reference Profile 来自已审核 Internal Care Knowledge，不允许从展示百科运行时反推。

```text
原子环境事实 / Plant Facts
→ 不可变输入快照
→ 确定性派生
→ Internal Care Knowledge / Reference Profile
→ GrowthActivity / DryProgress 等能力派生
→ 四类养护能力与诊断
```

室外天气不得冒充室内实测；无室内实测时只能生成明确标识的 Estimated Indoor Environment。算法变化不得改写原子事实；环境/栽培派生与植物状态/浇水决策派生分层保存，任何派生都不能反向成为植物永久属性。浇水只消费上游 Light Model 已计算的 DLI，`indoorEqHours` 不属于正式输入；GrowthActivity 只选择适用基线，不叠加季节倍率；当前可靠盆土证据优先于 DryProgress 预测。临时浇水使用相同语义的临时快照，不回写已有用户植物；游客与已登录用户主动临时使用都属于 Ephemeral 语义，底层 DDL 已形成 016/017 迁移设计，但尚未在目标 CloudBase MySQL 完成真实执行与约束读回。后续显式绑定只增加归属而不改变原结果语义。

## 知识边界

```text
百度候选 ≠ 规范分类事实
Tropicals API 外部身份 ≠ 已审核发布的青花植植物身份
SQL 百科行 / 学名派生 slug ≠ 已审核发布的青花植植物身份
规范植物身份 ≠ 展示百科
展示百科 ≠ 内部养护、安全、诊断知识
用户私有图片 ≠ 公共 CMS 素材
```

2026-10-03 起，展示型百科详情的运行时主读是 CloudBase SQL：`qinghuazhi_v2_test.tropicals_species_encyclopedia_ref`。详情 slug 由 `scientificName` 去符号后做成 kebab-case（例：`Monstera deliciosa 'Thai Constellation'` → `monstera-deliciosa-thai-constellation`），不必是已存储的 API 字段。Tropicals 实时 API 改为可选同步、来源或后续能力，不是百科详情主路径。API id/slug、学名派生 slug、数据集 taxon_id 与内部 PlantIdentity/Taxon 的 crosswalk 仍是待设计能力，须保留来源、证据、歧义、状态和审核轨迹。未映射可以按许可展示百科行，但不能写成内部已确认身份、创建规范分类事实或跳过 userPlant 确认。当前代码仍是首页 PlantSearchToolbar 前端直连 API；SQL 主读、内部 crosswalk 与媒体许可治理尚未完成。缺 `nameEn`、COL、价格等 API 字段不阻断这次切换。

本地 taxon.tsv.gz、vernacularname.tsv.gz 与已入库的分类、俗名、百科参考表就是目录/百科的离线事实来源，不是实时 API 的备用门。本地两份分类/名称原始文件分别有 409,880 和 1,204,618 条数据记录，SHA-256 分别为 7449ecc8f3a05e937ba2f39509ba933df33f66b018948232ebdfba954a17411d、e18c6c3a01e98b63a93636a02a850e4e8d66b29ef04a0ecf8c317f7d6fd3996d，与 Tropicals v1.0.0 官方清单一致。2026-10-03 对 `qinghuazhi_v2_test` 的实时 `COUNT(*)` 也读回分类 409,880、俗名 1,204,618，与源文件记录数一致；`information_schema.TABLE_ROWS` 仍可能显示更低的 InnoDB 近似值，不能拿它覆盖精确计数。早前按 `taxon_id` 核对过孤儿俗名为 0，同时 66,712 个中文名称对应多个分类记录：俗名因此不能当唯一标识。

目录搜索投影 **已经在库里**：`plant_search_documents` / `plant_search_terms`。它可重建，搜索全集不是已物化的 PlantIdentity 集合。已发布身份仍走公开搜索合同。俗名重名须保留多个候选，且未经内部身份准入不得升格。目录搜索已冻结 `plant-catalog-search/v1` 合同，但首页代码仍是 Tropicals 自动补全，尚未改读该投影。分层、外键和精确行数见 [植物目录数据模型](plant-catalog-data-model.md)。数据集文本 CC-BY 署名与实时 API 服务协议/商用授权分别核验；图片按来源方许可逐项判断，不从文本或数据集许可推定图片权利。

百科详情以 `tropicals_species_encyclopedia_ref` 的已有列为主，不要求先补齐实时 API 字段，也不把 SQL 行当成已发布的内部百科事实。展示投影中的养护难度、温湿范围、光照要求和病虫害字段不得直接进入养护或诊断决策；但其中结构化性状可作为外部证据，经 plant-knowledge 保留来源、归一、冲突检查和审核后，发布为独立的 Internal Care Knowledge / Reference Profile。当前实库已有 water/light/T-RH 与 growth-season 证据，但 `tropicals_trait_ref` 为 0 行且百科表没有 `substrate_preference`，因此植物级 cultivation reference 仍是缺口。内部毒性、养护、诊断和安全知识仍由青花植审核发布。CMS 自动扩种、CMS 拓百科及贡献奖励仍按首版范围延后；这不阻断 SQL 百科详情只读。首版目录与百科主路径固定为 CloudBase SQL；实时 API 仅属于可选同步/来源能力。

诊断还必须区分“用户看到的症状”和“园艺原因”：黄叶、萎蔫、疑似虫害只是题包入口，不是病因；内部审核知识把原因、Outcome 结论与 Action 行动分别登记并通过 CMS 不可变发布。结果可有多个候选或待判定，行动须通过适用性与禁忌检查，再由用户确认进入其用户植物的计划或事实。详见[诊断知识来源合同](../contracts/diagnosis-knowledge-sources.md)。

## 奖励闭环

```text
可验证的用户植物行为
→ 业务域奖励事件
→ 积分账本
→ 养护等级
→ 等级 AI 奖励或积分兑换
→ 统一 AI 额度
```

CMS 新规范植物和基础展示内容发布奖励直接进入 AI 额度，不经过积分。

## 业务策略也是版本化业务事实

试用/会员额度、免费用户植物上限、积分等级、奖励有效期、游客期限、养护阈值、题包版本和数据保留期必须由各自业务域以类型化、不可变、可审核的策略 release 管理。业务记录保存实际使用的策略版本，不能由环境变量、客户端参数或万能键值表临时改变。

“可配置”不等于“任何规则都可改”。用户植物归属、游客边界、身份准入、诊断只产生建议、用户确认才形成事实以及私图隔离都是不可配置硬规则。

所有业务关键变量的逐项状态、数值、owner、消费方和失败边界见[业务关键变量目录](configuration-variable-catalog.md)。该目录是实施前置门：`P1_PENDING` 只能补证据，不能由领域 Agent 自定默认值。
