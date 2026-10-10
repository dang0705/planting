import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserPrincipalDto } from '../../contracts/types.js'
import type { CoverUploadTargetResponseDto } from '../../contracts/user-plant-cover-asset-contract.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies
} from '../../foundation/http/authenticated-json-route.js'
import type { PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { GetCoverUploadTargetInput } from '../application/get-cover-upload-target.js'

/** route-registry.json 中 getUserPlantCoverUploadTarget 的冻结登记（user-plant-cover-asset/v1 §2.1）。 */
export const coverUploadTargetRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/user-plants/{userPlantRef}/cover-upload-target',
  operationId: 'getUserPlantCoverUploadTarget',
  security: 'authenticated'
}

/** 上传路径路由依赖。 */
export interface CoverUploadTargetRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** 只读上传路径用例。 */
  readonly readUploadTarget: (input: GetCoverUploadTargetInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
}

/** 已解析的路径 DTO。 */
interface CoverUploadTargetDto {
  /** 路径中的用户植物公开引用。 */ readonly userPlantRef: string
}

const validators = createPublicContractValidators()
const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
const passThroughErrors = new Set<PublicErrorType>(['USER_PLANT_NOT_FOUND', 'SERVICE_UNAVAILABLE'])

/** `GET …/cover-upload-target` 处理器：不接受任何查询参数；植物引用非法 400。 */
export function createCoverUploadTargetRouteHandler(dependencies: CoverUploadTargetRouteDependencies): RouteHandler {
  return createAuthenticatedJsonRouteHandler<UserPrincipalDto, CoverUploadTargetDto, CoverUploadTargetResponseDto>(dependencies, {
    route: coverUploadTargetRoute,
    kind: 'read',
    parse: ({ pathParameters, query }) => {
      const userPlantRef = pathParameters.userPlantRef ?? ''
      if (!userPlantRefPattern.test(userPlantRef) || [...query.keys()].length > 0) { throw validationFailed() }
      return { userPlantRef }
    },
    execute: ({ principal, dto }) => dependencies.readUploadTarget({ principal, userPlantRef: dto.userPlantRef }),
    validateData: data => validators.coverUploadTargetResponse(data),
    validateError: body => validators.errorResponse(body),
    passThroughErrors
  })
}
