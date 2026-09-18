'use strict'

// 固定题包的展示定义。题库中的 watering 题和当前 active/audited 版本同步，
// 由轻量 start 入口直接读取，避免首个请求再加载题库仓储和执行 SQL。
const WATERING_OPTIONS = [
  {
    optionId: 'normal_or_stable',
    optionKey: 'normal_or_stable',
    text: '等土表发干再浇，最近节奏基本稳定',
    description: '',
    isDefault: false
  },
  {
    optionId: 'often_dry',
    optionKey: 'often_dry',
    text: '常常干很久才浇，或这两周几乎没浇几次',
    description: '',
    isDefault: false
  },
  {
    optionId: 'often_wet',
    optionKey: 'often_wet',
    text: '土还没怎么干就会再浇，或这两周一直偏湿',
    description: '',
    isDefault: false
  },
  {
    optionId: 'unknown',
    optionKey: 'unknown',
    text: '说不清/没留意',
    description: '',
    isDefault: false
  }
]

const AIR_OPTIONS = [
  {
    optionId: 'opt_YWlyX2Vudmlyb25tZW50X3JlY29yZGVk',
    optionKey: 'air_environment_recorded',
    text: '已填写空气环境',
    description: '',
    isDefault: false
  },
  {
    optionId: 'opt_YWlyX2Vudmlyb25tZW50X3Vua25vd24',
    optionKey: 'air_environment_unknown',
    text: '不确定',
    description: '',
    isDefault: true
  }
]

function question({
  questionKey,
  targetSymptomKey,
  questionGroupKey,
  packageTopic,
  packageSection = 'context_probe',
  routePackageRole,
  packageEffect,
  defaultOptionKey = '',
  defaultOptionId = '',
  uiVariant = '',
  renderMode = '',
  questionType = 'single_choice',
  text,
  helpText = '',
  options,
  whyThisQuestion,
  routeKey = '',
  selectionSource = 'static_question_package'
} = {}) {
  return {
    questionKey,
    selectionSource,
    routeKey,
    conditionKey: '',
    outcomeKey: '',
    targetSymptomKey,
    questionGroupKey,
    packageTopic,
    packageSection,
    defaultOptionKey,
    defaultOptionId,
    uiVariant,
    renderMode,
    routePackageRole,
    packageEffect,
    questionType,
    type: 'single_choice',
    text,
    questionText: text,
    helpText,
    options,
    whyThisQuestion
  }
}

function cloneOptions(options) {
  return options.map(option => ({ ...option }))
}

function buildYellowingQuestions() {
  const targetSymptomKey = 'leaf_yellowing'
  return [
    question({
      targetSymptomKey,
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      questionGroupKey: 'observed_probe__leaf_yellowing__watering_frequency_context',
      packageTopic: 'watering_frequency_context',
      packageSection: 'route_package',
      routePackageRole: 'route_package_water_behavior',
      packageEffect: 'route_outcome',
      defaultOptionKey: 'care_behavior_timeline',
      defaultOptionId: 'opt_Y2FyZV9iZWhhdmlvcl90aW1lbGluZQ',
      uiVariant: 'care_behavior_timeline',
      renderMode: 'care_behavior_timeline',
      text: '最近 2 周，你的浇水情况更接近哪一种？',
      helpText: '只按最近实际情况选择，不用先判断对错；系统会结合黄叶线索判断偏湿、稳定或偏干方向。',
      options: cloneOptions(WATERING_OPTIONS),
      whyThisQuestion: '浇水频率用于判断黄叶是否可能和根区长期偏湿或偏干有关。'
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
      questionGroupKey: 'observed_probe__leaf_yellowing__light_change_context',
      packageTopic: 'light_change_context',
      routePackageRole: 'context_metric',
      packageEffect: 'context_feature',
      text: '黄叶和光照有关时，先看最近的直射、遮阴和离窗距离。最近 1-2 周，这盆植物更接近哪种光照？',
      helpText: '直接按全日光、散光、全阴或离窗远近选择；后端会结合这类植物的养护基线判断偏强或偏弱。',
      options: [
        { optionId: 'stronger_direct_light', optionKey: 'stronger_direct_light', text: '全日光，或每天直射很多', description: '', isDefault: false },
        { optionId: 'no_clear_change', optionKey: 'no_clear_change', text: '散光为主，最近基本没变', description: '', isDefault: false },
        { optionId: 'weaker_light', optionKey: 'weaker_light', text: '全阴、离窗较远，或最近更暗', description: '', isDefault: false },
        { optionId: 'unknown', optionKey: 'unknown', text: '说不清/没留意', description: '', isDefault: false }
      ],
      whyThisQuestion: '这题用于从“light_change_context”维度补充观察“叶片发黄”，避免回到同一视觉确认问题。'
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
      questionGroupKey: 'observed_probe__leaf_yellowing__fertilization_growth_context',
      packageTopic: 'fertilization_growth_context',
      routePackageRole: 'context_metric',
      packageEffect: 'context_feature',
      text: '黄叶和营养有关时，既可能是长期没补肥，也可能是近期重肥或换盆刺激。最近 1 个月，施肥情况更接近哪一种？',
      helpText: '用施肥次数和近期换盆/重肥记录营养背景，不直接把黄叶等同于缺肥。',
      options: [
        { optionId: 'low_or_no_fertilizer', optionKey: 'low_or_no_fertilizer', text: '近 1 个月 0 次（很少施肥）', description: '', isDefault: false },
        { optionId: 'normal_light_fertilizer', optionKey: 'normal_light_fertilizer', text: '近 1 个月 1-2 次（偏稳）', description: '', isDefault: false },
        { optionId: 'recent_heavy_fertilizer_or_repot', optionKey: 'recent_heavy_fertilizer_or_repot', text: '近 1 个月 2 次以上（重肥/换盆换土）', description: '', isDefault: false },
        { optionId: 'unknown', optionKey: 'unknown', text: '说不清/没留意', description: '', isDefault: false }
      ],
      whyThisQuestion: '这题用于从“fertilization_growth_context”维度补充观察“叶片发黄”，避免回到同一视觉确认问题。'
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_yellow_leaf__air_environment',
      questionGroupKey: 'yellow_leaf_air_environment',
      packageTopic: 'air_environment',
      packageSection: 'route_package',
      routePackageRole: 'route_package_air_environment',
      packageEffect: 'route_evidence',
      defaultOptionKey: 'air_environment_unknown',
      defaultOptionId: 'opt_YWlyX2Vudmlyb25tZW50X3Vua25vd24',
      uiVariant: 'air_environment',
      renderMode: 'composite',
      questionType: 'air_environment',
      text: '植物周围的空气环境怎样？',
      helpText: '请按植物所在位置填写换气、周围空间和设备风。',
      options: cloneOptions(AIR_OPTIONS),
      whyThisQuestion: '空气环境只作为诊断证据，不单独生成黄叶结论。'
    })
  ]
}

function buildWiltingQuestions() {
  const targetSymptomKey = 'wilting_droop'
  const commonWhy = '枯萎 / 发蔫固定题包用于收集水分、环境、近期应激和高危异常。'
  return [
    question({
      targetSymptomKey,
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      questionGroupKey: 'observed_probe__leaf_yellowing__watering_frequency_context',
      packageTopic: 'watering_frequency_context',
      packageSection: 'route_package',
      routeKey: 'wilting_droop',
      routePackageRole: 'route_package_water_behavior',
      packageEffect: 'route_outcome',
      defaultOptionKey: 'care_behavior_timeline',
      defaultOptionId: 'care_behavior_timeline',
      uiVariant: 'care_behavior_timeline',
      renderMode: 'care_behavior_timeline',
      text: '最近 2 周，你的浇水情况更接近哪一种？',
      helpText: '只按最近实际情况选择，不用先判断对错；系统会结合黄叶线索判断偏湿、稳定或偏干方向。',
      options: cloneOptions(WATERING_OPTIONS),
      whyThisQuestion: '浇水频率用于判断黄叶是否可能和根区长期偏湿或偏干有关。'
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_wilting_droop__shape',
      questionGroupKey: 'wilting_droop_shape',
      packageTopic: 'wilting_shape',
      routeKey: 'wilting_droop',
      routePackageRole: 'route_package_shape',
      packageEffect: 'route_outcome',
      text: '你现在看到的状态更接近哪一种？',
      options: [
        { optionId: 'whole_plant_droop', optionKey: 'whole_plant_droop', text: '整株软塌下垂', description: '', isDefault: false },
        { optionId: 'local_branch_leaf', optionKey: 'local_branch_leaf', text: '局部叶片 / 枝条发蔫', description: '', isDefault: false },
        { optionId: 'new_shoots', optionKey: 'new_shoots', text: '新叶嫩梢为主', description: '', isDefault: false },
        { optionId: 'dry_crispy_curled_burnt_edge', optionKey: 'dry_crispy_curled_burnt_edge', text: '叶片干脆、卷曲、焦边', description: '', isDefault: false },
        { optionId: 'unknown', optionKey: 'unknown', text: '不确定', description: '', isDefault: true }
      ],
      whyThisQuestion: commonWhy
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_wilting_droop__rhythm_environment',
      questionGroupKey: 'wilting_droop_rhythm_environment',
      packageTopic: 'wilting_rhythm_environment',
      routeKey: 'wilting_droop',
      routePackageRole: 'route_package_environment',
      packageEffect: 'route_outcome',
      text: '发蔫通常在什么情况下更明显？',
      options: [
        { optionId: 'daytime_recovers', optionKey: 'daytime_recovers', text: '白天明显，晚上 / 早晨缓解', description: '', isDefault: false },
        { optionId: 'strong_window_west_heat', optionKey: 'strong_window_west_heat', text: '靠近强光窗边、西晒、高温玻璃后', description: '', isDefault: false },
        { optionId: 'all_day_wilt', optionKey: 'all_day_wilt', text: '全天都蔫', description: '', isDefault: false },
        { optionId: 'unknown', optionKey: 'unknown', text: '不确定', description: '', isDefault: true }
      ],
      whyThisQuestion: commonWhy
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_wilting_droop__air_environment',
      questionGroupKey: 'wilting_droop_air_environment',
      packageTopic: 'air_environment',
      packageSection: 'route_package',
      routeKey: 'wilting_droop',
      routePackageRole: 'route_package_air_environment',
      packageEffect: 'route_outcome',
      defaultOptionKey: 'air_environment_unknown',
      defaultOptionId: 'opt_YWlyX2Vudmlyb25tZW50X3Vua25vd24',
      uiVariant: 'air_environment',
      renderMode: 'composite',
      questionType: 'air_environment',
      text: '植物周围的空气环境怎样？',
      helpText: '请按植物所在位置填写换气、周围空间和设备风。',
      options: cloneOptions(AIR_OPTIONS),
      whyThisQuestion: commonWhy
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_wilting_droop__recent_stress',
      questionGroupKey: 'wilting_droop_recent_stress',
      packageTopic: 'recent_stress',
      packageSection: 'route_package',
      routeKey: 'wilting_droop',
      routePackageRole: 'route_package_recent_stress',
      packageEffect: 'route_outcome',
      text: '最近 7 天有没有发生以下情况？',
      options: [
        { optionId: 'moved_transport', optionKey: 'moved_transport', text: '刚买回家、运输、搬位置', description: '', isDefault: false },
        { optionId: 'repot_divide_root_prune_soil_change', optionKey: 'repot_divide_root_prune_soil_change', text: '刚换盆、分株、修根、换土', description: '', isDefault: false },
        { optionId: 'heavy_pruning', optionKey: 'heavy_pruning', text: '最近大量修剪', description: '', isDefault: false },
        { optionId: 'heavy_fertilizer_chemical_cleaner', optionKey: 'heavy_fertilizer_chemical_cleaner', text: '最近施浓肥、用药、喷清洁液', description: '', isDefault: false },
        { optionId: 'none_unknown', optionKey: 'none_unknown', text: '都没有 / 不确定', description: '', isDefault: true }
      ],
      whyThisQuestion: commonWhy
    }),
    question({
      targetSymptomKey,
      questionKey: 'q_wilting_droop__high_risk',
      questionGroupKey: 'wilting_droop_high_risk',
      packageTopic: 'wilting_high_risk',
      packageSection: 'route_package',
      routeKey: 'wilting_droop',
      routePackageRole: 'route_package_high_risk',
      packageEffect: 'route_outcome',
      text: '有没有看到以下异常？',
      options: [
        { optionId: 'black_soft_collapsed_stem_base', optionKey: 'black_soft_collapsed_stem_base', text: '茎基部发黑、发软、塌陷', description: '', isDefault: false },
        { optionId: 'odor_root_soil_pot_bottom', optionKey: 'odor_root_soil_pot_bottom', text: '土壤 / 根部 / 盆底有异味', description: '', isDefault: false },
        { optionId: 'black_water_soaked_mushy_leaves', optionKey: 'black_water_soaked_mushy_leaves', text: '叶片发黑、水渍状、软烂', description: '', isDefault: false },
        { optionId: 'yellow_drop_increasing', optionKey: 'yellow_drop_increasing', text: '黄叶或落叶明显增加', description: '', isDefault: false },
        { optionId: 'pests_webbing_white_fuzz_spots_spreading', optionKey: 'pests_webbing_white_fuzz_spots_spreading', text: '虫害、蛛网、白絮、斑点扩散', description: '', isDefault: false },
        { optionId: 'none_unknown', optionKey: 'none_unknown', text: '都没有 / 不确定', description: '', isDefault: true }
      ],
      whyThisQuestion: commonWhy
    })
  ]
}

const QUESTION_PACKAGES = Object.freeze({
  yellow_leaf: buildYellowingQuestions(),
  wilting_droop: buildWiltingQuestions()
})

function getStartQuestionPackage(mode = '') {
  const questions = QUESTION_PACKAGES[String(mode || '').trim()]
  return Array.isArray(questions)
    ? questions.map(item => ({ ...item, options: cloneOptions(item.options || []) }))
    : []
}

module.exports = { getStartQuestionPackage }
