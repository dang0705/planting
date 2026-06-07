'use strict'

const { toOptionId, toQuestionId } = require('../mappers/public-id-mapper')

const WILTING_DROOP_PACKAGE_MODE = 'wilting_droop'
const WILTING_DROOP_PACKAGE_SOURCE_MODE = 'manual_wilting_droop_route_package'
const WILTING_DROOP_PACKAGE_QUESTION_COUNT = 5
const WILTING_DROOP_CLASS_KEY = 'wilting_droop_mode'

const WILTING_DROOP_STATIC_ITEM = Object.freeze({
  symptomKey: 'wilting_droop',
  symptomCn: '枯萎发蔫',
  displayTextCn: '枯萎 / 发蔫',
  locationKey: 'whole_plant',
  patternKey: 'wilting_droop',
  classKey: WILTING_DROOP_CLASS_KEY,
  classNameCn: '枯萎 / 发蔫模式'
})

const RAW_WILTING_DROOP_PACKAGE_QUESTIONS = Object.freeze([
  {
    questionKey: 'q_wilting_droop__watering_frequency_context',
    targetDimension: 'watering_frequency_context',
    questionGroupKey: 'wilting_droop_water_behavior',
    uiVariant: 'care_behavior_timeline',
    renderMode: 'care_behavior_timeline',
    questionRole: 'route_package_water_behavior',
    questionText: '请您选择在过去的10天内，哪几天浇了水？',
    helpText: '系统会结合天气和浇水记录判断偏干、偏湿或基本合理。',
    defaultOptionKey: 'care_behavior_timeline',
    options: [
      { optionKey: 'care_behavior_timeline', text: '养护记录已提供', isDefault: true },
      { optionKey: 'unknown', text: '不确定 / 记不清' }
    ]
  },
  {
    questionKey: 'q_wilting_droop__shape',
    targetDimension: 'wilting_shape',
    questionGroupKey: 'wilting_droop_shape',
    questionRole: 'route_package_shape',
    questionText: '你现在看到的状态更接近哪一种？',
    options: [
      { optionKey: 'whole_plant_droop', text: '整株软塌下垂' },
      { optionKey: 'local_branch_leaf', text: '局部叶片 / 枝条发蔫' },
      { optionKey: 'new_shoots', text: '新叶嫩梢为主' },
      { optionKey: 'dry_crispy_curled_burnt_edge', text: '叶片干脆、卷曲、焦边' },
      { optionKey: 'unknown', text: '不确定', isDefault: true }
    ]
  },
  {
    questionKey: 'q_wilting_droop__rhythm_environment',
    targetDimension: 'wilting_rhythm_environment',
    questionGroupKey: 'wilting_droop_rhythm_environment',
    questionRole: 'route_package_environment',
    questionText: '发蔫通常在什么情况下更明显？',
    options: [
      { optionKey: 'daytime_recovers', text: '白天明显，晚上 / 早晨缓解' },
      { optionKey: 'strong_window_west_heat', text: '靠近强光窗边、西晒、高温玻璃后' },
      { optionKey: 'ac_heater_fan_direct', text: '空调、暖气、风扇直吹' },
      { optionKey: 'all_day_wilt', text: '全天都蔫' },
      { optionKey: 'unknown', text: '不确定', isDefault: true }
    ]
  },
  {
    questionKey: 'q_wilting_droop__recent_stress',
    targetDimension: 'recent_stress',
    questionGroupKey: 'wilting_droop_recent_stress',
    questionRole: 'route_package_recent_stress',
    questionText: '最近 7 天有没有发生以下情况？',
    options: [
      { optionKey: 'moved_transport', text: '刚买回家、运输、搬位置' },
      { optionKey: 'repot_divide_root_prune_soil_change', text: '刚换盆、分株、修根、换土' },
      { optionKey: 'heavy_pruning', text: '最近大量修剪' },
      { optionKey: 'heavy_fertilizer_chemical_cleaner', text: '最近施浓肥、用药、喷清洁液' },
      { optionKey: 'none_unknown', text: '都没有 / 不确定', isDefault: true }
    ]
  },
  {
    questionKey: 'q_wilting_droop__high_risk',
    targetDimension: 'wilting_high_risk',
    questionGroupKey: 'wilting_droop_high_risk',
    questionRole: 'route_package_high_risk',
    questionText: '有没有看到以下异常？',
    options: [
      { optionKey: 'black_soft_collapsed_stem_base', text: '茎基部发黑、发软、塌陷' },
      { optionKey: 'odor_root_soil_pot_bottom', text: '土壤 / 根部 / 盆底有异味' },
      { optionKey: 'black_water_soaked_mushy_leaves', text: '叶片发黑、水渍状、软烂' },
      { optionKey: 'yellow_drop_increasing', text: '黄叶或落叶明显增加' },
      { optionKey: 'pests_webbing_white_fuzz_spots_spreading', text: '虫害、蛛网、白絮、斑点扩散' },
      { optionKey: 'none_unknown', text: '都没有 / 不确定', isDefault: true }
    ]
  }
])

function clonePlain(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlain)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clonePlain(child)]))
  }
  return value
}

function mapWiltingDroopQuestion(question = {}) {
  return {
    questionKey: question.questionKey,
    questionId: toQuestionId(question.questionKey),
    selectionSource: 'static_question_package',
    routeKey: 'wilting_droop',
    gateKey: '',
    outcomeKey: '',
    targetSymptomKey: WILTING_DROOP_STATIC_ITEM.symptomKey,
    questionGroupKey: question.questionGroupKey || '',
    targetDimension: question.targetDimension || '',
    routingScope: 'route_package',
    defaultOptionKey: question.defaultOptionKey || '',
    defaultOptionId: question.defaultOptionKey ? toOptionId(question.defaultOptionKey) : '',
    uiVariant: question.uiVariant || '',
    renderMode: question.renderMode || '',
    questionRole: question.questionRole || '',
    questionCategory: question.questionRole || '',
    effectMode: 'route_outcome',
    type: 'single_choice',
    text: question.questionText || '',
    questionText: question.questionText || '',
    helpText: question.helpText || '',
    options: (Array.isArray(question.options) ? question.options : []).map(option => ({
      optionId: toOptionId(option.optionKey),
      optionKey: option.optionKey,
      text: option.text || '',
      description: option.description || '',
      isDefault: Boolean(option.isDefault)
    })),
    whyThisQuestion: '枯萎 / 发蔫固定题包用于收集水分、环境、近期应激和高危异常。'
  }
}

function buildWiltingDroopPackageQuestions() {
  return clonePlain(RAW_WILTING_DROOP_PACKAGE_QUESTIONS.map(mapWiltingDroopQuestion))
}

function isWiltingDroopStaticQuestionStartMode(option = {}) {
  const classKey = String(option?.classKey || '').trim()
  const symptomKey = String(option?.symptomKey || '').trim()
  return classKey === WILTING_DROOP_CLASS_KEY || symptomKey === WILTING_DROOP_STATIC_ITEM.symptomKey
}

module.exports = {
  WILTING_DROOP_PACKAGE_MODE,
  WILTING_DROOP_PACKAGE_SOURCE_MODE,
  WILTING_DROOP_PACKAGE_QUESTION_COUNT,
  WILTING_DROOP_CLASS_KEY,
  WILTING_DROOP_STATIC_ITEM,
  buildWiltingDroopPackageQuestions,
  isWiltingDroopStaticQuestionStartMode,
  _test: {
    RAW_WILTING_DROOP_PACKAGE_QUESTIONS
  }
}
