# 游客临时会话认领合同

- 合同版本：`guest-session-claim/v1`
- 所有者：`user-plant` 单一拥有游客植物案例和认领投影；临时识别属于 `plant-knowledge`，临时养护属于 `care`，临时问诊属于 `diagnosis`。各域只能写自己的临时对象表。

游客可产生百度识别候选、固定题包结果、独立浇水建议和盆土视觉临时证据。

游客会话使用高熵 `guest_session_ref`，必须绑定服务端签发的游客令牌（只存摘要）和服务端持有证明（用户 2026-10-08 裁决替代 CloudBase 匿名主体）。设备 ID、IP、User-Agent 只能参与防刷，不能证明会话所有权。

持有证明只以 SHA-256 摘要存储，并具有单调递增的 `possession_proof_version`。轮换时只允许在
明确的短宽限期内接受上一版摘要；`previous_proof_valid_until_ms` 到期后必须清除上一版摘要。
认领命令记录已验证的 `proof_version` 以便审计，但永不保存或记录原始 bearer 证明。

持有证明即服务端自发的游客令牌本身（依据 guest-token/v1 §3，2026-10-09 主代理授权）：认领时由已登录用户在 JSON 请求体字段 `guestToken`
（`^[A-Za-z0-9_-]{43}$`，即 256 位随机值的 base64url）携带原游客令牌；不得出现在 URL、日志、审计或错误响应。
数据库仅保存其 SHA-256（`possession_proof_hash`）。校验时按令牌摘要定位会话，并要求会话引用与请求
`guestSessionRef` 一致、`identity_source='server_issued_guest_token'`（历史 `cloudbase_anonymous` 会话一律不可认领），
再对等长摘要使用常量时间比较。`anonymous_subject_hash` 只作防刷信号，不参与持有证明。MVP 不主动
续期游客会话；当前游客令牌不轮换，上一版证明宽限路径保留（无上一版时不触发），上一版最多保留 300 秒。
认领成功后立即清除上一版证明；当前会话到期时所有证明同时失效。

一个会话可以包含多个 `guest_plant_case_ref`，但每个游客植物案例只能表达一株临时植物。识别、问诊、独立浇水和盆土视觉等域内临时对象必须引用其中一个案例；不得把多株植物混进同一案例。

游客会话与游客植物案例是两个状态机：

```text
游客会话：active → completed / failed / expired
游客植物案例：active → completed / failed / expired；active / completed → claimed
```

可认领案例 = `active` 或 `completed`、未过期、未认领（2026-10-09 主代理授权）。依据 temporary-case/v1：案例创建即 `active`，v2 无案例完成流程，因此 `active` 案例可直接认领。

会话完成规则（2026-10-09 主代理授权）：按案例逐个认领；在认领事务内（同事务、条件写、读回）检查同一会话是否已无「未认领且未过期」的 `active`/`completed` 案例，若无则把游客会话置为 `completed`。guest-token/v1 §3「同一令牌第二次认领拒绝」落实为：同一案例不可二次认领；`completed` 会话只允许同用户、同案例、同幂等键、同请求摘要重放原收据，新命令返回 `GUEST_SESSION_NOT_CLAIMABLE`。

- 未绑定临时会话保留 7 天（168 小时，用户 2026-10-08 裁决，配置项 `identity.guest.session_ttl_hours`）。
- 失败或隔离记录最多保留 7 天，只用于防刷、故障定位和安全审计。
- 游客会话不创建 `user_id`、`user_plant_id`、积分账户、会员或个人 Agent 上下文。
- `claimed` 只属于单株游客植物案例，绝不作为游客会话状态；同一会话内不同案例可以分别认领或过期。

认领必须满足：持有同一游客会话的原游客令牌（依据 guest-token/v1 §3，2026-10-09 主代理授权）、已登录并解析到统一 `user_id`、用户明确选择新建或已有用户植物、会话未过期、命令具有 `Idempotency-Key`。

认领只补充归属，不把结果转为事实、建议转为计划，也不追溯发放积分。

认领目标为新建植物时，若服务端能力快照在执行前已失效且不存在可重放的原成功结果，统一返回 `409 CAPABILITY_SNAPSHOT_EXPIRED`（2026-10-10 用户裁决），不新建植物、不改变案例；已成功的同键重放不依赖当前快照。

## 认领记录的唯一事实源与三表一致性

游客认领必须把“命令”“成功事实”和“当前投影”分开，不能让三张表各自生成一份成功结论：

- `guest_claim_commands` 是认领命令的唯一记录，也是唯一公开 `claim_ref` 事实源。`claim_ref` 在命令创建时生成并以唯一约束保护；同键重放只能回读这条命令的引用，不能另发一把公开引用。
- `guest_case_claims` 是不可变成功事实，只在认领事务成功时插入一次。它通过 `claim_command_internal_id` 回溯命令，不重复保存 `claim_ref`；公开结果的 `claimRef` 必须从关联命令回读。成功事实必须与命令的 guest case、`user_id` 和最终 `user_plant_id` 完全一致。
- `guest_plant_cases` 的 claimed owner 只是可重建当前投影，不是第二个成功事实源。成功事实是唯一不可变事实源，当前投影不得独立生成认领结论；投影中的案例、用户和植物三元组必须与成功事实完全一致。
- `guest_case_claims` 对一个 `guest_plant_case_internal_id` 只允许一条成功事实，对一个命令只允许一条成功事实；失败命令不得插入成功事实。三表关系必须能沿“案例当前投影 → 不可变成功事实 → 认领命令/公开 claim ref”回放。
- 成功后案例 owner、命令目标和成功事实目标均不可更换。已有植物的请求目标和最终目标必须是同一 `user_plant_id`；新建植物的最终目标只能由同一认领事务中新建并写回，客户端不得提交内部主键冒充新建结果。
- existing_user_plant 的 requested target 与最终 target 必须是同一 user_plant；new_user_plant 的最终 target 只能由同一事务中新建并写回。

## 认领命令

```ts
export type ClaimGuestSessionCommand = {
  /** 临时会话公开引用，与令牌定位到的会话交叉校验。 */
  guestSessionRef: string
  /** 待认领的单株游客植物案例；该案例下全部临时对象一起获得派生归属。 */
  guestPlantCaseRef: string
  /** 原游客令牌，即持有证明（依据 guest-token/v1 §3，2026-10-09 主代理授权）；只在内存中计算摘要。 */
  guestToken: string
  /** 显式选择新建或绑定已有用户植物。 */
  target: { type: 'new_user_plant' } | { type: 'existing_user_plant'; user_plant_id: string }
}
```

幂等键只走 `Idempotency-Key` 请求头（以 route-registry 的 `required_header` 为准），请求体不得携带 `idempotencyKey`（2026-10-09 主代理授权）。

认领成功或同键同参重放时，公开结果固定为以下白名单字段。`claimedObjectKinds` 按现有临时表查询（2026-10-09 主代理授权）：该案例有 care 临时结果 → `independent_watering_advice`；有临时诊断结果 → `fixed_diagnosis_result`；有临时浇水视觉证据 → `soil_visual_evidence`；`identification_candidate` 在其临时表存在前不出现。`claimedObjectKinds` 只说明
哪些临时对象类别已获得派生归属，不能返回对象内部主键、对象内容、模型输出、持有证明、
租约或请求哈希。

```ts
export type GuestClaimResult = {
  /** 认领命令的唯一公开引用；同键同参重放必须保持不变。 */
  claimRef: string
  /** 最终归属的用户植物公开引用。 */
  userPlantId: string
  /** 已绑定临时对象的白名单类别摘要；不包含对象 ID、内容或内部状态。 */
  claimedObjectKinds: Array<
    'identification_candidate' | 'fixed_diagnosis_result' | 'independent_watering_advice' | 'soil_visual_evidence'
  >
  /** true 表示同键同参重放回读，false 表示本次首次成功完成认领。 */
  replayed: boolean
}
```

事务规则：

- 登录后的认领请求必须在请求体 `guestToken` 携带该游客会话的原游客令牌（依据 guest-token/v1 §3，2026-10-09 主代理授权）；仅知道 `guestSessionRef` 不足以认领。
- 认领事务必须锁定游客会话并校验当前或仍在宽限期内的上一版证明；证明版本过期、倒退、不匹配或会话来源不是服务端自发令牌统一返回 `GUEST_SESSION_NOT_CLAIMABLE`。
- 已 `completed` 的游客会话只允许同用户、同案例、同幂等键、同请求摘要重放原收据；新命令返回 `GUEST_SESSION_NOT_CLAIMABLE`（依据 guest-token/v1 §3，2026-10-09 主代理授权）。
- 认领已有植物时必须校验当前 `user_id + user_plant_id` 归属。
- 同一临时结果只能成功认领一次；重复同键同参返回第一次的 `claimRef`。
- 同键异参返回 `IDEMPOTENCY_CONFLICT`；已被其他用户认领、跨用户或持有证明不一致统一返回 `GUEST_SESSION_NOT_CLAIMABLE`。
- 过期返回 `GUEST_SESSION_EXPIRED`；事务失败时临时记录和目标植物均保持原状态。
- 新建目标时，创建用户植物与写入案例认领投影处于 `user-plant` 的同一 MySQL 事务。
- 认领成功只新增归属关系；用户之后显式确认实际行为时，才可另行创建事实或计划。

### 认领事务原子性

认领编排固定按以下可回放顺序执行；这是同一 MySQL 事务，不是跨域最终一致补偿：

```sql
START TRANSACTION;
-- 锁定 guest_sessions 和 guest_plant_cases；两者均使用 SELECT ... FOR UPDATE。
-- 校验登录 user_id、请求体 guestToken 摘要与会话来源、proof_version、过期时间和目标归属（依据 guest-token/v1 §3，2026-10-09 主代理授权）。
-- 读取同一 user_id + guest case + Idempotency-Key 的既有命令并比较 request_hash。
-- 新建目标时创建 user_plants；已有目标时只允许当前 user_id 的 user_plant_id。
-- 更新 guest_plant_cases 的 claimed owner；写入不可变 guest_case_claims；命令改为 completed。
COMMIT;
```

创建新用户植物、写入 guest_case_claims、更新 guest_plant_cases claimed owner 和命令完成状态必须在同一事务。
任一步骤失败都必须 `ROLLBACK`，使目标用户植物、guest case 当前投影、guest_case_claims 和命令完成状态同时保持事务前状态；不得留下半绑定。事务提交前不能向调用方返回成功 claimRef。

### proof_version、目标一致性和 processing lease

- `ClaimGuestSessionCommand` 不接受 `proof_version`、`user_id` 或任何内部主键。`proof_version` 由服务端从锁定会话的当前或宽限期证明校验结果写入命令，用于审计实际验证的是哪一版证明。
- `processing lease` 由服务端持有者摘要、过期时间和 `attempt_count` 组成。租约未过期时只有持有者可以继续处理；租约过期后原子接管并递增 `attempt_count`。租约字段只存在于 `processing` 状态。
- `requested → processing → completed/failed` 是认领命令状态机。processing 租约过期或事务回滚时，原命令保留同一 `claim_ref`、`request_hash` 和 `proof_version`，可重新取得租约；不得创建第二条命令来绕过恢复。
- 可重试内部失败只保留 `failed` 命令和脱敏 `failure_code`；不得写入 `guest_case_claims`。失败命令不会永久阻断后续认领，只有不可重试的确定失败才按原命令结果返回；成功事实一旦存在，任何新幂等键都必须拒绝更换目标。

## 单一编排与跨域可见性

- `user-plant` 是唯一认领编排者，拥有 `guest_plant_cases` 与 `guest_claim_commands`；公开认领命令不得由 `care` 或 `diagnosis` 各自实现一份。
- `plant-knowledge`、`care`、`diagnosis` 的临时对象只保存 `guest_plant_case_ref`，不在认领时跨域更新 `user_id` 或 `user_plant_id`。
- 认领事务提交后，各域通过带用户范围和服务签名的 `user-plant` 内部 Query API 解析案例当前归属；临时对象的业务语义和原始创建时间保持不变。
- 这种派生归属使“创建目标用户植物 + 案例认领”在单一写者事务内完成，避免分布式事务和半绑定。
- 一个案例必须整体认领，MVP 不支持部分对象认领；若一次游客流程涉及多株植物，必须先拆成多个案例。
