# P4 养护、诊断与小青

目标范围：原子环境事实、不可变输入快照、派生环境指标、盆土视觉、浇水、施肥、光照、通风、黄叶/萎蔫题包、动态虫害题包、建议确认、计划、提醒、事实、小青工具和四类可奖励业务事件。首版运行子集与后续任务见[首版运行边界](first-release-scope.md)。

诊断实现先锁定[知识来源合同](../contracts/diagnosis-knowledge-sources.md)的症状入口、园艺原因、Outcome、Action 与映射发布包，再做证据归约和结果展示；不能把黄叶/萎蔫直接当病因，也不能用展示百科或 Qwen 临时生成内容代替审核知识。首版在同症状多原因、混合/未知、禁忌动作和来源版本回放上具备可执行 Expected。

实施顺序固定为“先事实、后推导、再建议”：先完成原子环境事实的来源/范围/单位/时间/新鲜度校验和持久化，再冻结输入快照；随后实现 Estimated Indoor Environment、Window Plane Irradiance、PPFD/DLI、Air VPD 与空气运动等确定性派生，再接入 Internal Care Knowledge / Reference Profile、GrowthActivity 与 Watering DryProgress，最后才输出四类养护结果和诊断。不得从算法输出反推原子事实；Watering 禁止恢复 `indoorEqHours → dryDownFactor` 作为一级决策链。

首版退出条件：原子环境事实不可被算法改写，派生环境指标可按输入快照与算法 release 回放；室外天气不得冒充室内实测；诊断不直接写事实，视觉不自动记录浇水，已开放的养护能力均遵守四类统一合同，跨用户/跨植物访问被拒绝。诊断增强候选必须完成质量、成本与额度评估；通过后才可开放。未通过时安全回退基础版并继续优化候选，不能把原有偏薄结果直接宣称为“诊断内容充实”的 MVP 产品验收；多轮重测仍不成立则交由用户裁决取舍。延后的施肥、奖励和小青写操作按目标态任务另行验收。

诊断知识退出另要求：每个可见 Outcome 和 Action 可追溯已审核来源、适用植物、规则与同一兼容 release；未发布、撤回、冲突或缺少安全依据的行动不得展示。基础版必须能提供具体检查/处理步骤和复查条件，不能靠生成式增强掩盖知识空白。

旧路径中的 `outcomeKey → actionProfileKey`、分阶段行动和 `sourceRefIds` 只能作为 P-1 转换候选。旧来源主要挂 Action，部分来源按动作类别机械分配，弱黄叶线索可能路由到过细病因；P4 不得把旧 `audited/active` 或旧 SQL 原样视为 v2 知识准入。先按来源主张重新核验 Outcome 与 Action 的适用条件，再进入 CMS 发布包。

首版运行深度由[首版运行边界](first-release-scope.md)限定：浇水及黄叶/萎蔫/虫害是核心目标；DLI/PPFD 与 Estimated Indoor/Air VPD 是浇水正式上游而不是旧算法可选增强，具体参数在影子计算与真实链路验收前保持受控。多图、生成式解释和小青只读仍是受控实验；完整施肥和小青写操作延后。光照、通风原子事实仍归环境层，面向外部的评估结果遵守四类统一养护合同。诊断内容增强按[实验合同](../contracts/diagnosis-rich-response-experiment.md)完成质量、Token、实际成本与额度对照后才可开放。
