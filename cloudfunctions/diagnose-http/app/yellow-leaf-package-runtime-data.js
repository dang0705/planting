'use strict'

// 黄叶固定题包只使用已审核且处于 active 状态的固定运行资料。
// 这份资料与 cloud1_dev 的固定题包数据同步，用于避免 answer 首次请求再发起两次 SQL。
const ANSWER_EFFECTS = [
  {
    questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    optionKey: 'low_or_no_fertilizer',
    outcomeKey: 'iron_deficiency',
    routeKey: 'yellowing_low_fertilizer_iron_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'fertilization_growth_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    optionKey: 'low_or_no_fertilizer',
    outcomeKey: 'nitrogen_deficiency',
    routeKey: 'yellowing_low_fertilizer_nitrogen_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'fertilization_growth_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    optionKey: 'low_or_no_fertilizer',
    outcomeKey: 'nutrient_deficiency',
    routeKey: 'yellowing_low_fertilizer_nutrient_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'fertilization_growth_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    optionKey: 'normal_light_fertilizer',
    outcomeKey: 'nutrient_deficiency',
    routeKey: 'yellowing_low_fertilizer_nutrient_route',
    effectType: 'weaken',
    effectStrength: 0.5,
    evidenceDimension: 'fertilization_growth_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    optionKey: 'recent_heavy_fertilizer_or_repot',
    outcomeKey: 'fertilizer_repot_stress',
    routeKey: 'yellowing_heavy_fertilizer_repot_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'fertilization_growth_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    optionKey: 'unknown',
    outcomeKey: 'uncertain_observation',
    routeKey: 'yellowing_fertilization_unknown_route',
    effectType: 'support',
    effectStrength: 0.5,
    evidenceDimension: 'fertilization_growth_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
    optionKey: 'stronger_direct_light',
    outcomeKey: 'sunburn',
    routeKey: 'yellowing_sunburn_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'light_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
    optionKey: 'weaker_light',
    outcomeKey: 'low_light_growth_weakness',
    routeKey: 'yellowing_low_light_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'light_context'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    optionKey: 'normal_or_stable',
    outcomeKey: 'overwatering_root_pressure',
    routeKey: 'yellowing_wet_soil_route',
    effectType: 'weaken',
    effectStrength: 0.6,
    evidenceDimension: 'soil_moisture'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    optionKey: 'normal_or_stable',
    outcomeKey: 'underwatering',
    routeKey: 'yellowing_dry_soil_route',
    effectType: 'weaken',
    effectStrength: 0.6,
    evidenceDimension: 'soil_moisture'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    optionKey: 'often_dry',
    outcomeKey: 'underwatering',
    routeKey: 'yellowing_dry_soil_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'soil_moisture'
  },
  {
    questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    optionKey: 'often_wet',
    outcomeKey: 'overwatering_root_pressure',
    routeKey: 'yellowing_wet_soil_route',
    effectType: 'support',
    effectStrength: 1,
    evidenceDimension: 'soil_moisture'
  }
]

const OUTCOMES = {
  fertilizer_repot_stress: {
    outcomeKey: 'fertilizer_repot_stress',
    sourceProblemKey: 'fertilizer_repot_stress',
    outcomeType: 'care_cluster',
    outcomeCategory: 'nutrition',
    displayNameCn: '施肥/换盆应激',
    userDefinitionCn: '当前更像近期重肥、频繁施肥或换盆换土后的根区应激。',
    actionProfileKey: 'action_fertilizer_repot_stress',
    riskLevel: 'medium'
  },
  iron_deficiency: {
    outcomeKey: 'iron_deficiency',
    sourceProblemKey: 'iron_deficiency',
    outcomeType: 'problem_cluster',
    outcomeCategory: 'nutrition',
    displayNameCn: '缺铁/新叶脉间黄化',
    userDefinitionCn: '当前更像新叶或脉间黄化相关的营养吸收问题。',
    actionProfileKey: 'action_nutrient_support_basic',
    riskLevel: 'medium'
  },
  low_light_growth_weakness: {
    outcomeKey: 'low_light_growth_weakness',
    sourceProblemKey: 'low_light_growth_weakness',
    outcomeType: 'care_cluster',
    outcomeCategory: 'light',
    displayNameCn: '光照不足/生长偏弱',
    userDefinitionCn: '当前更像长期光照不足引起的徒长与偏弱。',
    actionProfileKey: 'action_low_light_basic',
    riskLevel: 'low'
  },
  nitrogen_deficiency: {
    outcomeKey: 'nitrogen_deficiency',
    sourceProblemKey: 'nitrogen_deficiency',
    outcomeType: 'problem_cluster',
    outcomeCategory: 'nutrition',
    displayNameCn: '缺氮/长期营养不足',
    userDefinitionCn: '当前更像长期补肥不足或营养供给偏弱导致的老叶/整体黄化。',
    actionProfileKey: 'action_nutrient_support_basic',
    riskLevel: 'medium'
  },
  nutrient_deficiency: {
    outcomeKey: 'nutrient_deficiency',
    sourceProblemKey: 'nutrient_deficiency',
    outcomeType: 'problem_cluster',
    outcomeCategory: 'nutrition',
    displayNameCn: '营养供给偏弱',
    userDefinitionCn: '当前更像长期养分供给不足，但暂不细分到单一元素。',
    actionProfileKey: 'action_nutrient_support_basic',
    riskLevel: 'medium'
  },
  overwatering_root_pressure: {
    outcomeKey: 'overwatering_root_pressure',
    sourceProblemKey: 'overwatering_root_pressure',
    outcomeType: 'problem_cluster',
    outcomeCategory: 'water',
    displayNameCn: '积水/根系压力',
    userDefinitionCn: '当前更像盆土长期偏湿或根系承压。',
    actionProfileKey: 'action_overwatering_basic',
    riskLevel: 'medium'
  },
  sunburn: {
    outcomeKey: 'sunburn',
    sourceProblemKey: 'sunburn',
    outcomeType: 'problem_cluster',
    outcomeCategory: 'light',
    displayNameCn: '晒伤/强光刺激',
    userDefinitionCn: '当前更像暴晒或强光刺激后的组织灼伤。',
    actionProfileKey: 'action_sunburn_basic',
    riskLevel: 'medium'
  },
  uncertain_observation: {
    outcomeKey: 'uncertain_observation',
    sourceProblemKey: 'uncertain_observation',
    outcomeType: 'uncertain',
    outcomeCategory: 'uncertain',
    displayNameCn: '暂不能稳定判断',
    userDefinitionCn: '当前证据仍不足以安全闭合到具体方向。',
    actionProfileKey: 'action_uncertain_prepare',
    riskLevel: 'low'
  },
  underwatering: {
    outcomeKey: 'underwatering',
    sourceProblemKey: 'underwatering',
    outcomeType: 'problem_cluster',
    outcomeCategory: 'water',
    displayNameCn: '缺水压力',
    userDefinitionCn: '当前更像盆土长期偏干或供水不足。',
    actionProfileKey: 'action_underwatering_basic',
    riskLevel: 'medium'
  }
}

const ACTION_PROFILES = {
  action_fertilizer_repot_stress: {
    actionProfileKey: 'action_fertilizer_repot_stress',
    todayActions: ['近期刚重肥或换盆时先暂停继续施肥', '保持盆土干湿和光照稳定'],
    threeDayActions: ['3 天内观察黄叶是否继续扩大或伴随萎蔫'],
    sevenDayObserve: ['7 天内记录新叶是否恢复稳定'],
    avoidActions: ['不要继续重肥、频繁换土或同时大幅改变浇水'],
    retakeOrEscalate: ['若伴随软塌、异味或持续掉叶，补拍根茎和盆土后升级复核']
  },
  action_low_light_basic: {
    actionProfileKey: 'action_low_light_basic',
    todayActions: ['把植株移到更稳定明亮散射光处'],
    threeDayActions: ['3 天内观察新叶节间是否继续拉长'],
    sevenDayObserve: ['7 天内观察整体株型是否稳定'],
    avoidActions: ['不要突然暴晒或一次性大幅施肥'],
    retakeOrEscalate: ['若徒长继续加重，补拍整株与摆放环境']
  },
  action_nutrient_support_basic: {
    actionProfileKey: 'action_nutrient_support_basic',
    todayActions: ['先核对最近 1-2 个生长周期是否长期未补肥', '若植株仍在生长期，可从低浓度、少量补肥开始'],
    threeDayActions: ['3 天内观察是否继续快速黄化，不要连续追肥'],
    sevenDayObserve: ['7 天内对比新叶和老叶黄化是否继续扩大'],
    avoidActions: ['不要一次性重肥猛补，也不要和大幅浇水调整同时进行'],
    retakeOrEscalate: ['若新叶持续脉间黄化或老叶快速扩大，补拍新老叶对比和盆土状态']
  },
  action_overwatering_basic: {
    actionProfileKey: 'action_overwatering_basic',
    todayActions: ['先暂停浇水', '检查盆底是否积水', '改善根区通风'],
    threeDayActions: ['3 天内观察盆土是否逐步变干'],
    sevenDayObserve: ['记录新叶和茎基部是否继续变软'],
    avoidActions: ['不要在盆土久湿时继续加大浇水'],
    retakeOrEscalate: ['若茎基部继续发软或异味明显，补拍根茎并升级处理']
  },
  action_sunburn_basic: {
    actionProfileKey: 'action_sunburn_basic',
    todayActions: ['先移离正午直射光', '保持通风稳定'],
    threeDayActions: ['3 天内观察灼伤边界是否继续扩大'],
    sevenDayObserve: ['7 天内观察新叶是否恢复正常'],
    avoidActions: ['不要马上重肥或重药'],
    retakeOrEscalate: ['若灼伤持续扩大，补拍叶面与摆放位置']
  },
  action_uncertain_prepare: {
    actionProfileKey: 'action_uncertain_prepare',
    todayActions: ['先保持养护稳定', '补拍整株、叶背、盆土和环境位置'],
    threeDayActions: ['3 天内整理浇水、光照、通风背景'],
    sevenDayObserve: ['7 天内观察异常是否扩大或重复出现'],
    avoidActions: ['不要在证据不足时大幅浇水、施肥或用药'],
    retakeOrEscalate: ['若出现明显加重，优先升级人工复核']
  },
  action_underwatering_basic: {
    actionProfileKey: 'action_underwatering_basic',
    todayActions: ['按盆土干湿补一次透水', '恢复稳定浇水节律'],
    threeDayActions: ['观察叶片能否回弹', '观察盆土干湿恢复速度'],
    sevenDayObserve: ['记录新叶是否恢复挺立'],
    avoidActions: ['不要连续少量频繁补水又很快断水'],
    retakeOrEscalate: ['若补水后仍持续萎蔫，补拍根区和盆土状态']
  }
}

module.exports = {
  ANSWER_EFFECTS,
  OUTCOMES,
  ACTION_PROFILES
}
