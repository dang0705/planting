import type { IncomingMessage } from 'node:http'

import Ajv, { type JSONSchemaType } from 'ajv'

import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import {
  CITY_CLIMATE_FIT_POLICY_VERSION,
  type CityClimateFit,
  type CityClimateProfile,
  type CityClimateRecommendationItem
} from '../repository/mysql-city-climate-fit-repository.js'

const publicReason = '城市气候适配为公开非个性化读取，不解析用户或平台主体'
const ownershipReason = '城市气候适配不包含用户数据'
const cityCodePattern = '^[a-z0-9_-]{2,64}$'

/** 城市气候剖面路径参数。 */
type CityCodePath = {
  /** 城市公开代码，小写字母数字与下划线/连字符，长度 2–64。 */
  cityCode: string
}

/** 城×植物适配查询参数。 */
type FitQuery = {
  /** 城市公开代码，与气候剖面主键一致。 */
  cityCode: string
  /** 百科分类引用 taxon_id；非空，最长 512 个 Unicode 码点，不裁剪。 */
  plantId: string
}

/** 城市气候推荐列表查询参数。 */
type RecommendQuery = {
  /** 城市公开代码，与气候剖面主键一致。 */
  cityCode: string
  /** 返回条数上限，整数 1–50；缺省由读取侧补 10。 */
  top: number
}

/** 城市气候适配只读端口；由 Repository 实现，应用层不直接碰 SQL。 */
export type CityClimateFitPort = {
  /** 列出全部已灌库城市气候剖面，按 city_code 排序。 */
  readonly listProfiles: () => Promise<readonly CityClimateProfile[]>
  /** 按城市代码读取单个气候剖面；不存在时返回 null。 */
  readonly getProfile: (cityCode: string) => Promise<CityClimateProfile | null>
  /** 读取指定城市与百科植物的适配缓存；缺剖面或缓存时返回 null。 */
  readonly getFit: (cityCode: string, plantId: string) => Promise<CityClimateFit | null>
  /** 按 overall 降序返回该城推荐植物，条数受 top 钳制。 */
  readonly listRecommendations: (
    cityCode: string,
    top: number
  ) => Promise<readonly CityClimateRecommendationItem[]>
}

/** 城市气候适配应用用例依赖；数据库与审计通过端口注入。 */
export type CityClimateFitDependencies = {
  /** 城市气候适配只读端口，承载剖面、适配与推荐查询。 */
  readonly cityClimateFit: CityClimateFitPort
  /** 请求结束后的脱敏结果事件端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

const cityCodePathSchema: JSONSchemaType<CityCodePath> = {
  type: 'object',
  additionalProperties: false,
  required: ['cityCode'],
  properties: {
    cityCode: { type: 'string', minLength: 2, maxLength: 64, pattern: cityCodePattern }
  }
}

const fitQuerySchema: JSONSchemaType<FitQuery> = {
  type: 'object',
  additionalProperties: false,
  required: ['cityCode', 'plantId'],
  properties: {
    cityCode: { type: 'string', minLength: 2, maxLength: 64, pattern: cityCodePattern },
    plantId: { type: 'string', minLength: 1, maxLength: 512 }
  }
}

const recommendQuerySchema: JSONSchemaType<RecommendQuery> = {
  type: 'object',
  additionalProperties: false,
  required: ['cityCode', 'top'],
  properties: {
    cityCode: { type: 'string', minLength: 2, maxLength: 64, pattern: cityCodePattern },
    top: { type: 'integer', minimum: 1, maximum: RUNTIME_PARAMETERS.weather.recommendTopMaxItems.value }
  }
}

const validateCityCodePath = new Ajv({ allErrors: true }).compile(cityCodePathSchema)
const validateFitQuery = new Ajv({ allErrors: true }).compile(fitQuerySchema)
const validateRecommendQuery = new Ajv({ allErrors: true }).compile(recommendQuerySchema)

function resume(request: IncomingMessage): void {
  request.resume()
}

function readFitQuery(request: IncomingMessage): Record<string, unknown> {
  resume(request)
  const parameters = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
  const cityCode = parameters.get('cityCode') ?? parameters.get('city')
  // 合同 v2：plantId 为 taxon_id 原值；已移除 plant_id / encyclopedia_id 别名。
  const plantId = parameters.get('plantId')
  return {
    cityCode: cityCode?.trim(),
    plantId: plantId ?? undefined
  }
}

function readRecommendQuery(request: IncomingMessage): Record<string, unknown> {
  resume(request)
  const parameters = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
  const cityCode = parameters.get('cityCode') ?? parameters.get('city')
  const top = parameters.get('top')
  return {
    cityCode: cityCode?.trim(),
    top: top === null ? 10 : /^\d+$/u.test(top) ? Number(top) : undefined
  }
}

/** 列出全部城市气候剖面。 */
export function createListCityClimateProfilesRouteHandler(
  dependencies: CityClimateFitDependencies
): RouteHandler {
  const handler = createNodeRequestChainHandler<
    Record<string, never>,
    undefined,
    undefined,
    Record<string, never>,
    Record<string, never>,
    Record<string, never>,
    { items: readonly CityClimateProfile[] },
    { items: readonly CityClimateProfile[] }
  >({
    requestLimits: {
      kind: 'execute',
      run: request => {
        resume(request)
        return {}
      }
    },
    identityValidate: { kind: 'not_applicable', reason: publicReason },
    principalResolve: { kind: 'not_applicable', reason: publicReason },
    objectOwnership: { kind: 'not_applicable', reason: ownershipReason },
    dtoValidate: { kind: 'execute', run: input => input },
    buildCommand: { kind: 'execute', run: ({ dto }) => dto },
    domainRule: { kind: 'execute', run: ({ command }) => command },
    transactionPersistence: {
      kind: 'execute',
      run: async () => ({ items: await dependencies.cityClimateFit.listProfiles() })
    },
    publicResponse: { kind: 'execute', run: result => result },
    writeAudit: dependencies.writeAudit
  })
  return (request, response) => handler(request, response)
}

/** 读取单个城市气候剖面。 */
export function createGetCityClimateProfileRouteHandler(
  dependencies: CityClimateFitDependencies
): RouteHandler {
  return (request, response, pathParameters) =>
    createNodeRequestChainHandler<
      CityCodePath | Record<string, string>,
      undefined,
      undefined,
      CityCodePath,
      CityCodePath,
      CityCodePath,
      CityClimateProfile | null,
      CityClimateProfile
    >({
      requestLimits: {
        kind: 'execute',
        run: raw => {
          resume(raw)
          return { cityCode: String(pathParameters.cityCode ?? '').trim() }
        }
      },
      identityValidate: { kind: 'not_applicable', reason: publicReason },
      principalResolve: { kind: 'not_applicable', reason: publicReason },
      objectOwnership: { kind: 'not_applicable', reason: ownershipReason },
      dtoValidate: {
        kind: 'execute',
        run: input => {
          if (!validateCityCodePath(input)) {
            throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
          }
          return input
        }
      },
      buildCommand: { kind: 'execute', run: ({ dto }) => dto },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: ({ domainDecision }) => dependencies.cityClimateFit.getProfile(domainDecision.cityCode)
      },
      publicResponse: {
        kind: 'execute',
        run: result => {
          if (!result) {
            throw new PublicRequestError(404, 'NOT_FOUND', '城市气候剖面不存在')
          }
          return result
        }
      },
      writeAudit: dependencies.writeAudit
    })(request, response)
}

/** 读取城×植物适配缓存。 */
export function createGetCityClimateFitRouteHandler(
  dependencies: CityClimateFitDependencies
): RouteHandler {
  const handler = createNodeRequestChainHandler<
    Record<string, unknown>,
    undefined,
    undefined,
    FitQuery,
    FitQuery,
    FitQuery,
    { profile: CityClimateProfile; fit: CityClimateFit } | 'missing_profile' | 'missing_fit',
    {
      policyVersion: string
      profile: CityClimateProfile
      fit: CityClimateFit
    }
  >({
    requestLimits: { kind: 'execute', run: readFitQuery },
    identityValidate: { kind: 'not_applicable', reason: publicReason },
    principalResolve: { kind: 'not_applicable', reason: publicReason },
    objectOwnership: { kind: 'not_applicable', reason: ownershipReason },
    dtoValidate: {
      kind: 'execute',
      run: input => {
        if (!validateFitQuery(input)) {
          throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
        }
        return input
      }
    },
    buildCommand: { kind: 'execute', run: ({ dto }) => dto },
    domainRule: { kind: 'execute', run: ({ command }) => command },
    transactionPersistence: {
      kind: 'execute',
      run: async ({ domainDecision }) => {
        const profile = await dependencies.cityClimateFit.getProfile(domainDecision.cityCode)
        if (!profile) {
          return 'missing_profile'
        }
        const fit = await dependencies.cityClimateFit.getFit(
          domainDecision.cityCode,
          domainDecision.plantId
        )
        if (!fit) {
          return 'missing_fit'
        }
        return { profile, fit }
      }
    },
    publicResponse: {
      kind: 'execute',
      run: result => {
        if (result === 'missing_profile') {
          throw new PublicRequestError(404, 'NOT_FOUND', '城市气候剖面不存在')
        }
        if (result === 'missing_fit') {
          throw new PublicRequestError(404, 'NOT_FOUND', '城市气候适配缓存不存在')
        }
        return {
          policyVersion: CITY_CLIMATE_FIT_POLICY_VERSION,
          profile: result.profile,
          fit: result.fit
        }
      }
    },
    writeAudit: dependencies.writeAudit
  })
  return (request, response) => handler(request, response)
}

/** 按 overall 推荐植物。 */
export function createListCityClimateRecommendationsRouteHandler(
  dependencies: CityClimateFitDependencies
): RouteHandler {
  const handler = createNodeRequestChainHandler<
    Record<string, unknown>,
    undefined,
    undefined,
    RecommendQuery,
    RecommendQuery,
    RecommendQuery,
    | {
        cityCode: string
        profile: CityClimateProfile
        recommendations: readonly CityClimateRecommendationItem[]
      }
    | 'missing_profile',
    {
      policyVersion: string
      cityCode: string
      profile: CityClimateProfile
      count: number
      recommendations: readonly CityClimateRecommendationItem[]
    }
  >({
    requestLimits: { kind: 'execute', run: readRecommendQuery },
    identityValidate: { kind: 'not_applicable', reason: publicReason },
    principalResolve: { kind: 'not_applicable', reason: publicReason },
    objectOwnership: { kind: 'not_applicable', reason: ownershipReason },
    dtoValidate: {
      kind: 'execute',
      run: input => {
        if (!validateRecommendQuery(input)) {
          throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
        }
        return input
      }
    },
    buildCommand: { kind: 'execute', run: ({ dto }) => dto },
    domainRule: { kind: 'execute', run: ({ command }) => command },
    transactionPersistence: {
      kind: 'execute',
      run: async ({ domainDecision }) => {
        const profile = await dependencies.cityClimateFit.getProfile(domainDecision.cityCode)
        if (!profile) {
          return 'missing_profile'
        }
        const recommendations = await dependencies.cityClimateFit.listRecommendations(
          domainDecision.cityCode,
          domainDecision.top
        )
        return { cityCode: domainDecision.cityCode, profile, recommendations }
      }
    },
    publicResponse: {
      kind: 'execute',
      run: result => {
        if (result === 'missing_profile') {
          throw new PublicRequestError(404, 'NOT_FOUND', '城市气候剖面不存在')
        }
        return {
          policyVersion: CITY_CLIMATE_FIT_POLICY_VERSION,
          cityCode: result.cityCode,
          profile: result.profile,
          count: result.recommendations.length,
          recommendations: result.recommendations
        }
      }
    },
    writeAudit: dependencies.writeAudit
  })
  return (request, response) => handler(request, response)
}
