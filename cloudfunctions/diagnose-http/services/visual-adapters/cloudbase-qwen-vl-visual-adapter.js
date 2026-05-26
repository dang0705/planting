'use strict'

const baseAdapter = require('./hunyuan-visual-adapter')

const ADAPTER_NAME = 'qwen_vl_visual_adapter'

function withQwenAdapterName(overrides = {}) {
  return {
    ...overrides,
    adapter_name: ADAPTER_NAME,
    adapterName: ADAPTER_NAME
  }
}

function getAdapterMeta(overrides = {}) {
  return baseAdapter.getAdapterMeta(withQwenAdapterName(overrides))
}

async function analyzeImage(imageRuntimeInput, options = {}) {
  return baseAdapter.analyzeImage(imageRuntimeInput, {
    ...options,
    adapterMetaOverride: withQwenAdapterName(options.adapterMetaOverride || {})
  })
}

module.exports = {
  ADAPTER_NAME,
  getAdapterMeta,
  analyzeImage
}
