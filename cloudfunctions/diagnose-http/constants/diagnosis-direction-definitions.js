'use strict'

const {
  QUESTION_TARGET_DIMENSIONS
} = require('../utils/question-target-dimension')

const DIAGNOSIS_DIRECTION_DEFINITIONS = [
  {
    directionKey: 'healthy_direction',
    categoryKey: 'healthy',
    label: '健康/非问题性方向',
    symptomKeys: [],
    patternKeys: [],
    routeHintTypes: ['possible_non_problematic_signal'],
    preferredQuestionDimensions: [
      QUESTION_TARGET_DIMENSIONS.STABILITY,
      QUESTION_TARGET_DIMENSIONS.PROGRESSION,
      QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
      QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
      QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT
    ],
    candidateProblemKeys: []
  },
  {
    directionKey: 'yellowing_direction',
    categoryKey: 'yellowing',
    label: '黄化方向',
    symptomKeys: [
      'leaf_yellowing',
      'yellow_new_leaves',
      'yellow_lower_leaves',
      'uniform_yellowing',
      'yellowing_patchy'
    ],
    patternKeys: [],
    preferredQuestionDimensions: [
      QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
      QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
      QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
      QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT,
      QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
      QUESTION_TARGET_DIMENSIONS.PROGRESSION
    ],
    candidateProblemKeys: [
      'iron_deficiency',
      'nitrogen_deficiency',
      'nutrient_deficiency',
      'underwatering',
      'overwatering',
      'low_light',
      'sunburn',
      'root_stress'
    ]
  },
  {
    directionKey: 'pest_direction',
    categoryKey: 'pest',
    label: '虫害方向',
    symptomKeys: [
      'yellow_speckling',
      'fine_webbing',
      'sticky_honeydew',
      'silver_streaks',
      'aphids_visible',
      'white_flies',
      'scale_shells',
      'small_flies_soil',
      'black_mold_growth',
      'sooty_mold',
      'chewed_edges',
      'holes_in_leaf',
      'skeletonized_leaves',
      'tunnels_in_leaf'
    ],
    patternKeys: [
      'webbing',
      'speckling',
      'sticky',
      'chew',
      'holes',
      'skeletonization',
      'tunnels'
    ],
    preferredQuestionDimensions: [
      QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
      QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
      QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY,
      QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
      QUESTION_TARGET_DIMENSIONS.PROGRESSION,
      QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
    ],
    candidateProblemKeys: [
      'spider_mites',
      'whiteflies',
      'aphids',
      'scale_insects',
      'thrips',
      'fungus_gnat',
      'sooty_mold_associated_pests',
      'chewing_insects',
      'caterpillars',
      'snails_slugs',
      'beetles',
      'leaf_miners'
    ]
  },
  {
    directionKey: 'mold_direction',
    categoryKey: 'mold',
    label: '霉菌方向',
    symptomKeys: [
      'powder_white',
      'sooty_mold',
      'black_mold_growth',
      'sticky_honeydew',
      'black_spots_spreading',
      'brown_spots_halo',
      'irregular_blotches'
    ],
    patternKeys: ['mold', 'powder', 'spots', 'blotch', 'blotches'],
    preferredQuestionDimensions: [
      QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
      QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
      QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
      QUESTION_TARGET_DIMENSIONS.LESION_HALO,
      QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
      QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
      QUESTION_TARGET_DIMENSIONS.PROGRESSION
    ],
    candidateProblemKeys: [
      'powdery_mildew',
      'fungal_leaf_spot',
      'sooty_mold_associated_pests',
      'whiteflies',
      'aphids',
      'scale_insects',
      'bacterial_leaf_spot'
    ]
  }
]

const ROOT_ZONE_STRONG_SYMPTOM_KEYS = new Set([
  'bad_root_smell',
  'roots_black',
  'roots_mushy',
  'wilting_wet_soil',
  'blackened_stem_base'
])

module.exports = {
  DIAGNOSIS_DIRECTION_DEFINITIONS,
  ROOT_ZONE_STRONG_SYMPTOM_KEYS
}
