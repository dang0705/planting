'use strict'

const { QUESTION_TARGET_DIMENSIONS } = require('../question-target-dimension')

module.exports = {
  holes_in_leaf: {
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', scoreDelta: 0.08 },
          { problemKey: 'caterpillars', scoreDelta: 0.06 },
          { problemKey: 'snails_slugs', scoreDelta: 0.06 },
          { problemKey: 'beetles', scoreDelta: 0.05 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
          { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.1 },
          { problemKey: 'chewing_insects', scoreDelta: -0.2 },
          { problemKey: 'caterpillars', scoreDelta: -0.14 },
          { problemKey: 'snails_slugs', scoreDelta: -0.14 },
          { problemKey: 'beetles', scoreDelta: -0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'chewing_insects', scoreDelta: 0.22 },
          { problemKey: 'caterpillars', scoreDelta: 0.14 },
          { problemKey: 'snails_slugs', scoreDelta: 0.14 },
          { problemKey: 'beetles', scoreDelta: 0.12 }
        ],
        no: [
          { problemKey: 'chewing_insects', scoreDelta: -0.12 },
          { problemKey: 'caterpillars', scoreDelta: -0.1 },
          { problemKey: 'snails_slugs', scoreDelta: -0.1 },
          { problemKey: 'beetles', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'chewing_insects', scoreDelta: 0.06 },
          { problemKey: 'caterpillars', scoreDelta: 0.04 },
          { problemKey: 'snails_slugs', scoreDelta: 0.04 },
          { problemKey: 'beetles', scoreDelta: 0.04 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'chewing_insects', scoreDelta: 0.05 },
          { problemKey: 'snails_slugs', scoreDelta: 0.04 }
        ]
      }
    },
  skeletonized_leaves: {
      [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
        yes: [
          { problemKey: 'chewing_insects', scoreDelta: 0.08 },
          { problemKey: 'beetles', scoreDelta: 0.06 },
          { problemKey: 'caterpillars', scoreDelta: 0.05 }
        ],
        no: [
          { problemKey: 'fungal_leaf_spot', scoreDelta: 0.1 },
          { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.08 },
          { problemKey: 'chewing_insects', scoreDelta: -0.22 },
          { problemKey: 'beetles', scoreDelta: -0.16 },
          { problemKey: 'caterpillars', scoreDelta: -0.14 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'chewing_insects', scoreDelta: 0.24 },
          { problemKey: 'beetles', scoreDelta: 0.16 },
          { problemKey: 'caterpillars', scoreDelta: 0.12 }
        ],
        no: [
          { problemKey: 'chewing_insects', scoreDelta: -0.12 },
          { problemKey: 'beetles', scoreDelta: -0.1 },
          { problemKey: 'caterpillars', scoreDelta: -0.08 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'chewing_insects', scoreDelta: 0.06 },
          { problemKey: 'beetles', scoreDelta: 0.05 },
          { problemKey: 'caterpillars', scoreDelta: 0.04 }
        ]
      }
    },
  tunnels_in_leaf: {
      [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
        yes: [
          { problemKey: 'leaf_miners', scoreDelta: 0.22 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
        yes: [
          { problemKey: 'leaf_miners', scoreDelta: 0.12 }
        ]
      }
    },
  water_soaked_stem: {
      [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
        yes: [
          { problemKey: 'poor_drainage', scoreDelta: 0.18 },
          { problemKey: 'root_stress', scoreDelta: 0.14 },
          { problemKey: 'general_stress', scoreDelta: 0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'poor_drainage', scoreDelta: 0.14 },
          { problemKey: 'root_stress', scoreDelta: 0.12 },
          { problemKey: 'general_stress', scoreDelta: 0.1 }
        ],
        no: [
          { problemKey: 'environmental_stress', scoreDelta: 0.12 },
          { problemKey: 'general_stress', scoreDelta: 0.12 }
        ]
      }
    },
  soft_stem: {
      [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
        yes: [
          { problemKey: 'poor_drainage', scoreDelta: 0.16 },
          { problemKey: 'root_stress', scoreDelta: 0.14 },
          { problemKey: 'general_stress', scoreDelta: 0.12 }
        ]
      },
      [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
        yes: [
          { problemKey: 'poor_drainage', scoreDelta: 0.12 },
          { problemKey: 'root_stress', scoreDelta: 0.12 },
          { problemKey: 'general_stress', scoreDelta: 0.1 }
        ],
        no: [
          { problemKey: 'environmental_stress', scoreDelta: 0.1 },
          { problemKey: 'general_stress', scoreDelta: 0.1 }
        ]
      }
    }
}
