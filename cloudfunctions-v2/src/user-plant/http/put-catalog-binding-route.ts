import { randomBytes } from 'node:crypto'

import { createPublicContractValidators } from '../../contracts/index.js'
import type { CatalogBindingResponseDto, PutCatalogBindingRequestDto, UserPrincipalDto } from '../../contracts/types.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies
} from '../../foundation/http/authenticated-json-route.js'
import { PublicRequestError, type PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { PutCatalogBindingInput } from '../application/put-catalog-binding.js'

/** route-registry.json 中 putUserPlantCatalogBinding 的冻结登记（long-term-care/v1 §1）。 */
export const putUserPlantCatalogBindingRoute: FrozenRoute = {
  method: 'PUT',
  path: '/api/v2/user-plants/{userPlantRef}/catalog-binding',
  operationId: 'putUserPlantCatalogBinding',
  security: 'authenticated'
}

/** 路由依赖。 */
export interface PutCatalogBindingRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** plant-knowledge 只读：目录引用是否存在（事务前）。 */
  readonly catalogExists: (catalogTaxonRef: string) => Promise<boolean>
  /** 事务化应用用例。 */
  readonly putCatalogBinding: (input: PutCatalogBindingInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 可选绑定引用生成器；缺省 18 字节随机数 base64url。 */
  readonly createBindingRef?: () => string
}

/** 路由 DTO。 */
interface BindingDto {
  /** 路径中的用户植物公开引用。 */
  readonly userPlantRef: string
  /** 已校验的请求正文。 */
  readonly body: PutCatalogBindingRequestDto
}

const validators = createPublicContractValidators()
const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
const passThroughErrors = new Set<PublicErrorType>(['USER_PLANT_NOT_FOUND', 'USER_PLANT_ARCHIVED', 'NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE'])

/** `PUT …/catalog-binding` 处理器。 */
export function createPutCatalogBindingRouteHandler(dependencies: PutCatalogBindingRouteDependencies): RouteHandler {
  const createBindingRef = dependencies.createBindingRef ?? (() => `cbd_${randomBytes(18).toString('base64url')}`)
  return createAuthenticatedJsonRouteHandler<UserPrincipalDto, BindingDto, CatalogBindingResponseDto>(dependencies, {
    route: putUserPlantCatalogBindingRoute,
    kind: 'write',
    parse: ({ pathParameters, body }) => {
      const userPlantRef = pathParameters.userPlantRef ?? ''
      if (!userPlantRefPattern.test(userPlantRef) || !validators.putCatalogBindingRequest(body)) { throw validationFailed() }
      return { userPlantRef, body }
    },
    execute: async ({ principal, dto, nowMs, idempotency }) => {
      let catalogExists: boolean
      try { catalogExists = await dependencies.catalogExists(dto.body.catalogTaxonRef) } catch {
        throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
      }
      return dependencies.putCatalogBinding({
        userRef: principal.user_id, userPlantRef: dto.userPlantRef, catalogTaxonRef: dto.body.catalogTaxonRef,
        catalogExists, bindingRef: createBindingRef(), nowMs, idempotency: idempotency!
      })
    },
    validateData: data => validators.catalogBindingResponse(data),
    validateError: body => validators.errorResponse(body),
    passThroughErrors
  })
}
