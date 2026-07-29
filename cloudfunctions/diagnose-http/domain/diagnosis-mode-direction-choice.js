'use strict'

const {
  DIAGNOSIS_MODE_REGISTRY,
  PEST_CATEGORY,
  PEST_MODE_KEYS
} = require('./diagnosis-mode-registry')

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function unique(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map(normalizeKey).filter(Boolean)))
}

function modeFamily(modeKey = '') {
  return PEST_MODE_KEYS.includes(modeKey) ? PEST_CATEGORY : 'general'
}

function hasCrossFamilyModes(modeKeys = []) {
  const families = new Set((Array.isArray(modeKeys) ? modeKeys : []).map(modeFamily))
  return families.has(PEST_CATEGORY) && families.size > 1
}

function buildDirectionChoices({
  associatedModes = [],
  directMatches = [],
  confirmationCandidates = []
} = {}) {
  const pestModeKeys = unique(associatedModes.filter(modeKey => PEST_MODE_KEYS.includes(modeKey)))
  const choices = []
  if (pestModeKeys.length) {
    // 单一具体虫害模式（如 aphid）应作为具体 mode 展示，不压缩为通用 pest 大类。
    // 多虫害模式时仍聚合为 pest 大类入口，供用户在结果页继续细分。
    // confirmationModeKeys 始终保留，供内部后续问诊/锁定使用，不暴露给用户作为大类入口。
    if (pestModeKeys.length === 1) {
      const singleModeKey = pestModeKeys[0]
      choices.push({
        modeKey: singleModeKey,
        directionKey: singleModeKey,
        familyKey: PEST_CATEGORY,
        category: PEST_CATEGORY,
        problemKey: singleModeKey,
        userDisplayName: DIAGNOSIS_MODE_REGISTRY[singleModeKey]?.userDisplayName || singleModeKey,
        pestModeKeys,
        directModeKeys: unique(
          directMatches.map(item => item.modeKey).filter(modeKey => PEST_MODE_KEYS.includes(modeKey))
        ),
        confirmationModeKeys: unique(
          confirmationCandidates
            .map(item => item.modeKey)
            .filter(modeKey => PEST_MODE_KEYS.includes(modeKey))
        )
      })
    } else {
      choices.push({
        modeKey: PEST_CATEGORY,
        directionKey: PEST_CATEGORY,
        familyKey: PEST_CATEGORY,
        category: PEST_CATEGORY,
        problemKey: PEST_CATEGORY,
        userDisplayName: '虫害',
        pestModeKeys,
        directModeKeys: unique(
          directMatches.map(item => item.modeKey).filter(modeKey => PEST_MODE_KEYS.includes(modeKey))
        ),
        confirmationModeKeys: unique(
          confirmationCandidates
            .map(item => item.modeKey)
            .filter(modeKey => PEST_MODE_KEYS.includes(modeKey))
        )
      })
    }
  }
  for (const modeKey of associatedModes) {
    if (PEST_MODE_KEYS.includes(modeKey)) {
      continue
    }
    choices.push({
      modeKey,
      directionKey: modeKey,
      familyKey: modeFamily(modeKey),
      problemKey: modeKey,
      category: DIAGNOSIS_MODE_REGISTRY[modeKey]?.category || 'general',
      userDisplayName: DIAGNOSIS_MODE_REGISTRY[modeKey]?.userDisplayName || modeKey
    })
  }
  return choices
}

module.exports = {
  buildDirectionChoices,
  hasCrossFamilyModes,
  modeFamily
}
