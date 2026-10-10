# 用户植物身份确认合同（草案，待用户审）

- 所属票据：E03 / `z8v0kmr9mj`；起草：2026-10-10（用户裁决 B：按推荐分期，先写草案）。
- 状态：**草案，待用户审**。不作为运行时准入，不实现、不改 route-registry 字段、不建 DDL。
- 已登记路由：`POST /api/v2/user-plants/{userPlantRef}/identity-confirmations`（operationId `confirmUserPlantIdentity`，`required_header_and_version`）。
- 依据：`docs/backend-v2/contracts/user-plant.md`「身份状态」、`schema/003_user_plant.sql` 的 `user_plant_identity_history`、
  配置目录硬规则 `user-plant.identity.current_states`、`user-plant.identity.superseded_history_only`、`plant-knowledge.identity.release_required`。

## 1. 与 catalog-binding 的边界（推荐，待确认）

| | 身份确认（本合同） | 品种绑定 `PUT …/catalog-binding`（已实现，long-term-care/v1） |
|---|---|---|
| 指向 | 已发布的规范植物身份 `pid_…`（plant-knowledge 审核通过、有 active release） | Tropicals 目录引用（外部目录值域） |
| 用途 | 用户植物“它到底是什么”，驱动 `identityStatus` 与百科/问诊上下文 | 只给养护算法选品种参数 |
| 写入 | `user_plants.current_identity_status / confirmed_identity_internal_id` + 追加 `user_plant_identity_history` | 只追加 `user_plant_catalog_bindings` |
| 互相影响 | **不自动联动**：确认身份不改品种绑定，绑定品种也不改身份 | 同左 |

是否需要“确认身份后自动建议一个品种绑定”留到后续，不在本合同内。

## 2. 请求 DTO（草案）

```ts
/** 用户明确确认“这株植物就是某个已发布身份”。 */
export type ConfirmUserPlantIdentityRequest = {
  /** 调用方最后读到的用户植物版本；不匹配 409 USER_PLANT_VERSION_CONFLICT。 */
  expectedVersion: number
  /** 要确认的已发布规范身份公开引用 pid_…；未发布、隔离或不存在 → 404 NOT_FOUND（待确认，见 §5-Q2）。 */
  plantIdentityRef: string
  /** 确认来源：用户从识别候选中选择，或用户自行搜索百科后选择。 */
  source: { type: 'identification_candidate'; candidateRef: string } | { type: 'user_search' }
}
```

- `Idempotency-Key` 只走请求头；正文不得带 `user_id`、`identityStatus`、内部主键或额外字段。
- 响应：`200 { data: UserPlantDto }`（`identityStatus='confirmed'`、`confirmedIdentityRef=pid_…`、版本 +1）。

## 3. 规则（草案）

1. 归属：按 `user_id + user_plant_id` 在事务内加锁；跨用户、deleting/deleted 统一 404 `USER_PLANT_NOT_FOUND`。
2. 归档植物：推荐**允许**确认身份（档案类配置，不是养护写入）——待确认 Q3。
3. 历史：每次确认追加一条 `history_status='confirmed'`；若已有当前确认，把旧条目改为 `superseded`（仅历史表使用该状态，不进当前投影）。
   同一 `(user_plant, source_type, source_ref)` 唯一约束防重复。
4. 同一身份重复确认（目标与当前确认相同）：推荐返回 200 当前投影且**不**递增版本、不写历史——待确认 Q4。
5. `candidate_pending`：只由识别会话写入，本接口不负责；确认后统一进入 `confirmed`。
6. 不写养护事实/计划、不发积分事件；身份变化**不**触发首株档案奖励（奖励只看环境档案完整度，见环境档案草案）。

## 4. 错误集合（草案）

`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`USER_PLANT_VERSION_CONFLICT`、`IDEMPOTENCY_CONFLICT`、
`NOT_FOUND`（身份引用不可用，待确认）、`SERVICE_UNAVAILABLE`。

## 5. 需要用户拍板

- Q1：是否同意 §1 的“两者不自动联动”边界？
- Q2：身份引用未发布/不存在时用 `404 NOT_FOUND`（与 catalog-binding 一致）还是新增专用错误码？推荐沿用 `NOT_FOUND`。
- Q3：归档植物能否确认身份？推荐可以。
- Q4：重复确认同一身份是否视为无变化（不增版本）？推荐是。
- Q5：是否允许“撤销确认回到 unidentified”？合同状态图没有这条边，推荐本期不提供。
