import type { IncomingHttpHeaders } from 'node:http'
import Ajv2020 from 'ajv/dist/2020.js'
import publicSchema from '../../../../docs/backend-v2/contracts/schemas/diagnosis-result.v1.schema.json'
import type { UserPrincipalDto, GuestPrincipalDto } from '../../contracts/types.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
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
import type {
  DiagnosisResultReadInput,
  DiagnosisResultReadResult
} from '../application/get-diagnosis-result.js'
import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
/** 登记的结果读取路由；没有写入，不要求重复提交键。 */
export const diagnosisResultRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/diagnosis/sessions/{diagnosisSessionRef}/result',
  operationId: 'getDiagnosisResult',
  security: 'guest_or_authenticated'
}
/** 结果协议适配依赖，身份仅由identity域统一解析。 */
export interface DiagnosisResultRouteDependencies {
  /** 平台无关的已验证用户或游客主体，不能由请求参数构造。 */ readonly resolvePrincipal: (
    command: ResolveUserPrincipalCommand
  ) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** 应用在持久化中核验归属及原样记录，不能信任客户端。 */ readonly getResult: (
    input: DiagnosisResultReadInput
  ) => Promise<DiagnosisResultReadResult>
  /** 服务端时钟只用于会话资格检查，不改写历史结果。 */ readonly now: () => number
  /** 固定请求链的脱敏观测，禁止输入与模型原文。 */ readonly writeAudit: (
    event: RequestChainAuditEvent
  ) => void | Promise<void>
}
/** GET只保留请求头和路径，正文不参与身份或查询。 */
type Restricted = {
  /** 请求头仅用于受控认证，不进入日志。 */ readonly headers: IncomingHttpHeaders
  /** 冻结路由分发器提供的路径参数。 */ readonly path: RoutePathParameters
}
/** 已冻结的会话路径引用，不新增前缀或额外参数要求。 */
type PathDto = {
  /** 公开会话引用，公共合同长度8至100。 */
  diagnosisSessionRef: string
}
const ajv = new Ajv2020({ strict: true, allErrors: true }),
  validatePublic = ajv.compile(publicSchema),
  validatePath = ajv.compile({
    type: 'object',
    additionalProperties: false,
    required: ['diagnosisSessionRef'],
    properties: { diagnosisSessionRef: { type: 'string', minLength: 8, maxLength: 100 } }
  })
/** 路径校验先于数据库查询，不靠SQL错误识别非法输入。 */
function parse(path: RoutePathParameters): PathDto {
  if (!validatePath(path)) {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
  }
  return path as PathDto
}
/** 归属阶段只读取一次，后续步骤复用严格公开数据，不产生任何业务写入。 */
export function createDiagnosisResultRouteHandler(
  deps: DiagnosisResultRouteDependencies
): RouteHandler {
  return (request, response, path) => {
    let owned: CanonicalJsonObject | undefined
    return createNodeRequestChainHandler<
      Restricted,
      ResolveUserPrincipalCommand,
      UserPrincipalDto | GuestPrincipalDto,
      PathDto,
      DiagnosisResultReadInput,
      DiagnosisResultReadInput,
      CanonicalJsonObject,
      CanonicalJsonObject
    >({
      requestLimits: {
        kind: 'execute',
        run: raw => {
          raw.resume()
          return { headers: raw.headers, path }
        }
      },
      identityValidate: {
        kind: 'execute',
        run: input => {
          const token = extractBearerToken(input.headers)
          if (!token) {
            throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
          }
          return { bearerToken: token, nowMs: deps.now() }
        }
      },
      principalResolve: {
        kind: 'execute',
        run: async command => {
          try {
            return await deps.resolvePrincipal(command)
          } catch (e) {
            if (e instanceof UnifiedUserPrincipalResolveError) {
              throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
            }
            throw e
          }
        }
      },
      objectOwnership: {
        kind: 'execute',
        run: async ({ request: input, principal }) => {
          const dto = parse(input.path)
          if (principal.principalType !== 'user') {
            throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '诊断结果暂不可用')
          }
          const result = await deps.getResult({
            userRef: principal.user_id,
            diagnosisRef: dto.diagnosisSessionRef
          })
          if (result.status !== 'found') {
            throw new PublicRequestError(
              result.status === 'not_found' ? 404 : 503,
              result.status === 'not_found' ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE',
              result.status === 'not_found' ? '诊断结果不存在' : '诊断结果暂不可用'
            )
          }
          owned = result.data
        }
      },
      dtoValidate: { kind: 'execute', run: input => parse(input.path) },
      buildCommand: {
        kind: 'execute',
        run: ({ dto, principal }) => ({
          userRef: principal.principalType === 'user' ? principal.user_id : '',
          diagnosisRef: dto.diagnosisSessionRef
        })
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: () => {
          if (owned === undefined) {
            throw new Error('结果归属读取未产出')
          }
          return owned
        }
      },
      publicResponse: {
        kind: 'execute',
        run: result => {
          if (!validatePublic(result)) {
            throw new Error('诊断公开结果非法')
          }
          return result
        }
      },
      writeAudit: deps.writeAudit
    })(request, response)
  }
}
