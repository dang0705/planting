import type { IncomingHttpHeaders } from 'node:http'

import Ajv, { type JSONSchemaType } from 'ajv'

import type { UserPlantDto, UserPlantRef, UserPrincipalDto } from '../../contracts/types.js'
import { userPlantSchema } from '../../contracts/user-plant-schema.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type {
  FrozenRoute,
  RouteHandler,
  RoutePathParameters
} from '../../foundation/http/route-dispatcher.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import type {
  GetUserPlantApplicationInput,
  GetUserPlantApplicationResponse
} from '../application/get-user-plant.js'

/** route-registry.json 中 getUserPlant 的冻结登记。 */
export const getUserPlantRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/user-plants/{userPlantRef}',
  operationId: 'getUserPlant',
  security: 'authenticated'
}

/** 单株读取路由的端口依赖；会话解析与数据库读取通过注入替换边界。 */
export type GetUserPlantRouteDependencies = {
  /** identity 域的统一用户 Principal 解析用例。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** user-plant 域 owner-scoped 单株读取用例。 */
  readonly getUserPlant: (
    input: GetUserPlantApplicationInput
  ) => Promise<GetUserPlantApplicationResponse>
  /** 服务端可信时钟，返回当前 UTC 毫秒。 */
  readonly now: () => number
  /** 请求结束后的脱敏结果事件端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 请求限制阶段输出：仅保留后续阶段需要的请求头与路径参数。 */
type RestrictedUserPlantRequest = {
  /** 原始请求头；只在身份阶段读取，禁止进入日志或响应。 */
  readonly headers: IncomingHttpHeaders
  /** 分发器解析出的路径参数。 */
  readonly pathParameters: RoutePathParameters
}

/** 路径参数 DTO。 */
type UserPlantPathDto = {
  /** 用户植物公开引用，`upl_` 前缀，总长不超过 64。 */
  userPlantRef: string
}

const userPlantPathSchema: JSONSchemaType<UserPlantPathDto> = {
  type: 'object',
  additionalProperties: false,
  required: ['userPlantRef'],
  properties: {
    userPlantRef: { type: 'string', maxLength: 64, pattern: '^upl_[A-Za-z0-9_-]{8,}$' }
  }
}

const validatePath = new Ajv({ allErrors: true }).compile(userPlantPathSchema)
/** 在发送前执行严格公开响应准入，端口返回的对象不能因TS类型而被直接信任。 */
const validatePlant = new Ajv({ strict: true, allErrors: true }).compile<UserPlantDto>(userPlantSchema)
const badRequestStatus = 400
const unauthorizedStatus = 401
const notFoundStatus = 404

/** 统一的 401 公开错误；不区分缺失、伪造、过期或撤销。 */
function principalInvalid(): PublicRequestError {
  return new PublicRequestError(unauthorizedStatus, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
}

/** 校验路径引用；不合法时返回 400。 */
function validateUserPlantPath(pathParameters: RoutePathParameters): UserPlantPathDto {
  const dto = { ...pathParameters }
  if (!validatePath(dto)) {
    throw new PublicRequestError(badRequestStatus, 'VALIDATION_FAILED', '请求参数不合法')
  }
  return dto
}

/** 会话错误中仅 PRINCIPAL_INVALID 映射为 401，其余交由请求链泛化为 500。 */
function mapIdentityError(error: unknown): unknown {
  if (error instanceof UnifiedUserPrincipalResolveError && error.type === 'PRINCIPAL_INVALID') {
    return principalInvalid()
  }
  return error
}

/**
 * 创建 `GET /api/v2/user-plants/{userPlantRef}` 的处理器。
 * owner-scoped 查询同时承担归属校验与读取：在归属阶段执行一次，持久化阶段直接复用其结果，
 * 避免同一请求开两次事务。
 */
export function createGetUserPlantRouteHandler(
  dependencies: GetUserPlantRouteDependencies
): RouteHandler {
  return (request, response, pathParameters) => {
    let ownedPlant: UserPlantDto | undefined
    return createNodeRequestChainHandler<
      RestrictedUserPlantRequest,
      ResolveUserPrincipalCommand,
      UserPrincipalDto,
      UserPlantPathDto,
      GetUserPlantApplicationInput,
      GetUserPlantApplicationInput,
      UserPlantDto,
      UserPlantDto
    >({
      requestLimits: {
        kind: 'execute',
        run: rawRequest => {
          rawRequest.resume()
          return { headers: rawRequest.headers, pathParameters }
        }
      },
      identityValidate: {
        kind: 'execute',
        run: async ({ headers }) => {
          const bearerToken = extractBearerToken(headers)
          if (bearerToken === null) {
            throw principalInvalid()
          }
          return { bearerToken, nowMs: dependencies.now() }
        }
      },
      principalResolve: {
        kind: 'execute',
        run: async command => {
          try {
            return await dependencies.resolvePrincipal(command)
          } catch (error: unknown) {
            throw mapIdentityError(error)
          }
        }
      },
      objectOwnership: {
        kind: 'execute',
        run: async ({ request: restricted, principal }) => {
          const { userPlantRef } = validateUserPlantPath(restricted.pathParameters)
          const result = await dependencies.getUserPlant({
            principal,
            userPlantRef: userPlantRef as UserPlantRef
          })
          if (!('data' in result.body)) {
            throw new PublicRequestError(
              notFoundStatus,
              result.body.error.type,
              result.body.error.message
            )
          }
          ownedPlant = result.body.data
        }
      },
      dtoValidate: {
        kind: 'execute',
        run: ({ pathParameters: parameters }) => validateUserPlantPath(parameters)
      },
      buildCommand: {
        kind: 'execute',
        run: ({ dto, principal }) => ({
          principal,
          userPlantRef: dto.userPlantRef as UserPlantRef
        })
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: () => {
          if (ownedPlant === undefined) {
            throw new Error('归属阶段未产出用户植物读取结果')
          }
          return ownedPlant
        }
      },
      publicResponse: { kind: 'execute', run: plant => {
        if (!validatePlant(plant)) { throw new Error('用户植物公开响应未通过严格合同校验') }
        return plant
      } },
      writeAudit: dependencies.writeAudit
    })(request, response)
  }
}
