import { parentPort, workerData } from 'node:worker_threads'
import { runRendererScreenshotProbe } from './renderer-screenshot-probe.mjs'
import { connectAutomatorTransport } from '../../../../../../test/e2e/automator/_shared/formal-leaf-harness.mjs'

function emit(result) {
  parentPort?.postMessage(result)
}

async function connectMiniProgram({ wsEndpoint }) {
  const imported = await import('miniprogram-automator')
  const automator = imported.default ?? imported['module.exports'] ?? imported
  return connectAutomatorTransport(automator, wsEndpoint)
}

runRendererScreenshotProbe({
  connect: connectMiniProgram,
  wsEndpoint: workerData.wsEndpoint,
  outputPath: workerData.outputPath,
  timeoutMs: workerData.timeoutMs,
  projectPath: workerData.projectPath,
  expectedRoute: workerData.expectedRoute,
  emitEvent: emit
})
  .then(emit)
  .catch(error => emit({ status: 'failed', error: String(error?.message ?? error) }))
