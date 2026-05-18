'use strict'

const { clamp01 } = require('./sql')
const {
  normalizeQuestionTargetDimension,
  normalizeQuestionRoutingScope,
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionTargetDimension,
  inferQuestionRoutingScope,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('../utils/question-target-dimension')

const AUDITED_DIRECT_PROBLEM_ADJUSTMENTS = {
  q_gnat_soil_stays_wet: {
    yes: [
      { problemKey: 'overwatering', effectValue: 0.18 }
    ]
  },
  q_stem_collapse_poor_drainage: {
    yes: [
      { problemKey: 'soft_rot', effectValue: 0.16 },
      { problemKey: 'crown_rot', effectValue: 0.12 },
      { problemKey: 'root_rot', effectValue: 0.1 },
      { problemKey: 'overwatering', effectValue: 0.1 }
    ],
    no: [
      { problemKey: 'soft_rot', effectValue: -0.08 },
      { problemKey: 'crown_rot', effectValue: -0.08 },
      { problemKey: 'root_rot', effectValue: -0.06 }
    ]
  },
  q_root_rot_bad_smell: {
    yes: [
      { problemKey: 'root_rot', effectValue: 0.28 },
      { problemKey: 'soft_rot', effectValue: 0.22 },
      { problemKey: 'crown_rot', effectValue: 0.2 }
    ],
    no: [
      { problemKey: 'root_rot', effectValue: -0.08 },
      { problemKey: 'soft_rot', effectValue: -0.08 },
      { problemKey: 'crown_rot', effectValue: -0.06 }
    ]
  },
  q_root_rot_black_roots: {
    yes: [
      { problemKey: 'root_rot', effectValue: 0.24 },
      { problemKey: 'root_stress', effectValue: 0.14 },
      { problemKey: 'soft_rot', effectValue: 0.08 }
    ],
    no: [
      { problemKey: 'root_rot', effectValue: -0.08 }
    ]
  },
  q_root_rot_mushy_roots: {
    yes: [
      { problemKey: 'root_rot', effectValue: 0.28 },
      { problemKey: 'soft_rot', effectValue: 0.18 },
      { problemKey: 'crown_rot', effectValue: 0.1 }
    ],
    no: [
      { problemKey: 'root_rot', effectValue: -0.08 },
      { problemKey: 'soft_rot', effectValue: -0.06 }
    ]
  },
  q_black_spots_surface_layer_check: {
    embedded: [
      { problemKey: 'fungal_leaf_spot', effectValue: 0.2 },
      { problemKey: 'bacterial_leaf_spot', effectValue: 0.18 },
      { problemKey: 'sooty_mold_associated_pests', effectValue: -0.2 }
    ],
    surface: [
      { problemKey: 'sooty_mold_associated_pests', effectValue: 0.22 },
      { problemKey: 'fungal_leaf_spot', effectValue: -0.16 },
      { problemKey: 'bacterial_leaf_spot', effectValue: -0.14 }
    ]
  },
  q_black_spots_tissue_moisture_check: {
    dry_firm: [
      { problemKey: 'fungal_leaf_spot', effectValue: 0.18 },
      { problemKey: 'bacterial_leaf_spot', effectValue: 0.12 },
      { problemKey: 'edema', effectValue: -0.08 },
      { problemKey: 'fungus_gnat', effectValue: -0.1 }
    ],
    soft_wet: [
      { problemKey: 'bacterial_leaf_spot', effectValue: 0.24 },
      { problemKey: 'edema', effectValue: 0.18 },
      { problemKey: 'fungal_leaf_spot', effectValue: -0.14 }
    ]
  },
  q_brown_spots_halo_confirm: {
    yes: [
      { problemKey: 'bacterial_leaf_spot', effectValue: 0.2 },
      { problemKey: 'fungal_leaf_spot', effectValue: 0.1 }
    ],
    no: [
      { problemKey: 'fungal_leaf_spot', effectValue: 0.12 },
      { problemKey: 'bacterial_leaf_spot', effectValue: -0.14 }
    ]
  }
}

function resolveAuditedDirectProblemAdjustments(questionKey = '', optionKey = '') {
  const questionAdjustments = AUDITED_DIRECT_PROBLEM_ADJUSTMENTS[String(questionKey || '').trim()]
  if (!questionAdjustments) {return []}
  const optionAdjustments = questionAdjustments[String(optionKey || '').trim()]
  if (!Array.isArray(optionAdjustments)) {return []}

  return optionAdjustments.map(item => ({
    problemKey: String(item?.problemKey || '').trim(),
    effectValue: Number(item?.effectValue || 0)
  })).filter(item => item.problemKey && Number.isFinite(item.effectValue) && item.effectValue !== 0)
}

function mapQuestionRow(row = {}) {
  const questionKey = row.question_key || ''
  const targetSymptomKey = row.target_symptom_key || ''
  const targetDimension = normalizeQuestionTargetDimension(
    row.target_dimension,
    inferQuestionTargetDimension(questionKey, targetSymptomKey)
  )
  const routingScope = normalizeQuestionRoutingScope(
    row.routing_scope,
    inferQuestionRoutingScope(questionKey, targetSymptomKey)
  )
  const questionRole = normalizeQuestionRole(
    row.question_role,
    inferQuestionRole(targetDimension, routingScope)
  )

  return {
    questionKey,
    questionTextCn: row.question_text_cn || '',
    questionTextUserCn: row.question_text_user_cn || row.question_text_cn || '',
    questionType: row.question_type || 'single_choice',
    targetSymptomKey,
    questionGroupKey: row.question_group_key || '',
    questionLevel: Number(row.question_level || 1),
    observability: row.observability || 'medium',
    targetDimension,
    routingScope,
    questionRole,
    effectMode: normalizeQuestionEffectMode(
      row.effect_mode,
      inferQuestionEffectMode(questionRole, targetDimension)
    ),
    allowUnknown: Number(row.allow_unknown || 0) === 1,
    priority: Number(row.priority || 0),
    helpTextCn: row.help_text_cn || '',
    whyThisQuestionCn: row.why_this_question_cn || '',
    defaultOptionKey: row.default_option_key || '',
    uiVariant: row.ui_variant || '',
    renderMode: row.render_mode || '',
    templateEngineRuleKey: row.template_engine_rule_key || '',
    dataStatus: row.data_status || 'unknown',
    reviewStatus: row.review_status || 'unknown'
  }
}

function mapOptionRow(row = {}) {
  const directProblemAdjustments = resolveAuditedDirectProblemAdjustments(
    row.question_key,
    row.option_key
  )

  return {
    questionKey: row.question_key,
    optionKey: row.option_key,
    optionTextCn: row.option_text_cn || row.option_text_user_cn || row.option_key,
    optionTextUserCn: row.option_text_user_cn || row.option_text_cn || row.option_key,
    mapsToSymptomKey: row.maps_to_symptom_key || '',
    value: Number(row.value || 0),
    associationStrength: clamp01(row.association_strength),
    answerEffectCn: row.answer_effect_cn || '',
    optionDescriptionUserCn: row.option_description_user_cn || '',
    displayOrder: Number(row.display_order || 0),
    isDefault: Number(row.is_default || 0) === 1,
    directProblemAdjustments,
    dataStatus: row.data_status || 'unknown',
    reviewStatus: row.review_status || 'unknown'
  }
}

function mapStrategyRow(row = {}) {
  return {
    problemKey: row.problem_key,
    questionGroupKey: row.question_group_key || '',
    questionKey: row.question_key,
    priorityScore: Number(row.priority_score || 0),
    triggerType: row.trigger_type || 'candidate',
    strategyNoteCn: row.strategy_note_cn || '',
    dataStatus: row.data_status || 'unknown',
    reviewStatus: row.review_status || 'unknown'
  }
}

module.exports = {
  mapQuestionRow,
  mapOptionRow,
  mapStrategyRow
}
