# 游客案例绑定已有植物的原子完成

E03 / z8v0kmr9mj。依据 guest-session-claim/v1 的事务原子性、处理租约、目标一致性与成功后清除上一版证明规则；复用003认领四表和已验收证明端口。

仅完成已经处于processing、仍有效且由当前服务端持有的原命令，不取得或延长租约。租约时长仍未确认，本模块不生成期限，不提供默认值，也不接HTTP。输入复用登记命令的六项可信输入，严格限定已有植物目标，另增加服务端leaseOwnerHash。claimRef必须为原命令引用；规范请求摘要必须一致。

在调用方显式事务中，先锁会话并重新验证匿名主体和持有证明，再锁案例、有效统一用户、本人active/archived植物、原命令。命令必须属于相同用户与案例、相同幂等键和原claimRef；请求目标等于最终目标。仅processing可完成，租约摘要必须匹配且截止时间严格晚于本次可信nowMs。过期或错误持有者拒绝；不接管、不重试、不修改failed/requested/completed。完成重放由已有只读收据端口负责。

案例必须completed、未过期、无归属，时间和版本有效；版本溢出拒绝。证明拒绝直接返回，损坏存储不可用；同键不同语义返回idempotency_conflict。租约、状态和目标不满足返回not_claimable；到期返回expired。

原子写入：案例claimed owner及version递增；原命令completed、最终目标且清除租约；不可变guest_case_claims插入一次；游客会话上一版证明及其截止时间清空。保留原claimRef、request_hash、proof_version、attempt_count。所有写入必须affectedRows=1并在同一事务完整读回关系；任一失败抛错供外层整体回滚，不由Repository提交。完成结果只有status=completed、claimRef、userPlantRef、guestPlantCaseRef、proofVersion、claimedAtMs，不是公开对象类别结果。提交前结果仅供事务编排，外层提交后才能披露。

不更改临时养护/诊断内容，不恢复归档植物、不新增计划、行为或积分。真实数据库测试证明同事务四项写入与各失败点回滚；身份Provider仍为明确替身，不能当正式认领HTTP验收。

配置裁决：复用不可覆盖的单次认领、归属、状态和不可变事实规则；无新配置或默认。processing时长缺口仍阻断真实租约取得与完整用例。
