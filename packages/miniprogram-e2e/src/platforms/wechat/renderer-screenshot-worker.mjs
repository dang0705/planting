import { screenshotPage, connectWechatAutomator } from './automator-session.mjs'

const [wsEndpoint, outputPath] = process.argv.slice(2)

try {
  const connection = await connectWechatAutomator({ wsEndpoint })
  try {
    const result = await screenshotPage(connection.miniProgram, outputPath)
    process.stdout.write(`${JSON.stringify({ status: 'passed', ...result })}\n`)
  } finally {
    await connection.stop()
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: 'failed', code: error?.code || 'mp_e2e_renderer_worker_failed', message: error?.message || String(error) })}\n`)
  process.exitCode = 1
}
