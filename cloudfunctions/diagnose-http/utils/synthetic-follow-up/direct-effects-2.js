'use strict'

const { QUESTION_TARGET_DIMENSIONS } = require('../question-target-dimension')

module.exports = {
  black_spots_spreading: {
      [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE]: {
        yes: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.2 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.16 },
          { problemKey: 'sooty_mold_associated_pests', effectValue: -0.18 }
        ],
        no: [
          { problemKey: 'sooty_mold_associated_pests', effectValue: 0.22 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.14 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]: {
        yes: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.18 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.1 },
          { problemKey: 'edema', effectValue: -0.08 },
          { problemKey: 'fungus_gnat', effectValue: -0.1 }
        ],
        no: [
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.22 },
          { problemKey: 'edema', effectValue: 0.16 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.14 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.LESION_HALO]: {
        yes: [
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.18 },
          { problemKey: 'fungal_leaf_spot', effectValue: 0.1 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING]: {
        yes: [
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.24 },
          { problemKey: 'edema', effectValue: 0.16 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.12 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.14 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.22 },
          { problemKey: 'caterpillars', effectValue: 0.16 },
          { problemKey: 'beetles', effectValue: 0.14 },
          { problemKey: 'snails_slugs', effectValue: 0.12 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.16 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.12 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.18 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.14 },
          { problemKey: 'chewing_insects', effectValue: -0.18 },
          { problemKey: 'caterpillars', effectValue: -0.12 },
          { problemKey: 'beetles', effectValue: -0.1 },
          { problemKey: 'snails_slugs', effectValue: -0.1 }
        ]
      }
    },
  structuralDamageCause: {
      [QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE]: {
        pest_trace: [
          { problemKey: 'chewing_insects', effectValue: 0.28 },
          { problemKey: 'caterpillars', effectValue: 0.18 },
          { problemKey: 'beetles', effectValue: 0.14 },
          { problemKey: 'snails_slugs', effectValue: 0.14 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.1 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.08 }
        ],
        lesion_dropout: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.2 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.18 },
          { problemKey: 'chewing_insects', effectValue: -0.16 },
          { problemKey: 'caterpillars', effectValue: -0.1 },
          { problemKey: 'beetles', effectValue: -0.08 },
          { problemKey: 'snails_slugs', effectValue: -0.08 }
        ],
        mechanical_old: [
          { problemKey: 'chewing_insects', effectValue: -0.16 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.08 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.08 }
        ]
      }
    },
  pestTraceType: {
      [QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE]: {
        mite_webbing: [
          { problemKey: 'spider_mites', effectValue: 0.28 },
          { problemKey: 'thrips', effectValue: -0.08 },
          { problemKey: 'sunburn', effectValue: -0.1 },
          { problemKey: 'nutrient_deficiency', effectValue: -0.08 }
        ],
        thrips_silver_black: [
          { problemKey: 'thrips', effectValue: 0.28 },
          { problemKey: 'spider_mites', effectValue: -0.08 },
          { problemKey: 'sunburn', effectValue: -0.08 }
        ],
        sticky_honeydew: [
          { problemKey: 'whiteflies', effectValue: 0.22 },
          { problemKey: 'aphids', effectValue: 0.22 },
          { problemKey: 'scale_insects', effectValue: 0.2 },
          { problemKey: 'sooty_mold_associated_pests', effectValue: 0.18 },
          { problemKey: 'spider_mites', effectValue: -0.16 },
          { problemKey: 'thrips', effectValue: -0.08 }
        ],
        no_pest_trace: [
          { problemKey: 'spider_mites', effectValue: -0.18 },
          { problemKey: 'thrips', effectValue: -0.18 },
          { problemKey: 'whiteflies', effectValue: -0.14 },
          { problemKey: 'aphids', effectValue: -0.14 },
          { problemKey: 'scale_insects', effectValue: -0.12 },
          { problemKey: 'sunburn', effectValue: -0.02 },
          { problemKey: 'nutrient_deficiency', effectValue: -0.02 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS]: {
        yes: [
          { problemKey: 'whiteflies', effectValue: 0.24 },
          { problemKey: 'aphids', effectValue: 0.22 },
          { problemKey: 'scale_insects', effectValue: 0.2 },
          { problemKey: 'sooty_mold_associated_pests', effectValue: 0.16 },
          { problemKey: 'spider_mites', effectValue: -0.2 },
          { problemKey: 'thrips', effectValue: -0.1 }
        ],
        no: [
          { problemKey: 'whiteflies', effectValue: -0.14 },
          { problemKey: 'aphids', effectValue: -0.14 },
          { problemKey: 'scale_insects', effectValue: -0.12 },
          { problemKey: 'spider_mites', effectValue: 0.1 },
          { problemKey: 'thrips', effectValue: 0.04 }
        ]
      }
    },
  edemaBumpStage: {
      [QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE]: {
        watery_blister: [
          { problemKey: 'edema', effectValue: 0.24 },
          { problemKey: 'overwatering', effectValue: 0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.08 }
        ],
        corky_scab: [
          { problemKey: 'edema', effectValue: 0.28 },
          { problemKey: 'overwatering', effectValue: 0.1 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.08 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.08 }
        ],
        flat_spot: [
          { problemKey: 'edema', effectValue: -0.18 },
          { problemKey: 'fungal_leaf_spot', effectValue: 0.08 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.06 }
        ]
      }
    },
  tunnels_in_leaf: {
      [QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN]: {
        mine_line: [
          { problemKey: 'leaf_miners', effectValue: 0.3 }
        ],
        other_mark: [
          { problemKey: 'leaf_miners', effectValue: -0.22 }
        ]
      }
    },
  powder_white: {
      [QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN]: {
        spreading_powder: [
          { problemKey: 'powdery_mildew', effectValue: 0.3 }
        ],
        limited_static: [
          { problemKey: 'powdery_mildew', effectValue: -0.12 }
        ]
      }
    },
  brown_spots_halo: {
      [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE]: {
        yes: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.2 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.18 },
          { problemKey: 'sooty_mold_associated_pests', effectValue: -0.2 }
        ],
        no: [
          { problemKey: 'sooty_mold_associated_pests', effectValue: 0.22 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.16 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.14 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]: {
        yes: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.18 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.12 },
          { problemKey: 'edema', effectValue: -0.08 },
          { problemKey: 'fungus_gnat', effectValue: -0.1 }
        ],
        no: [
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.24 },
          { problemKey: 'edema', effectValue: 0.18 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.14 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.LESION_HALO]: {
        yes: [
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.2 },
          { problemKey: 'fungal_leaf_spot', effectValue: 0.1 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.14 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING]: {
        yes: [
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.24 },
          { problemKey: 'edema', effectValue: 0.18 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.12 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.16 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.22 },
          { problemKey: 'caterpillars', effectValue: 0.16 },
          { problemKey: 'beetles', effectValue: 0.14 },
          { problemKey: 'snails_slugs', effectValue: 0.12 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.16 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.14 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.18 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.16 },
          { problemKey: 'chewing_insects', effectValue: -0.18 },
          { problemKey: 'caterpillars', effectValue: -0.12 },
          { problemKey: 'beetles', effectValue: -0.1 },
          { problemKey: 'snails_slugs', effectValue: -0.1 }
        ]
      }
    },
  irregular_blotches: {
      [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE]: {
        yes: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.18 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.14 },
          { problemKey: 'sooty_mold_associated_pests', effectValue: -0.16 }
        ],
        no: [
          { problemKey: 'sooty_mold_associated_pests', effectValue: 0.2 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.1 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]: {
        yes: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.16 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.1 },
          { problemKey: 'edema', effectValue: -0.08 }
        ],
        no: [
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.2 },
          { problemKey: 'edema', effectValue: 0.16 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.2 },
          { problemKey: 'caterpillars', effectValue: 0.14 },
          { problemKey: 'beetles', effectValue: 0.12 },
          { problemKey: 'snails_slugs', effectValue: 0.12 },
          { problemKey: 'fungal_leaf_spot', effectValue: -0.14 },
          { problemKey: 'bacterial_leaf_spot', effectValue: -0.1 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.14 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.12 },
          { problemKey: 'chewing_insects', effectValue: -0.16 },
          { problemKey: 'caterpillars', effectValue: -0.12 },
          { problemKey: 'beetles', effectValue: -0.1 },
          { problemKey: 'snails_slugs', effectValue: -0.1 }
        ]
      }
    },
  chewed_edges: {
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.08 },
          { problemKey: 'caterpillars', effectValue: 0.06 },
          { problemKey: 'beetles', effectValue: 0.05 },
          { problemKey: 'snails_slugs', effectValue: 0.05 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.1 },
          { problemKey: 'chewing_insects', effectValue: -0.18 },
          { problemKey: 'caterpillars', effectValue: -0.12 },
          { problemKey: 'beetles', effectValue: -0.1 },
          { problemKey: 'snails_slugs', effectValue: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.22 },
          { problemKey: 'caterpillars', effectValue: 0.16 },
          { problemKey: 'beetles', effectValue: 0.12 },
          { problemKey: 'snails_slugs', effectValue: 0.1 }
        ],
        no: [
          { problemKey: 'chewing_insects', effectValue: -0.12 },
          { problemKey: 'caterpillars', effectValue: -0.1 },
          { problemKey: 'beetles', effectValue: -0.08 },
          { problemKey: 'snails_slugs', effectValue: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.06 },
          { problemKey: 'caterpillars', effectValue: 0.04 },
          { problemKey: 'beetles', effectValue: 0.04 },
          { problemKey: 'snails_slugs', effectValue: 0.04 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.05 },
          { problemKey: 'caterpillars', effectValue: 0.04 },
          { problemKey: 'beetles', effectValue: 0.04 }
        ]
      }
    }
}
