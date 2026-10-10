import type { UserPlantListRules } from '../../configuration/business-policies/index.js'
import { requirePolicy, type PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserPrincipalDto } from '../../contracts/types.js'
import type { TimelineResponseDto } from '../../contracts/user-plant-timeline-contract.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies
} from '../../foundation/http/authenticated-json-route.js'
import type { PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { ListUserPlantTimelineInput } from '../application/list-user-plant-timeline.js'
import { decodeTimelineCursor, resolveTimelineLimit, type TimelineCursor } from '../domain/timeline.js'

/** route-registry.json 中 listUserPlantTimeline 的冻结登记（user-plant-timeline/v1）。 */
export const listUserPlantTimelineRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/user-plants/{userPlantRef}/timeline',
  operationId: 'listUserPlantTimeline',
  security: 'authenticated'
}

/** 时间线路由依赖。 */
export interface ListUserPlantTimelineRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** 只读时间线用例。 */
  readonly listTimeline: (input: ListUserPlantTimelineInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 读取用户植物列表规则策略快照（user-plant/list_rules）；null 时 503。 */
  readonly readListRules: PolicyRulesPort<UserPlantListRules>
}

/** 已严格解析的查询 DTO。 */
interface TimelineQueryDto {
  /** 路径中的用户植物公开引用。 */ readonly userPlantRef: string
  /** 本页最多返回的时间线条数（1～策略上限，缺省策略默认；v1 = 50 / 20）。 */ readonly limit: number
  /** 上一页最后一项的位置（由游标解码）；第一页为 null。 */ readonly after: TimelineCursor | null
}

const validators = createPublicContractValidators()
const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
const passThroughErrors = new Set<PublicErrorType>(['USER_PLANT_NOT_FOUND', 'SERVICE_UNAVAILABLE'])

/** `GET …/timeline` 处理器：查询只允许 limit/cursor，未知、重复或非法一律 400。 */
export function createListUserPlantTimelineRouteHandler(dependencies: ListUserPlantTimelineRouteDependencies): RouteHandler {
  return createAuthenticatedJsonRouteHandler<UserPrincipalDto, TimelineQueryDto, TimelineResponseDto>(dependencies, {
    route: listUserPlantTimelineRoute,
    kind: 'read',
    parse: async ({ pathParameters, query }) => {
      const userPlantRef = pathParameters.userPlantRef ?? ''
      const keys = [...query.keys()]
      if (!userPlantRefPattern.test(userPlantRef) || keys.some(key => key !== 'limit' && key !== 'cursor') || new Set(keys).size !== keys.length) { throw validationFailed() }
      // 分页默认与上限来自请求内锁定的 user-plant/list_rules 策略（用户 2026-10-10 裁定）；策略不可用 503。
      const limit = resolveTimelineLimit(query.get('limit'), (await requirePolicy(dependencies.readListRules)).timelinePageSize)
      const rawCursor = query.get('cursor')
      const after = rawCursor === null ? null : decodeTimelineCursor(rawCursor)
      if (limit === null || (rawCursor !== null && after === null)) { throw validationFailed() }
      return { userPlantRef, limit, after }
    },
    execute: ({ principal, dto }) => dependencies.listTimeline({ principal, ...dto }),
    validateData: data => validators.timelineResponse(data),
    validateError: body => validators.errorResponse(body),
    passThroughErrors
  })
}
