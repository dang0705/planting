#!/usr/bin/env node
import { runDoseLive } from './_shared/run-dose-live.mjs'

runDoseLive({ variant: 'bottle_text' }).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exit(1)
})
