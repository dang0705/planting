import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

/**
 * Expected 来源：P1 审计交付要求和当前数据制品目录约定。
 * 测试层次：unit_real_data；只读取真实审计正文、sidecar 与 data manifest，
 * 不连接 CloudBase、MySQL、支付、CMS 或供应商，也不把 SHA 一致当作运行验收。
 */
test('P1 审计正文与 sidecar 使用当前文件字节', () => {
  const root = findProjectRoot()
  const auditFiles = [
    'docs/backend-v2/audits/P1-http-api-openapi-exit-gate.md',
    'docs/backend-v2/audits/P1-identity-semantics-2026-09-20.md',
    'docs/backend-v2/audits/P1-ai-quota-reward-requirements.md'
  ]

  for (const relativePath of auditFiles) {
    const filePath = path.join(root, relativePath)
    const sidecarPath = filePath.replace(/\.md$/u, '.sha256')
    const content = fs.readFileSync(filePath)
    const expected = `${createHash('sha256').update(content).digest('hex')}  ${path.basename(relativePath)}\n`
    const actual = fs.readFileSync(sidecarPath, 'utf8')
    if (actual !== expected) {
      throw new Error(`审计 sidecar 与正文不一致：${relativePath}`)
    }
  }
})

test('P1 data manifest 锁定两份指定数据文档', () => {
  const root = findProjectRoot()
  const manifestPath = path.join(root, 'docs/backend-v2/data/manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    version: string
    algorithm: string
    files: Record<string, string>
  }

  if (manifest.version !== 'backend-v2-data/p1' || manifest.algorithm !== 'sha256') {
    throw new Error('data manifest 版本或哈希算法不符合 P1 合同')
  }

  const expectedFiles = ['v2-data-dictionary.md', 'phase-1-identity-audit.md']
  if (Object.keys(manifest.files).sort().join('\n') !== expectedFiles.sort().join('\n')) {
    throw new Error('data manifest 必须且只能登记两份指定 P1 数据文档')
  }

  for (const fileName of expectedFiles) {
    const filePath = path.join(root, 'docs/backend-v2/data', fileName)
    const actualSha = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
    if (manifest.files[fileName] !== actualSha) {
      throw new Error(`data manifest SHA 不一致：${fileName}`)
    }
  }
})
