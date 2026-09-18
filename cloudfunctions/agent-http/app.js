'use strict'
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}
const { models, invokeFunctionLightweight } = require('/opt/utils/cloudbase')
const {
  getBearerToken,
  hashSessionToken,
  resolvePersistentSession
} = require('/opt/utils/platform-session')
const {
  createHttpIdentityTicket,
  HTTP_IDENTITY_TICKET_HEADER
} = require('/opt/utils/http-identity-ticket')
const { createSessionStore } = require('./session-store')
const { isLocalGatewayRuntime } = require('./runtime-config')
const { createToolRunner } = require('./tool-runner')
const { createAgentQuota } = require('./agent-quota')
const { start } = require('./server')
const { findCanonicalPlantMatch, getPlantCatalogById } = require('/opt/utils/plant-knowledge')
const { buildWateringPlanner } = require('/opt/utils/watering-planner')
const { getUserWithQuota, getUserTier, QUOTA_CONFIG } = require('/opt/utils/quota')
start({
  store: createSessionStore(models),
  agentQuota: createAgentQuota({
    models,
    getUserWithQuota,
    getUserTier,
    quotaConfig: QUOTA_CONFIG
  }),
  resolveIdentity: headers => resolvePersistentSession({ token: getBearerToken(headers), models }),
  hashParent: headers => hashSessionToken(getBearerToken(headers)),
  apiKey: process.env.AGENT_API_KEY || process.env.CLOUDBASE_AI_API_KEY,
  agentEndpoint: process.env.AGENT_ENDPOINT,
  executeTool: createToolRunner({
    findCanonicalPlantMatch,
    getPlantCatalogById,
    buildWateringPlanner,
    invokeHttpFunction: async ({ functionName, path, method, query, body, identity, signal }) => {
      if (signal?.aborted) {
        throw Object.assign(new Error('请求已取消。'), { statusCode: 499 })
      }
      const internalTicket = createHttpIdentityTicket({
        openid: identity?.openid,
        uid: identity?.userId,
        customUserId: identity?.userId,
        subject: 'planting-agent',
        platform: identity?.platform
      })
      if (!internalTicket) {
        throw Object.assign(new Error('小青用户身份票据配置不可用。'), { statusCode: 503 })
      }
      const queryString = new URLSearchParams(query || {}).toString()
      const normalizedPath = `${path}${queryString ? `?${queryString}` : ''}`
      const invocation = await invokeFunctionLightweight(functionName, {
        path: normalizedPath,
        httpMethod: method || 'POST',
        headers: { [HTTP_IDENTITY_TICKET_HEADER]: internalTicket },
        body: body || {}
      })
      if (signal?.aborted) {
        throw Object.assign(new Error('请求已取消。'), { statusCode: 499 })
      }
      const rawResponse = invocation?.result || {}
      const response =
        typeof rawResponse === 'string' ? JSON.parse(rawResponse || '{}') : rawResponse
      const payload =
        typeof response.body === 'string'
          ? JSON.parse(response.body || '{}')
          : response.body || response
      const statusCode = Number(response.statusCode || payload?.code || 200)
      if (statusCode >= 400 || Number(payload?.code || 0) >= 400) {
        throw Object.assign(new Error(String(payload?.message || '青花植正式接口请求失败。')), {
          statusCode: statusCode >= 400 ? statusCode : Number(payload.code)
        })
      }
      return payload?.data ?? null
    }
  }),
  origin: process.env.AGENT_H5_ORIGIN,
  development: isLocalGatewayRuntime(process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY)
})
