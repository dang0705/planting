import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

// Expected 来源：Canonical Master Plan 的 P1 退出条件与第六、七、八、九、十一章。
// 测试层次：unit_real_data；读取真实合同制品与哈希，不访问网络、数据库或业务实现。
test('P1 合同制品完整且哈希与注册表一致', () => {
  const projectRoot = findProjectRoot()
  const contractDirectory = path.join(projectRoot, 'docs/backend-v2/contracts')
  const registryPath = path.join(contractDirectory, 'contract-registry.json')

  /** 合同注册表中的最小可验证字段；测试不依赖生成器的内部实现。 */
  interface ContractRegistryEntry {
    id: string
    version: string
    file: string
    sha256: string
  }

  const requiredContracts = {
    'principal-and-capability': {
      file: 'principal-and-capability.md',
      version: 'principal-capability/v1',
      terms: [
        'GuestPrincipal',
        'UserPrincipal',
        'ServicePrincipal',
        'CapabilitySnapshot',
        'user_id'
      ]
    },
    'user-plant': {
      file: 'user-plant.md',
      version: 'user-plant/v1',
      terms: ['user_plant_id', 'unidentified', 'candidate_pending', 'confirmed', 'deleted']
    },
    'guest-session-claim': {
      file: 'guest-session-claim.md',
      version: 'guest-session-claim/v1',
      terms: ['Idempotency-Key', 'claimed', '同键异参', '不追溯发放积分']
    },
    'care-points-and-ai-quota': {
      file: 'care-points-and-ai-quota.md',
      version: 'care-points-ai-quota/v1',
      terms: [
        '2,000',
        '200',
        'reserved',
        'settled',
        'released',
        'pending_reconciliation',
        '1.25',
        '向上取整',
        'aqg_',
        'expiresAt: string',
        'expiresAt 为开区间'
      ]
    },
    'reward-events': {
      file: 'reward-events.md',
      version: 'reward-events/v1',
      terms: ['outbox', 'inbox', '至少一次', 'payloadHash']
    },
    'plant-taxonomy': {
      file: 'plant-taxonomy.md',
      version: 'plant-taxonomy/v1',
      terms: ['权威分类实体', '青花植产品身份', 'authority_taxon_id', 'QUARANTINE', 'spp.']
    },
    'care-environment-foundation': {
      file: 'care-environment-foundation.md',
      version: 'care-environment-foundation/v1',
      terms: [
        '原子环境事实',
        '派生环境指标',
        'inputSnapshotHash',
        'algorithmRelease',
        '室外温湿度',
        '预计干湿周期'
      ]
    },
    'care-capability-output': {
      file: 'care-capability-output.md',
      version: 'care-capability-result/v1',
      terms: ['watering', 'fertilizing', 'lighting', 'ventilation', 'detailsSchemaVersion']
    },
    'http-api': {
      file: 'http-api.md',
      version: 'http-api/v1',
      terms: [
        'error.type',
        'Idempotency-Key',
        'GUEST_SESSION_EXPIRED',
        'AI_QUOTA_INSUFFICIENT',
        '内部服务'
      ]
    }
  }

  const requiredJsonSchemas = {
    'plant-encyclopedia-display': {
      file: 'schemas/plant-encyclopedia-display.v1.schema.json',
      version: 'plant-encyclopedia-display/v1'
    },
    'diagnosis-model-output': {
      file: 'schemas/diagnosis-model-output.v1.schema.json',
      version: 'diagnosis-model-output/v1'
    }
  }

  const requiredPromptReleases = {
    'diagnosis-visual-prompt': {
      file: 'prompts/diagnosis-visual.v1.release.json',
      version: 'diagnosis-visual/v1',
      promptFile: 'prompts/diagnosis-visual.v1.txt'
    }
  }

  assert.ok(fs.existsSync(registryPath), '缺少 P1 合同注册表 contract-registry.json')
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
    schemaVersion: number
    contracts: ContractRegistryEntry[]
  }
  assert.equal(registry.schemaVersion, 1)
  assert.ok(Array.isArray(registry.contracts))

  for (const [contractId, expected] of Object.entries(requiredContracts)) {
    const contractPath = path.join(contractDirectory, expected.file)
    assert.ok(fs.existsSync(contractPath), `缺少合同文件：${expected.file}`)
    const content = fs.readFileSync(contractPath, 'utf8')
    assert.match(
      content,
      new RegExp(`合同版本[：:]\\s*\\x60${expected.version.replace('/', '\\/')}\\x60`, 'u')
    )
    for (const term of expected.terms) {
      assert.ok(content.includes(term), `${expected.file} 缺少冻结项：${term}`)
    }
    if (contractId === 'care-points-and-ai-quota') {
      assert.ok(
        !content.includes('expiresAt?: string'),
        'AI 额度批次必须有绝对到期时间，不得声明为可选字段'
      )
    }

    const entry = registry.contracts.find(item => item.id === contractId)
    assert.ok(entry, `注册表缺少合同：${contractId}`)
    assert.equal(entry.version, expected.version)
    assert.equal(entry.file, expected.file)
    assert.equal(entry.sha256, createHash('sha256').update(content).digest('hex'))
  }

  for (const [contractId, expected] of Object.entries(requiredJsonSchemas)) {
    const contractPath = path.join(contractDirectory, expected.file)
    assert.ok(fs.existsSync(contractPath), `缺少 JSON Schema 合同：${expected.file}`)
    const content = fs.readFileSync(contractPath, 'utf8')
    const schema = JSON.parse(content) as { $id?: string; title?: string; description?: string }
    assert.ok(
      schema.$id?.includes(expected.version),
      `${expected.file} 的 $id 未绑定 ${expected.version}`
    )
    assert.match(schema.title ?? '', /[\u3400-\u9fff]/u, `${expected.file} 缺少中文标题`)
    assert.match(schema.description ?? '', /[\u3400-\u9fff]/u, `${expected.file} 缺少中文描述`)

    const entry = registry.contracts.find(item => item.id === contractId)
    assert.ok(entry, `注册表缺少 JSON Schema 合同：${contractId}`)
    assert.equal(entry.version, expected.version)
    assert.equal(entry.file, expected.file)
    assert.equal(entry.sha256, createHash('sha256').update(content).digest('hex'))
  }

  for (const [contractId, expected] of Object.entries(requiredPromptReleases)) {
    const releasePath = path.join(contractDirectory, expected.file)
    const promptPath = path.join(contractDirectory, expected.promptFile)
    assert.ok(fs.existsSync(releasePath), `缺少 Prompt release：${expected.file}`)
    assert.ok(fs.existsSync(promptPath), `缺少 Prompt 正文：${expected.promptFile}`)
    const releaseContent = fs.readFileSync(releasePath, 'utf8')
    const release = JSON.parse(releaseContent) as {
      promptVersion?: string
      normalizedSha256?: string
    }
    const promptContent = fs.readFileSync(promptPath, 'utf8').replace(/\r\n?/g, '\n')
    assert.equal(release.promptVersion, expected.version)
    assert.equal(release.normalizedSha256, createHash('sha256').update(promptContent).digest('hex'))

    const entry = registry.contracts.find(item => item.id === contractId)
    assert.ok(entry, `注册表缺少 Prompt release：${contractId}`)
    assert.equal(entry.version, expected.version)
    assert.equal(entry.file, expected.file)
    assert.equal(entry.sha256, createHash('sha256').update(releaseContent).digest('hex'))
  }
})
