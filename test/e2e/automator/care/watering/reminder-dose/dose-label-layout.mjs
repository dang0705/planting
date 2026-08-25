#!/usr/bin/env node
import { runDoseLive } from './_shared/run-dose-live.mjs'

runDoseLive({ variant: 'dose_label_layout' }).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exit(1)
})
