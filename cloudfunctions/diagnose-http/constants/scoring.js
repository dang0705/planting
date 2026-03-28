'use strict'

module.exports = {
  evidence: {
    questionWeight: 1.25,
    maxVisualSymptoms: 8
  },
  prior: {
    genusBase: 0.6,
    genusWeight: 0.4,
    hostBase: 0.8,
    hostWeight: 0.2
  },
  causality: {
    topK: 3,
    relationTypeFactors: {
      causes: 0.25,
      predisposes: 0.18,
      leads_to: 0.12,
      co_occurs: 0.08
    }
  },
  ranking: {
    followUpTopScoreThreshold: 0.62,
    followUpGapThreshold: 0.15,
    maxQuestionsPerRound: 3,
    maxRounds: 4,
    supportRolesAsTop1: ['root_cause', 'secondary_issue'],
    contributingRoles: ['predisposing_factor'],
    intermediateRoles: ['result_state', 'aggregate_cluster']
  },
  unknownFlow: {
    groupUnknownThreshold: 2
  }
}
