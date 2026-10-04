# 兼容诊断知识包与原子发布

归属E05原票z8v0kmr974。依据既有诊断知识持久化合同009/010，不把审核通过等同发布。新增内部发布包结构diagnosis-knowledge-release/v1，只保存原样完整候选及其审核出处；不从关系表重新排列或改写被审候选。

包字段：schemaVersion、releaseRef、bundleCode、version、candidateRef、candidateContentSha256、reviewRef、reviewProtocolVersion、publishedAtMs、candidate。candidate严格满足原候选Schema，包业务代码与candidate.bundleCode一致，候选内容摘要重新计算。全部字段必填、拒绝未知字段，引用遵循009列宽，版本遵循unsigned整数范围；时间是安全UTC毫秒。审核与依赖准入是应用职责，结构锁定不代替审核。包整体另算规范化SHA-256并冻结。

受控发布命令：commandRef、releaseRef、bundleCode、version、candidateRef、candidateContentSha256、reviewRef、reviewProtocolVersion、expectedPointerVersion、operatorRefHash、reasonZh。主体已由上游CMS鉴权；协议已由上游明确批准，不设默认。服务端时间不属于请求摘要或重放相等性。

同一显式事务：先按commandRef读历史审计，已有同参命令返回原收据，异参冲突；否则锁定精确审核与候选并查撤销，重新执行现有候选准备的Schema/来源/题包/引用闭合，原样摘要须等于命令摘要；锁活动指针并比较期望版本；版本必须大于同包历史最大发布版本；插入不可变发布、切换指针、追加原有激活审计并读回。首次无指针时expectedPointerVersion=0，首次指针版本1；已有指针每次加1。release版本由受控命令指定，不能猜“最新”。没有获准依赖Reader不得构造发布用例。

同键重放通过既有审计字段与完整发布包逐项比对命令，不以当前活动指针或当前时间重建收据。历史收据不重新激活发布，也不证明当前发布仍安全。结构损坏拒绝重放。查询和更新使用绑定参数与二进制引用比较。唯一约束和期望版本保护并发；失败由共享事务驱动回滚，提交未知只用新连接读commandRef对账，不重跑写入。

本增量不创建生产资源或修改DDL，不实现CMS鉴权、实际园艺内容审核、来源许可判定、回滚/撤销写HTTP或实际诊断。精确审核撤销内部用例见 `review-revocation-contract.md`，独立事实与发布共享目标锁；同范围有效旧知识包指针回滚内部用例见 `knowledge-rollback-contract.md`；知识撤回与正式CMS接线仍须完成。受控依赖与审核协议仍须真实接线后才能正式发布；测试中的替身不授予生产发布资格。

配置裁决：包版本、原样内容、幂等、事务原子性和指针比较属于不可配置硬规则；没有新增超时、预算、重试或协议默认值。正式诊断知识release引用仍pending，只有真实审核内容发布后才能确认。

运行请求的活动知识快照由 `active-knowledge-contract.md` 约束：重新核验原审核及来源依赖、锁后当前读确认单一指针和精确包，事务结束后才允许后续模型调用；只读快照不代表诊断结果已经生成。
