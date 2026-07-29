'use strict'

const { toResultId } = require('../mappers/public-id-mapper')
const {
  WILTING_DROOP_PACKAGE_MODE,
  WILTING_DROOP_PACKAGE_SOURCE_MODE
} = require('../app/wilting-droop-question-package')

const BLOCKED_ACTION_TEXT = Object.freeze({
  increase_watering: '补足浇水',
  foliar_spray: '叶面喷水',
  fertilize: '施肥',
  immediate_fertilize: '立即施肥',
  repot_again: '再次换盆',
  sun_exposure: '暴晒',
  strong_light: '强光',
  direct_airflow: '风口刺激',
  frequent_move: '频繁搬动',
  continue_fertilizer: '继续施肥',
  continue_spray: '继续喷药',
  keep_humid_cover: '继续闷养'
})

const OUTCOMES = Object.freeze({
  water_replenish: {
    outcomeKey: 'wilting_droop_water_replenish',
    actionGroup: 'water_supply',
    displayNameCn: '缺水处理',
    summary: '水分行为显示偏干，先用温和方式补足水分。',
    actionAdviceItems: ['沿盆土缓慢补水，先浇到盆土均匀湿润并确认能从盆底排出。'],
    avoidAdviceItems: ['不要同时施浓肥或频繁挪动。']
  },
  root_drainage_pressure: {
    outcomeKey: 'wilting_droop_root_drainage_pressure',
    actionGroup: 'root_drainage',
    displayNameCn: '停浇查根和排水',
    summary: '水分或高危信号提示根部和排水压力，先暂停继续加水。',
    actionAdviceItems: ['先停浇，检查盆土气味、根颈软硬和盆底排水。'],
    avoidAdviceItems: ['暂时不要补足浇水、叶面喷水或施肥。']
  },
  water_reasonable: {
    outcomeKey: 'wilting_droop_water_reasonable',
    actionGroup: 'water_observation',
    displayNameCn: '水分基本合理',
    summary: '水分行为暂未显示明显偏干或偏湿。',
    actionAdviceItems: ['保持当前浇水节奏，观察发蔫是否随环境或应激变化。'],
    avoidAdviceItems: ['不要因为单次发蔫立刻大幅增加浇水。']
  },
  whole_plant_water_pressure: {
    outcomeKey: 'wilting_droop_whole_plant_water_pressure',
    actionGroup: 'stabilize',
    displayNameCn: '全株水分压力',
    summary: '整株软塌更像全株水分或根区压力，需要先减少折腾。',
    actionAdviceItems: ['先减少搬动、修剪和施肥，结合水分判断处理。'],
    avoidAdviceItems: ['不要在状态未稳定时连续换位置或加肥。']
  },
  local_inspection: {
    outcomeKey: 'wilting_droop_local_inspection',
    actionGroup: 'local_inspection',
    displayNameCn: '局部检查',
    summary: '局部发蔫更需要检查枝条、叶背、虫害或机械损伤。',
    actionAdviceItems: ['检查发蔫枝条基部、叶背和相邻叶片，必要时隔离问题枝叶。'],
    avoidAdviceItems: []
  },
  protect_new_shoots: {
    outcomeKey: 'wilting_droop_protect_new_shoots',
    actionGroup: 'new_shoot_protection',
    displayNameCn: '保护嫩梢',
    summary: '嫩梢更容易受强光、风口和浓肥刺激。',
    actionAdviceItems: ['把嫩梢避开强光和直吹风，维持稳定散射光。'],
    avoidAdviceItems: ['暂时不要施浓肥。']
  },
  dry_tissue_handling: {
    outcomeKey: 'wilting_droop_dry_tissue_handling',
    actionGroup: 'dry_tissue',
    displayNameCn: '干枯组织处理',
    summary: '已经干脆、卷曲或焦边的组织通常不会恢复。',
    actionAdviceItems: ['等植株稳定后再修剪干枯组织，不把原叶恢复作为判断标准。'],
    avoidAdviceItems: ['不要为了让焦枯叶恢复而反复加水加肥。']
  },
  reduce_transpiration: {
    outcomeKey: 'wilting_droop_reduce_transpiration',
    actionGroup: 'environment_transpiration',
    displayNameCn: '降低蒸腾压力',
    summary: '白天发蔫、早晚缓解常见于蒸腾压力偏高。',
    actionAdviceItems: ['中午前后避开强光和热源，保持明亮散射光。'],
    avoidAdviceItems: ['不要在高温强光时补水后立刻暴晒。']
  },
  move_from_heat: {
    outcomeKey: 'wilting_droop_move_from_heat',
    actionGroup: 'environment_heat',
    displayNameCn: '移离强光热源',
    summary: '窗边、西晒或高温玻璃后会加大发蔫。',
    actionAdviceItems: ['移到离玻璃和西晒更远的位置，保留明亮散射光。'],
    avoidAdviceItems: ['暂时避免暴晒。']
  },
  move_from_direct_airflow: {
    outcomeKey: 'wilting_droop_move_from_direct_airflow',
    actionGroup: 'environment_airflow',
    displayNameCn: '移出直吹区',
    summary: '空调、暖气、风扇直吹会让叶片更快失水。',
    actionAdviceItems: ['移出空调、暖气或风扇直吹区，保留温和通风。'],
    avoidAdviceItems: ['避免继续放在冷热风口。']
  },
  persistent_wilt: {
    outcomeKey: 'wilting_droop_persistent_wilt',
    actionGroup: 'persistent_observation',
    displayNameCn: '持续发蔫',
    summary: '全天都蔫需要结合水分判断和高危信号处理。',
    actionAdviceItems: ['连续观察 48-72 小时，若软烂、异味或掉叶加重，优先检查根茎。'],
    avoidAdviceItems: []
  },
  acclimation_stability: {
    outcomeKey: 'wilting_droop_acclimation_stability',
    actionGroup: 'acclimation',
    displayNameCn: '缓苗稳定',
    summary: '刚买回、运输或搬位置后，先给植株稳定缓苗。',
    actionAdviceItems: ['固定在温和散射光位置，减少搬动并观察 3-7 天。'],
    avoidAdviceItems: ['暂时不要频繁搬动。']
  },
  repot_recovery: {
    outcomeKey: 'wilting_droop_repot_recovery',
    actionGroup: 'repot_recovery',
    displayNameCn: '换盆后缓苗',
    summary: '换盆、分株、修根或换土后，根系需要恢复。',
    actionAdviceItems: ['放在散射光和通风温和处缓苗，等新叶或挺立度恢复后再恢复常规养护。'],
    avoidAdviceItems: ['暂时不要立即施肥、再次换盆或暴晒。']
  },
  pruning_recovery: {
    outcomeKey: 'wilting_droop_pruning_recovery',
    actionGroup: 'pruning_recovery',
    displayNameCn: '修剪后恢复',
    summary: '大量修剪后短期发蔫先按恢复期处理。',
    actionAdviceItems: ['保持环境稳定，等切口和新生长恢复后再增加刺激性操作。'],
    avoidAdviceItems: ['避免强光和风口刺激。']
  },
  pause_fertilizer_chemical: {
    outcomeKey: 'wilting_droop_pause_fertilizer_chemical',
    actionGroup: 'fertilizer_chemical_pause',
    displayNameCn: '暂停施肥用药',
    summary: '浓肥、药剂或清洁液后发蔫，要先停止继续刺激。',
    actionAdviceItems: ['暂停施肥和喷药，保持通风，观察是否继续软塌或焦边扩展。'],
    avoidAdviceItems: ['不要继续施肥或继续喷药。']
  },
  stem_base_check: {
    outcomeKey: 'wilting_droop_stem_base_check',
    actionGroup: 'root_drainage',
    displayNameCn: '停浇查根茎',
    summary: '茎基部发黑、发软或塌陷属于高危信号。',
    actionAdviceItems: ['立即暂停浇水，检查茎基部和根系是否软烂。'],
    avoidAdviceItems: ['不要补足浇水或施肥。']
  },
  mushy_tissue_isolation: {
    outcomeKey: 'wilting_droop_mushy_tissue_isolation',
    actionGroup: 'soft_rot_cleanup',
    displayNameCn: '隔离并清理软烂组织',
    summary: '发黑、水渍状、软烂叶片需要减少扩散风险。',
    actionAdviceItems: ['先隔离植株，清理明显软烂组织，并保持工具清洁。'],
    avoidAdviceItems: ['不要叶面喷水或继续闷养。']
  },
  yellow_drop_root_check: {
    outcomeKey: 'wilting_droop_yellow_drop_root_check',
    actionGroup: 'root_drainage',
    displayNameCn: '检查根系压力和排水',
    summary: '黄叶或落叶增加时，需要把根系和排水纳入检查。',
    actionAdviceItems: ['检查盆土干湿、排水和根颈状态，再决定是否补水或停浇。'],
    avoidAdviceItems: []
  },
  pest_isolation: {
    outcomeKey: 'wilting_droop_pest_isolation',
    actionGroup: 'pest_isolation',
    displayNameCn: '隔离并进入病虫处理',
    summary: '虫害、蛛网、白絮或斑点扩散需要先隔离。',
    actionAdviceItems: ['先隔离植株，检查叶背、嫩梢和盆土表面，后续进入病虫处理。'],
    avoidAdviceItems: []
  }
})

const OPTION_OUTCOME_KEYS = Object.freeze({
  often_dry: ['water_replenish'],
  often_wet: ['root_drainage_pressure'],
  normal_or_stable: ['water_reasonable'],
  whole_plant_droop: ['whole_plant_water_pressure'],
  local_branch_leaf: ['local_inspection'],
  new_shoots: ['protect_new_shoots'],
  dry_crispy_curled_burnt_edge: ['dry_tissue_handling'],
  daytime_recovers: ['reduce_transpiration'],
  strong_window_west_heat: ['move_from_heat'],
  ac_heater_fan_direct: ['move_from_direct_airflow'],
  all_day_wilt: ['persistent_wilt'],
  moved_transport: ['acclimation_stability'],
  repot_divide_root_prune_soil_change: ['repot_recovery'],
  heavy_pruning: ['pruning_recovery'],
  heavy_fertilizer_chemical_cleaner: ['pause_fertilizer_chemical'],
  black_soft_collapsed_stem_base: ['stem_base_check'],
  odor_root_soil_pot_bottom: ['root_drainage_pressure'],
  black_water_soaked_mushy_leaves: ['mushy_tissue_isolation'],
  yellow_drop_increasing: ['yellow_drop_root_check'],
  pests_webbing_white_fuzz_spots_spreading: ['pest_isolation']
})

const OPTION_BLOCKS = Object.freeze({
  moved_transport: ['frequent_move'],
  repot_divide_root_prune_soil_change: ['immediate_fertilize', 'repot_again', 'sun_exposure'],
  heavy_pruning: ['strong_light', 'direct_airflow'],
  heavy_fertilizer_chemical_cleaner: ['continue_fertilizer', 'continue_spray'],
  black_soft_collapsed_stem_base: ['increase_watering', 'fertilize'],
  odor_root_soil_pot_bottom: ['increase_watering', 'foliar_spray'],
  black_water_soaked_mushy_leaves: ['foliar_spray', 'keep_humid_cover']
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeMode(value = '') {
  return normalizeText(value).toLowerCase()
}

function isWiltingDroopQuestionPackage(questionPackage = {}) {
  const mode = normalizeMode(
    questionPackage?.mode || questionPackage?.diagnosisMode || questionPackage?.sourceMode
  )
  return [
    WILTING_DROOP_PACKAGE_MODE,
    WILTING_DROOP_PACKAGE_SOURCE_MODE,
    'wilt_droop',
    'wilting',
    'drooping'
  ].includes(mode)
}

function collectAnswerOptionKeys(answers = []) {
  return Array.from(
    new Set(
      (Array.isArray(answers) ? answers : [])
        .map(answer => normalizeText(answer?.optionKey || answer?.answerValue))
        .filter(Boolean)
    )
  )
}

function cloneOutcome(source = {}) {
  return {
    outcomeKey: source.outcomeKey,
    problemKey: source.outcomeKey,
    outcomeType: 'problematic',
    outcomeCategory: 'wilting_droop',
    displayNameCn: source.displayNameCn,
    summary: source.summary,
    actionGroup: source.actionGroup,
    actionAdviceItems: Array.isArray(source.actionAdviceItems)
      ? source.actionAdviceItems.slice()
      : [],
    avoidAdviceItems: Array.isArray(source.avoidAdviceItems) ? source.avoidAdviceItems.slice() : []
  }
}

function buildBlockExplanations(blockedKeys = [], sourceOptionKeys = []) {
  const sourceText = sourceOptionKeys.includes('odor_root_soil_pot_bottom')
    ? '因为已出现土壤、根部或盆底异味，继续补水或喷水可能加重根部缺氧。'
    : sourceOptionKeys.includes('black_soft_collapsed_stem_base')
      ? '因为茎基部发黑发软属于高危信号，继续补水或施肥可能加重软烂。'
      : sourceOptionKeys.includes('black_water_soaked_mushy_leaves')
        ? '因为已有水渍状软烂组织，喷水或闷养会增加扩散风险。'
        : sourceOptionKeys.includes('repot_divide_root_prune_soil_change')
          ? '因为刚换盆、分株、修根或换土，根系恢复前不适合再施肥、再次换盆或暴晒。'
          : sourceOptionKeys.includes('heavy_fertilizer_chemical_cleaner')
            ? '因为最近已经有浓肥、药剂或清洁液刺激，需要先暂停继续施肥喷药。'
            : sourceOptionKeys.includes('moved_transport')
              ? '因为刚搬动或运输后需要缓苗，频繁挪动会延长恢复。'
              : sourceOptionKeys.includes('heavy_pruning')
                ? '因为最近大量修剪，需要避免强光和风口继续刺激。'
                : '因为当前存在高风险或恢复期信号，暂时不建议执行冲突动作。'
  return blockedKeys.map(key => ({
    actionKey: key,
    actionText: BLOCKED_ACTION_TEXT[key] || key,
    explanation: sourceText
  }))
}

function mergeOutcome(target = {}, source = {}) {
  return {
    ...target,
    actionAdviceItems: Array.from(
      new Set([
        ...(Array.isArray(target.actionAdviceItems) ? target.actionAdviceItems : []),
        ...(Array.isArray(source.actionAdviceItems) ? source.actionAdviceItems : [])
      ])
    ),
    avoidAdviceItems: Array.from(
      new Set([
        ...(Array.isArray(target.avoidAdviceItems) ? target.avoidAdviceItems : []),
        ...(Array.isArray(source.avoidAdviceItems) ? source.avoidAdviceItems : [])
      ])
    )
  }
}

function removeBlockedActions(outcomes = [], blockedActionTexts = []) {
  if (!blockedActionTexts.length) {
    return outcomes
  }
  const shouldRemoveWaterSupply = blockedActionTexts.includes(BLOCKED_ACTION_TEXT.increase_watering)
  return outcomes
    .filter(outcome => !(shouldRemoveWaterSupply && outcome?.actionGroup === 'water_supply'))
    .map(outcome => ({
      ...outcome,
      actionAdviceItems: (Array.isArray(outcome.actionAdviceItems)
        ? outcome.actionAdviceItems
        : []
      ).filter(text => !blockedActionTexts.some(blocked => text.includes(blocked))),
      avoidAdviceItems: Array.from(
        new Set([
          ...(Array.isArray(outcome.avoidAdviceItems) ? outcome.avoidAdviceItems : []),
          ...blockedActionTexts.map(text => `暂时不要${text}。`)
        ])
      )
    }))
}

function resolveWiltingDroopOutcomeResult({
  sessionId = '',
  round = 1,
  answers = [],
  questionPackage = null,
  plantContext = {},
  careBehaviorTimeline = null,
  environmentCareContext = null
} = {}) {
  if (!isWiltingDroopQuestionPackage(questionPackage)) {
    return null
  }

  const optionKeys = collectAnswerOptionKeys(answers)
  const sourceOptionKeysByBlock = new Map()
  const blockedActionKeys = []
  const outcomesByActionGroup = new Map()

  for (const optionKey of optionKeys) {
    for (const blockKey of OPTION_BLOCKS[optionKey] || []) {
      if (!blockedActionKeys.includes(blockKey)) {
        blockedActionKeys.push(blockKey)
      }
      sourceOptionKeysByBlock.set(blockKey, [
        ...(sourceOptionKeysByBlock.get(blockKey) || []),
        optionKey
      ])
    }
    for (const outcomeKey of OPTION_OUTCOME_KEYS[optionKey] || []) {
      const outcome = cloneOutcome(OUTCOMES[outcomeKey])
      const actionGroup = outcome.actionGroup || outcome.outcomeKey
      outcomesByActionGroup.set(
        actionGroup,
        outcomesByActionGroup.has(actionGroup)
          ? mergeOutcome(outcomesByActionGroup.get(actionGroup), outcome)
          : outcome
      )
    }
  }

  const blockedActionTexts = blockedActionKeys.map(key => BLOCKED_ACTION_TEXT[key]).filter(Boolean)
  const visibleOutcomes = removeBlockedActions(
    Array.from(outcomesByActionGroup.values()),
    blockedActionTexts
  )
  const blockedActionExplanations = blockedActionKeys.length
    ? buildBlockExplanations(
        blockedActionKeys,
        Array.from(new Set(Array.from(sourceOptionKeysByBlock.values()).flat()))
      )
    : []
  const todayActions = Array.from(
    new Set(visibleOutcomes.flatMap(item => item.actionAdviceItems || []))
  )
  const avoidActions = Array.from(
    new Set([
      ...visibleOutcomes.flatMap(item => item.avoidAdviceItems || []),
      ...blockedActionExplanations.map(item => `${item.actionText}：${item.explanation}`)
    ])
  )
  const hasHighRisk = optionKeys.some(key =>
    [
      'black_soft_collapsed_stem_base',
      'odor_root_soil_pot_bottom',
      'black_water_soaked_mushy_leaves'
    ].includes(key)
  )
  const observationPeriod = hasHighRisk
    ? '24-48 小时内复查软烂、异味和塌陷是否扩大。'
    : '连续观察 48-72 小时，记录挺立度、掉叶和盆土干湿变化。'
  const summaryText = visibleOutcomes.length
    ? '已根据水分行为、发蔫形态、环境点位、近期应激和高危异常整理建议行动清单。'
    : '本次回答未形成明确处理动作，建议先保持环境稳定并继续观察。'

  return {
    diagnosisSessionId: sessionId,
    resultId: toResultId(sessionId || 'wilting_droop', round || 1),
    roundId: `round_${Number(round || 1)}`,
    roundIndex: Number(round || 1),
    currentRoundIndex: Number(round || 1),
    currentRoundId: `round_${Number(round || 1)}`,
    stage: 'final',
    status: 'closed',
    sessionStatus: 'closed',
    routePrimaryAction: 'finalize',
    stopReason: 'wilting_droop_package_completed',
    outcomeType: visibleOutcomes.length ? 'problematic' : 'uncertain',
    outcomeMode: 'visible_outcomes',
    plantId: plantContext?.userPlantId || plantContext?.plantId || '',
    plantIdentityId: plantContext?.plantIdentityId || '',
    identityResolutionStatus: plantContext?.identityResolutionStatus || '',
    questions: [],
    finalResult: {
      resultId: toResultId(sessionId || 'wilting_droop', round || 1),
      problemKey: 'wilting_droop_action_list',
      displayName: '建议行动清单',
      problemName: '建议行动清单',
      summary: summaryText,
      outcomeType: visibleOutcomes.length ? 'problematic' : 'uncertain',
      visibleOutcomes,
      outcomeMode: 'visible_outcomes',
      actionAdvice: {
        todayActions,
        threeDayActions: [],
        sevenDayObserve: [observationPeriod],
        avoidActions,
        retakeOrEscalate: [],
        conflictDetected: blockedActionExplanations.length > 0
      }
    },
    summaryCard: {
      title: '建议行动清单',
      subtitle: summaryText,
      severity: hasHighRisk ? 'high' : 'normal',
      statusText: hasHighRisk ? '存在高危信号' : '已完成问诊'
    },
    actionAdvice: {
      todayActions,
      threeDayActions: [],
      sevenDayObserve: [observationPeriod],
      avoidActions,
      retakeOrEscalate: [],
      conflictDetected: blockedActionExplanations.length > 0
    },
    visibleOutcomes,
    blockedActionExplanations,
    highRiskWarning: hasHighRisk
      ? '发现软烂、异味或茎基部塌陷等高危信号时，先停浇检查，不要急着补水或施肥。'
      : '',
    observationPeriod,
    routeDecisionCause: {
      decisionCauseKey: 'wilting_droop_route_package_completed',
      decisionCauseText: '枯萎 / 发蔫固定题包已完成，按答案直接产出建议行动清单。'
    },
    questionPackage: {
      ...questionPackage,
      mode: WILTING_DROOP_PACKAGE_MODE
    },
    careBehaviorTimeline,
    environmentCareContext,
    plantContext
  }
}

module.exports = {
  resolveWiltingDroopOutcomeResult,
  _test: {
    OUTCOMES,
    OPTION_OUTCOME_KEYS,
    OPTION_BLOCKS,
    isWiltingDroopQuestionPackage,
    collectAnswerOptionKeys
  }
}
