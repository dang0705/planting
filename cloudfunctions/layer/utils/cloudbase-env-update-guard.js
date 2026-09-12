'use strict'

/**
 * Guard the full-replacement envVariables contract used by CloudBase
 * updateFunctionConfig. The API replaces the whole object; it does not merge
 * it. Callers must therefore prove that existing keys are preserved and make
 * secret changes/removals explicit.
 */

const SENSITIVE_KEY_PATTERN =
  /(?:SECRET|TOKEN|PASSWORD|API(?:_|-)?KEY|ACCESS(?:_|-)?KEY|(?:^|_)(?:AK|SK)(?:_|$))/i

const CREDENTIAL_PAIRS = [
  ['CLOUDBASE_SECRET_ID', 'CLOUDBASE_SECRET_KEY'],
  ['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY'],
  ['TENCENTCLOUD_SECRETID', 'TENCENTCLOUD_SECRETKEY']
]

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function normalizeEntry(entry) {
  const key = String(entry?.Key ?? entry?.key ?? entry?.name ?? '').trim()
  if (!key) {
    return null
  }
  const value = entry?.Value ?? entry?.value ?? ''
  return [key, String(value ?? '')]
}

/**
 * Accept both the object shape used by local scripts and the array shape
 * returned by CloudBase function detail APIs.
 */
function normalizeEnvVariables(input) {
  const source = Array.isArray(input) ? input : Object.entries(input || {})
  const entries = Array.isArray(input)
    ? source.map(normalizeEntry)
    : source.map(([key, value]) => [String(key).trim(), String(value ?? '')])

  return Object.fromEntries(entries.filter(entry => entry && entry[0]))
}

function isSensitiveEnvKey(key) {
  return SENSITIVE_KEY_PATTERN.test(String(key || ''))
}

function asKeySet(value) {
  return new Set(
    (Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean)
  )
}

function createBlockedError(details) {
  const sections = []
  if (details.missingKeys.length) {
    sections.push(`缺少现有配置：${details.missingKeys.join(', ')}`)
  }
  if (details.changedSensitiveKeys.length) {
    sections.push(`敏感配置变更未显式批准：${details.changedSensitiveKeys.join(', ')}`)
  }
  if (details.partialCredentialPairs.length) {
    sections.push(`凭据成对变更不完整：${details.partialCredentialPairs.join(', ')}`)
  }
  if (details.invalidAllowRemove.length) {
    sections.push(`allowRemove 包含不存在的配置：${details.invalidAllowRemove.join(', ')}`)
  }
  if (details.invalidAllowReplace.length) {
    sections.push(`allowReplace 包含不存在的配置：${details.invalidAllowReplace.join(', ')}`)
  }

  const error = new Error(`CloudBase 函数环境变量更新已阻断；${sections.join('；')}`)
  error.code = 'CLOUDBASE_ENV_UPDATE_BLOCKED'
  error.details = details
  return error
}

/**
 * Verify an updateFunctionConfig envVariables payload before sending it.
 *
 * Defaults are deliberately deny-by-default:
 * - every existing key must remain in the proposed full object;
 * - sensitive values cannot change silently;
 * - credential id/key pairs cannot be changed one-sidedly.
 *
 * The function never includes environment values in an error or result.
 */
function assertSafeFunctionEnvUpdate(currentEnv, proposedEnv, options = {}) {
  const current = normalizeEnvVariables(currentEnv)
  const proposed = normalizeEnvVariables(proposedEnv)
  const allowRemove = asKeySet(options.allowRemove)
  const allowReplace = asKeySet(options.allowReplace)

  const missingKeys = Object.keys(current).filter(
    key => !hasOwn(proposed, key) && !allowRemove.has(key)
  )
  const changedSensitiveKeys = Object.keys(current).filter(
    key =>
      hasOwn(proposed, key) &&
      current[key] !== proposed[key] &&
      isSensitiveEnvKey(key) &&
      !allowReplace.has(key)
  )
  const invalidAllowRemove = [...allowRemove].filter(key => !hasOwn(current, key))
  const invalidAllowReplace = [...allowReplace].filter(key => !hasOwn(current, key))
  const partialCredentialPairs = []

  for (const [idKey, secretKey] of CREDENTIAL_PAIRS) {
    const currentKeys = [idKey, secretKey].filter(key => hasOwn(current, key))
    if (currentKeys.length !== 2) {
      continue
    }

    const changedKeys = [idKey, secretKey].filter(key => {
      const removed = !hasOwn(proposed, key)
      const changed = hasOwn(proposed, key) && current[key] !== proposed[key]
      return removed || changed
    })

    if (changedKeys.length === 1) {
      partialCredentialPairs.push(`${idKey}/${secretKey}`)
    }
  }

  const details = {
    missingKeys,
    changedSensitiveKeys,
    partialCredentialPairs,
    invalidAllowRemove,
    invalidAllowReplace,
    addedKeys: Object.keys(proposed).filter(key => !hasOwn(current, key)),
    changedKeys: Object.keys(current).filter(
      key => hasOwn(proposed, key) && current[key] !== proposed[key]
    ),
    removedKeys: Object.keys(current).filter(key => !hasOwn(proposed, key))
  }

  if (
    details.missingKeys.length ||
    details.changedSensitiveKeys.length ||
    details.partialCredentialPairs.length ||
    details.invalidAllowRemove.length ||
    details.invalidAllowReplace.length
  ) {
    throw createBlockedError(details)
  }

  return { ok: true, ...details }
}

function mergeFunctionEnv(currentEnv, patchEnv) {
  return {
    ...normalizeEnvVariables(currentEnv),
    ...normalizeEnvVariables(patchEnv)
  }
}

module.exports = {
  assertSafeFunctionEnvUpdate,
  isSensitiveEnvKey,
  mergeFunctionEnv,
  normalizeEnvVariables
}
