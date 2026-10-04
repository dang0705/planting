# 架构硬规则

1. 用户植物是长期个体数据的中心。
2. 游客不是正式用户，不拥有用户植物、积分、会员或个人小青上下文。
3. 识别候选不能直接成为规范身份。
4. 诊断只能产生建议，不能直接写计划和事实。
5. 只有用户确认实际发生，才能写植物事实。
6. 盆土视觉只产生有时效证据。
7. 展示百科不得进入养护和诊断基本面。
8. CMS 贡献奖励必须在 release 正式发布后发放。
9. 领域函数不得跨域写表。
10. `subscription` 是积分、等级、兑换和 AI 额度唯一写者。
11. 会员能力层和 AI grant 消费层必须分离。
12. 所有公开响应、日志和错误必须脱敏。
13. 关键业务变量必须由所属领域的类型化不可变策略 release 管理；禁止万能键值配置表。
14. 第三方能力统一经过 Provider Registry、请求级配置快照和受控 Adapter；业务域不得自行读取供应商环境变量。
15. 配置只保存 `credential_ref`，密钥原文不得进入 MySQL、CMS、代码、日志、测试或响应。
16. 用户植物归属、身份准入、写入所有权、安全校验顺序和公开脱敏属于不可配置硬规则。
17. `configuration-variable-catalog.json` 是业务关键变量机器事实源；目录外关键常量不得进入实现。
18. `P1_PENDING` 变量不得拥有源码默认值；对应 `blockingScope` 在冻结前只能补合同、证据与 RED。
19. 配置 release 必须不可变、带 SHA-256、原子切换 active 指针并保留回滚审计；同一请求只能使用一个配置快照。
20. Tropicals id/slug、数据集 taxon_id 与内部 taxon_key/plant_identities 属不同命名空间；未通过证据审核的 crosswalk 不得视作规范身份映射。
21. 植物目录百科详情的运行时主读是 CloudBase SQL（`qinghuazhi_v2_test.tropicals_species_encyclopedia_ref` 及相关离线 `tropicals_*`）。Tropicals 实时 API 只可作为可选同步、来源或后续能力，不是百科详情主路径。SQL 或 API 的外部文字、养护字段、病虫害字段和媒体都不能自动成为内部已确认身份、养护规则、诊断知识或安全事实。
22. 本地 106 条身份 seed/准入门只约束内部身份发布，不得作为 SQL 百科只读或合法媒体展示的前置门，也不得因百科行或 API 命中而跳过。
24. 展示型百科与 Structured Trait Evidence 必须分流：展示 DTO 永远不能成为 Care/Diagnosis 运行时知识源；外部性状只有保留来源、原始值、归一规则、置信度并经 plant-knowledge 审核发布为 Internal Care Knowledge / Reference Profile 后才可进入养护。
25. 浇水正式主时间轴是 DryUnit / DryProgress；`indoorEqHours`、`dryDownFactor`、`adjusted cycle` 不属于 Watering 一级决策输入；当前可靠 Soil Evidence 拥有最终安全门。
26. GrowthActivityState 只选择条件性 Baseline，不得作为额外季节乘数；DLI、温度等证据不得重复计权。
27. 光照是否有直射由太阳几何、窗面几何和遮挡决定，禁止硬编码“北窗无直射”等经验规则。
28. 室外天气不得直接生成室内 VPD；缺室内实测时只能使用明确标识、可回放的 Estimated Indoor Environment。
