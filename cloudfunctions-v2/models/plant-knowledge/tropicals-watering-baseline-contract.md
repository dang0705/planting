# Tropicals 浇水语义编译与名义基线读取

归属 E04／E06 原票 z8v0kmr973，是 Care 上游知识的内部只读切片，不改变公开目录、百科或身份搜索，不新建HTTP或物种派生表。

真实源：2026-10-08定向读回 cloud1-2grufevs395a9d5e 的 qinghuazhi_v2_test。watering_baseline_policy 有22条active v1规则，唯一键为policy_version＋water_frequency_tier＋trigger_state。来源百科含tier及原始water_frequency_source_json；三条已保存实数据为龟背竹、绿萝、星兜。

已批准方向：plant-knowledge对单条来源运行compileWaterState({tier,remarks})，保留tier，再查小策略表；Care不直接查Tropicals SQL。没有二十多万行派生表，不回填百科状态，不用湿度或光照改编译天数。旧记忆中直接称dry units的表述不覆盖当前计划：参考条件未确认，min_days/max_days仍是名义日基线。

本次编译是明确标识的保守词义候选，不宣称已复现旧批处理97.19%覆盖率。条件作用范围沿逗号分句保留，在句号、分号或换行后重新判定；生长季／生长期／休眠期／春夏秋冬等条件句不充当全年trigger。有且只有一种明确无条件trigger才细分；无明确主句或混合冲突保留TIER_DEFAULT。否定表达不当作正向触发词，原文与全部匹配／否定句保留供审核，不制造置信度。

本增量识别保持湿润／微湿、表土干燥、见干见湿、干透浇透、充分／长期干燥及缺水信号的明确词义。特殊供水关键词进入专项复核，不冒充普通盆土周期；明显叶形／叶序等跨域文本且无浇水信号时拒绝普通编译。未知tier或非法原文不填默认。源JSON的taxonID、measurementTypeID和measurementValue必须与SQL来源一致；原始JSON不改写，AI抽取审校状态如实保留，不凭active标志授予正式知识发布资格。

一次参数化LEFT JOIN同时取得该植物和指定版本的active规则，再编译选择；不分两次查询产生来源/策略交叉读。两表tier列的真实排序规则不同（unicode_ci／0900_ai_ci），直接等值连接在现网报1267；对枚举标识使用CAST AS BINARY精确比较，避免改表和改变既有排序规则。版本由调用方明确提供，无最新版本默认。引用与版本在等待SQL前固定，调用方后续改写不改变本次读取。

缺植物、源损坏、特殊栽培、缺策略分别返回明确状态。来源行不一致、重复策略、非法天数或返回不属于查询版本的规则拒绝；具体trigger缺规则时不偷换TIER_DEFAULT。只把现有nominal days返回给候选回放，不产生干燥单位、水量、日期、正式建议或用户事实。

独立Expected：真实v1下绿萝regular＋SURFACE_DRY为[5,8]；星兜drought_tolerant＋FULL_DRY为[14,21]；龟背竹主句见干见湿为regular＋DRY_WET [7,14]，条件句“生长期保持盆土微湿”不覆盖全年主句。全部条件句时用已有TIER_DEFAULT，不在代码写数值。结果锁定来源、编译结果与所选策略的副本和规范SHA-256，调用后改输入不改回放。

测试分层：L1词义unit_fake、真实只读响应制品unit_real_data；实际编译后的Node22 Repository通过受控SQL桥接认证CloudBase MCP完成测试库读回。本轮没有容器MySQL验证，直接TCP连接超时；桥接读回不证明mysql2网络接入、正式CloudBase HTTP或生产发布。正式编译策略发布、参考条件和知识准入仍待完成。
