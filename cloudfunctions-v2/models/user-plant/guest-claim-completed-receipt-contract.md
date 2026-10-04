# 游客认领成功收据只读核对

E03 / z8v0kmr9mj。复用 `guest-session-claim/v1`、003认领三表一致性和上个增量的规范请求哈希。本用例不依赖租约时长，也不完成认领；它是已完成认领的内部只读查询及后续提交未知核对端口。

输入严格为已验真UserPrincipal、guestSessionRef、guestPlantCaseRef、严格target、idempotencyKeyHash、可信nowMs。调用前固定输入，不接受证明版本、候选claimRef、内部键或额外身份。Principal在捕获的nowMs有效；数据库用户仍为active并且技术字段为空。

只接受 completed 命令、不可变 guest_case_claims、claimed案例owner、同用户未删除植物四方关系一致；所有技术字段为空。session引用仍验证与案例的关系，但长期结果读回不要求游客证明再次有效；认领写事务仍必须先验真原持有证明。案例/会话后来到期不会删除已经归属于用户的成功事实。归档植物可查询，deleting/deleted不可查询。已有目标的requested和最终植物必须一致；新目标的requested必须为空。

一次参数化SELECT，使用新只读连接，不锁定、不开事务、不写入、不重试认领。无完整可见成功收据返回null；重复、损坏、无法验证字段或技术失败返回unavailable；完整成功命令的同键异参返回idempotency_conflict。跨用户、仅命令completed但缺事实、案例owner不匹配、技术字段污染和失败/处理中命令都不能伪装成成功。

完整内部结果：status=completed、原claimRef、userPlantRef、guestPlantCaseRef、proofVersion、claimedAtMs。只返回这些字段，无内部键、原始证明、匿名主体、请求哈希、租约或失败代码。时间必须安全、可表示且不晚于捕获的nowMs；proofVersion为1～4294967295。引用有相应命名空间且最多64字符。

该结果不是公开GuestClaimResultDto；公开结果还需各领域提供已获得派生归属的对象类别白名单，不猜测该名单、不跨领域改写结果。暂不新增HTTP。

配置裁决：无新增参数或默认；复用已批准身份有效性、归属及不可变成功事实硬规则。数据库故障和未知提交没有写入重试路径。
