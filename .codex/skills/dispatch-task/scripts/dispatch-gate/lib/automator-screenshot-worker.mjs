#!/usr/bin/env node

import { runRendererScreenshotProbe } from './renderer-screenshot-probe.mjs'
import { connectAutomatorTransport } from '../../../../../../test/e2e/automator/_shared/formal-leaf-harness.mjs'

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

async function connectMiniProgram({ wsEndpoint }) {
  const imported = await import('miniprogram-automator')
  const automator = imported.default ?? imported['module.exports'] ?? imported
  return connectAutomatorTransport(automator, wsEndpoint)
}

function emitEvent(event) {
  emit(event)
}

const [, , wsEndpoint, outputPath, timeoutArg, projectPath, expectedRoute] = process.argv
if (!wsEndpoint || !outputPath) {
  emit({
    status: 'failed',
    error:
      'usage: automator-screenshot-worker <wsEndpoint> <outputPath> [timeoutMs] [projectPath] [expectedRoute]'
  })
} else {
  runRendererScreenshotProbe({
    connect: connectMiniProgram,
    wsEndpoint,
    outputPath,
    timeoutMs: Number(timeoutArg) || 20000,
    projectPath,
    expectedRoute,
    emitEvent
  })
    .then(emit)
    .catch(error => emit({ status: 'failed', error: String(error?.message ?? error) }))
}
