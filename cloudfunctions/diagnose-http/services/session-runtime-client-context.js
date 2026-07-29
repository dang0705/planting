'use strict'

function compactClientContextForSnapshot(clientContext = null) {
  if (!clientContext || typeof clientContext !== 'object') {
    return null
  }
  return {
    source: String(clientContext?.source || '').trim(),
    platform: String(clientContext?.platform || '').trim(),
    reviewSourceType: String(clientContext?.reviewSourceType || '').trim(),
    visualInputVersion: String(clientContext?.visualInputVersion || '').trim(),
    structuredImageCount: Number(clientContext?.structuredImageCount || 0),
    auditLabel: String(clientContext?.auditLabel || '').trim(),
    auditFileName: String(clientContext?.auditFileName || '').trim(),
    auditCaseKey: String(clientContext?.auditCaseKey || '').trim()
  }
}

module.exports = {
  compactClientContextForSnapshot
}
