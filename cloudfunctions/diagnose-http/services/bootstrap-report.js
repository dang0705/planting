'use strict'

const repositoryShapes = require('../constants/repository-shapes')
const keyAliasMap = require('../constants/key-alias-map')
const { buildDataDiffReport } = require('../mappers/data-diff-builder')
const { buildBackfillPlan } = require('../mappers/data-backfill-builder')

function buildRefactorArtifacts(runtimeSchema = {}) {
  const dataDiffReport = buildDataDiffReport({ runtimeSchema })
  const backfillPlan = buildBackfillPlan(dataDiffReport)

  return {
    dataDiffReport,
    keyAliasMap,
    backfillPlan,
    repositoryOutputShape: repositoryShapes
  }
}

module.exports = {
  buildRefactorArtifacts
}
