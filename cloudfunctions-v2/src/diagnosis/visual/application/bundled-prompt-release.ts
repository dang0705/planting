import { createHash } from 'node:crypto'

import agentAllowlist from '../../../../../docs/backend-v2/contracts/diagnosis-visual-gen-agent-allowlist.v1.json'
import promptV13 from '../../../../models/diagnosis/visual-diagnosis-prompt.v1.3.release.json'
import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../../foundation/json/canonical-json-sha256.js'
import type { ReadVisualPromptRelease, VisualPromptRelease } from './visual-ports.js'

/**
 * 随函数包打包的视觉诊断提示词发布（用户 2026-10-11 裁决：v1.3 为首个发布版；4/4 定稿后另发 v2，旧版保留以便回滚）。
 *
 * 通俗说明：提示词正文像前端打包进 bundle 的静态资源，策略里只登记它的「指纹」（SHA-256）。
 * 运行时按指纹取正文：指纹对得上才用；对不上（例如策略已切到尚未打包的新版）就返回 null，接口 503，绝不换用别的提示词。
 * 在途诊断按创建时锁定的指纹取，所以切换或回滚策略不影响已发起的诊断。
 */

/** 发布文件结构（models/diagnosis/visual-diagnosis-prompt.*.release.json）。 */
interface PromptReleaseFile {
  /** 发布版本，例如 visual-diagnosis-prompt/v1.3。 */
  readonly releaseVersion: string
  /** 登记的前缀摘要（必须等于 prefixText 的 SHA-256）。 */
  readonly promptReleaseSha256: string
  /** 模型输出结构版本。 */
  readonly outputSchemaVersion: string
  /** 药剂允许名单版本。 */
  readonly agentAllowlistVersion: string
  /** 药剂允许名单 JSON 的规范化 SHA-256。 */
  readonly agentAllowlistSha256: string
  /** 前缀【4】段的病因编号闭集。 */
  readonly causeCatalog: readonly string[]
  /** 固定前缀正文（system 消息）。 */
  readonly prefixText: string
}

/** 打包名单的规范化摘要（与发布文件登记值比对）。 */
const bundledAllowlistSha256 = calculateCanonicalJsonSha256(
  agentAllowlist as unknown as CanonicalJsonValue
)

/** 校验发布文件自洽：正文摘要与名单摘要都必须与登记一致，否则不收录（失败关闭）。 */
function verified(file: PromptReleaseFile): VisualPromptRelease | null {
  const actual = createHash('sha256').update(file.prefixText, 'utf8').digest('hex')
  if (actual !== file.promptReleaseSha256 || file.agentAllowlistSha256 !== bundledAllowlistSha256) {
    return null
  }
  return Object.freeze({
    prefixText: file.prefixText,
    promptReleaseSha256: file.promptReleaseSha256,
    outputSchemaVersion: file.outputSchemaVersion,
    agentAllowlistVersion: file.agentAllowlistVersion,
    causeCatalog: Object.freeze([...file.causeCatalog]),
    strictOutputSchema: null
  })
}

/** 已打包且自洽的全部发布（新版本追加在后面，旧版本保留以便回滚）。 */
export const BUNDLED_VISUAL_PROMPT_RELEASES: readonly VisualPromptRelease[] = Object.freeze(
  [promptV13 as PromptReleaseFile].flatMap(file => {
    const release = verified(file)
    return release === null ? [] : [release]
  })
)

/** 创建按摘要读取打包发布的端口。 */
export function createBundledVisualPromptReleaseReader(): ReadVisualPromptRelease {
  const bySha = new Map(
    BUNDLED_VISUAL_PROMPT_RELEASES.map(release => [release.promptReleaseSha256, release])
  )
  return async promptReleaseSha256 => bySha.get(promptReleaseSha256) ?? null
}
