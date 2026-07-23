'use strict'

/**
 * 截图工具 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 安全截图：miniProgram.screenshot() 可能 hang，用 Promise.race + timeout
 *   - 保存到 artifact 目录，返回绝对路径
 *   - 失败不阻断主流程（返回 null）
 *
 * 不承载业务逻辑。
 */

import path from 'node:path'
import fs from 'node:fs'

const SCREENSHOT_TIMEOUT_MS = 8000
const MAX_RETRIES = 3

/**
 * 安全截图。失败返回 null，不抛错。
 *
 * @param {object} mp - miniProgram 实例
 * @param {string} artifactDir - 截图保存目录
 * @param {string} label - 文件名标签（不含扩展名）
 * @returns {Promise<string|null>} 截图绝对路径，或 null
 */
export async function safeScreenshot(mp, artifactDir, label) {
  if (!mp) return null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buf = await Promise.race([
        mp.screenshot(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`screenshot_timeout after ${SCREENSHOT_TIMEOUT_MS}ms`)),
            SCREENSHOT_TIMEOUT_MS
          )
        )
      ])
      if (buf) {
        const filename = `${label}-${attempt}.png`
        const filepath = path.resolve(artifactDir, filename)
        fs.writeFileSync(filepath, buf)
        return filepath
      }
    } catch (error) {
      // retry
    }
  }
  return null
}
