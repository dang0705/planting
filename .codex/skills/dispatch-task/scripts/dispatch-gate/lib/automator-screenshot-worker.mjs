#!/usr/bin/env node

import { runRendererScreenshotProbe } from './renderer-screenshot-probe.mjs'

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

async function connectMiniProgram({ wsEndpoint }) {
  const imported = await import('miniprogram-automator')
  const automator = imported.default ?? imported['module.exports'] ?? imported
  return automator.connect({ wsEndpoint })
}

function emitEvent(event) {
  emit(event)
}

const [, , wsEndpoint, outputPath, timeoutArg] = process.argv
if (!wsEndpoint || !outputPath) {
  emit({
    status: 'failed',
    error: 'usage: automator-screenshot-worker <wsEndpoint> <outputPath> [timeoutMs]'
  })
} else {
  runRendererScreenshotProbe({
    connect: connectMiniProgram,
    wsEndpoint,
    outputPath,
    timeoutMs: Number(timeoutArg) || 20000,
    emitEvent
  })
    .then(emit)
    .catch(error => emit({ status: 'failed', error: String(error?.message ?? error) }))
}
