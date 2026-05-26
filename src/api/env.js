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

export function shouldAppendWebFunctionFlag() {
  return !IS_LOCAL_API_BASE_URL
}
