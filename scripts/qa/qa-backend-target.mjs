import { resolveLocalApiBaseUrl } from '../dev/local-api-env-config.mjs'

const ONLINE_MODE = 'online'
const DEFAULT_LAN_PORT = 3011
const DEFAULT_FUNCTION_PORT_BASE = 9100
export const QA_ONLINE_TARGET = Object.freeze({
  environmentId: 'cloud1-2grufevs395a9d5e',
  region: 'ap-shanghai',
  apiGatewayBaseUrl: 'https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions',
  httpFunctionBaseUrl: 'https://cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com'
})

function normalizeBaseUrl(value = '') {
  return String(value || '')
    .trim()
    .replace(/\/+$/u, '')
}

function isPrivateHostname(hostname = '') {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    return false
  }
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(normalized)) {
    return true
  }
  if (normalized.startsWith('192.168.') || normalized.startsWith('10.')) {
    return true
  }
  const match = normalized.match(/^172\.(\d+)\./u)
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31)
}

function validateOnlineBaseUrl(value = '') {
  const normalized = normalizeBaseUrl(value)
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    throw Object.assign(new Error('QA_ONLINE_API_BASE_URL 不是有效 URL'), {
      code: 'qa_online_base_url_invalid'
    })
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    isPrivateHostname(parsed.hostname)
  ) {
    throw Object.assign(
      new Error('线上 QA 后端必须使用不带凭据、查询参数或片段的 HTTPS 公网地址'),
      { code: 'qa_online_base_url_invalid' }
    )
  }
  return normalized
}

function isApiGatewayBaseUrl(value = '') {
  let parsed
  try {
    parsed = new URL(normalizeBaseUrl(value))
  } catch {
    return false
  }
  return (
    /\.api\.tcloudbasegateway\.com$/iu.test(parsed.hostname) &&
    parsed.pathname.replace(/\/+$/u, '') === '/v1/functions'
  )
}

function assertCanonicalAlias(value, expected, { variable, code }) {
  const raw = String(value || '').trim()
  if (!raw) {
    return
  }
  const normalized = validateOnlineBaseUrl(raw)
  if (normalized !== expected) {
    throw Object.assign(
      new Error(`${variable} 只能作为 canonical QA 目标校验值，不能改写正式 QA 远端地址`),
      {
        code,
        details: {
          variable,
          expected,
          observed: normalized
        }
      }
    )
  }
}

function resolveOnlineHttpFunctionBaseUrl(environment = {}) {
  const configuredGateway = String(environment.QA_ONLINE_API_BASE_URL || '').trim()
  if (configuredGateway && !isApiGatewayBaseUrl(validateOnlineBaseUrl(configuredGateway))) {
    throw Object.assign(
      new Error(
        '线上 QA 的 QA_ONLINE_API_BASE_URL 必须是 CloudBase API Gateway 地址：*.api.tcloudbasegateway.com/v1/functions'
      ),
      { code: 'qa_online_api_base_url_must_be_gateway' }
    )
  }
  assertCanonicalAlias(configuredGateway, QA_ONLINE_TARGET.apiGatewayBaseUrl, {
    variable: 'QA_ONLINE_API_BASE_URL',
    code: 'qa_online_api_base_url_mismatch'
  })

  // api.tcloudbasegateway.com/v1/functions 由 wx.cloud.callHTTPFunction
  // 接管时会在 DevTools Network 中显示为二进制协议。正式 QA 与产品一致，
  // 固定改用公开 HTTPS 服务域名，让 wx.request 直接拿到 JSON 响应。
  assertCanonicalAlias(
    environment.QA_ONLINE_HTTP_FUNCTION_BASE_URL,
    QA_ONLINE_TARGET.httpFunctionBaseUrl,
    {
      variable: 'QA_ONLINE_HTTP_FUNCTION_BASE_URL',
      code: 'qa_online_http_function_base_url_mismatch'
    }
  )
  assertCanonicalAlias(
    environment.VITE_PUBLIC_HTTP_FUNCTION_BASE_URL,
    QA_ONLINE_TARGET.httpFunctionBaseUrl,
    {
      variable: 'VITE_PUBLIC_HTTP_FUNCTION_BASE_URL',
      code: 'qa_online_http_function_base_url_mismatch'
    }
  )
  return QA_ONLINE_TARGET.httpFunctionBaseUrl
}

export function resolveQaBackendMode(environment = process.env) {
  const mode = String(environment.QA_BACKEND_MODE || 'lan')
    .trim()
    .toLowerCase()
  if (mode === ONLINE_MODE) {
    return ONLINE_MODE
  }
  if (mode === 'lan' || !mode) {
    return 'lan'
  }
  throw Object.assign(new Error(`不支持的 QA_BACKEND_MODE：${mode}`), {
    code: 'qa_backend_mode_invalid'
  })
}

export function resolveQaBackendBaseUrl(
  environment = process.env,
  { port = DEFAULT_LAN_PORT, functionPortBase = DEFAULT_FUNCTION_PORT_BASE } = {}
) {
  if (resolveQaBackendMode(environment) === ONLINE_MODE) {
    return resolveOnlineHttpFunctionBaseUrl(environment)
  }
  return resolveLocalApiBaseUrl({ mode: 'lan', port, functionPortBase }, environment)
}

export function buildQaWxRequestUrl(baseUrl = '') {
  return `${normalizeBaseUrl(baseUrl)}/plant-user-http/user-plants?page=1&pageSize=1`
}

export function buildQaBusinessAuthUrl(baseUrl = '') {
  return `${normalizeBaseUrl(baseUrl)}/auth-user-http/auth/user`
}

export function buildQaHealthRequestUrl(baseUrl = '') {
  // The performance preflight must not invoke either endpoint under test.
  // Calling plant-user-http/user-plants/health would initialize the very
  // function whose cold request we are about to measure and would turn the
  // sample into a warm request. Use an unrelated, cheap health route only to
  // verify that the remote wx.request path is reachable.
  return `${normalizeBaseUrl(baseUrl)}/plant-catalog-http/catalog/health`
}

export function qaBackendTargetEvidence(target = null) {
  if (!target) {
    return null
  }
  return {
    mode: target.mode,
    environment_id: target.environmentId,
    api_gateway_base_url: target.apiGatewayBaseUrl,
    base_url: target.baseUrl,
    wx_request_url: target.wxRequestUrl,
    business_auth_url: target.businessAuthUrl,
    source: target.source
  }
}

export function qaBackendTargetMatches(observed = null, expected = null) {
  const expectedEvidence = qaBackendTargetEvidence(expected)
  return Boolean(
    observed &&
    expectedEvidence &&
    observed.mode === expectedEvidence.mode &&
    observed.environment_id === expectedEvidence.environment_id &&
    observed.api_gateway_base_url === expectedEvidence.api_gateway_base_url &&
    observed.base_url === expectedEvidence.base_url &&
    observed.wx_request_url === expectedEvidence.wx_request_url &&
    observed.business_auth_url === expectedEvidence.business_auth_url
  )
}

export function resolveQaBackendTarget(
  environment = process.env,
  options = { port: DEFAULT_LAN_PORT, functionPortBase: DEFAULT_FUNCTION_PORT_BASE }
) {
  const mode = resolveQaBackendMode(environment)
  const baseUrl = resolveQaBackendBaseUrl(environment, options)
  const wxRequestUrl = buildQaWxRequestUrl(baseUrl)
  const businessAuthUrl = buildQaBusinessAuthUrl(baseUrl)
  return {
    mode,
    baseUrl,
    environmentId: mode === ONLINE_MODE ? QA_ONLINE_TARGET.environmentId : null,
    apiGatewayBaseUrl: mode === ONLINE_MODE ? QA_ONLINE_TARGET.apiGatewayBaseUrl : null,
    // Online QA resolves the configured API Gateway control URL to the public
    // HTTPS function domain. The public domain must not receive webfn=true.
    wxRequestUrl,
    businessAuthUrl,
    source: mode === ONLINE_MODE ? 'supervisor_fixed_online_public_http' : 'supervisor_fixed_lan'
  }
}
