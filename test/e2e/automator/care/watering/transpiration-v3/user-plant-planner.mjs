#!/usr/bin/env node
import { runTranspirationV3 } from './_shared/run-transpiration-v3.mjs'

runTranspirationV3({ forcedScenario: 'myplant' }).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exit(1)
})
