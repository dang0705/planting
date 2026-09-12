#!/usr/bin/env node
import { runAirExchangeV1 } from './_shared/run-air-exchange-v1.mjs'

runAirExchangeV1().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exit(1)
})
