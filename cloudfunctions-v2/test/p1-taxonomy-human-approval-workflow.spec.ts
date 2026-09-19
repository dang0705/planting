/* oxlint-disable no-magic-numbers -- 分类准入的 200 条数量与 SHA-256 长度是明确的 Expected。 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

/**
 * 人工批准批次：记录一个产品负责人针对哪一批审核包作出批准。
 * 批次号必须能够在审计记录中唯一定位本次批准，不得用代理名称冒充。
 */
type ApprovalBatch = {
  /** 本次人工批准的唯一批次引用。 */
  batchId: string
  /** 对应的外部任务或审核票据引用。 */
  ticketId: string
  /** 本批次必须覆盖的审核记录总数。 */
  recordCount: number
}

/**
 * 人工批准主体：只保存受控引用和带时区时间，不保存姓名、令牌或登录凭证。
 */
type ApprovalPrincipal = {
  /** 明确表示人工审核人的受控引用，不能以 agent: 开头。 */
  reviewerRef: string
  /** 人工批准发生的带时区 ISO 8601 时间。 */
  approvedAt: string
}

/**
 * 人工批准范围：显式列出全部源记录及其最终处置，不允许从代理建议推导批准。
 */
type ApprovalScope = {
  /** 范围类型；本工作流只接受完整审核包。 */
  kind: string
  /** 人工实际核阅并明确作出处置的全部源记录引用。 */
  sourceRecordIds: string[]
  /** 每个源记录的人工最终处置，键集合必须与 sourceRecordIds 完全相同。 */
  dispositionBySourceRecordId: Record<string, string>
  /** 范围内明确处理的记录数。 */
  approvedRecordCount: number
}

/**
 * 人工批准制品：工作流唯一认可的批准输入，代理审核结果不具备该结构的批准效力。
 */
type ApprovalArtifact = {
  /** 人工批准制品的结构版本。 */
  approvalVersion: string
  /** 本次人工批准对应的批次信息。 */
  batch: ApprovalBatch
  /** 人工批准主体与时间。 */
  approver: ApprovalPrincipal
  /** 显式人工批准范围与逐条处置。 */
  scope: ApprovalScope
  /** 审核包文件路径与其实际 SHA-256。 */
  reviewPacket: {
    /** 审核包在仓库内的相对路径。 */
    path: string
    /** 审核包原始字节的 SHA-256。 */
    sha256: string
  }
}

type ReviewRecord = {
  /** 审核记录在 200 条合并清单中的稳定下标。 */
  manifestIndex: number
  /** 遗留来源记录的稳定引用。 */
  sourceRecordId: string
  /** 代理建议的处置枚举。 */
  reviewDecision: string
}

type WorkflowModule = {
  /** 读取并验证分片审核包，返回可供人工批准绑定的快照。 */
  loadReviewPacket: (input: {
    projectRoot: string
    reviewPacketPath: string
    reviewPacketSha256: string
  }) => {
    packetSha256: string
    reviews: ReviewRecord[]
    summary: Record<string, number>
  }
  /** 验证人工批准制品与已核验审核包的逐条绑定关系。 */
  validateApprovalArtifact: (input: {
    approval: ApprovalArtifact
    packet: {
      packetSha256: string
      reviews: ReviewRecord[]
      summary: Record<string, number>
    }
  }) => { valid: boolean; errors: string[]; counts: Record<string, number> }
  /** 只在人工批准完整有效时生成尚未激活的分类种子清单。 */
  buildSeedManifest: (input: {
    approval: ApprovalArtifact
    packet: {
      packetSha256: string
      reviews: ReviewRecord[]
      summary: Record<string, number>
    }
  }) => { summary: Record<string, number>; releaseStatus: string; activeRelease: string }
  /** 以新目录原子落盘人工批准制品和待导入种子清单。 */
  runTaxonomyHumanApprovalWorkflow: (input: {
    projectRoot: string
    approvalArtifactPath: string
    outputDirectory: string
  }) => { outputDirectory: string; seedManifestSha256: string }
}

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

async function loadWorkflow(): Promise<WorkflowModule> {
  const projectRoot = findProjectRoot()
  return import(
    pathToFileURL(
      path.join(projectRoot, 'docs/backend-v2/audits/taxonomy-human-approval-workflow.mjs')
    ).href
  ) as Promise<WorkflowModule>
}

function makeTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qinghuazhi-taxonomy-approval-test-'))
  tempDirectories.push(directory)
  return directory
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function loadRealPacket(projectRoot: string): {
  packetPath: string
  packetSha256: string
  reviews: ReviewRecord[]
  summary: Record<string, number>
} {
  const packetPath = path.join(
    projectRoot,
    'docs/backend-v2/audits/plant-identity-validation-manifest-v1.json'
  )
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8')) as {
    recordShards: Array<{ ref: string }>
    summary: Record<string, number>
  }
  const reviews = packet.recordShards.flatMap(shard => {
    const shardPath = path.join(projectRoot, shard.ref)
    return (
      JSON.parse(fs.readFileSync(shardPath, 'utf8')) as {
        reviews: ReviewRecord[]
      }
    ).reviews
  })
  return {
    packetPath,
    packetSha256: sha256File(packetPath),
    reviews,
    summary: packet.summary
  }
}

function makeApproval(projectRoot: string): ApprovalArtifact {
  const packet = loadRealPacket(projectRoot)
  const dispositionMap: Record<string, string> = {
    ADMIT_AS_ACCEPTED: 'REUSE_AS_IS',
    TRANSFORM_TO_ACCEPTED: 'TRANSFORM',
    QUARANTINE: 'QUARANTINE'
  }
  const dispositionBySourceRecordId: Record<string, string> = {}
  for (const review of packet.reviews) {
    const disposition = dispositionMap[review.reviewDecision]
    if (!disposition) {
      throw new Error('测试审核包包含未识别的代理建议')
    }
    dispositionBySourceRecordId[review.sourceRecordId] = disposition
  }
  return {
    approvalVersion: 'p1-taxonomy-human-approval/v1',
    batch: {
      batchId: 'z8v0kmr9gm-test-full-20260920',
      ticketId: 'z8v0kmr9gm',
      recordCount: 200
    },
    approver: {
      reviewerRef: 'human:test-product-owner',
      approvedAt: '2026-09-20T12:00:00+08:00'
    },
    scope: {
      kind: 'FULL_REVIEW_PACKET',
      sourceRecordIds: packet.reviews.map(review => review.sourceRecordId),
      dispositionBySourceRecordId,
      approvedRecordCount: 200
    },
    reviewPacket: {
      path: path.relative(projectRoot, packet.packetPath),
      sha256: packet.packetSha256
    }
  }
}

describe('P1 分类人工批准落盘与种子清单工作流', () => {
  test('真实审核包必须精确保持 113 原样、7 转换、80 隔离', async () => {
    const projectRoot = findProjectRoot()
    const workflow = await loadWorkflow()
    const packet = loadRealPacket(projectRoot)
    const loaded = workflow.loadReviewPacket({
      projectRoot,
      reviewPacketPath: path.relative(projectRoot, packet.packetPath),
      reviewPacketSha256: packet.packetSha256
    })
    expect(loaded.summary).toMatchObject({
      recommendedReuseAsIs: 113,
      recommendedTransform: 7,
      recommendedQuarantine: 80,
      total: 200
    })

    const approval = makeApproval(projectRoot)
    const validation = workflow.validateApprovalArtifact({
      approval,
      packet: loaded
    })
    expect(validation).toMatchObject({
      valid: true,
      counts: { REUSE_AS_IS: 113, TRANSFORM: 7, QUARANTINE: 80 }
    })
  })

  test('只有完整人工批准才能生成未激活的种子清单', async () => {
    const projectRoot = findProjectRoot()
    const workflow = await loadWorkflow()
    const packet = loadRealPacket(projectRoot)
    const loaded = workflow.loadReviewPacket({
      projectRoot,
      reviewPacketPath: path.relative(projectRoot, packet.packetPath),
      reviewPacketSha256: packet.packetSha256
    })
    const seedManifest = workflow.buildSeedManifest({
      approval: makeApproval(projectRoot),
      packet: loaded
    })

    expect(seedManifest.summary).toMatchObject({
      total: 200,
      reuseAsIs: 113,
      transform: 7,
      quarantine: 80,
      seedEligible: 120
    })
    expect(seedManifest.releaseStatus).toBe('SEED_READY_NOT_ACTIVE')
    expect(seedManifest.activeRelease).toBe('STOP')
  })

  test('缺少人工批准或篡改批准范围必须失败关闭', async () => {
    const projectRoot = findProjectRoot()
    const workflow = await loadWorkflow()
    const packet = loadRealPacket(projectRoot)
    const loaded = workflow.loadReviewPacket({
      projectRoot,
      reviewPacketPath: path.relative(projectRoot, packet.packetPath),
      reviewPacketSha256: packet.packetSha256
    })
    const approval = makeApproval(projectRoot)
    approval.scope.sourceRecordIds.pop()
    const validation = workflow.validateApprovalArtifact({
      approval,
      packet: loaded
    })
    expect(validation.valid).toBe(false)
    expect(validation.errors.join('\n')).toMatch(/范围|完整|记录/)

    const agentApproval = makeApproval(projectRoot)
    agentApproval.approver.reviewerRef = 'agent:pretend-product-owner'
    expect(
      workflow.validateApprovalArtifact({ approval: agentApproval, packet: loaded }).valid
    ).toBe(false)
  })

  test('审核包 SHA 错误时不创建任何输出目录', async () => {
    const projectRoot = findProjectRoot()
    const workflow = await loadWorkflow()
    const temporaryDirectory = makeTemporaryDirectory()
    const approvalPath = path.join(temporaryDirectory, 'approval.json')
    const outputDirectory = path.join(temporaryDirectory, 'output')
    const approval = makeApproval(projectRoot)
    approval.reviewPacket.sha256 = '0'.repeat(64)
    fs.writeFileSync(approvalPath, `${JSON.stringify(approval)}\n`)

    expect(() =>
      workflow.runTaxonomyHumanApprovalWorkflow({
        projectRoot,
        approvalArtifactPath: approvalPath,
        outputDirectory
      })
    ).toThrow(/SHA/)
    expect(fs.existsSync(outputDirectory)).toBe(false)
  })

  test('缺少批准制品或已有输出目录时不改变任何产物', async () => {
    const projectRoot = findProjectRoot()
    const workflow = await loadWorkflow()
    const temporaryDirectory = makeTemporaryDirectory()
    const missingOutputDirectory = path.join(temporaryDirectory, 'missing-output')
    expect(() =>
      workflow.runTaxonomyHumanApprovalWorkflow({
        projectRoot,
        approvalArtifactPath: path.join(temporaryDirectory, 'missing.json'),
        outputDirectory: missingOutputDirectory
      })
    ).toThrow(/人工批准制品/)
    expect(fs.existsSync(missingOutputDirectory)).toBe(false)

    const existingOutputDirectory = path.join(temporaryDirectory, 'existing-output')
    fs.mkdirSync(existingOutputDirectory)
    const sentinelPath = path.join(existingOutputDirectory, 'sentinel.txt')
    fs.writeFileSync(sentinelPath, '不得覆盖')
    const approvalPath = path.join(temporaryDirectory, 'approval.json')
    fs.writeFileSync(approvalPath, JSON.stringify(makeApproval(projectRoot)))
    expect(() =>
      workflow.runTaxonomyHumanApprovalWorkflow({
        projectRoot,
        approvalArtifactPath: approvalPath,
        outputDirectory: existingOutputDirectory
      })
    ).toThrow(/输出目录已存在/)
    expect(fs.readFileSync(sentinelPath, 'utf8')).toBe('不得覆盖')
  })

  test('合法工作流以新目录提交，且不修改已有审计制品', async () => {
    const projectRoot = findProjectRoot()
    const workflow = await loadWorkflow()
    const temporaryDirectory = makeTemporaryDirectory()
    const approvalPath = path.join(temporaryDirectory, 'approval.json')
    const outputDirectory = path.join(temporaryDirectory, 'output')
    const approval = makeApproval(projectRoot)
    const packetPath = path.join(
      projectRoot,
      'docs/backend-v2/audits/plant-identity-validation-manifest-v1.json'
    )
    const admissionManifestPath = path.join(
      projectRoot,
      'docs/backend-v2/audits/P1-taxonomy-admission-manifest.json'
    )
    const originalPacketSha256 = sha256File(packetPath)
    const originalAdmissionManifestSha256 = sha256File(admissionManifestPath)
    fs.writeFileSync(approvalPath, `${JSON.stringify(approval)}\n`)

    const result = workflow.runTaxonomyHumanApprovalWorkflow({
      projectRoot,
      approvalArtifactPath: approvalPath,
      outputDirectory
    })
    expect(result.outputDirectory).toBe(outputDirectory)
    expect(fs.existsSync(path.join(outputDirectory, 'approval-record.json'))).toBe(true)
    expect(fs.existsSync(path.join(outputDirectory, 'seed-manifest.json'))).toBe(true)
    expect(fs.readFileSync(path.join(outputDirectory, 'seed-manifest.json'), 'utf8')).toContain(
      'SEED_READY_NOT_ACTIVE'
    )
    const seedManifestBytes = fs.readFileSync(path.join(outputDirectory, 'seed-manifest.json'))
    const seedSidecar = fs.readFileSync(path.join(outputDirectory, 'seed-manifest.sha256'), 'utf8')
    expect(seedSidecar).toContain(
      `${createHash('sha256').update(seedManifestBytes).digest('hex')}  seed-manifest.json`
    )
    expect(sha256File(packetPath)).toBe(originalPacketSha256)
    expect(sha256File(admissionManifestPath)).toBe(originalAdmissionManifestSha256)
  })
})
