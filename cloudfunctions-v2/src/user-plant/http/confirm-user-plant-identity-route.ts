import { randomBytes } from 'node:crypto'

import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserPlantDto, UserPrincipalDto } from '../../contracts/types.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies
} from '../../foundation/http/authenticated-json-route.js'
import { PublicRequestError, type PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { ConfirmUserPlantIdentityInput } from '../application/confirm-user-plant-identity.js'

/** route-registry.json 中 confirmUserPlantIdentity 的冻结登记。 */
export const confirmUserPlantIdentityRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/user-plants/{userPlantRef}/identity-confirmations',
  operationId: 'confirmUserPlantIdentity',
  security: 'authenticated'
}

/** 身份确认路由依赖。 */
export interface ConfirmUserPlantIdentityRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** plant-knowledge 只读公开准入：身份当前是否已发布且未隔离（事务前调用）。 */
  readonly isPublishedIdentity: (plantIdentityRef: string) => Promise<boolean>
  /** 事务化确认用例。 */
  readonly confirmIdentity: (input: ConfirmUserPlantIdentityInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 可选确认引用生成器；缺省 idc_ + 18 字节随机数 base64url。 */
  readonly createConfirmationRef?: () => string
}

/** 已严格解析的确认 DTO。 */
interface ConfirmDto {
  /** 路径中的用户植物公开引用。 */
  readonly userPlantRef: string
  /** 请求正文里调用方最后读到的用户植物版本。 */
  readonly expectedVersion: number
  /** 请求正文里要确认的规范身份公开引用。 */
  readonly plantIdentityRef: string
}

const validators = createPublicContractValidators()
const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
const passThroughErrors = new Set<PublicErrorType>([
  'USER_PLANT_NOT_FOUND', 'USER_PLANT_ARCHIVED', 'USER_PLANT_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'NOT_FOUND', 'SERVICE_UNAVAILABLE'
])

/** `POST …/identity-confirmations` 处理器：先严格校验 DTO，再只读确认身份可用性，最后进入事务化用例。 */
export function createConfirmUserPlantIdentityRouteHandler(dependencies: ConfirmUserPlantIdentityRouteDependencies): RouteHandler {
  const createConfirmationRef = dependencies.createConfirmationRef ?? (() => `idc_${randomBytes(18).toString('base64url')}`)
  return createAuthenticatedJsonRouteHandler<UserPrincipalDto, ConfirmDto, UserPlantDto>(dependencies, {
    route: confirmUserPlantIdentityRoute,
    kind: 'write',
    parse: ({ pathParameters, query, body }) => {
      const userPlantRef = pathParameters.userPlantRef ?? ''
      if ([...query.keys()].length > 0 || !userPlantRefPattern.test(userPlantRef) || !validators.confirmUserPlantIdentityRequest(body)) { throw validationFailed() }
      return { userPlantRef, expectedVersion: body.expectedVersion, plantIdentityRef: body.plantIdentityRef }
    },
    execute: async ({ principal, dto, nowMs, idempotency }) => {
      if (idempotency === null) { throw new Error('身份确认缺少幂等占位输入') }
      let identityPublished: boolean
      try { identityPublished = await dependencies.isPublishedIdentity(dto.plantIdentityRef) } catch {
        throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
      }
      return dependencies.confirmIdentity({
        userRef: principal.user_id, userPlantRef: dto.userPlantRef, expectedVersion: dto.expectedVersion, plantIdentityRef: dto.plantIdentityRef,
        identityPublished, confirmationRef: createConfirmationRef(), nowMs, idempotency
      })
    },
    validateData: data => validators.userPlant(data),
    validateError: body => validators.errorResponse(body),
    passThroughErrors
  })
}
