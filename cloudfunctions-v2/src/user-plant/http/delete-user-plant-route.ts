import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserPlantDeletionResponseDto, UserPrincipalDto } from '../../contracts/types.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies
} from '../../foundation/http/authenticated-json-route.js'
import type { PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { DeleteUserPlantInput } from '../application/delete-user-plant.js'

/** route-registry.json 中 deleteUserPlant 的冻结登记（user-plant.md「删除公开接口」）。 */
export const deleteUserPlantRoute: FrozenRoute = {
  method: 'DELETE',
  path: '/api/v2/user-plants/{userPlantRef}',
  operationId: 'deleteUserPlant',
  security: 'authenticated'
}

/** 删除路由依赖。 */
export interface DeleteUserPlantRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** 事务化标记删除用例。 */
  readonly deleteUserPlant: (input: DeleteUserPlantInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
}

/** 已严格解析的删除 DTO。 */
interface DeleteDto {
  /** 路径中的植物公开引用。 */
  readonly userPlantRef: string
  /** 请求正文里调用方最后读到的用户植物版本，必须与当前版本一致才允许标记删除。 */
  readonly expectedVersion: number
}

const validators = createPublicContractValidators()
const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
/** 删除只声明这些确定错误；能力类错误不属于删除合同，出现即泛化 500。 */
const passThroughErrors = new Set<PublicErrorType>(['USER_PLANT_NOT_FOUND', 'USER_PLANT_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE'])

/** `DELETE /api/v2/user-plants/{userPlantRef}` 处理器。 */
export function createDeleteUserPlantRouteHandler(dependencies: DeleteUserPlantRouteDependencies): RouteHandler {
  return createAuthenticatedJsonRouteHandler<UserPrincipalDto, DeleteDto, UserPlantDeletionResponseDto>(dependencies, {
    route: deleteUserPlantRoute,
    kind: 'write',
    parse: ({ pathParameters, query, body }) => {
      const userPlantRef = pathParameters.userPlantRef ?? ''
      if ([...query.keys()].length > 0 || !userPlantRefPattern.test(userPlantRef) || !validators.deleteUserPlantRequest(body)) { throw validationFailed() }
      return { userPlantRef, expectedVersion: body.expectedVersion }
    },
    execute: ({ principal, dto, nowMs, idempotency }) => {
      if (idempotency === null) { throw new Error('删除缺少幂等占位输入') }
      return dependencies.deleteUserPlant({ userRef: principal.user_id, userPlantRef: dto.userPlantRef, expectedVersion: dto.expectedVersion, nowMs, idempotency })
    },
    validateData: data => validators.userPlantDeletionResponse(data),
    validateError: body => validators.errorResponse(body),
    passThroughErrors
  })
}
