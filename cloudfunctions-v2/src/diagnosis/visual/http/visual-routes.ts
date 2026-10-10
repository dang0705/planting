import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import Ajv2020 from 'ajv/dist/2020.js'

import visualApiSchema from '../../../../../docs/backend-v2/contracts/schemas/diagnosis-visual-api.v1.schema.json'
import resultSchema from '../../../../../docs/backend-v2/contracts/schemas/diagnosis-result.v2.schema.json'
import { RUNTIME_PARAMETERS } from '../../../configuration/runtime-parameters.js'
import type { GuestPrincipalDto, UserPrincipalDto } from '../../../contracts/types.js'
import { createNodeRequestChainHandler } from '../../../foundation/http/node-request-chain-handler.js'
import { PublicRequestError, type PublicErrorType, type RequestChainAuditEvent } from '../../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteBinding, RoutePathParameters } from '../../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../../foundation/idempotency/http-idempotency.js'
import type { ResolveUserPrincipalCommand } from '../../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../../identity/http/request-identity.js'
import type { CreateVisualDiagnosisInput } from '../application/create-visual-diagnosis.js'
import type { VisualDiagnosisListResponse } from '../application/read-visual-diagnosis.js'
import type { RegisterVisualImagesInput, VisualUploadTargetsResponse } from '../application/register-visual-images.js'
import type { VisualDiagnosisSessionResponse } from '../domain/visual-session-record.js'

/**
 * 生成式视觉诊断 HTTP 路由（diagnosis-visual-api/v1，网关前缀 /api/v2/diagnosis/visual）。
 *
 * 通俗说明：这一层只做「协议翻译」——限制请求大小与类型 → 校验登录凭证（游客 403）→ 按合同 Schema 校验请求 →
 * 调用应用用例 → 按合同 Schema 校验响应后返回。任何不合合同的响应都失败关闭（500），不会把内部字段泄露给前端。
 */

/** 取上传路径。 */
export const visualUploadTargetsRoute: FrozenRoute = { method: 'GET', path: '/api/v2/diagnosis/visual/upload-targets', operationId: 'getVisualDiagnosisUploadTargets', security: 'authenticated' }
/** 登记图片。 */
export const visualImagesRoute: FrozenRoute = { method: 'POST', path: '/api/v2/diagnosis/visual/images', operationId: 'registerVisualDiagnosisImages', security: 'authenticated' }
/** 发起诊断。 */
export const visualCreateRoute: FrozenRoute = { method: 'POST', path: '/api/v2/diagnosis/visual/sessions', operationId: 'createVisualDiagnosis', security: 'authenticated' }
/** 取单个诊断。 */
export const visualGetRoute: FrozenRoute = { method: 'GET', path: '/api/v2/diagnosis/visual/sessions/{visualDiagnosisRef}', operationId: 'getVisualDiagnosis', security: 'authenticated' }
/** 诊断历史。 */
export const visualListRoute: FrozenRoute = { method: 'GET', path: '/api/v2/diagnosis/visual/sessions', operationId: 'listVisualDiagnoses', security: 'authenticated' }

/** 路由依赖：身份由 identity 域解析，其余都是应用用例。 */
export interface VisualRouteDependencies {
  /** 身份域校验 Bearer 并返回平台无关主体。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
  /** 脱敏请求结果事件。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 取上传路径（只读，不落库）。 */
  readonly getUploadTargets: (input: VisualUploadTargetsQuery) => Promise<VisualUploadTargetsResponse>
  /** 登记图片（幂等）。 */
  readonly registerImages: (input: RegisterVisualImagesInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 发起诊断（幂等，202）。 */
  readonly createDiagnosis: (input: CreateVisualDiagnosisInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 取单个诊断的状态与结果。 */
  readonly getDiagnosis: (input: VisualDiagnosisGetQuery) => Promise<VisualDiagnosisSessionResponse>
  /** 本人诊断历史（回放入口）。 */
  readonly listDiagnoses: (input: VisualDiagnosisListQuery) => Promise<VisualDiagnosisListResponse>
}

/** 取上传路径的查询。 */
export interface VisualUploadTargetsQuery {
  /** 已解析的登录主体。 */
  readonly principal: UserPrincipalDto
  /** 本次要上传的张数（1～3）。 */
  readonly count: number
}

/** 取单个诊断的查询。 */
export interface VisualDiagnosisGetQuery {
  /** 已解析的登录主体。 */
  readonly principal: UserPrincipalDto
  /** 诊断公开引用，格式 vds_…。 */
  readonly visualDiagnosisRef: string
}

/** 诊断历史的查询。 */
export interface VisualDiagnosisListQuery {
  /** 已解析的登录主体。 */
  readonly principal: UserPrincipalDto
  /** 按用户植物筛选；为 null 时返回全部。 */
  readonly userPlantRef: string | null
  /** 翻页游标；首页为 null。 */
  readonly cursor: string | null
}

const ajv = new Ajv2020({ strict: true, allErrors: true })
ajv.addSchema(resultSchema as object)
ajv.addSchema(visualApiSchema as object)
const schemaId = (visualApiSchema as { $id: string }).$id
const validator = (name: string) => {
  const validate = ajv.getSchema(`${schemaId}#/$defs/${name}`)
  if (validate === undefined) {
    throw new Error(`合同缺少定义：${name}`)
  }
  return (value: unknown) => validate(value) === true
}
const validateRegisterRequest = validator('RegisterVisualDiagnosisImagesRequest')
const validateRegisterResponse = validator('RegisterVisualDiagnosisImagesResponse')
const validateCreateRequest = validator('CreateVisualDiagnosisRequest')
const validateSessionResponse = validator('VisualDiagnosisSessionResponse')
const validateListResponse = validator('VisualDiagnosisListResponse')
const validateTargetsResponse = validator('UploadTargetsResponse')

/** 请求体字节上限（与共享 HTTP 硬边界一致）。 */
const bodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value
const keyPattern = /^[\x20-\x7e]{8,128}$/u
const visualRefPattern = /^vds_[A-Za-z0-9_-]{8,60}$/u
const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
/** 可透传的用例公开错误（状态码必须与类型一致）。 */
const passThroughErrors: Readonly<Partial<Record<PublicErrorType, number>>> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  USER_PLANT_NOT_FOUND: 404,
  USER_PLANT_ARCHIVED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  AI_QUOTA_INSUFFICIENT: 409,
  CAPABILITY_DENIED: 403,
  CAPABILITY_SNAPSHOT_EXPIRED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SERVICE_UNAVAILABLE: 503
}
const validationFailed = () => new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')

/** 受限后的协议输入。 */
interface Restricted {
  /** 请求头（只用于身份与幂等键）。 */
  readonly headers: IncomingHttpHeaders
  /** JSON 正文（GET 为 null）。 */
  readonly body: unknown
  /** URL 查询参数（只读，用于 GET 接口）。 */
  readonly query: URLSearchParams
  /** 冻结路由分发器提供的路径参数。 */
  readonly path: RoutePathParameters
}

/** 媒体类型与字节上限先于身份；GET 不读正文。 */
async function restrict(request: IncomingMessage, path: RoutePathParameters, withBody: boolean): Promise<Restricted> {
  const query = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
  if (!withBody) {
    request.resume()
    return { headers: request.headers, body: null, query, path }
  }
  const type = request.headers['content-type']
  if (typeof type !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(type)) {
    request.resume()
    throw new PublicRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求须使用JSON')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += data.length
    if (bytes > bodyLimitBytes) {
      throw new PublicRequestError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
    }
    chunks.push(data)
  }
  try {
    return { headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')), query, path }
  } catch {
    throw validationFailed()
  }
}

/** 读取唯一的幂等键。 */
function idempotencyKey(headers: IncomingHttpHeaders): string {
  const key = headers['idempotency-key']
  if (typeof key !== 'string' || !keyPattern.test(key)) {
    throw validationFailed()
  }
  return key
}

/** 用例返回的幂等快照 → 公开数据（错误按白名单透传）。 */
function unwrapSnapshot(snapshot: HttpIdempotencyPublicResponseSnapshot, expectedStatus: number): unknown {
  const body = snapshot.body as { error?: { type?: unknown; message?: unknown }; data?: unknown }
  if (body.error !== undefined) {
    const type = body.error.type as PublicErrorType
    if (passThroughErrors[type] !== snapshot.status || typeof body.error.message !== 'string') {
      throw new Error('视觉诊断公开错误非法')
    }
    throw new PublicRequestError(snapshot.status, type, body.error.message)
  }
  if (snapshot.status !== expectedStatus) {
    throw new Error('视觉诊断成功状态非法')
  }
  return body.data
}

/** 单个路由的协议规格。 */
interface VisualRouteSpec<TDto, TData> {
  /** 冻结路由（方法、路径、操作编号）。 */
  readonly route: FrozenRoute
  /** 是否读取 JSON 正文。 */
  readonly withBody: boolean
  /** 成功状态码：200，或已受理异步处理的 202。 */
  readonly successStatus: 200 | 202
  /** DTO 校验：不合法抛 400（或 404）。 */
  readonly parse: (input: Restricted) => TDto
  /** 执行用例并返回公开数据。 */
  readonly execute: (principal: UserPrincipalDto, dto: TDto) => Promise<TData>
  /** 响应合同校验：不合合同即失败关闭。 */
  readonly validateResponse: (value: unknown) => boolean
}

/** 用固定请求链装配一个视觉诊断路由。 */
function bind<TDto, TData>(deps: VisualRouteDependencies, spec: VisualRouteSpec<TDto, TData>): RouteBinding {
  return {
    route: spec.route,
    handler: (request, response, path) =>
      createNodeRequestChainHandler<Restricted, ResolveUserPrincipalCommand, UserPrincipalDto, TDto, TDto, TDto, TData, TData>({
        successStatus: spec.successStatus,
        requestLimits: { kind: 'execute', run: raw => restrict(raw, path, spec.withBody) },
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
            let principal: UserPrincipalDto | GuestPrincipalDto
            try {
              principal = await deps.resolvePrincipal(command)
            } catch (error) {
              if (error instanceof UnifiedUserPrincipalResolveError) {
                throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
              }
              throw error
            }
            if (principal.principalType !== 'user') {
              throw new PublicRequestError(403, 'CAPABILITY_DENIED', '游客不能使用视觉诊断')
            }
            return principal
          }
        },
        objectOwnership: { kind: 'not_applicable', reason: '用户植物、临时案例、图片与诊断的归属在应用用例中按统一用户核验' },
        dtoValidate: { kind: 'execute', run: spec.parse },
        buildCommand: { kind: 'execute', run: ({ dto }) => dto },
        domainRule: { kind: 'execute', run: ({ command }) => command },
        transactionPersistence: { kind: 'execute', run: ({ domainDecision, principal }) => spec.execute(principal, domainDecision) },
        publicResponse: {
          kind: 'execute',
          run: data => {
            if (!spec.validateResponse(data)) {
              throw new Error('视觉诊断响应不符合合同')
            }
            return data
          }
        },
        writeAudit: deps.writeAudit
      })(request, response)
  }
}

/** 组装五个视觉诊断路由。 */
export function createVisualRouteBindings(deps: VisualRouteDependencies): readonly RouteBinding[] {
  return [
    bind(deps, {
      route: visualUploadTargetsRoute,
      withBody: false,
      successStatus: 200,
      parse: input => {
        const count = input.query.get('count')
        if ([...input.query.keys()].some(key => key !== 'count') || count === null || !/^[1-3]$/u.test(count)) {
          throw validationFailed()
        }
        return Number(count)
      },
      execute: (principal, count) => deps.getUploadTargets({ principal, count }),
      validateResponse: validateTargetsResponse
    }),
    bind(deps, {
      route: visualImagesRoute,
      withBody: true,
      successStatus: 200,
      parse: input => {
        if (!validateRegisterRequest(input.body)) {
          throw validationFailed()
        }
        return { files: (input.body as { files: { fileId: string }[] }).files, key: idempotencyKey(input.headers) }
      },
      execute: async (principal, dto) =>
        unwrapSnapshot(await deps.registerImages({ principal, files: dto.files, idempotencyKey: dto.key }), 200),
      validateResponse: validateRegisterResponse
    }),
    bind(deps, {
      route: visualCreateRoute,
      withBody: true,
      successStatus: 202,
      parse: input => {
        if (!validateCreateRequest(input.body)) {
          throw validationFailed()
        }
        return { request: input.body as CreateVisualDiagnosisInput['request'], key: idempotencyKey(input.headers) }
      },
      execute: async (principal, dto) =>
        unwrapSnapshot(await deps.createDiagnosis({ principal, request: dto.request, idempotencyKey: dto.key }), 202),
      validateResponse: validateSessionResponse
    }),
    bind(deps, {
      route: visualGetRoute,
      withBody: false,
      successStatus: 200,
      parse: input => {
        const ref = input.path.visualDiagnosisRef
        if (typeof ref !== 'string' || !visualRefPattern.test(ref)) {
          throw new PublicRequestError(404, 'NOT_FOUND', '诊断不存在')
        }
        return ref
      },
      execute: (principal, visualDiagnosisRef) => deps.getDiagnosis({ principal, visualDiagnosisRef }),
      validateResponse: validateSessionResponse
    }),
    bind(deps, {
      route: visualListRoute,
      withBody: false,
      successStatus: 200,
      parse: input => {
        const userPlantRef = input.query.get('userPlantRef')
        const cursor = input.query.get('cursor')
        if (
          [...input.query.keys()].some(key => key !== 'userPlantRef' && key !== 'cursor') ||
          (userPlantRef !== null && userPlantRef !== '' && !userPlantRefPattern.test(userPlantRef)) ||
          (cursor !== null && (cursor.length === 0 || cursor.length > 200))
        ) {
          throw validationFailed()
        }
        return { userPlantRef: userPlantRef === null || userPlantRef === '' ? null : userPlantRef, cursor }
      },
      execute: (principal, dto) => deps.listDiagnoses({ principal, ...dto }),
      validateResponse: validateListResponse
    })
  ]
}
