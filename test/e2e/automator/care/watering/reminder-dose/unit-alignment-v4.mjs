#!/usr/bin/env node
import { runDoseLive } from './_shared/run-dose-live.mjs'

runDoseLive({ variant: 'unit_alignment_v4' }).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exit(1)
})
