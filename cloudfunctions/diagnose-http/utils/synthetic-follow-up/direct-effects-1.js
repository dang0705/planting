'use strict'

const { QUESTION_TARGET_DIMENSIONS } = require('../question-target-dimension')

module.exports = {
  leaf_yellowing: {
      [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
        yes: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.34 },
          { problemKey: 'low_light', scoreDelta: 0.14 },
          { problemKey: 'iron_deficiency', scoreDelta: -0.12 }
        ],
        no: [
          { problemKey: 'iron_deficiency', scoreDelta: 0.24 },
          { problemKey: 'root_stress', scoreDelta: 0.14 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.1 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'root_stress', scoreDelta: 0.14 },
          { problemKey: 'temperature_stress', scoreDelta: 0.1 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 },
          { problemKey: 'iron_deficiency', scoreDelta: -0.08 }
        ],
        no: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.2 },
          { problemKey: 'iron_deficiency', scoreDelta: 0.16 },
          { problemKey: 'low_light', scoreDelta: 0.14 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 },
          { problemKey: 'root_rot', scoreDelta: -0.1 },
          { problemKey: 'overwatering', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'spider_mites', scoreDelta: 0.12 },
          { problemKey: 'thrips', scoreDelta: 0.12 },
          { problemKey: 'aphids', scoreDelta: 0.1 },
          { problemKey: 'sunburn', scoreDelta: 0.1 }
        ],
        no: [
          { problemKey: 'chlorosis', scoreDelta: 0.14 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.18 },
          { problemKey: 'iron_deficiency', scoreDelta: 0.16 },
          { problemKey: 'low_light', scoreDelta: 0.12 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE]: {
        yes: [
          { problemKey: 'sunburn', scoreDelta: 0.26 },
          { problemKey: 'heat_stress', scoreDelta: 0.2 },
          { problemKey: 'low_light', scoreDelta: -0.14 }
        ],
        no: [
          { problemKey: 'low_light', scoreDelta: 0.18 },
          { problemKey: 'iron_deficiency', scoreDelta: 0.08 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.06 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT]: {
        yes: [
          { problemKey: 'overwatering', scoreDelta: 0.26 },
          { problemKey: 'root_rot', scoreDelta: 0.18 },
          { problemKey: 'root_stress', scoreDelta: 0.16 },
          { problemKey: 'underwatering', scoreDelta: -0.16 }
        ],
        no: [
          { problemKey: 'underwatering', scoreDelta: 0.24 },
          { problemKey: 'low_light', scoreDelta: 0.08 },
          { problemKey: 'overwatering', scoreDelta: -0.16 },
          { problemKey: 'root_rot', scoreDelta: -0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT]: {
        yes: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.24 },
          { problemKey: 'iron_deficiency', scoreDelta: 0.18 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.18 },
          { problemKey: 'low_light', scoreDelta: -0.08 }
        ],
        no: [
          { problemKey: 'low_light', scoreDelta: 0.12 },
          { problemKey: 'root_stress', scoreDelta: 0.08 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 },
          { problemKey: 'iron_deficiency', scoreDelta: -0.08 }
        ]
      }
    },
  yellowingDifferential: {
      [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE]: {
        halo_spots: [
          { problemKey: 'fungal_leaf_spot', scoreDelta: 0.2 },
          { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.14 }
        ],
        water_soaked_soft: [
          { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.2 },
          { problemKey: 'root_rot', scoreDelta: 0.1 },
          { problemKey: 'soft_rot', scoreDelta: 0.08 }
        ],
        powder_mold_surface: [
          { problemKey: 'powdery_mildew', scoreDelta: 0.2 },
          { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.12 }
        ],
        yellowing_only_no_lesion: [
          { problemKey: 'fungal_leaf_spot', scoreDelta: -0.1 },
          { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.1 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.03 },
          { problemKey: 'low_light', scoreDelta: 0.03 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE]: {
        mite_webbing: [
          { problemKey: 'spider_mites', scoreDelta: 0.22 },
          { problemKey: 'whiteflies', scoreDelta: -0.08 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 }
        ],
        thrips_silver_black: [
          { problemKey: 'thrips', scoreDelta: 0.22 },
          { problemKey: 'spider_mites', scoreDelta: -0.08 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 }
        ],
        sticky_honeydew: [
          { problemKey: 'whiteflies', scoreDelta: 0.2 },
          { problemKey: 'aphids', scoreDelta: 0.18 },
          { problemKey: 'scale_insects', scoreDelta: 0.18 },
          { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.14 },
          { problemKey: 'spider_mites', scoreDelta: -0.12 }
        ],
        no_pest_trace: [
          { problemKey: 'spider_mites', scoreDelta: -0.1 },
          { problemKey: 'whiteflies', scoreDelta: -0.1 },
          { problemKey: 'aphids', scoreDelta: -0.08 },
          { problemKey: 'thrips', scoreDelta: -0.08 },
          { problemKey: 'low_light', scoreDelta: -0.02 },
          { problemKey: 'nutrient_deficiency', scoreDelta: -0.02 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN]: {
        new_leaves_first: [
          { problemKey: 'iron_deficiency', scoreDelta: 0.26 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.12 }
        ],
        old_lower_leaves_first: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.16 },
          { problemKey: 'low_light', scoreDelta: 0.04 },
          { problemKey: 'iron_deficiency', scoreDelta: -0.14 }
        ],
        no_clear_age_bias: [
          { problemKey: 'low_light', scoreDelta: 0.04 },
          { problemKey: 'root_stress', scoreDelta: 0.04 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.03 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN]: {
        uniform_whole_leaf: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.12 },
          { problemKey: 'low_light', scoreDelta: 0.05 },
          { problemKey: 'overwatering', scoreDelta: 0.03 }
        ],
        interveinal: [
          { problemKey: 'iron_deficiency', scoreDelta: 0.28 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.1 }
        ],
        patchy_or_speckled: [
          { problemKey: 'thrips', scoreDelta: 0.1 },
          { problemKey: 'spider_mites', scoreDelta: 0.1 },
          { problemKey: 'sunburn', scoreDelta: 0.08 }
        ],
        edge_or_scorch_patch: [
          { problemKey: 'sunburn', scoreDelta: 0.22 },
          { problemKey: 'heat_stress', scoreDelta: 0.14 },
          { problemKey: 'salt_stress', scoreDelta: 0.1 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT]: {
        often_wet: [
          { problemKey: 'overwatering', scoreDelta: 0.26 },
          { problemKey: 'root_stress', scoreDelta: 0.18 },
          { problemKey: 'root_rot', scoreDelta: 0.1 },
          { problemKey: 'underwatering', scoreDelta: -0.18 }
        ],
        often_dry: [
          { problemKey: 'underwatering', scoreDelta: 0.26 },
          { problemKey: 'overwatering', scoreDelta: -0.18 },
          { problemKey: 'root_rot', scoreDelta: -0.1 }
        ],
        normal_or_stable: [
          { problemKey: 'overwatering', scoreDelta: -0.1 },
          { problemKey: 'underwatering', scoreDelta: -0.1 },
          { problemKey: 'root_rot', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT]: {
        stronger_direct_light: [
          { problemKey: 'sunburn', scoreDelta: 0.24 },
          { problemKey: 'heat_stress', scoreDelta: 0.18 },
          { problemKey: 'low_light', scoreDelta: -0.16 }
        ],
        weaker_light: [
          { problemKey: 'low_light', scoreDelta: 0.24 },
          { problemKey: 'sunburn', scoreDelta: -0.14 }
        ],
        no_clear_change: [
          { problemKey: 'low_light', scoreDelta: -0.08 },
          { problemKey: 'sunburn', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT]: {
        low_or_no_fertilizer: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.22 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.2 },
          { problemKey: 'iron_deficiency', scoreDelta: 0.12 }
        ],
        normal_light_fertilizer: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 },
          { problemKey: 'nutrient_deficiency', scoreDelta: -0.08 }
        ],
        recent_heavy_fertilizer_or_repot: [
          { problemKey: 'root_stress', scoreDelta: 0.12 },
          { problemKey: 'nutrient_deficiency', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED]: {
        rapid_spreading: [
          { problemKey: 'root_stress', scoreDelta: 0.16 },
          { problemKey: 'temperature_stress', scoreDelta: 0.12 },
          { problemKey: 'root_rot', scoreDelta: 0.08 }
        ],
        slow_stable: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.1 },
          { problemKey: 'low_light', scoreDelta: 0.1 },
          { problemKey: 'root_rot', scoreDelta: -0.08 }
        ],
        with_wilting_or_drop: [
          { problemKey: 'root_stress', scoreDelta: 0.2 },
          { problemKey: 'root_rot', scoreDelta: 0.12 },
          { problemKey: 'overwatering', scoreDelta: 0.1 }
        ]
      }
    },
  yellow_speckling: {
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'spider_mites', scoreDelta: 0.14 },
          { problemKey: 'whiteflies', scoreDelta: 0.14 },
          { problemKey: 'aphids', scoreDelta: 0.08 },
          { problemKey: 'thrips', scoreDelta: 0.1 }
        ],
        no: [
          { problemKey: 'spider_mites', scoreDelta: -0.1 },
          { problemKey: 'whiteflies', scoreDelta: -0.1 },
          { problemKey: 'aphids', scoreDelta: -0.08 },
          { problemKey: 'sunburn', scoreDelta: 0.12 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.1 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS]: {
        yes: [
          { problemKey: 'whiteflies', scoreDelta: 0.26 },
          { problemKey: 'aphids', scoreDelta: 0.24 },
          { problemKey: 'scale_insects', scoreDelta: 0.22 },
          { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.18 },
          { problemKey: 'spider_mites', scoreDelta: -0.22 },
          { problemKey: 'thrips', scoreDelta: -0.12 }
        ],
        no: [
          { problemKey: 'spider_mites', scoreDelta: -0.12 },
          { problemKey: 'thrips', scoreDelta: -0.08 },
          { problemKey: 'whiteflies', scoreDelta: -0.12 },
          { problemKey: 'aphids', scoreDelta: -0.12 },
          { problemKey: 'scale_insects', scoreDelta: -0.1 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'spider_mites', scoreDelta: 0.08 },
          { problemKey: 'thrips', scoreDelta: 0.12 },
          { problemKey: 'aphids', scoreDelta: 0.1 },
          { problemKey: 'whiteflies', scoreDelta: 0.1 }
        ],
        no: [
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.14 },
          { problemKey: 'iron_deficiency', scoreDelta: 0.12 },
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.12 },
          { problemKey: 'low_light', scoreDelta: 0.1 },
          { problemKey: 'spider_mites', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'spider_mites', scoreDelta: 0.08 },
          { problemKey: 'thrips', scoreDelta: 0.12 },
          { problemKey: 'whiteflies', scoreDelta: 0.08 }
        ],
        no: [
          { problemKey: 'sunburn', scoreDelta: 0.12 },
          { problemKey: 'nutrient_deficiency', scoreDelta: 0.1 },
          { problemKey: 'spider_mites', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
        yes: [
          { problemKey: 'nitrogen_deficiency', scoreDelta: 0.14 },
          { problemKey: 'low_light', scoreDelta: 0.1 },
          { problemKey: 'spider_mites', scoreDelta: -0.1 }
        ],
        no: [
          { problemKey: 'spider_mites', scoreDelta: 0.04 },
          { problemKey: 'thrips', scoreDelta: 0.1 },
          { problemKey: 'whiteflies', scoreDelta: 0.08 }
        ]
      }
    }
}
