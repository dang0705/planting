#!/usr/bin/env node
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'userPlantDeleteConfirmation',
  catalogId: 'user.plant_detail.delete_confirmation'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
