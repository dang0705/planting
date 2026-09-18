'use strict'

const crypto = require('crypto')

const DYNAMIC_TASK_MARKER = '[Dynamic Task]'

function sha1(value = '') {
  return crypto
    .createHash('sha1')
    .update(String(value || ''))
    .digest('hex')
}

function buildCacheFirstVisualPrompt({
  taskLine = 'Normalize visible plant evidence only.',
  schemaText = '',
  ruleText = '',
  evidenceDirectoryText = '',
  dynamicTaskText = ''
} = {}) {
  // 固定前缀格式的缓存契约（严禁自行变更）：除非先征得用户明确同意，以下段名、顺序、
  // 换行分隔和 `[Dynamic Task]` 分界均不得修改。百炼以这段稳定前缀建缓存，改动会增加输入 token。
  const staticPrefix = [
    String(taskLine || '').trim(),
    '[Static Schema]',
    String(schemaText || '').trim(),
    '[Static Rules]',
    String(ruleText || '').trim(),
    '[Static Evidence Directory]',
    String(evidenceDirectoryText || '').trim()
  ]
    .filter(Boolean)
    .join('\n')
  const dynamicTail = `${DYNAMIC_TASK_MARKER}\n${String(dynamicTaskText || '').trim()}`.trim()
  const promptText = `${staticPrefix}\n\n${dynamicTail}`.trim()
  return {
    promptText,
    staticPrefix,
    dynamicTail,
    staticPrefixHash: sha1(staticPrefix),
    dynamicTailHash: sha1(dynamicTail),
    marker: DYNAMIC_TASK_MARKER
  }
}

module.exports = {
  DYNAMIC_TASK_MARKER,
  buildCacheFirstVisualPrompt
}
