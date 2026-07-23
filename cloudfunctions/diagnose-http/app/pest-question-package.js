'use strict'

const {
  LOCKED_SPECIFIC_PEST_MODES,
  evidenceGroupForKey
} = require('../domain/diagnosis-mode-router')

const PEST_MODE_LABELS = Object.freeze({
  spider_mite: '红蜘蛛（叶螨）',
  thrips: '蓟马',
  whitefly: '白色小飞虫（白粉虱）',
  aphid: '成群小软虫（蚜虫）',
  scale_insect: '小硬壳虫（介壳虫）',
  mealybug: '白色棉粉虫（粉蚧）',
  leaf_miner: '叶子里的潜道虫',
  fungus_gnat: '盆土小黑飞（蕈蚊）'
})

const PEST_MODE_CLASS_KEYS = Object.freeze({
  spider_mite: 'mite_damage_mode',
  thrips: 'thrips_damage_mode',
  whitefly: 'sap_sucking_pest_mode',
  aphid: 'sap_sucking_pest_mode',
  scale_insect: 'sap_sucking_pest_mode',
  mealybug: 'sap_sucking_pest_mode',
  leaf_miner: 'leaf_miner_mode',
  fungus_gnat: 'soil_moisture_pest_mode'
})

const SAP_SUCKING_MODES = Object.freeze(['whitefly', 'aphid', 'scale_insect', 'mealybug'])

const QUESTION_BLUEPRINTS = Object.freeze([
  {
    topic: 'spider_mite_webbing',
    modes: ['spider_mite'],
    evidenceKeys: ['fine_webbing'],
    text: '叶背或叶柄附近有没有很细的蛛网状丝线？'
  },
  {
    topic: 'spider_mite_dots',
    modes: ['spider_mite'],
    evidenceKeys: ['yellow_speckling'],
    text: '叶面或叶背有没有白黄小点，旁边能看到很小的移动点？'
  },
  {
    topic: 'mealybug_colony',
    modes: ['mealybug'],
    evidenceKeys: ['visible_mealybug_colony'],
    text: '叶柄、叶腋或茎上有没有一团团白色棉絮状虫体？'
  },
  {
    topic: 'scale_shells',
    modes: ['scale_insect'],
    evidenceKeys: ['scale_shells'],
    text: '茎或叶背有没有固定不动、像小壳或小凸点一样的虫体？'
  },
  {
    topic: 'whitefly_adults',
    modes: ['whitefly'],
    evidenceKeys: ['white_flies'],
    text: '在确认安全的前提下，轻碰叶片时有没有白色小飞虫飞起？',
    riskLevel: 'medium',
    riskNotice: '需要轻碰叶片；如果植株脆弱、过敏或不方便操作，请直接跳过。',
    requiresExplicitConsent: true,
    safetyInstructions: ['先确认手部安全', '只轻碰叶片边缘', '不方便操作时请选择跳过']
  },
  {
    topic: 'whitefly_nymphs',
    modes: ['whitefly'],
    evidenceKeys: ['fixed_oval_nymphs'],
    text: '叶背有没有固定的小白点或椭圆虫体？'
  },
  {
    topic: 'aphid_clusters',
    modes: ['aphid'],
    evidenceKeys: ['aphids_visible'],
    text: '嫩梢、新叶或花苞附近有没有成群的小虫？'
  },
  {
    topic: 'thrips_silver_scarring',
    modes: ['thrips'],
    evidenceKeys: ['silver_scarring'],
    text: '叶面有没有发白、发灰，像被擦过的条斑？'
  },
  {
    topic: 'thrips_black_spots',
    modes: ['thrips'],
    evidenceKeys: ['black_fecal_spots', 'thrips_visible'],
    text: '这些条斑附近有没有细小黑点，或能看到细长的小虫？'
  },
  {
    topic: 'leaf_miner_tracks',
    modes: ['leaf_miner'],
    evidenceKeys: ['tunnels_in_leaf'],
    text: '叶片里面有没有弯弯绕绕的浅色线条或块状潜道？'
  },
  {
    topic: 'fungus_gnat_soil',
    modes: ['fungus_gnat'],
    evidenceKeys: ['small_flies_soil'],
    text: '小飞虫是否主要围着盆土表面或盆边活动，而不是停在叶片上？'
  },
  {
    topic: 'fungus_gnat_wet_soil',
    modes: ['fungus_gnat'],
    evidenceKeys: ['wet_soil_surface'],
    text: '盆土表面是否长期偏湿，或者能看到潮湿表土附近有小飞虫？'
  },
  {
    topic: 'surface_residue',
    modes: SAP_SUCKING_MODES,
    evidenceKeys: ['surface_glossy_residue'],
    text: '叶片或枝条表面有没有发亮、发黏，像沾了糖水一样的透明痕迹？',
    options: 'surface_residue'
  },
  {
    topic: 'sooty_mold',
    modes: SAP_SUCKING_MODES,
    evidenceKeys: ['sooty_mold'],
    text: '叶面像蒙了一层黑灰或黑膜吗？'
  }
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeMode(value = '') {
  return normalizeText(value).toLowerCase()
}

function uniqueModes(modes = []) {
  return Array.from(
    new Set((Array.isArray(modes) ? modes : []).map(normalizeMode).filter(Boolean))
  ).filter(mode => LOCKED_SPECIFIC_PEST_MODES.includes(mode))
}

function normalizeEvidenceKey(item = {}) {
  return normalizeText(
    item?.evidenceKey || item?.evidence_key || item?.symptomKey || ''
  ).toLowerCase()
}

function collectLockedEvidence(hiddenPrefilledEvidence = []) {
  const keys = new Set()
  const groups = new Set()
  const modes = new Set()
  for (const item of Array.isArray(hiddenPrefilledEvidence) ? hiddenPrefilledEvidence : []) {
    const key = normalizeEvidenceKey(item)
    if (key) {
      keys.add(key)
      groups.add(evidenceGroupForKey(key))
    }
    const mode = normalizeMode(item?.diagnosisMode || item?.diagnosis_mode || item?.modeKey || '')
    if (LOCKED_SPECIFIC_PEST_MODES.includes(mode) && item?.routeEvidenceRole === 'direct_match') {
      modes.add(mode)
    }
  }
  return { keys, groups, modes }
}

function buildOption({ optionKey, text, modes = [], value = 0, evidenceKeys = [] }) {
  return {
    optionId: optionKey,
    optionKey,
    text,
    isDefault: value === 0,
    answerValue: value === 0 ? 'unknown' : value > 0 ? 'positive' : 'negative',
    mapsToModes: uniqueModes(modes),
    mapsToEvidenceKeys: evidenceKeys,
    value,
    associationStrength: Math.abs(value)
  }
}

function buildDefaultOptions(blueprint, targetModes) {
  return [
    buildOption({
      optionKey: `${blueprint.topic}_yes`,
      text: '有，能清楚看到这种痕迹',
      modes: targetModes,
      value: 1,
      evidenceKeys: blueprint.evidenceKeys
    }),
    buildOption({
      optionKey: `${blueprint.topic}_no`,
      text: '没有看到',
      modes: targetModes,
      value: -1,
      evidenceKeys: blueprint.evidenceKeys
    }),
    buildOption({ optionKey: 'unknown', text: '不方便确认 / 看不清' })
  ]
}

function buildSurfaceResidueOptions(blueprint, targetModes) {
  return [
    buildOption({
      optionKey: 'surface_residue_sticky_yes',
      text: '有，摸起来或看起来明显发黏',
      modes: targetModes,
      value: 1,
      evidenceKeys: ['surface_glossy_residue']
    }),
    buildOption({ optionKey: 'surface_residue_unsure', text: '只有发亮的痕迹，不确定是否发黏' }),
    buildOption({
      optionKey: 'surface_residue_no',
      text: '没有看到',
      modes: targetModes,
      value: -1,
      evidenceKeys: blueprint.evidenceKeys
    }),
    buildOption({ optionKey: 'unknown', text: '不方便确认 / 看不清' })
  ]
}

function buildQuestion(blueprint, candidateModes) {
  const targetModes = uniqueModes(blueprint.modes).filter(mode => candidateModes.includes(mode))
  return {
    questionKey: `q_specific_pest__${blueprint.topic}`,
    selectionSource: 'dynamic_specific_pest_package',
    routeKey: 'specific_pest_visual',
    targetSymptomKey: targetModes[0] || 'specific_pest_visual',
    questionGroupKey: blueprint.topic,
    packageTopic: blueprint.topic,
    packageSection: 'specific_pest_package',
    defaultOptionKey: 'unknown',
    defaultOptionId: 'unknown',
    routePackageRole: 'specific_pest_confirmation',
    packageEffect: 'route_outcome',
    type: 'single_choice',
    text: blueprint.text,
    questionText: blueprint.text,
    helpText: '只按现在能看到的痕迹选择；看不清或不方便翻看就跳过。',
    riskLevel: blueprint.riskLevel || 'low',
    riskNotice: blueprint.riskNotice || '不需要处理植物，只需要观察照片或轻轻查看叶片表面。',
    safetyInstructions: blueprint.safetyInstructions || [
      '不要喷药或剪叶',
      '不方便翻看叶背时请选择跳过'
    ],
    requiresExplicitConsent: Boolean(blueprint.requiresExplicitConsent),
    skipOptionEnabled: true,
    skipAnswerValue: 'unknown',
    candidateModes: targetModes,
    requiredEvidenceKeys: blueprint.evidenceKeys,
    options:
      blueprint.options === 'surface_residue'
        ? buildSurfaceResidueOptions(blueprint, targetModes)
        : buildDefaultOptions(blueprint, targetModes),
    whyThisQuestion: '补齐图片尚未确定的不同维度线索，避免把普通黄化或萎蔫误判成虫害。'
  }
}

function shouldSuppressBlueprint(blueprint, lockedKeys) {
  return blueprint.evidenceKeys.some(key => lockedKeys.has(key))
}

function hasLockedEvidenceGroup(blueprint, lockedGroups) {
  return blueprint.evidenceKeys.some(key => lockedGroups.has(evidenceGroupForKey(key)))
}

function shouldSuppressAuxiliaryBlueprint(blueprint, modes = [], lockedGroups = new Set()) {
  return (
    modes.length === 1 &&
    modes[0] === 'whitefly' &&
    ['surface_residue', 'sooty_mold'].includes(blueprint.topic) &&
    (lockedGroups.has(evidenceGroupForKey('white_flies')) ||
      lockedGroups.has(evidenceGroupForKey('fixed_oval_nymphs')))
  )
}

function selectDistinctModeQuestions(questions = [], modes = [], maxQuestions = 2) {
  const selected = []
  const coveredModes = new Set()

  for (const mode of modes) {
    if (selected.length >= maxQuestions) {
      break
    }
    if (coveredModes.has(mode)) {
      continue
    }
    const question = questions.find(
      item => !selected.includes(item) && item.candidateModes.includes(mode)
    )
    if (!question) {
      continue
    }
    selected.push(question)
    question.candidateModes.forEach(item => coveredModes.add(item))
  }

  for (const question of questions) {
    if (selected.length >= maxQuestions) {
      break
    }
    if (!selected.includes(question)) {
      selected.push(question)
    }
  }

  return selected
}

function buildSpecificPestQuestionPackage({
  candidateModes = [],
  hiddenPrefilledEvidence = []
} = {}) {
  const modes = uniqueModes(candidateModes)
  if (!modes.length) {
    return null
  }
  const locked = collectLockedEvidence(hiddenPrefilledEvidence)
  const eligibleQuestions = QUESTION_BLUEPRINTS.filter(
    blueprint =>
      blueprint.modes.some(mode => modes.includes(mode)) &&
      !blueprint.modes.some(mode => locked.modes.has(mode)) &&
      !shouldSuppressBlueprint(blueprint, locked.keys) &&
      !hasLockedEvidenceGroup(blueprint, locked.groups) &&
      !shouldSuppressAuxiliaryBlueprint(blueprint, modes, locked.groups)
  )
    .map(blueprint => buildQuestion(blueprint, modes))
    .filter(question => question.candidateModes.length)
  const questions = selectDistinctModeQuestions(eligibleQuestions, modes, 2)
  return {
    mode: 'specific_pest_visual',
    route: 'specific_pest_visual',
    sourceMode: 'visual_specific_pest',
    questionCount: questions.length,
    packageTopics: questions.map(item => item.packageTopic),
    answerSubmitMode: 'package',
    questionDisplayMode: 'package',
    fixedQuestionPackage: false,
    dynamicQuestionPackage: true,
    candidateModes: modes,
    hiddenPrefilledEvidence: Array.isArray(hiddenPrefilledEvidence) ? hiddenPrefilledEvidence : [],
    outcomePolicy: { allowMultipleOutcomes: true, preferSingleOutcome: false },
    packageQuestions: questions
  }
}

function buildSpecificPestObservedEvidenceSet({
  candidateModes = [],
  sourceRecordId = 'specific_pest_visual'
} = {}) {
  return uniqueModes(candidateModes).map(mode => ({
    observedEvidenceSetId: `specific_pest_visual::${mode}`,
    evidenceKey: mode,
    evidenceType: 'diagnosis_mode',
    symptomKey: mode,
    symptomCn: PEST_MODE_LABELS[mode] || mode,
    confidence: 0.82,
    sourceType: 'visual_mode_router',
    currentStatus: 'active',
    targetLayer: 'observed_evidence_set',
    sourceRecordId,
    firstSeenStage: 'visual_specific_pest',
    enteredRuntime: 1,
    enteredExplanation: 1,
    isKeyEvidence: 1,
    diagnosisMode: mode,
    symptomClassKey: PEST_MODE_CLASS_KEYS[mode] || ''
  }))
}

module.exports = {
  PEST_MODE_LABELS,
  PEST_MODE_CLASS_KEYS,
  QUESTION_BLUEPRINTS,
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet,
  _test: { uniqueModes, collectLockedEvidence, buildQuestion, selectDistinctModeQuestions }
}
