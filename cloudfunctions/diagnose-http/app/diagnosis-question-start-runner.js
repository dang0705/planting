'use strict'

const {
  resolvePlantContext
} = require('../repositories/prior-repository')
const {
  buildManualQuestionStartRoundResult,
  _test: manualQuestionStartFastPathTest
} = require('./manual-symptom-question-start-fast-path')
const { buildSessionId } = require('../services/session-service')
const { resolveRequestClientContext } = require('./request-normalizers')
const { createReviewTimingLogger } = require('../repositories/diagnosis-review/review-performance')

const MANUAL_SYMPTOM_MODE_OPTIONS = [
  { classKey: 'yellowing_mode', classNameCn: '黄叶模式', symptomKey: 'uniform_yellowing', symptomCn: '整叶黄化' },
  { classKey: 'bacterial_leaf_spot_mode', classNameCn: '细菌性叶斑模式', symptomKey: 'water_soaked_spots', symptomCn: '水渍斑' },
  { classKey: 'chewing_pest_mode', classNameCn: '咀嚼损伤虫害模式', symptomKey: 'holes_in_leaf', symptomCn: '叶片穿孔' },
  { classKey: 'edema_overwater_mode', classNameCn: '水肿/过湿模式', symptomKey: 'edema', symptomCn: '水肿' },
  { classKey: 'flower_stress_mode', classNameCn: '花器胁迫模式', symptomKey: 'bud_drop', symptomCn: '掉花苞' },
  { classKey: 'fungal_leaf_spot_mode', classNameCn: '真菌性叶斑模式', symptomKey: 'brown_spots_halo', symptomCn: '褐斑带黄晕' },
  { classKey: 'general_stress_mode', classNameCn: '泛胁迫兜底模式', symptomKey: 'distorted_growth', symptomCn: '整体畸形' },
  { classKey: 'gray_mold_mode', classNameCn: '灰霉模式', symptomKey: 'gray_fuzzy_mold', symptomCn: '灰色绒霉' },
  { classKey: 'humidity_stress_mode', classNameCn: '湿度胁迫模式', symptomKey: 'low_humidity_damage', symptomCn: '低湿伤害' },
  { classKey: 'leaf_edge_necrosis_mode', classNameCn: '叶缘坏死模式', symptomKey: 'leaf_margin_necrosis', symptomCn: '叶缘坏死' },
  { classKey: 'leaf_spot_complex_mode', classNameCn: '复合叶斑模式', symptomKey: 'irregular_blotches', symptomCn: '不规则斑块' },
  { classKey: 'leafminer_mode', classNameCn: '潜叶损伤模式', symptomKey: 'tunnels_in_leaf', symptomCn: '叶内潜道' },
  { classKey: 'light_stress_mode', classNameCn: '光照胁迫模式', symptomKey: 'leaf_bleaching', symptomCn: '叶片漂白' },
  { classKey: 'mechanical_damage_mode', classNameCn: '机械损伤模式', symptomKey: 'wind_damage', symptomCn: '风伤' },
  { classKey: 'mite_damage_mode', classNameCn: '螨害模式', symptomKey: 'fine_webbing', symptomCn: '细密蛛网' },
  { classKey: 'natural_aging_mode', classNameCn: '自然老化模式', symptomKey: 'normal_leaf_aging_stable', symptomCn: '底部老叶稳定黄化' },
  { classKey: 'nutrient_stress_mode', classNameCn: '营养胁迫模式', symptomKey: 'vein_darkening', symptomCn: '叶脉变深' },
  { classKey: 'powdery_mildew_mode', classNameCn: '白粉模式', symptomKey: 'white_fuzz', symptomCn: '白色菌丝' },
  { classKey: 'root_rot_wet_wilt_mode', classNameCn: '湿土萎蔫/根腐模式', symptomKey: 'wilting_wet_soil', symptomCn: '湿土萎蔫' },
  { classKey: 'rust_mode', classNameCn: '锈病模式', symptomKey: 'rust_pustules', symptomCn: '锈孢子堆' },
  { classKey: 'salt_dry_edge_mode', classNameCn: '盐害/干边模式', symptomKey: 'tip_burn', symptomCn: '叶尖焦枯' },
  { classKey: 'sap_sucking_honeydew_pest_mode', classNameCn: '刺吸蜜露型虫害模式', symptomKey: 'white_flies', symptomCn: '有白色小飞虫，一碰会飞起来' },
  { classKey: 'soft_rot_mode', classNameCn: '软腐模式', symptomKey: 'soft_stem', symptomCn: '茎变软' },
  { classKey: 'soil_moisture_pest_mode', classNameCn: '盆土过湿相关模式', symptomKey: 'small_flies_soil', symptomCn: '土壤小飞虫' },
  { classKey: 'temperature_stress_mode', classNameCn: '温度胁迫模式', symptomKey: 'heat_stress', symptomCn: '高温胁迫' },
  { classKey: 'thrips_damage_mode', classNameCn: '蓟马损伤模式', symptomKey: 'yellow_speckling', symptomCn: '点刺状黄化' },
  { classKey: 'virus_mosaic_mode', classNameCn: '病毒花叶模式', symptomKey: 'leaf_mosaic_mottling', symptomCn: '叶子上有深浅不一、花花绿绿的斑驳花纹' },
  { classKey: 'water_stress_mode', classNameCn: '水分胁迫模式', symptomKey: 'wilting_dry_soil', symptomCn: '干土萎蔫' }
]

const MANUAL_SYMPTOM_MODE_BY_CLASS = new Map(
  MANUAL_SYMPTOM_MODE_OPTIONS.map(item => [item.classKey, item])
)

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function resolveManualSymptomMode(payload = {}) {
  const classKey = normalizeKey(
    payload.symptomClassKey ||
      payload.symptom_class_key ||
      payload.classKey ||
      payload.class_key
  )
  if (!classKey) {
    throw Object.assign(new Error('缺少 symptomClassKey'), { statusCode: 400 })
  }

  const option = MANUAL_SYMPTOM_MODE_BY_CLASS.get(classKey)
  if (!option) {
    throw Object.assign(new Error('不支持的症状模式'), { statusCode: 400 })
  }

  const requestedSymptomKey = normalizeKey(payload.symptomKey || payload.symptom_key)
  if (requestedSymptomKey && requestedSymptomKey !== option.symptomKey) {
    throw Object.assign(new Error('symptomKey 与 symptomClassKey 不匹配'), { statusCode: 400 })
  }

  return option
}

function buildManualObservedSymptoms(option = {}) {
  return [
    {
      symptomKey: option.symptomKey,
      symptomCn: option.symptomCn,
      confidence: 0.82,
      source: 'manual_symptom_mode',
      evidenceSource: 'manual_symptom_mode',
      classKey: option.classKey,
      classNameCn: option.classNameCn
    }
  ]
}

function buildManualObservedEvidenceSet(option = {}) {
  return [
    {
      observedEvidenceSetId: `manual_symptom_mode::${option.classKey}::${option.symptomKey}`,
      evidenceKey: option.symptomKey,
      evidenceType: 'symptom',
      symptomKey: option.symptomKey,
      symptomCn: option.symptomCn,
      confidence: 0.82,
      sourceType: 'manual_symptom_mode',
      currentStatus: 'active',
      targetLayer: 'observed_evidence_set',
      sourceRecordId: option.classKey,
      firstSeenStage: 'manual_symptom_mode',
      enteredRuntime: 1,
      enteredExplanation: 1,
      isKeyEvidence: 1,
      symptomClassKey: option.classKey,
      symptomClassNameCn: option.classNameCn
    }
  ]
}

async function persistQuestionStartRoundResult({
  sessionId,
  openid,
  plantContext,
  response,
  round,
  image,
  description,
  skipPersistence = false,
  clientContext = null
}) {
  if (skipPersistence) {return}
  const { persistRoundRuntime } = require('../services/round-runtime-persistence-service')
  await persistRoundRuntime({
    sessionId,
    openid,
    plantContext,
    response,
    round,
    image,
    description,
    clientContext
  })
}

async function runQuestionStartDiagnosis({
  payload,
  openid,
  skipPersistence = false
} = {}) {
  payload = payload || {}
  const timing = createReviewTimingLogger('diagnosis-question-start', {
    skipPersistence: Boolean(skipPersistence)
  })
  const clientContext = resolveRequestClientContext(
    {
      ...payload,
      clientContext: {
        ...(payload.clientContext && typeof payload.clientContext === 'object' ? payload.clientContext : {}),
        source: payload.clientContext?.source || 'DiagnosePopup',
        reviewSourceType: payload.clientContext?.reviewSourceType || 'manual_symptom_mode',
        visualInputVersion: payload.clientContext?.visualInputVersion || 'manual_symptom_mode_v1',
        structuredImageCount: 0
      }
    },
    null
  )
  const legacyPlantId = payload.plantId || null
  const plantCatalogId = payload.plantCatalogId || payload.catalogPlantId || null
  const userPlantId = payload.userPlantId || null
  const plantId = plantCatalogId || legacyPlantId
  if (!userPlantId && !plantId) {
    throw Object.assign(new Error('缺少 userPlantId 或 plantCatalogId'), { statusCode: 400 })
  }

  const option = resolveManualSymptomMode(payload)
  const sessionId = buildSessionId()
  timing.mark('request-ready', {
    hasPlantId: Boolean(plantId),
    hasUserPlantId: Boolean(userPlantId)
  })
  const observedSymptoms = buildManualObservedSymptoms(option)
  const observedEvidenceSet = buildManualObservedEvidenceSet(option)

  const plantContext = await resolvePlantContext({
    openid,
    plantId,
    userPlantId,
    preferCatalogPlantId: Boolean(plantCatalogId && !userPlantId)
  })
  timing.mark('plant-context-ready')

  let roundResult = null
  try {
    roundResult = await buildManualQuestionStartRoundResult({
      sessionId,
      plantContext,
      observedSymptoms,
      observedEvidenceSet,
      round: 1
    })
  } catch (error) {
    console.warn('diagnosis-question-start manual fast path failed, fallback to full round:', {
      sessionId,
      message: String(error?.message || error || '')
    })
    timing.mark('manual-fast-path-error-fallback')
  }
  if (!roundResult) {
    timing.mark('manual-fast-path-empty-fallback')
    const { runDiagnosisRound } = require('../domain/diagnosis-engine')
    roundResult = await runDiagnosisRound({
      openid,
      plantId,
      userPlantId,
      observedSymptoms,
      observedEvidenceSet,
      visualAggregateResult: null,
      answers: [],
      askedQuestionKeys: [],
      unknownCountByGroup: {},
      symptomClassState: null,
      preferCatalogPlantId: Boolean(plantCatalogId && !userPlantId),
      round: 1,
      stage: 'preliminary',
      sessionId,
      perfLogger: timing
    })
  } else {
    timing.mark('manual-fast-path-ready')
  }
  timing.mark('round-result-ready', {
    followUpCount: Array.isArray(roundResult?.followUps) ? roundResult.followUps.length : 0
  })

  await persistQuestionStartRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round: 1,
    image: '',
    description:
      payload.description ||
      `无图症状模式：${option.symptomCn}（${option.classNameCn}）`,
    skipPersistence,
    clientContext
  })
  timing.finish({
    hasFollowUps: Array.isArray(roundResult?.followUps) && roundResult.followUps.length > 0,
    hasFinalResult: Boolean(roundResult?.topProblem || roundResult?.finalResult)
  })

  return {
    sessionId,
    userPlantId: roundResult?.plantContext?.userPlantId || userPlantId || null,
    plantId:
      roundResult?.plantContext?.userPlantId ||
      roundResult?.plantContext?.plantId ||
      plantId ||
      '',
    plantCatalogId: roundResult?.plantContext?.plantId || plantId || null,
    plantIdentityId: roundResult?.plantContext?.plantIdentityId || '',
    latestVisualCallBatchId: null,
    diagnosisText: '',
    response: roundResult
  }
}

module.exports = {
  MANUAL_SYMPTOM_MODE_OPTIONS,
  resolveManualSymptomMode,
  runQuestionStartDiagnosis,
  _test: manualQuestionStartFastPathTest
}
