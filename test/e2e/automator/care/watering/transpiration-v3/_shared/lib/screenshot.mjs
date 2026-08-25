'use strict'

/** Shared formal screenshot handoff for transpiration leaves. */
import path from 'node:path'
import automator from 'miniprogram-automator'
import { handoffFormalLeafScreenshot } from '../../../../../_shared/formal-leaf-harness.mjs'
import { resumeAutomatorSession } from './automator-client.mjs'
import { recordScreenshotAttempts } from './reporter.mjs'

export async function safeScreenshot(
  mp,
  artifactDir,
  label,
  wsEndpoint,
  { maxAttempts = 2, report = null, timeoutMs = undefined, expectedRoute = '' } = {}
) {
  if (!mp) {
    return null
  }
  const outputPath = path.resolve(artifactDir, `${label}.png`)
  try {
    const resumed = await handoffFormalLeafScreenshot({
      mp,
      automator,
      wsEndpoint,
      outputPath,
      maxAttempts,
      timeoutMs,
      expectedRoute
    })
    recordScreenshotAttempts(report, label, resumed.attempts)
    resumeAutomatorSession(mp, resumed.mp)
    return outputPath
  } catch (error) {
    recordScreenshotAttempts(report, label, error?.screenshot?.attempts)
    if (error?.reconnectedMp) {
      resumeAutomatorSession(mp, error.reconnectedMp)
    }
    return null
  }
}
