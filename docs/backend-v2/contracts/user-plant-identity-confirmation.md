# 用户植物身份确认合同

- 合同版本：`user-plant-identity-confirmation/v1`
- 所有者：`user-plant`；所属票据：E03 / `z8v0kmr9mj`。
- 冻结：2026-10-10 用户审定（草案 `models/user-plant/identity-confirmation-contract-draft.md` 按推荐通过，并裁定“归档植物不能确认”）。
- 路由：`POST /api/v2/user-plants/{userPlantRef}/identity-confirmations`（operationId `confirmUserPlantIdentity`，`authenticated`，`required_header_and_version`）。
- 依据：`user-plant.md`「身份状态」、`schema/003_user_plant.sql` 的 `user_plant_identity_history`；
  配置目录硬规则 `user-plant.identity.current_states`、`user-plant.identity.superseded_history_only`、`plant-knowledge.identity.release_required`。

## 1. 与品种绑定互不联动

| | 身份确认（本合同） | 品种绑定 `PUT …/catalog-binding`（long-term-care/v1） |
|---|---|---|
| 指向 | 已发布的规范植物身份 `pid_…` | Tropicals 目录引用 |
| 用途 | 这株植物“是什么”，决定 `identityStatus` / `confirmedIdentityRef` | 只给养护算法选品种参数 |
| 写入 | `user_plants` 当前身份投影 + 追加 `user_plant_identity_history` | 只追加 `user_plant_catalog_bindings` |

两者**互不联动**：确认身份不写、不改品种绑定；绑定品种也不改身份。

## 2. 请求与响应

```ts
/** 用户明确确认“这株植物就是某个已发布身份”。 */
export type ConfirmUserPlantIdentityRequest = {
  /** 调用方最后读到的用户植物版本；正安全整数，不匹配 409 USER_PLANT_VERSION_CONFLICT。 */
  expectedVersion: number
  /** 要确认的规范身份公开引用 pid_…（pid_ + 8～60 位字母数字下划线连字符）。 */
  plantIdentityRef: string
  /** 确认来源。本期只有用户自行搜索后选择；识别候选来源随识别会话存储上线时以新枚举追加。 */
  source: { type: 'user_search' }
}
```

- 媒体类型 `application/json`；`Idempotency-Key` 只从必填请求头读取；正文不得带 `user_id`、`identityStatus`、内部主键或任何额外字段，否则 400。
- 成功 `200 { "data": UserPlantDto }`，即单株读取的同一公开投影（`identityStatus='confirmed'`、`confirmedIdentityRef` 为确认的 `pid_…`）。

## 3. 规则

1. **归属**：事务内按 `user_id + user_plant_id` 加锁；跨用户、不存在、`deleting`/`deleted` 统一 `404 USER_PLANT_NOT_FOUND`。
2. **归档植物不能确认**：`archived` 返回 `409 USER_PLANT_ARCHIVED`（用户 2026-10-10 裁决）。
3. **版本**：`expectedVersion` 与当前版本不一致返回 `409 USER_PLANT_VERSION_CONFLICT`，不写任何数据。
4. **身份可用性**：目标身份必须当前已发布且未隔离（与 plant-knowledge 公开准入同一判定）；否则 `404 NOT_FOUND`（与品种绑定一致），不写任何数据。
5. **重复确认同一身份**：当前已确认身份与目标相同时返回 200 当前投影，**不递增版本、不写历史**。
6. **改确认为另一身份**：同一事务内把该植物现有 `confirmed` 历史改为 `superseded`，追加一条新的 `confirmed` 历史
   （`source_type='user'`，`source_ref` 为服务端生成的高熵确认引用 `idc_…`），更新当前身份投影并版本 +1。
   `superseded` 只存在于历史表，永不进入当前投影。
7. **不提供撤销**：本期没有“回到 unidentified”的接口。
8. **幂等**：同键同参重放首次结果；同键异参 `409 IDEMPOTENCY_CONFLICT`。
9. **事实边界**：不写养护事实/计划，不发积分或其他事件；身份变化不影响首株档案奖励判定之外的任何域。
10. **失败回滚**：任一步失败整体回滚，不留下半更新的投影或孤立历史。

## 4. 错误集合

`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`USER_PLANT_ARCHIVED`、`USER_PLANT_VERSION_CONFLICT`、
`IDEMPOTENCY_CONFLICT`、`NOT_FOUND`、`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`、`SERVICE_UNAVAILABLE`。
