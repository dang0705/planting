#!/usr/bin/env node
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'lightEnvironmentSave',
  catalogId: 'plant.light_environment_save_event_channel'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
