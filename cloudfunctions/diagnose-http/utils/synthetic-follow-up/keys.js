'use strict'

const SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX = 'q_visual_candidate_confirm__'
const SYNTHETIC_VISUAL_CANDIDATE_GROUP_PREFIX = 'visual_candidate_confirm__'
const SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX = 'q_observed_probe__'
const SYNTHETIC_OBSERVED_PROBE_GROUP_PREFIX = 'observed_probe__'

const CARE_CONTEXT_OPTION_COPY = {
  wateringFrequency: {
    often_wet: '近 2 周 2 次以上（偏多）',
    normal_or_stable: '近 2 周 1-2 次（相对稳定）',
    often_dry: '近 2 周 0 次（偏少）',
    unknown: '说不清/没留意'
  },
  lightContext: {
    stronger_direct_light: '全日光，或每天直射很多',
    no_clear_change: '散光为主，最近基本没变',
    weaker_light: '全阴、离窗较远，或最近更暗',
    unknown: '说不清/没留意'
  },
  fertilizationGrowth: {
    low_or_no_fertilizer: '近 1 个月 0 次（很少施肥）',
    normal_light_fertilizer: '近 1 个月 1-2 次（偏稳）',
    recent_heavy_fertilizer_or_repot: '近 1 个月 2 次以上（重肥/换盆换土）',
    unknown: '说不清/没留意'
  },
  airflowHumidity: {
    stagnant_humid: '通风弱，环境偏闷或偏潮',
    dry_or_drafty: '空气偏干，或风口/空调直吹',
    stable_airflow: '通风和湿度基本稳定',
    unknown: '说不清/没留意'
  }
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function buildVisualCandidateQuestionGroupKey(symptomKey = '') {
  return `${SYNTHETIC_VISUAL_CANDIDATE_GROUP_PREFIX}${normalizeText(symptomKey)}`
}

function buildSyntheticVisualCandidateQuestionKey(symptomKey = '') {
  return `${SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX}${normalizeText(symptomKey)}`
}

function isSyntheticVisualCandidateQuestionKey(questionKey = '') {
  return normalizeText(questionKey).startsWith(SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX)
}

function buildObservedProbeQuestionGroupKey(symptomKey = '', targetDimension = '') {
  return `${SYNTHETIC_OBSERVED_PROBE_GROUP_PREFIX}${normalizeText(symptomKey)}__${normalizeText(targetDimension)}`
}

function buildSyntheticObservedProbeQuestionKey(symptomKey = '', targetDimension = '') {
  return `${SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX}${normalizeText(symptomKey)}__${normalizeText(targetDimension)}`
}

function isSyntheticObservedProbeQuestionKey(questionKey = '') {
  return normalizeText(questionKey).startsWith(SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX)
}

function parseSyntheticObservedProbeQuestionKey(questionKey = '') {
  const normalizedQuestionKey = normalizeText(questionKey)
  if (!isSyntheticObservedProbeQuestionKey(normalizedQuestionKey)) {
    return { symptomKey: '', targetDimension: '' }
  }

  const body = normalizedQuestionKey.slice(SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX.length)
  const [symptomKey, targetDimension] = body.split('__')

  return {
    symptomKey: normalizeText(symptomKey),
    targetDimension: normalizeText(targetDimension)
  }
}

module.exports = {
  SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX,
  SYNTHETIC_VISUAL_CANDIDATE_GROUP_PREFIX,
  SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX,
  SYNTHETIC_OBSERVED_PROBE_GROUP_PREFIX,
  CARE_CONTEXT_OPTION_COPY,
  normalizeText,
  buildVisualCandidateQuestionGroupKey,
  buildSyntheticVisualCandidateQuestionKey,
  isSyntheticVisualCandidateQuestionKey,
  buildObservedProbeQuestionGroupKey,
  buildSyntheticObservedProbeQuestionKey,
  isSyntheticObservedProbeQuestionKey,
  parseSyntheticObservedProbeQuestionKey
}
