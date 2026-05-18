'use strict'

const {
  isWeakBroadStructuralObservedEvidence
} = require('./structural-visual-evidence')
const {
  QUESTION_TARGET_DIMENSIONS: _QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension,
  isGenericObservedProbeDirectEvidenceDimension
} = require('./question-target-dimension')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

const CONTEXT_REQUIRED_PROBLEM_GUARDS = {
  root_rot: {
    preferredQuestionKeys: [
      'q_root_rot_bad_smell',
      'q_root_rot_wet_soil_wilt',
      'q_root_rot_black_roots',
      'q_root_rot_mushy_roots'
    ],
    corroboratingSymptomKeys: [
      'bad_root_smell',
      'roots_black',
      'roots_mushy',
      'wilting_wet_soil'
    ],
    maxForcedQuestions: 2,
    advice:
      '根腐属于强上下文依赖型问题，至少需要补齐“湿土仍萎 / 异味 / 黑根 / 糊根”这类根区强事实中的一类。'
  },
  crown_rot: {
    preferredQuestionKeys: [
      'q_blackened_stem_base_bad_root_smell',
      'q_stem_collapse_poor_drainage'
    ],
    corroboratingSymptomKeys: [
      'bad_root_smell',
      'wilting_wet_soil'
    ],
    maxForcedQuestions: 2,
    advice:
      '茎腐/冠腐不能只凭泛黄叶、排水差或一般进展性判断，需要补齐异味、湿土仍萎或基部强恶化事实。'
  },
  soft_rot: {
    preferredQuestionKeys: [
      'q_blackened_stem_base_bad_root_smell',
      'q_stem_collapse_poor_drainage'
    ],
    corroboratingSymptomKeys: [
      'bad_root_smell',
      'wilting_wet_soil'
    ],
    maxForcedQuestions: 2,
    advice:
      '软腐属于强上下文依赖型问题，至少需要补齐湿土仍萎、异味或基部湿软塌陷等强事实中的一类。'
  },
  overwatering: {
    preferredQuestionKeys: ['q_gnat_soil_stays_wet'],
    corroboratingSymptomKeys: [
      'poor_drainage',
      'wilting_wet_soil',
      'watering_excess_background'
    ],
    maxForcedQuestions: 1,
    advice:
      '浇水过多不能只凭黄叶直出，至少需要补齐“盆土长期偏湿/排水不良/湿土仍萎”等过湿背景事实。'
  },
  underwatering: {
    preferredQuestionKeys: ['q_leaf_yellowing_watering_background'],
    corroboratingSymptomKeys: [
      'watering_deficit_background',
      'wilting_dry_soil',
      'dry_root_ball',
      'leaf_curl',
      'crispy_leaf_edges'
    ],
    maxForcedQuestions: 1,
    advice:
      '缺水不能只凭黄叶直出，至少需要补齐“经常干透后才浇/干土萎蔫/叶片卷曲干脆”等供水不足事实。'
  },
  low_light: {
    preferredQuestionKeys: ['q_leaf_yellowing_light_background'],
    corroboratingSymptomKeys: [
      'low_light_context',
      'leggy_growth',
      'weak_new_growth'
    ],
    maxForcedQuestions: 1,
    advice:
      '光照不足不能只凭黄叶直出，至少需要补齐“近期位置更阴/长期弱光/徒长或新生长变弱”等光照背景事实。'
  },
  sunburn: {
    preferredQuestionKeys: ['q_leaf_yellowing_light_background', 'q_leaf_bleaching_sunburn_patch'],
    corroboratingSymptomKeys: [
      'recent_direct_sun_increase',
      'sunburn_patch',
      'leaf_bleaching',
      'leaf_scorch'
    ],
    maxForcedQuestions: 1,
    advice:
      '日灼不能只凭黄叶直出，至少需要补齐“近期强光直晒增加/漂白或灼伤斑”等强光背景事实。'
  },
  nitrogen_deficiency: {
    preferredQuestionKeys: [
      'q_leaf_yellowing_fertilization_background',
      'q_leaf_yellowing_new_growth_bias'
    ],
    corroboratingSymptomKeys: [
      'fertilization_gap',
      'yellow_lower_leaves'
    ],
    maxForcedQuestions: 1,
    advice:
      '氮缺乏不能只凭泛黄叶直出，至少需要补齐“长期缺肥/老叶先黄/整体均匀黄化”等营养背景事实。'
  },
  iron_deficiency: {
    preferredQuestionKeys: [
      'q_leaf_yellowing_fertilization_background',
      'q_leaf_yellowing_new_growth_bias'
    ],
    corroboratingSymptomKeys: [
      'fertilization_gap',
      'yellow_new_leaves',
      'interveinal_chlorosis'
    ],
    maxForcedQuestions: 1,
    advice:
      '铁缺乏不能只凭泛黄叶直出，至少需要补齐“新叶更黄/叶脉间失绿/长期缺肥或介质问题”等营养背景事实。'
  },
  nutrient_deficiency: {
    preferredQuestionKeys: [
      'q_leaf_yellowing_fertilization_background',
      'q_leaf_yellowing_new_growth_bias'
    ],
    corroboratingSymptomKeys: [
      'fertilization_gap',
      'yellow_new_leaves',
      'yellow_lower_leaves'
    ],
    maxForcedQuestions: 1,
    advice:
      '营养不足不能只凭泛黄叶直出，至少需要补齐“长期缺肥/新叶或老叶黄化模式/整体均匀黄化”等营养背景事实。'
  },
  root_stress: {
    preferredQuestionKeys: [
      'q_leaf_yellowing_watering_background',
      'q_root_rot_bad_smell',
      'q_root_rot_wet_soil_wilt'
    ],
    corroboratingSymptomKeys: [
      'poor_drainage',
      'watering_excess_background',
      'watering_deficit_background',
      'wilting_wet_soil',
      'roots_black',
      'roots_mushy',
      'bad_root_smell'
    ],
    maxForcedQuestions: 1,
    advice:
      '根系压力不能只凭黄叶直出，至少需要补齐浇水异常、排水差、湿土仍萎或根区异常等事实。'
  },
  spider_mites: {
    preferredQuestionKeys: [
      'q_spider_webbing_visible',
      'q_observed_probe__yellow_speckling__pest_trace_type',
      'q_observed_probe__stippling__pest_trace_type',
      'q_observed_probe__fine_webbing__pest_trace_type'
    ],
    corroboratingSymptomKeys: ['fine_webbing'],
    maxForcedQuestions: 1,
    advice:
      '红蜘蛛不能只凭小黄点直出，至少需要补齐蛛网、叶背更明显或其他高特异虫害事实中的一类。'
  },
  whiteflies: {
    preferredQuestionKeys: ['q_sticky_honeydew_confirm'],
    corroboratingSymptomKeys: ['white_flies', 'sticky_honeydew', 'sooty_mold', 'black_mold_growth'],
    maxForcedQuestions: 1,
    advice:
      '白粉虱不能只凭失绿斑驳直出，至少需要补齐蜜露、煤污或白色小飞虫等强虫害事实。'
  },
  aphids: {
    preferredQuestionKeys: ['q_sticky_honeydew_confirm'],
    corroboratingSymptomKeys: ['aphids_visible', 'sticky_honeydew', 'sooty_mold', 'black_mold_growth'],
    maxForcedQuestions: 1,
    advice:
      '蚜虫不能只凭泛化黄点直出，至少需要补齐虫体、蜜露或煤污等刺吸式害虫事实。'
  },
  scale_insects: {
    preferredQuestionKeys: ['q_sticky_honeydew_confirm'],
    corroboratingSymptomKeys: ['scale_shells', 'sticky_honeydew', 'sooty_mold', 'black_mold_growth'],
    maxForcedQuestions: 1,
    advice:
      '介壳虫不能只凭泛化黄点直出，至少需要补齐壳状虫体、蜜露或煤污等事实。'
  },
  mealybugs: {
    preferredQuestionKeys: ['q_sticky_honeydew_confirm'],
    corroboratingSymptomKeys: ['sticky_honeydew', 'sooty_mold', 'black_mold_growth'],
    maxForcedQuestions: 1,
    advice:
      '粉蚧不能只凭模糊白点或泛化失绿直出，至少需要补齐蜜露、煤污或其他刺吸式害虫高价值事实。'
  },
  thrips: {
    preferredQuestionKeys: [
      'q_thrips_silver_streaks',
      'q_observed_probe__yellow_speckling__pest_trace_type',
      'q_observed_probe__stippling__pest_trace_type',
      'q_observed_probe__silver_streaks__pest_trace_type'
    ],
    corroboratingSymptomKeys: ['silver_streaks'],
    maxForcedQuestions: 1,
    advice:
      '蓟马不能只凭点状失绿直出，至少需要补齐银化条纹/擦伤样痕迹等更特异的取食事实。'
  },
  sooty_mold_associated_pests: {
    preferredQuestionKeys: ['q_sticky_honeydew_confirm', 'q_sooty_mold_confirm'],
    corroboratingSymptomKeys: [
      'sticky_honeydew',
      'sooty_mold',
      'black_mold_growth',
      'aphids_visible',
      'white_flies',
      'scale_shells'
    ],
    maxForcedQuestions: 1,
    advice:
      '煤污相关虫害不能只凭表面泛黑直出，至少需要补齐蜜露、煤污层或对应刺吸式害虫事实。'
  },
  chewing_insects: {
    preferredQuestionKeys: [
      'q_observed_probe__chewed_edges__structural_cause',
      'q_observed_probe__holes_in_leaf__structural_cause',
      'q_observed_probe__skeletonized_leaves__structural_cause',
      'q_chewed_edges_confirm',
      'q_holes_in_leaf_confirm'
    ],
    corroboratingSymptomKeys: ['chewed_edges', 'holes_in_leaf', 'skeletonized_leaves'],
    maxForcedQuestions: 1,
    advice:
      '咀嚼型害虫不能只凭孔洞/缺口直出，至少需要补齐虫体、虫粪、黏液痕、新鲜缺口等活动痕迹或明确用户分流答案。'
  },
  caterpillars: {
    preferredQuestionKeys: [
      'q_observed_probe__chewed_edges__structural_cause',
      'q_observed_probe__holes_in_leaf__structural_cause',
      'q_observed_probe__skeletonized_leaves__structural_cause',
      'q_chewed_edges_confirm',
      'q_holes_in_leaf_confirm'
    ],
    corroboratingSymptomKeys: ['chewed_edges', 'holes_in_leaf', 'skeletonized_leaves'],
    maxForcedQuestions: 1,
    advice:
      '毛虫路径不能只凭孔洞/缺口直出，至少需要补齐虫体、虫粪、新鲜啃食边缘或明确用户分流答案。'
  },
  beetles: {
    preferredQuestionKeys: [
      'q_observed_probe__chewed_edges__structural_cause',
      'q_observed_probe__holes_in_leaf__structural_cause',
      'q_observed_probe__skeletonized_leaves__structural_cause',
      'q_chewed_edges_confirm',
      'q_skeletonized_leaves_confirm'
    ],
    corroboratingSymptomKeys: ['chewed_edges', 'holes_in_leaf', 'skeletonized_leaves'],
    maxForcedQuestions: 1,
    advice:
      '甲虫路径不能只凭孔洞/缺口直出，至少需要补齐虫体、新鲜啃食边缘、骨架化进展或明确用户分流答案。'
  },
  snails_slugs: {
    preferredQuestionKeys: [
      'q_observed_probe__holes_in_leaf__structural_cause',
      'q_observed_probe__chewed_edges__structural_cause',
      'q_holes_in_leaf_confirm'
    ],
    corroboratingSymptomKeys: ['holes_in_leaf', 'chewed_edges'],
    maxForcedQuestions: 1,
    advice:
      '蜗牛/蛞蝓路径不能只凭孔洞/缺口直出，至少需要补齐黏液痕、夜间活动线索、新鲜缺口或明确用户分流答案。'
  },
  leaf_miners: {
    preferredQuestionKeys: ['q_tunnels_in_leaf_confirm'],
    corroboratingSymptomKeys: ['tunnels_in_leaf'],
    maxForcedQuestions: 1,
    advice:
      '潜叶虫路径至少需要补齐叶内潜道这一类高特异事实，不能只凭普通斑块或褪色直出。'
  }
}

function getContextRequiredProblemGuard(problemKey = '') {
  return CONTEXT_REQUIRED_PROBLEM_GUARDS[normalizeText(problemKey)] || null
}

function collectActiveObservedSymptomKeys(observedEvidenceSet = []) {
  return new Set(
    (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
      .filter(
        item =>
          normalizeText(item?.currentStatus || item?.current_status || 'active', 'active') ===
            'active' &&
          !isWeakBroadStructuralObservedEvidence(item)
      )
      .map(item => normalizeText(item?.symptomKey || item?.symptom_key || ''))
      .filter(Boolean)
  )
}

function collectDirectPositiveAnswerContextKeys(answerEffects = [], problemKey = '') {
  const normalizedProblemKey = normalizeText(problemKey)
  if (!normalizedProblemKey) {return []}

  return (Array.isArray(answerEffects) ? answerEffects : [])
    .filter(item =>
      normalizeText(item?.effectType) === 'direct_problem_positive' &&
      normalizeText(item?.problemKey) === normalizedProblemKey &&
      Number(item?.value || 0) > 0 &&
      !isGenericObservedProbeDirectEvidenceDimension(
        normalizeQuestionTargetDimension(item?.targetDimension || '', '')
      ) &&
      !item?.isGenericObservedProbeDirectPositive
    )
    .map(item => `answer:${normalizeText(item?.questionKey)}:${normalizeText(item?.optionKey)}`)
    .filter(item => item !== 'answer::')
}

function collectDirectNegativeAnswerContextKeys(answerEffects = [], problemKey = '') {
  const normalizedProblemKey = normalizeText(problemKey)
  if (!normalizedProblemKey) {return []}

  return (Array.isArray(answerEffects) ? answerEffects : [])
    .filter(item =>
      normalizeText(item?.effectType) === 'direct_problem_negative' &&
      normalizeText(item?.problemKey) === normalizedProblemKey &&
      Number(item?.value || 0) < 0
    )
    .map(item => `answer:${normalizeText(item?.questionKey)}:${normalizeText(item?.optionKey)}`)
    .filter(item => item !== 'answer::')
}

function evaluateContextRequiredProblemGuard({
  candidateOutcomes = [],
  observedEvidenceSet = [],
  answerEffects = []
} = {}) {
  const sourceCandidateOutcomes = Array.isArray(candidateOutcomes) ? candidateOutcomes : []
  const topProblemKey = normalizeText(sourceCandidateOutcomes?.[0]?.problemKey || '')
  const guard = getContextRequiredProblemGuard(topProblemKey)
  if (!guard) {
    return {
      applies: false,
      problemKey: topProblemKey,
      hasRequiredContext: true,
      matchedSymptomKeys: [],
      matchedAnswerContextKeys: [],
      preferredQuestionKeys: [],
      maxForcedQuestions: 0,
      advice: ''
    }
  }

  const activeObservedSymptomKeys = collectActiveObservedSymptomKeys(observedEvidenceSet)
  const matchedSymptomKeys = (Array.isArray(guard.corroboratingSymptomKeys)
    ? guard.corroboratingSymptomKeys
    : []
  ).filter(symptomKey => activeObservedSymptomKeys.has(normalizeText(symptomKey)))
  const matchedAnswerContextKeys = collectDirectPositiveAnswerContextKeys(answerEffects, topProblemKey)
  const matchedNegativeAnswerContextKeys = collectDirectNegativeAnswerContextKeys(answerEffects, topProblemKey)
  const blockedByDirectNegativeAnswer =
    matchedNegativeAnswerContextKeys.length > 0 && matchedAnswerContextKeys.length === 0

  return {
    applies: true,
    problemKey: topProblemKey,
    hasRequiredContext:
      !blockedByDirectNegativeAnswer &&
      (matchedSymptomKeys.length > 0 || matchedAnswerContextKeys.length > 0),
    matchedSymptomKeys,
    matchedAnswerContextKeys,
    matchedNegativeAnswerContextKeys,
    blockedByDirectNegativeAnswer,
    preferredQuestionKeys: Array.isArray(guard.preferredQuestionKeys)
      ? guard.preferredQuestionKeys.map(item => normalizeText(item)).filter(Boolean)
      : [],
    maxForcedQuestions: Math.max(1, Number(guard.maxForcedQuestions || 1)),
    advice: normalizeText(guard.advice)
  }
}

module.exports = {
  CONTEXT_REQUIRED_PROBLEM_GUARDS,
  getContextRequiredProblemGuard,
  evaluateContextRequiredProblemGuard
}
