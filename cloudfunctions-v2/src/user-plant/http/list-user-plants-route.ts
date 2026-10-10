import type { UserPlantListRules } from '../../configuration/business-policies/index.js'
import { requirePolicy, type PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserPlantListResponseDto, UserPrincipalDto } from '../../contracts/types.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies
} from '../../foundation/http/authenticated-json-route.js'
import type { PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { ListUserPlantsApplicationInput } from '../application/list-user-plants.js'
import {
  decodeUserPlantListCursor,
  resolveListLifecycles,
  resolveUserPlantListLimit,
  type ListableUserPlantLifecycle,
  type UserPlantListCursor
} from '../domain/user-plant-list-query.js'

/** route-registry.json 中 listUserPlants 的冻结登记（user-plant.md「列表公开接口」）。 */
export const listUserPlantsRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/user-plants',
  operationId: 'listUserPlants',
  security: 'authenticated'
}

/** 列表路由依赖。 */
export interface ListUserPlantsRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** 事务化只读列表用例。 */
  readonly listUserPlants: (input: ListUserPlantsApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 读取用户植物列表规则策略快照（user-plant/list_rules）；null 时 503。 */
  readonly readListRules: PolicyRulesPort<UserPlantListRules>
}

/** 已严格解析的查询 DTO。 */
interface ListQueryDto {
  /** 本次要列出的生命周期集合；省略查询参数时为正常与已归档两者。 */
  readonly lifecycles: readonly ListableUserPlantLifecycle[]
  /** 本页最多返回的用户植物条数，范围 1～策略上限，省略时为策略默认（v1 = 50 / 20）。 */
  readonly limit: number
  /** 上一页最后一项的位置（由不透明游标解码）；第一页为 null。 */
  readonly after: UserPlantListCursor | null
}

const validators = createPublicContractValidators()
const allowedQueryKeys = new Set(['lifecycle', 'limit', 'cursor'])
/** 列表只读：只有服务不可用可以透传；列表从不返回 404。 */
const passThroughErrors = new Set<PublicErrorType>(['SERVICE_UNAVAILABLE'])

/** `GET /api/v2/user-plants` 处理器：未知/重复/非法查询参数一律 400，主体只来自 Bearer。 */
export function createListUserPlantsRouteHandler(dependencies: ListUserPlantsRouteDependencies): RouteHandler {
  return createAuthenticatedJsonRouteHandler<UserPrincipalDto, ListQueryDto, UserPlantListResponseDto>(dependencies, {
    route: listUserPlantsRoute,
    kind: 'read',
    parse: async ({ query }) => {
      const keys = [...query.keys()]
      if (keys.some(key => !allowedQueryKeys.has(key)) || new Set(keys).size !== keys.length) { throw validationFailed() }
      const lifecycles = resolveListLifecycles(query.get('lifecycle'))
      // 分页默认与上限来自请求内锁定的 user-plant/list_rules 策略（用户 2026-10-10 裁定）；策略不可用 503。
      const limit = resolveUserPlantListLimit(query.get('limit'), (await requirePolicy(dependencies.readListRules)).userPlantListPageSize)
      const rawCursor = query.get('cursor')
      const after = rawCursor === null ? null : decodeUserPlantListCursor(rawCursor)
      if (lifecycles === null || limit === null || (rawCursor !== null && after === null)) { throw validationFailed() }
      return { lifecycles, limit, after }
    },
    execute: ({ principal, dto }) => dependencies.listUserPlants({ principal, ...dto }),
    validateData: data => validators.userPlantListResponse(data),
    validateError: body => validators.errorResponse(body),
    passThroughErrors
  })
}
