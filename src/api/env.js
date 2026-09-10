import { CLOUDBASE_ENV_ID } from '@/utils/runtime-env'

const H5_DEV_FUNCTION_PROXY_BASE = '/__tcb_functions__'
const isH5DevProxyRuntime = Boolean(import.meta.env.DEV) && typeof window !== 'undefined'
const explicitApiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || '')
const appEnv = String(import.meta.env.VITE_APP_ENV || '').trim().toLowerCase()
const isProductionAppEnv =
  ['prod', 'production'].includes(appEnv) || (!appEnv && import.meta.env.PROD)

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function isPrivateLanHost(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (!normalized) {return false}
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(normalized)) {
    return true
  }
  if (normalized.startsWith('192.168.')) {return true}
  if (normalized.startsWith('10.')) {return true}

  const match = normalized.match(/^172\.(\d+)\./)
  if (!match) {return false}
  const second = Number(match[1])
  return second >= 16 && second <= 31
}

function getBaseUrlHostname(value = '') {
  const normalized = normalizeBaseUrl(value)
  if (!normalized || normalized.startsWith('/')) {return ''}

  const withoutProtocol = normalized.replace(/^[a-z][a-z\d+.-]*:\/\//i, '')
  const withoutPath = withoutProtocol.split(/[/?#]/)[0] || ''
  if (withoutPath.startsWith('[')) {
    const closingIndex = withoutPath.indexOf(']')
    return closingIndex >= 0 ? withoutPath.slice(0, closingIndex + 1) : withoutPath
  }

  return withoutPath.split(':')[0] || ''
}

function isLocalBaseUrl(value = '') {
  const normalized = normalizeBaseUrl(value)
  if (!normalized || normalized.startsWith('/')) {return false}
  return isPrivateLanHost(getBaseUrlHostname(normalized))
}

function isHttpBaseUrl(value = '') {
  return /^http:\/\//i.test(normalizeBaseUrl(value))
}

export const IS_EXPLICIT_API_BASE_URL = Boolean(explicitApiBaseUrl)
export const IS_LOCAL_API_BASE_URL = isLocalBaseUrl(explicitApiBaseUrl)

if (
  explicitApiBaseUrl &&
  isProductionAppEnv &&
  (IS_LOCAL_API_BASE_URL || isHttpBaseUrl(explicitApiBaseUrl))
) {
  throw new Error('生产环境不允许使用本地或非 HTTPS 的 VITE_API_BASE_URL')
}

export const BASE_URL = explicitApiBaseUrl || (isH5DevProxyRuntime
  ? H5_DEV_FUNCTION_PROXY_BASE
  : `https://${CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com/v1/functions`)

const defaultPublicHttpFunctionBaseUrl =
  `https://${CLOUDBASE_ENV_ID}-1403815561.ap-shanghai.app.tcloudbase.com`

// 公开 HTTPS 云函数服务域名。它只负责承载公网路由，具体身份校验仍在
// 各函数内部完成；原生 HTTP 云函数通道仅保留给尚未建立手机号会话的微信身份引导。
export const PUBLIC_HTTP_FUNCTION_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_PUBLIC_HTTP_FUNCTION_BASE_URL || defaultPublicHttpFunctionBaseUrl
)

// 匿名手机号 bootstrap 走 HTTPS 云函数服务域名；API 网关的 /v1/functions
// 入口仍要求 CloudBase 登录态，不能承载三端首次登录。
export const PLATFORM_PHONE_BOOTSTRAP_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_PLATFORM_PHONE_BOOTSTRAP_BASE_URL || PUBLIC_HTTP_FUNCTION_BASE_URL
)

// 题包请求在已有手机号会话后走同一个公开 HTTPS 服务域名。该域名的路由
// 由函数自身校验 x-planting-platform-session，避免使用原生通道的内部字节
// 包，也不要求客户端持有 CloudBase Authorization。
export const DIAGNOSIS_HTTP_BASE_URL = IS_LOCAL_API_BASE_URL
  ? ''
  : normalizeBaseUrl(
      import.meta.env.VITE_DIAGNOSIS_HTTP_BASE_URL || PUBLIC_HTTP_FUNCTION_BASE_URL
    )

export function shouldAppendWebFunctionFlag(baseUrl = BASE_URL) {
  if (IS_LOCAL_API_BASE_URL) {
    return false
  }

  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized || normalized.startsWith('/')) {
    return false
  }

  // `webfn=true` belongs to CloudBase API Gateway's /v1/functions protocol.
  // The public app.tcloudbase.com function domain already returns JSON directly;
  // adding this flag there switches it to the slow web-function protocol.
  return (
    /^https:\/\//iu.test(normalized) &&
    /\.api\.tcloudbasegateway\.com$/iu.test(getBaseUrlHostname(normalized)) &&
    normalized
      .replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]+/iu, '')
      .split(/[?#]/u)[0]
      .replace(/\/+$/u, '') === '/v1/functions'
  )
}
