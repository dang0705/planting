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
