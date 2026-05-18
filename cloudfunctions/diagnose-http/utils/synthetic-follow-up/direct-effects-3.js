'use strict'

const { QUESTION_TARGET_DIMENSIONS } = require('../question-target-dimension')

module.exports = {
  holes_in_leaf: {
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.08 },
          { problemKey: 'caterpillars', effectValue: 0.06 },
          { problemKey: 'snails_slugs', effectValue: 0.06 },
          { problemKey: 'beetles', effectValue: 0.05 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.12 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.1 },
          { problemKey: 'chewing_insects', effectValue: -0.2 },
          { problemKey: 'caterpillars', effectValue: -0.14 },
          { problemKey: 'snails_slugs', effectValue: -0.14 },
          { problemKey: 'beetles', effectValue: -0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.22 },
          { problemKey: 'caterpillars', effectValue: 0.14 },
          { problemKey: 'snails_slugs', effectValue: 0.14 },
          { problemKey: 'beetles', effectValue: 0.12 }
        ],
        no: [
          { problemKey: 'chewing_insects', effectValue: -0.12 },
          { problemKey: 'caterpillars', effectValue: -0.1 },
          { problemKey: 'snails_slugs', effectValue: -0.1 },
          { problemKey: 'beetles', effectValue: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.06 },
          { problemKey: 'caterpillars', effectValue: 0.04 },
          { problemKey: 'snails_slugs', effectValue: 0.04 },
          { problemKey: 'beetles', effectValue: 0.04 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.05 },
          { problemKey: 'snails_slugs', effectValue: 0.04 }
        ]
      }
    },
  skeletonized_leaves: {
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.08 },
          { problemKey: 'beetles', effectValue: 0.06 },
          { problemKey: 'caterpillars', effectValue: 0.05 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', effectValue: 0.1 },
          { problemKey: 'bacterial_leaf_spot', effectValue: 0.08 },
          { problemKey: 'chewing_insects', effectValue: -0.22 },
          { problemKey: 'beetles', effectValue: -0.16 },
          { problemKey: 'caterpillars', effectValue: -0.14 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.24 },
          { problemKey: 'beetles', effectValue: 0.16 },
          { problemKey: 'caterpillars', effectValue: 0.12 }
        ],
        no: [
          { problemKey: 'chewing_insects', effectValue: -0.12 },
          { problemKey: 'beetles', effectValue: -0.1 },
          { problemKey: 'caterpillars', effectValue: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'chewing_insects', effectValue: 0.06 },
          { problemKey: 'beetles', effectValue: 0.05 },
          { problemKey: 'caterpillars', effectValue: 0.04 }
        ]
      }
    },
  tunnels_in_leaf: {
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'leaf_miners', effectValue: 0.22 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'leaf_miners', effectValue: 0.12 }
        ]
      }
    },
  water_soaked_stem: {
      [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
        yes: [
          { problemKey: 'poor_drainage', effectValue: 0.18 },
          { problemKey: 'root_stress', effectValue: 0.14 },
          { problemKey: 'general_stress', effectValue: 0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'poor_drainage', effectValue: 0.14 },
          { problemKey: 'root_stress', effectValue: 0.12 },
          { problemKey: 'general_stress', effectValue: 0.1 }
        ],
        no: [
          { problemKey: 'environmental_stress', effectValue: 0.12 },
          { problemKey: 'general_stress', effectValue: 0.12 }
        ]
      }
    },
  soft_stem: {
      [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
        yes: [
          { problemKey: 'poor_drainage', effectValue: 0.16 },
          { problemKey: 'root_stress', effectValue: 0.14 },
          { problemKey: 'general_stress', effectValue: 0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'poor_drainage', effectValue: 0.12 },
          { problemKey: 'root_stress', effectValue: 0.12 },
          { problemKey: 'general_stress', effectValue: 0.1 }
        ],
        no: [
          { problemKey: 'environmental_stress', effectValue: 0.1 },
          { problemKey: 'general_stress', effectValue: 0.1 }
        ]
      }
    }
}
