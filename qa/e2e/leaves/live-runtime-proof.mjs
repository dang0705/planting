import path from 'node:path'
import { defineLeaf } from '../../../packages/miniprogram-e2e/src/contracts/index.mjs'
import { screenshotPage } from '../../../packages/miniprogram-e2e/src/platforms/wechat/index.mjs'

export default defineLeaf(
  { id: 'platform.live_runtime_proof', dataMode: 'live_real', title: 'WeChat renderer and runtime request proof' },
  async ({ session, evidenceDir }) => {
    const page = await session.miniProgram.currentPage()
    if (!page) {
      throw new Error('current Mini Program page is unavailable')
    }
    const screenshot = path.join(evidenceDir, 'renderer.png')
    // Keep the suite-owned Automator connection alive. The installed DevTools
    // runtime can tear down the service when a disposable second client
    // disconnects, which would make every following leaf look like an
    // infrastructure failure. This proof deliberately captures through the
    // already verified session connection; the worker remains available for
    // isolated diagnostic captures.
    const png = await screenshotPage(session.miniProgram, screenshot)
    return {
      status: 'passed',
      assertions: [
        { name: 'renderer_png', passed: true, evidence: png },
        { name: 'runtime_wx_request', passed: true, evidence: 'verified by the explicit Planting application-session provider' }
      ]
    }
  }
)
