import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  BUNDLED_VISUAL_PROMPT_RELEASES,
  createBundledVisualPromptReleaseReader
} from '../../../src/diagnosis/visual/application/bundled-prompt-release.js'
import { calculateCanonicalJsonSha256 } from '../../../src/foundation/json/canonical-json-sha256.js'
import {
  extractCauseCodesFromPrefix,
  extractPrefixFromDraft
} from '../../../scripts/visual-diagnosis-eval/eval-core.js'
import { findProjectRoot } from '../../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-11 裁决（协调方转达）——提示词 v1.3、对应输出 Schema 与现有药剂名单作为首个发布版，
 * prompt_release_sha256 / output_schema_version / agent_allowlist_ref 改为 confirmed；v1.3 草案转为正式发布文件，哈希与策略登记一致；
 * 4/4 评测定稿后再发 v2，必须可回滚。前缀正文以评测时实际使用的提取规则（eval-core extractPrefixFromDraft）从 v1.3 草案独立提取，
 * 病因闭集按评测脚本同一规则从【4】段提取（50 个）；名单摘要为名单 JSON 的规范化 SHA-256。
 * 测试层次：unit_real_data（读取仓库内草案、发布文件、名单、策略发布文档与配置目录）。
 */
const root = findProjectRoot()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const draftPrefix = extractPrefixFromDraft(
  read('cloudfunctions-v2/models/diagnosis/visual-diagnosis-prompt.v1.3.draft.md')
)
const draftSha = createHash('sha256').update(draftPrefix, 'utf8').digest('hex')
const allowlistSha = calculateCanonicalJsonSha256(
  JSON.parse(read('docs/backend-v2/contracts/diagnosis-visual-gen-agent-allowlist.v1.json'))
)
const releaseDoc = JSON.parse(
  read('cloudfunctions-v2/models/policy-releases/diagnosis.visual_generation.v1.release.json')
) as {
  policy: { promptRelease: Record<string, unknown> }
}
const catalog = JSON.parse(
  read('docs/backend-v2/architecture/configuration-variable-catalog.json')
) as {
  variables: { id: string; status: string; currentValue: unknown }[]
}
const variable = (id: string) => catalog.variables.find(item => item.id === id)

describe('视觉诊断提示词首个发布版（v1.3）', () => {
  test('正式发布文件的前缀与评测所用 v1.3 草案逐字一致，摘要、病因闭集与名单版本正确', () => {
    const release = JSON.parse(
      read('cloudfunctions-v2/models/diagnosis/visual-diagnosis-prompt.v1.3.release.json')
    ) as Record<string, unknown>
    expect(release).toMatchObject({
      releaseVersion: 'visual-diagnosis-prompt/v1.3',
      promptReleaseSha256: draftSha,
      outputSchemaVersion: 'diagnosis-visual-gen-output/v1',
      agentAllowlistVersion: 'diagnosis-visual-gen-agent-allowlist/v1',
      agentAllowlistSha256: allowlistSha,
      causeCatalog: extractCauseCodesFromPrefix(draftPrefix),
      prefixText: draftPrefix
    })
    expect((release.causeCatalog as string[]).length).toBe(50)
  })

  test('策略发布文档与配置目录登记同一组摘要与版本（三项 confirmed）', () => {
    const expected = {
      releaseVersion: 'visual-diagnosis-prompt/v1.3',
      promptReleaseSha256: draftSha,
      outputSchemaVersion: 'diagnosis-visual-gen-output/v1',
      agentAllowlistVersion: 'diagnosis-visual-gen-agent-allowlist/v1',
      agentAllowlistSha256: allowlistSha
    }
    expect(releaseDoc.policy.promptRelease).toEqual(expected)
    expect(variable('diagnosis.visual_gen.prompt_release_sha256')).toMatchObject({
      status: 'confirmed',
      currentValue: draftSha
    })
    expect(variable('diagnosis.visual_gen.output_schema_version')).toMatchObject({
      status: 'confirmed',
      currentValue: 'diagnosis-visual-gen-output/v1'
    })
    expect(variable('diagnosis.visual_gen.agent_allowlist_ref')).toMatchObject({
      status: 'confirmed',
      currentValue: {
        agentAllowlistVersion: 'diagnosis-visual-gen-agent-allowlist/v1',
        agentAllowlistSha256: allowlistSha
      }
    })
  })

  test('运行时按摘要取打包的发布：摘要一致才返回；未知摘要（例如尚未打包的 v2）返回 null（接口 503），旧版本仍可取到以便回滚', async () => {
    expect(BUNDLED_VISUAL_PROMPT_RELEASES.map(release => release.promptReleaseSha256)).toContain(
      draftSha
    )
    const reader = createBundledVisualPromptReleaseReader()
    const release = await reader(draftSha)
    expect(release).toMatchObject({
      promptReleaseSha256: draftSha,
      prefixText: draftPrefix,
      strictOutputSchema: null
    })
    expect(release?.causeCatalog).toHaveLength(50)
    expect(await reader('f'.repeat(64))).toBeNull()
  })
})

describe('AI 额度预占有效期', () => {
  test('subscription.ai_reservation.ttl_seconds = 300，confirmed，并写入策略发布', () => {
    expect(variable('subscription.ai_reservation.ttl_seconds')).toMatchObject({
      status: 'confirmed',
      currentValue: 300
    })
    const doc = JSON.parse(
      read('cloudfunctions-v2/models/policy-releases/subscription.ai_reservation.v1.release.json')
    ) as {
      domainCode: string
      policyCode: string
      policy: Record<string, unknown>
    }
    expect(doc).toMatchObject({
      domainCode: 'subscription',
      policyCode: 'ai_reservation',
      policy: { contractVersion: 'subscription-ai-reservation/v1', ttlSeconds: 300 }
    })
  })
})
