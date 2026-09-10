'use strict'

function text(value = '') {
  return String(value || '').trim()
}

function buildIdentityResolutionHeaders(headers = {}) {
  const normalizedHeaders = { ...(headers || {}) }
  const hasAuthorization = Object.keys(normalizedHeaders).some(
    key => String(key).toLowerCase() === 'authorization'
  )
  const platformSession = text(
    Object.entries(normalizedHeaders).find(
      ([key]) => String(key).toLowerCase() === 'x-planting-platform-session'
    )?.[1]
  )
  if (!hasAuthorization && platformSession) {
    normalizedHeaders.authorization = `Bearer ${platformSession}`
  }
  return normalizedHeaders
}

async function resolveSlimHttpIdentity({ headers = {}, payload = {}, context = null } = {}) {
  const normalizedHeaders = buildIdentityResolutionHeaders(headers)
  try {
    const { resolveHttpUserInfo } = require('/opt/utils/http')
    return await resolveHttpUserInfo(normalizedHeaders, payload, context, {
      allowRuntimeIdentity: !Object.keys(normalizedHeaders).some(
        key => String(key).toLowerCase() === 'x-planting-platform-session'
      )
    })
  } catch (error) {
    console.warn('diagnosis-http slim identity resolution failed:', {
      message: String(error?.message || error || '').slice(0, 200)
    })
    return null
  }
}

module.exports = {
  buildIdentityResolutionHeaders,
  resolveSlimHttpIdentity
}
