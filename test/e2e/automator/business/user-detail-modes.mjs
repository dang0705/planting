#!/usr/bin/env node
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'userDetailModes',
  catalogId: 'plant.user_detail_create_edit_view_modes'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
