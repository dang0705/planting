'use strict'

const { AsyncLocalStorage } = require('async_hooks')

const llmImagePromptContextStorage = new AsyncLocalStorage()

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeObject(value = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeArray(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function pickField(source = {}, fallback = {}, key = '', conservative = '') {
  return normalizeText(source?.[key] || fallback?.[key] || '', conservative)
}

function normalizeLlmImageTaskContext(imageInput = {}, options = {}) {
  const image = normalizeObject(imageInput)
  const promptOptions = normalizeObject(options)
  const plantContext = normalizeObject(image.plantContext)
  const optionPlantContext = normalizeObject(promptOptions.plantContext)
  return {
    diagnosisProfile: pickField(image, promptOptions, 'diagnosisProfile', 'full'),
    analysisRound: pickField(image, promptOptions, 'analysisRound', 'initial'),
    entrySource: pickField(image, promptOptions, 'entrySource', ''),
    plantContext: Object.keys(plantContext).length ? plantContext : optionPlantContext,
    priorAdmittedEvidenceDigest: pickField(image, promptOptions, 'priorAdmittedEvidenceDigest', ''),
    priorEvidenceLedger: normalizeArray(
      image.priorEvidenceLedger || promptOptions.priorEvidenceLedger
    ),
    unresolvedEvidenceGroups: normalizeArray(
      image.unresolvedEvidenceGroups || promptOptions.unresolvedEvidenceGroups
    ),
    requestedCaptureRegion: pickField(image, promptOptions, 'requestedCaptureRegion', ''),
    originVisualCallBatchId: pickField(image, promptOptions, 'originVisualCallBatchId', '')
  }
}

function getLlmImagePromptContext() {
  return normalizeObject(llmImagePromptContextStorage.getStore())
}

function withLlmImagePromptContext(context = {}, callback) {
  if (typeof callback !== 'function') {
    return null
  }
  return llmImagePromptContextStorage.run(normalizeObject(context), callback)
}

module.exports = {
  getLlmImagePromptContext,
  normalizeLlmImageTaskContext,
  withLlmImagePromptContext
}
