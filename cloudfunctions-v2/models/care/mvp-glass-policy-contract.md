# MVP玻璃分类策略与后端接线

## 范围与配置裁决

用户只提供 `single`（单层）、`double`（双层）或尚未确认的 `null`，不提供型号、厚度、镀膜、波长或透射率。专业双通道参数接口及计算全部保留。当前用户裁决允许近似，不等于已发布一组生产参数。

玻璃近似值具有校准和回退需求，因此属于care领域的类型化版本策略；不增加环境变量、万能配置表或云函数。以下值不是源码默认：单层0.83、双层0.70仍为已有来源的离线候选。

## 独立合同

策略载荷 `contractVersion=mvp-glass-policy/v1`、`scopeCode=care_mvp_glass`；正文包含 `approximation=clear_glass_broadband_proxy`、`singleTransmission`、`doubleTransmission`、`sourceRef`。

两个透射率必须为有限的0至1数值，零是有效完全阻挡，不以真假判断补值。不要求双层值总小于单层值：数值范围来自具体策略，不能把普通透明玻璃关系扩大成所有玻璃的硬规则。

发布记录同时包含非空 `releaseVersion`、小写SHA-256 `contentSha256`、`releaseStatus`（draft/verified/active/retired）、合法UTC `effectiveAt` 和可选 `expiresAt`。正文摘要复用既有策略发布规范：上述六字段按键排序后紧凑JSON序列化，再对UTF-8计算SHA-256；版本、状态和时间为发布元数据，不进入正文摘要。来源必须纳入正文摘要。未知字段拒绝，日期不接受自动归一化。

数据库复用 `business_policy_releases` / `active_business_policy_releases`，类型范围为 `domain_code=care`、`policy_code=mvp_glass`、`schema_version=mvp-glass-policy/v1`。正文仅含六个载荷字段；发布状态、版本、生效与失效时间来自列。读取只接受唯一活动指针，指针冗余版本和摘要必须匹配；发布域、类型和Schema必须匹配，`verified_at_ms`不能缺失。SQL均经Repository参数化查询。数据库BIGINT时间只接受非负安全整数，转换UTC后交给已有解析器；无记录或完整性不可信均拒绝，不补默认。读回结果保留数据库发布引用，不混入公开响应。

请求捕获时刻必须合法UTC。只有active且满足 `effectiveAt <= capturedAt < expiresAt` 的版本可解析。缺发布、非active或过期返回 `unavailable`；结构、摘要、时间非法返回 `invalid`；未来生效返回 `not_effective`。不提供隐式回退。

成功解析返回冻结快照及通用配置版本引用；它仅证明当前输入策略的结构、摘要和有效期，不证明数据库活动指针、审校或科学准确性。Repository负责权威活动指针，未接正式Repository/HTTP时仍只报告回放接线。

单层选singleTransmission、双层选doubleTransmission，生成同值直射/散射输入，来源串保留版本与正文摘要。null返回两通道null，不选择默认玻璃；其他值拒绝。玻璃值在既有传播链路中仅乘一次，窗帘仍是独立效应。

`replayMvpIndoorNaturalLight` 消费显式发布记录、捕获时刻、层数和既有窗帘证据，调用既有自然光回放；有效时返回策略快照与离线结果，不开启productionAdmission，不写事实、计划、提醒或数据库。

## 验证边界

L1验证发布摘要、日期、缺失及选值；L3通过真实气象制品验证用户分类到双通道传播。策略发布记录为明确测试制品，不能证明真实生产发布。实际气象不等于现场植物测量。独立Expected来自本合同、用户确认的输入范围及已有玻璃来源；不从当前实现反推。
