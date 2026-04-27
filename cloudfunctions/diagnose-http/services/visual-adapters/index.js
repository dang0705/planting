'use strict'

const {
  llm: { service: configuredService = 'hunyuan' } = {}
} = require('../../configs')
const hunyuanVisualAdapter = require('./hunyuan-visual-adapter')
const hfAutotrainVisualAdapter = require('./hf-autotrain-visual-adapter')

function normalizeService(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getVisualAdapter(service = configuredService) {
  const normalizedService = normalizeService(service) || 'hunyuan'

  if (normalizedService === 'hunyuan') {
    return hunyuanVisualAdapter
  }

  if (normalizedService === 'hf_autotrain') {
    return hfAutotrainVisualAdapter
  }

  throw new Error(`unsupported_visual_model_provider:${normalizedService}`)
}

module.exports = {
  getVisualAdapter
}
