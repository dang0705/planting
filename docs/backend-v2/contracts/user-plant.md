# 用户植物合同

- 合同版本：`user-plant/v1`
- 所有者：`user-plant`
- 公开主键：`user_plant_id`，格式 `upl_...`。

## 公开引用

`user_plant_id` 是不透明公开引用；内部 `BIGINT UNSIGNED` 主键只存在数据库和 Repository 层。

每株真实植物拥有稳定的 `user_plant_id`。更换昵称、图片、盆器、介质、位置、环境或植物身份都不得创建新的用户植物；只有用户明确“加入花园”时才创建。

```ts
export type PublicUserPlant = {
  /** 高熵公开引用，不暴露内部数值主键。 */
  user_plant_id: string
  /** 用户植物生命周期。 */
  lifecycle: 'active' | 'archived' | 'deleting' | 'deleted'
  /** 当前植物身份状态；暂未识别是合法业务状态。 */
  identityStatus: 'unidentified' | 'candidate_pending' | 'confirmed'
  /** 只在 confirmed 时存在，指向已发布的规范植物身份。 */
  confirmedIdentityRef?: string
  /** 乐观锁版本，任何并发更新必须携带旧版本。 */
  version: number
  createdAt: string
  updatedAt: string
}
```

公开 DTO 不返回 `user_id`。服务端仍在内部聚合和 Repository 中保存统一用户归属，并在每次访问时以当前认证主体执行 `user_id + user_plant_id` 归属校验；调用方不能通过响应枚举或关联其他用户。

## 创建用户植物

`POST /api/v2/user-plants` 只表达登录用户明确执行“加入花园”。请求体固定为严格空 JSON 对象 `{}`；身份、能力、数量上限、公开引用、初始状态和时间全部由服务端可信上下文生成。

```ts
/** 创建请求不接受任何客户端业务字段。 */
export type CreateUserPlantRequest = Record<string, never>

/** 创建成功只返回新建用户植物的初始公开投影。 */
export type CreateUserPlantResponse = {
  /** 服务端生成的高熵用户植物公开引用。 */
  user_plant_id: string
  /** 新建植物固定处于 active 生命周期。 */
  lifecycle: 'active'
  /** 未经过用户确认的身份固定为暂未识别。 */
  identityStatus: 'unidentified'
  /** 新聚合的初始乐观锁版本固定为 1。 */
  version: 1
  /** 服务端生成的 UTC 创建时间。 */
  createdAt: string
  /** 初次创建时与 createdAt 相同的 UTC 更新时间。 */
  updatedAt: string
}
```

客户端不得在创建请求中提交 `user_id`、植物身份、生命周期、版本、时间、数量上限、能力快照、内部主键、档案、照片、盆器、位置、光照、通风或幂等键。`Idempotency-Key` 只允许作为必填 HTTP Header；误放入 JSON 请求体必须返回 `VALIDATION_FAILED`，不得静默丢弃。

成功状态固定为 `200`，响应使用统一 `{ data: CreateUserPlantResponse }` 信封。同键同参必须重放相同公开响应；同键异参返回 `IDEMPOTENCY_CONFLICT`。能力快照在执行前失效时返回 `CAPABILITY_SNAPSHOT_EXPIRED`。

## 身份状态

```text
unidentified → candidate_pending → confirmed
confirmed → candidate_pending → confirmed
```

- `unidentified` 的中文含义是“暂未识别”，不是数据错误；宁可保持未知，也不得错误确认物种。
- 识别候选保存在识别会话，`candidate_pending` 只表示存在待用户确认候选，不把候选写成当前身份。
- 只有用户明确确认且目标规范身份处于已发布状态，才进入 `confirmed`。
- 已确认身份变更必须新增身份历史；不得覆盖旧记录。
- `superseded` 只用于身份历史记录，表示某次旧确认已被后续确认或权威重定向替代；它不是用户植物“当前身份状态”，因此当前投影始终只使用上述三态。

## 最低档案

首株档案奖励所需完整度由 `user-plant-profile/v1` 冻结，至少包含：

- 合法用户植物身份状态（允许暂未识别）。
- 盆器。
- 位置。
- 光照环境。
- 通风与空气环境。

## 归属

任何读写必须同时校验 `user_id + user_plant_id`。跨用户、跨主体、已删除植物一律拒绝。

- 内部子表使用 `(user_id, user_plant_internal_id)` 复合外键或等价唯一约束，防止把他人的档案、环境、资产或时间线绑定过来。
- 公开读取跨用户对象统一返回 `USER_PLANT_NOT_FOUND`，不暴露对象是否存在。
- 创建、编辑、归档、恢复和删除均要求 `Idempotency-Key`；同键同参返回原结果，同键异参返回 `IDEMPOTENCY_CONFLICT`。
- 编辑使用 `version` 乐观锁；版本过期返回 `USER_PLANT_VERSION_CONFLICT`，不得后写覆盖。

## 生命周期

```text
active ↔ archived → deleting → deleted
```

删除后不能恢复或写入；历史以审计和必要的归档记录保留。

- `archived` 可恢复为 `active`；归档植物不计入 active 数量上限。
- `deleting` 只允许清理编排和只读审计，不接受新业务写入。
- `deleted` 不可恢复；公开查询视为不存在。
- 删除跨域数据使用明确清单与补偿，不使用无界级联删除。

## 归档与恢复公开接口

`POST /api/v2/user-plants/{userPlantRef}/archive` 与
`POST /api/v2/user-plants/{userPlantRef}/restore` 共用严格请求 DTO：

```ts
/** 归档或恢复时调用方最后读到的用户植物版本。 */
export type UserPlantVersionRequest = {
  /** 正安全整数；不匹配时返回 409 USER_PLANT_VERSION_CONFLICT。 */
  expectedVersion: number
}
```

JSON 请求体只允许 `expectedVersion`，且必须是大于等于 1 的 JavaScript 安全整数。
`userPlantRef` 只从路径读取，`Idempotency-Key` 只从必需请求头读取；请求体不得接收
`user_id`、主体、能力快照、公开植物引用、内部主键或其他字段。主体由认证层解析，
恢复所需的能力快照只由服务端从 subscription 能力服务注入，不得由客户端声明。

两个操作都返回 HTTP `200` 和 `{ "data": UserPlantResponse }`。归档只允许当前 owner
的 `active` 植物按 `expectedVersion` 转为 `archived`；恢复只允许当前 owner 的
`archived` 植物按 `expectedVersion` 转为 `active`，并在同一用户锁下重新核验当前能力快照与
active 植物数量上限。跨用户或不存在的植物统一返回 `404 USER_PLANT_NOT_FOUND`；版本过期
返回 `409 USER_PLANT_VERSION_CONFLICT`；同一幂等键异参返回 `409 IDEMPOTENCY_CONFLICT`。

恢复额外允许 `403 CAPABILITY_DENIED` 和 `409 CAPABILITY_SNAPSHOT_EXPIRED`；归档路由不声明
这两项能力错误。上述状态码以 `contracts/http-api.md` 错误目录为准。

## 事实边界

- 档案和环境变化是用户植物配置，不等于养护事实。
- 识别结果、诊断结果、建议、计划、提醒和模型输出都不能直接写成植物事实。
- 用户确认实际发生的浇水、施肥、换盆或位置变化，才由 `care` 创建不可变事实。
- 时间线是投影视图，不是事实写入口。
