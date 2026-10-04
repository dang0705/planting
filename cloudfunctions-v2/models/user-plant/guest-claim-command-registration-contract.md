# 游客认领命令登记

E03 / z8v0kmr9mj。依据 `guest-session-claim/v1` 的 requested→processing→completed/failed 状态机，本用例只登记或复用命令，不取得处理租约，不完成认领。认领租约时长尚未冻结；本用例没有时长默认值。

输入严格包含六项：已验真的 UserPrincipal、上一增量的 proof 可信上下文、guestPlantCaseRef、严格互斥 target、服务端生成的 gcl_ 认领引用、SHA-256 幂等键摘要。使用 proof.nowMs 作为同次可信时刻。target 仅允许 new_user_plant 或 existing_user_plant 加 user_plant_id。没有客户端用户、期限、租约、proof_version 或新植物引用。

登录用户不存在、停用或技术字段非空返回principal_invalid；匿名会话、案例、目标不可见统一not_claimable。

固定顺序：在外层真实事务中锁定会话并验证匿名主体与证明；锁定该会话的案例；锁定 active 统一用户；已有目标核对同一用户及未删除归属；查同一用户/案例/键原命令。

新命令只允许已完成、未过期、未认领的案例。会话和案例期限均有效；案例完成时间必须存在且时间与版本自洽。已有目标允许本人 active/archived 植物登记；后续完成用例仍须执行其全部目标资格检查。登记不会恢复归档植物，不改变其数量。

规范请求哈希包含 guestSessionRef、guestPlantCaseRef 与用户显式目标，字段顺序固定。服务端本次候选claimRef、当前证明版本和请求时间不参与哈希。同键异参拒绝；同键同参复用原claimRef和原proof_version，保留 requested/processing/failed/completed 状态及所有租约、失败信息，不偷偷重置。登记重放不是成功认领重放。已完成命令只能在命令、不可变成功事实和案例归属一致时复用。其他用户或其他键已认领的案例拒绝。到期证明不可用；案例到期拒绝新登记，不阻断已登记同键引用的内部查询，但会话持有证明仍必须有效。

新记录状态requested、attempt_count=0、target_user_plant_internal_id=NULL、租约及failure_code=NULL。existing requested target必须为本人植物内部引用；new requested target必须NULL。写后在同一事务读回原claimRef、request_hash、proof_version、requested状态和初始字段；失败必须由外层整体回滚。

结果只用于内部编排：`registered` 加 claimRef、proofVersion、replayed；或 not_claimable、expired、principal_invalid、idempotency_conflict、unavailable。registered绝不是GuestClaimResultDto，不得直接作为HTTP成功认领响应。没有新用户植物、成功事实、案例owner、计划、事实、积分或临时结果修改。

配置裁决：无新增参数，复用证明策略和不可覆盖的归属/一次认领规则；租约策略缺口只阻断后续processing及完整认领，不阻断requested登记。没有发布身份适配时不开放公开入口。
