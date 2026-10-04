# 已登录用户临时植物案例合同

- 合同版本：`authenticated-ephemeral-plant-case/v1`
- 所有者：`user-plant`
- 运行状态：合同与数据模型方向已冻结；具体 TTL 仍由业务关键变量目录冻结后才能开放持久化创建入口。

## 1. 核心语义

`Principal` 与 `PlantContext` 是两个独立维度：

```ts
export type PlantContext =
  | { type: 'ephemeral'; ephemeralPlantCaseRef: string }
  | { type: 'persistent'; userPlantId: string }
```

- 游客首次只能 Ephemeral。
- 已有 `user_id` 的用户可以选择 Ephemeral，也可以选择 Persistent。
- 登录本身绝不触发写入任何已有用户植物。
- Ephemeral 没有 `user_plant_id`，不进入长期事实、状态、时间线和小青长期上下文。

## 2. 不复用游客匿名证明

游客路径继续使用 `guest_sessions / guest_plant_cases / X-QHZ-Guest-Proof`。已登录临时案例由可信认证层解析的 `UserPrincipal` + 服务端保存的 `user_internal_id` 授权。

为避免混淆两套持有证明，v1 采用**两套 backing table、统一语义引用**：

```text
GuestPrincipal
→ guest_plant_cases
        │
        ├── internal map ──┐
                           ├→ EphemeralPlantCaseRef 语义
UserPrincipal              │
→ authenticated_ephemeral_plant_cases
        └── internal map ──┘
```

不把 `user_id` 塞进 `guest_plant_cases`，也不要求已登录用户持有游客 proof。

## 3. 已登录临时案例状态

```text
active
→ completed / failed / expired
completed
→ bound
```

`bound` 表示用户已明确创建或选择本人用户植物，并产生一次性不可变绑定事实。绑定只增加归属，不修改原识别候选、诊断结果、浇水建议或图片证据的内容与时间。

## 4. 公共命令

```ts
export type CreateAuthenticatedEphemeralPlantCaseCommand = {
  idempotencyKey: string
}

export type CreateAuthenticatedEphemeralPlantCaseResult = {
  ephemeralPlantCaseRef: string
  expiresAt: string
  replayed: boolean
}

export type PromoteAuthenticatedEphemeralPlantCaseCommand = {
  ephemeralPlantCaseRef: string
  target:
    | { type: 'new_user_plant' }
    | { type: 'existing_user_plant'; userPlantId: string }
  idempotencyKey: string
}

export type AuthenticatedEphemeralPlantPromotionResult = {
  promotionRef: string
  userPlantId: string
  linkedObjectKinds: Array<
    | 'identification_candidate'
    | 'fixed_diagnosis_result'
    | 'independent_watering_advice'
    | 'soil_visual_evidence'
  >
  replayed: boolean
}
```

请求正文不得接收 `user_id`、OpenID 或内部主键。服务端只从已验证 `UserPrincipal` 取得归属。

## 5. 数据模型

### `authenticated_ephemeral_plant_cases`

保存：

- `ephemeral_plant_case_ref`；
- `user_internal_id`；
- 状态与绝对失效时间；
- 可重建的已绑定用户植物投影；
- 创建/更新时间。

### `authenticated_ephemeral_promotion_commands`

保存幂等命令、请求摘要、目标类型、目标植物、状态和结果。`Idempotency-Key` 同键同参重放，同键异参冲突。

### `authenticated_ephemeral_case_bindings`

只保存成功绑定事实；每个 authenticated ephemeral case 最多一条。它是成功绑定唯一事实源。

## 6. 跨域临时对象

`temporary_care_*` 与 `temporary_diagnosis_*` 统一定义为“Ephemeral 临时对象”。在物理表层允许二选一：

```text
guest_plant_case_internal_id
XOR
authenticated_ephemeral_case_internal_id
```

必须且只能有一个非空。对外与跨域合同统一暴露 `ephemeralPlantCaseRef` 语义；游客旧 API 字段保持兼容，由 `user-plant` 做内部映射。

## 7. Promotion 事务

已登录临时案例 Promotion 固定顺序：

```text
校验 UserPrincipal
→ 锁定 authenticated_ephemeral_plant_cases
→ 校验未过期、未绑定、归属本人
→ 校验/创建目标 user_plant
→ 写 promotion command 完成态
→ 写 immutable case binding
→ 更新 case 的 bound 投影
→ 提交
```

创建新用户植物时，上述操作与目标植物创建处于同一事务。提交未知时必须按 `promotionRef` / idempotency key 读回，不得盲重试复制绑定。

## 8. 硬边界

- 跨用户案例访问按不存在/无权访问的统一安全语义返回，不泄露他人案例。
- 绑定目标为已有植物时必须属于当前 `user_id`。
- 同一案例只能成功绑定一次。
- 绑定不自动创建 Care Fact、Plan、Reminder 或积分。
- 临时结果被绑定后仍保持“候选/结果/建议”的原语义。
- TTL 未冻结时不得开放 authenticated ephemeral 创建入口；这只阻断运行开关，不再阻断合同/DDL/测试准备。
