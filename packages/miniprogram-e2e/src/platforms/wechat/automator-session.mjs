import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/** @param {{wsEndpoint:string}} options */
export async function connectWechatAutomator({ wsEndpoint }) {
  if (!/^ws:\/\/127\.0\.0\.1:\d+$/u.test(String(wsEndpoint || ''))) {
    const error = new Error('WeChat Automator endpoint must be a localhost ws URL')
    error.code = 'mp_e2e_wechat_endpoint_invalid'
    throw error
  }
  let imported
  try {
    imported = await import('miniprogram-automator')
  } catch (cause) {
    const error = new Error('miniprogram-automator peer dependency is required for WeChat sessions')
    error.code = 'mp_e2e_wechat_peer_missing'
    error.cause = cause
    throw error
  }
  const automator = imported.default || imported
  const miniProgram = await automator.connect({ wsEndpoint })
  return {
    miniProgram,
    async stop() {
      await miniProgram.disconnect?.()
    }
  }
}

/** @param {Buffer|Uint8Array|unknown} value */
export function isValidPng(value) {
  const bytes = Buffer.from(value || [])
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
}

/** @param {object} miniProgram @param {string} outputPath */
export async function screenshotPage(miniProgram, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true })
  await miniProgram.screenshot({ path: outputPath })
  const screenshot = await readFile(outputPath)
  if (!isValidPng(screenshot)) {
    const error = new Error('Renderer did not return a valid PNG')
    error.code = 'mp_e2e_invalid_png'
    throw error
  }
  return { path: outputPath, bytes: screenshot.length }
}
