#!/usr/bin/env node
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'homeCardCareClosure',
  catalogId: 'care.home_card.water_and_fertilization_closure'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
