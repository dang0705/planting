/**
 * P1 植物分类人工批准落盘与种子清单生成工作流。
 *
 * 本工具只接受明确的人工批准制品，不把代理审核建议当作批准。
 * 所有校验在写盘前完成；失败时不创建或修改任何输出制品。
 * 它只生成“待导入、未激活”的本地种子清单，不写 CloudBase、CMS、ClickUp
 * 或现有 admission manifest。
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APPROVAL_VERSION = 'p1-taxonomy-human-approval/v2'
const SEED_MANIFEST_VERSION = 'plant-taxonomy-seed/v1'
const REVIEW_PACKET_VERSION = 'plant-identity-validation-manifest/v1'
const EXPECTED_TICKET_ID = 'z8v0kmr9gm'
const EXPECTED_RECORD_COUNT = 200
const EXPECTED_RECOMMENDATION_COUNTS = Object.freeze({
  REUSE_AS_IS: 113,
  TRANSFORM: 7,
  QUARANTINE: 80
})
const EXPECTED_APPROVAL_COUNTS = Object.freeze({
  REUSE_AS_IS: 99,
  TRANSFORM: 7,
  TRANSFORM_PENDING: 4,
  QUARANTINE: 90
})
const TRANSFORM_PENDING_TARGETS = Object.freeze({
  '29': Object.freeze({
    canonicalScientificName: 'Narcissus tazetta subsp. chinensis',
    identityLevel: 'subspecies'
  }),
  '73': Object.freeze({
    canonicalScientificName: "Aglaonema commutatum 'Silver Queen'",
    identityLevel: 'cultivar'
  }),
  '98': Object.freeze({
    canonicalScientificName: "Asparagus densiflorus 'Myersii'",
    identityLevel: 'cultivar'
  }),
  '123': Object.freeze({
    canonicalScientificName: 'Gymnocalycium stenopleurum',
    identityLevel: 'species'
  })
})
const ADDITIONAL_QUARANTINE_IDS = new Set([
  '79',
  '84',
  '87',
  '90',
  '92',
  '102',
  '114',
  '124',
  '169',
  '171'
])
const REVIEW_TO_DISPOSITION = Object.freeze({
  ADMIT_AS_ACCEPTED: 'REUSE_AS_IS',
  TRANSFORM_TO_ACCEPTED: 'TRANSFORM',
  QUARANTINE: 'QUARANTINE'
})
const ALLOWED_DISPOSITIONS = new Set([
  ...Object.values(REVIEW_TO_DISPOSITION),
  'TRANSFORM_PENDING'
])

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])])
    )
  }
  return value
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'))
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} 必须是 64 位小写 SHA-256`)
  }
}

function requireNonEmptyText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} 不能为空`)
  }
}

function resolveProjectPath(projectRoot, relativePath, label) {
  requireNonEmptyText(relativePath, `${label} 路径`)
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${label} 必须是项目根目录内的相对路径`)
  }
  const resolvedRoot = path.resolve(projectRoot)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} 不能越过项目根目录`)
  }
  return resolvedPath
}

function readJson(filePath, label) {
  let bytes
  try {
    bytes = fs.readFileSync(filePath)
  } catch (error) {
    throw new Error(`${label}无法读取：${error.message}`)
  }
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${label}不是有效 JSON：${error.message}`)
  }
}

function exactCounts(reviews) {
  const counts = {
    REUSE_AS_IS: 0,
    TRANSFORM: 0,
    QUARANTINE: 0
  }
  for (const review of reviews) {
    const disposition = REVIEW_TO_DISPOSITION[review.reviewDecision]
    if (disposition) counts[disposition] += 1
  }
  return counts
}

function countsMatch(counts, expectedCounts) {
  return Object.keys(expectedCounts).every(key => counts[key] === expectedCounts[key])
}

function expectedApprovedDisposition(review) {
  if (Object.hasOwn(TRANSFORM_PENDING_TARGETS, review.sourceRecordId)) {
    return 'TRANSFORM_PENDING'
  }
  if (ADDITIONAL_QUARANTINE_IDS.has(review.sourceRecordId)) return 'QUARANTINE'
  return REVIEW_TO_DISPOSITION[review.reviewDecision]
}

function assertReviewShape(review, expectedIndex, seenIds) {
  if (!isRecord(review)) throw new Error(`审核记录 ${expectedIndex} 不是对象`)
  if (review.manifestIndex !== expectedIndex) {
    throw new Error(`审核记录 ${expectedIndex} 的 manifestIndex 不连续`)
  }
  requireNonEmptyText(review.sourceRecordId, `审核记录 ${expectedIndex} 的 sourceRecordId`)
  if (seenIds.has(review.sourceRecordId)) {
    throw new Error(`审核记录 sourceRecordId=${review.sourceRecordId} 重复`)
  }
  seenIds.add(review.sourceRecordId)
  requireSha256(review.sourceLineSha256, `审核记录 ${expectedIndex} 的来源行 SHA`)
  if (!Object.hasOwn(REVIEW_TO_DISPOSITION, review.reviewDecision)) {
    throw new Error(`审核记录 ${expectedIndex} 的代理建议非法`)
  }
}

/**
 * 读取并校验分片审核包。
 *
 * 它不仅校验顶层摘要，还逐个回读分片 SHA、下标、来源引用和代理建议，
 * 防止把少量代表性记录、篡改分片或代理汇总文字误当作完整审核范围。
 */
export function loadReviewPacket({ projectRoot, reviewPacketPath, reviewPacketSha256 }) {
  const packetPath = resolveProjectPath(projectRoot, reviewPacketPath, '审核包')
  requireSha256(reviewPacketSha256, '审核包 SHA')
  const packetBytes = fs.readFileSync(packetPath)
  const packetSha256 = sha256Bytes(packetBytes)
  if (packetSha256 !== reviewPacketSha256) {
    throw new Error(`审核包 SHA 不匹配：声明 ${reviewPacketSha256}，实际 ${packetSha256}`)
  }
  const packet = readJson(packetPath, '审核包')
  if (!isRecord(packet) || packet.manifestVersion !== REVIEW_PACKET_VERSION) {
    throw new Error(`审核包必须是 ${REVIEW_PACKET_VERSION}`)
  }
  if (packet.ticketId !== EXPECTED_TICKET_ID) {
    throw new Error(`审核包 ticketId 必须是 ${EXPECTED_TICKET_ID}`)
  }
  if (packet.reviewPolicy?.agentRecommendationIsHumanApproval !== false) {
    throw new Error('审核包必须明确声明代理建议不等于人工批准')
  }
  if (!Array.isArray(packet.humanApprovals) || packet.humanApprovals.length !== 0) {
    throw new Error('审核包不得预置或伪造人工批准记录')
  }
  if (!Array.isArray(packet.recordShards) || packet.recordShards.length === 0) {
    throw new Error('审核包缺少分片记录')
  }

  const reviews = []
  const seenIds = new Set()
  let expectedIndex = 0
  for (const shard of packet.recordShards) {
    if (!isRecord(shard)) throw new Error('审核包分片描述不是对象')
    if (shard.startIndex !== expectedIndex) {
      throw new Error(`审核包分片起始下标应为 ${expectedIndex}`)
    }
    if (shard.recordCount !== shard.endIndex - shard.startIndex + 1) {
      throw new Error('审核包分片记录数量与下标范围不一致')
    }
    const shardPath = resolveProjectPath(projectRoot, shard.ref, '审核分片')
    requireSha256(shard.sha256, `审核分片 ${shard.ref} 的 SHA`)
    const shardBytes = fs.readFileSync(shardPath)
    const shardSha256 = sha256Bytes(shardBytes)
    if (shardSha256 !== shard.sha256) {
      throw new Error(`审核分片 ${shard.ref} SHA 不匹配`)
    }
    const shardContent = readJson(shardPath, `审核分片 ${shard.ref}`)
    if (!Array.isArray(shardContent?.reviews)) {
      throw new Error(`审核分片 ${shard.ref} 缺少 reviews`)
    }
    if (shardContent.reviews.length !== shard.recordCount) {
      throw new Error(`审核分片 ${shard.ref} 记录数不一致`)
    }
    for (const review of shardContent.reviews) {
      assertReviewShape(review, expectedIndex, seenIds)
      reviews.push(review)
      expectedIndex += 1
    }
  }

  if (reviews.length !== EXPECTED_RECORD_COUNT) {
    throw new Error(`审核包必须覆盖 ${EXPECTED_RECORD_COUNT} 条记录`)
  }
  const counts = exactCounts(reviews)
  if (!countsMatch(counts, EXPECTED_RECOMMENDATION_COUNTS)) {
    throw new Error(
      `代理建议集合不精确：实际 ${JSON.stringify(counts)}，期望 ${JSON.stringify(EXPECTED_RECOMMENDATION_COUNTS)}`
    )
  }
  const expectedSummary = {
    total: EXPECTED_RECORD_COUNT,
    recommendedReuseAsIs: EXPECTED_RECOMMENDATION_COUNTS.REUSE_AS_IS,
    recommendedTransform: EXPECTED_RECOMMENDATION_COUNTS.TRANSFORM,
    recommendedQuarantine: EXPECTED_RECOMMENDATION_COUNTS.QUARANTINE
  }
  for (const [key, expected] of Object.entries(expectedSummary)) {
    if (packet.summary?.[key] !== expected) {
      throw new Error(`审核包 summary.${key} 不符合精确集合`)
    }
  }

  return {
    packetSha256,
    reviews,
    summary: expectedSummary
  }
}

function validateIsoTimestamp(value, label) {
  requireNonEmptyText(value, label)
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} 必须是带时区的 ISO 8601 时间`)
  }
}

function sameArray(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function sameSet(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    new Set(left).size === right.length &&
    right.every(value => left.includes(value))
  )
}

/**
 * 校验人工批准制品。
 *
 * 批准范围必须逐条覆盖审核包的 200 条记录；最终裁决为 99 条
 * REUSE_AS_IS、7 条 TRANSFORM、4 条 TRANSFORM_PENDING 和 90 条
 * QUARANTINE。四条待转换记录必须绑定新的 canonical 目标与权威来源，
 * 在重新生成稳定 ID、身份层级和证据哈希前不得进入 seed。
 * 任何缺项、额外项、错配、代理主体或审核包 SHA 错误都会返回失败，调用方
 * 不得在失败状态下写入任何文件。
 */
export function validateApprovalArtifact({ approval, packet }) {
  const errors = []
  const counts = { REUSE_AS_IS: 0, TRANSFORM: 0, TRANSFORM_PENDING: 0, QUARANTINE: 0 }
  if (!isRecord(approval)) {
    return { valid: false, errors: ['人工批准制品必须是对象'], counts }
  }
  if (approval.approvalVersion !== APPROVAL_VERSION) {
    errors.push(`批准版本必须是 ${APPROVAL_VERSION}`)
  }
  if (!isRecord(approval.batch)) {
    errors.push('缺少人工批准批次')
  } else {
    if (approval.batch.ticketId !== EXPECTED_TICKET_ID) {
      errors.push(`批准批次 ticketId 必须是 ${EXPECTED_TICKET_ID}`)
    }
    if (approval.batch.recordCount !== EXPECTED_RECORD_COUNT) {
      errors.push('批准批次 recordCount 必须是 200')
    }
    try {
      requireNonEmptyText(approval.batch.batchId, '批准批次 batchId')
    } catch (error) {
      errors.push(error.message)
    }
  }
  if (!isRecord(approval.approver)) {
    errors.push('缺少人工批准主体')
  } else {
    try {
      requireNonEmptyText(approval.approver.reviewerRef, '人工批准人引用')
      if (!approval.approver.reviewerRef.startsWith('human:')) {
        errors.push('批准人必须是 human: 受控引用，不能使用 agent: 或代理名称')
      }
      validateIsoTimestamp(approval.approver.approvedAt, '人工批准时间')
    } catch (error) {
      errors.push(error.message)
    }
  }
  if (Object.hasOwn(approval, 'reviewerAgent')) {
    errors.push('代理审核字段 reviewerAgent 不能作为人工批准依据')
  }
  if (!isRecord(approval.reviewPacket)) {
    errors.push('缺少审核包绑定')
  } else {
    try {
      requireSha256(approval.reviewPacket.sha256, '批准制品中的审核包 SHA')
      if (approval.reviewPacket.sha256 !== packet.packetSha256) {
        errors.push('批准制品绑定的审核包 SHA 与已核验审核包不一致')
      }
      requireNonEmptyText(approval.reviewPacket.path, '批准制品中的审核包路径')
    } catch (error) {
      errors.push(error.message)
    }
  }

  const packetIds = packet.reviews.map(review => review.sourceRecordId)
  if (!isRecord(approval.scope)) {
    errors.push('缺少人工批准范围')
  } else {
    if (approval.scope.kind !== 'FULL_REVIEW_PACKET') {
      errors.push('人工批准范围必须是 FULL_REVIEW_PACKET')
    }
    if (approval.scope.approvedRecordCount !== EXPECTED_RECORD_COUNT) {
      errors.push('approvedRecordCount 必须是 200')
    }
    if (!sameArray(approval.scope.sourceRecordIds, packetIds)) {
      errors.push('人工批准 sourceRecordIds 必须按审核包顺序精确覆盖 200 条记录')
    }
    const decisions = approval.scope.dispositionBySourceRecordId
    if (!isRecord(decisions)) {
      errors.push('缺少逐条人工批准处置')
    } else {
      const decisionIds = Object.keys(decisions)
      if (!sameSet(decisionIds, packetIds)) {
        errors.push('人工批准处置键集合必须与审核包 sourceRecordIds 完全一致')
      }
      for (const review of packet.reviews) {
        const actualDisposition = decisions[review.sourceRecordId]
        const expectedDisposition = expectedApprovedDisposition(review)
        if (!ALLOWED_DISPOSITIONS.has(actualDisposition)) {
          errors.push(`sourceRecordId=${review.sourceRecordId} 人工处置非法`)
          continue
        }
        counts[actualDisposition] += 1
        if (actualDisposition !== expectedDisposition) {
          errors.push(
            `sourceRecordId=${review.sourceRecordId} 人工处置与已采纳的 106/4/90 裁决不一致`
          )
        }
      }
    }
    const transformPending = approval.scope.transformPendingBySourceRecordId
    const expectedPendingIds = Object.keys(TRANSFORM_PENDING_TARGETS)
    if (!isRecord(transformPending) || !sameSet(Object.keys(transformPending), expectedPendingIds)) {
      errors.push('四条 TRANSFORM_PENDING 的目标键集合必须精确为 29、73、98、123')
    } else {
      for (const sourceRecordId of expectedPendingIds) {
        const target = transformPending[sourceRecordId]
        const expectedTarget = TRANSFORM_PENDING_TARGETS[sourceRecordId]
        if (!isRecord(target)) {
          errors.push(`sourceRecordId=${sourceRecordId} 缺少待转换目标`)
          continue
        }
        if (
          target.canonicalScientificName !== expectedTarget.canonicalScientificName ||
          target.identityLevel !== expectedTarget.identityLevel
        ) {
          errors.push(`sourceRecordId=${sourceRecordId} 的 canonical 或身份层级与人工裁决不一致`)
        }
        if (target.requiresStableIdRegeneration !== true) {
          errors.push(`sourceRecordId=${sourceRecordId} 必须重新生成稳定 ID`)
        }
        if (
          !Array.isArray(target.authorityRefs) ||
          target.authorityRefs.length === 0 ||
          target.authorityRefs.some(ref => typeof ref !== 'string' || !/^https:\/\//u.test(ref))
        ) {
          errors.push(`sourceRecordId=${sourceRecordId} 缺少 HTTPS 权威来源`)
        }
      }
    }
  }
  if (!countsMatch(counts, EXPECTED_APPROVAL_COUNTS)) {
    errors.push(
      `人工批准集合不精确：实际 ${JSON.stringify(counts)}，期望 ${JSON.stringify(EXPECTED_APPROVAL_COUNTS)}`
    )
  }
  return { valid: errors.length === 0, errors, counts }
}

/**
 * 在内存中生成尚未激活的植物分类种子清单。
 *
 * 该函数只接受 validateApprovalArtifact 的成功结果；输出中的 activeRelease
 * 永远保持 STOP，避免本地生成动作被误认为已经发布或修改线上状态。
 */
export function buildSeedManifest({ approval, packet }) {
  const validation = validateApprovalArtifact({ approval, packet })
  if (!validation.valid) {
    throw new Error(`人工批准制品未通过校验：${validation.errors.join('；')}`)
  }
  const approvalSha256 = sha256Json(approval)
  const records = packet.reviews.map(review => {
    const approvedDisposition = approval.scope.dispositionBySourceRecordId[review.sourceRecordId]
    const seedEligible =
      approvedDisposition === 'REUSE_AS_IS' || approvedDisposition === 'TRANSFORM'
    return {
      manifestIndex: review.manifestIndex,
      sourceRecordId: review.sourceRecordId,
      sourceLineSha256: review.sourceLineSha256,
      legacyDisplayNameZh: review.legacyDisplayNameZh ?? null,
      rawScientificName: review.rawScientificName ?? null,
      acceptedScientificName: review.acceptedScientificName ?? null,
      authoritySource: review.authoritySource ?? null,
      authorityTaxonId: review.authorityTaxonId ?? null,
      rank: review.rank ?? null,
      genus: review.genus ?? null,
      family: review.family ?? null,
      recommendedDisposition: REVIEW_TO_DISPOSITION[review.reviewDecision],
      approvedDisposition,
      transformTarget:
        approvedDisposition === 'TRANSFORM_PENDING'
          ? approval.scope.transformPendingBySourceRecordId[review.sourceRecordId]
          : null,
      seedEligible
    }
  })
  const manifestWithoutHash = {
    manifestVersion: SEED_MANIFEST_VERSION,
    generatedAt: approval.approver.approvedAt,
    ticketId: approval.batch.ticketId,
    approvalBatchId: approval.batch.batchId,
    approverRef: approval.approver.reviewerRef,
    approvedAt: approval.approver.approvedAt,
    reviewPacketSha256: packet.packetSha256,
    approvalArtifactSha256: approvalSha256,
    summary: {
      total: records.length,
      reuseAsIs: validation.counts.REUSE_AS_IS,
      transform: validation.counts.TRANSFORM,
      transformPending: validation.counts.TRANSFORM_PENDING,
      quarantine: validation.counts.QUARANTINE,
      seedEligible: records.filter(record => record.seedEligible).length
    },
    releaseStatus: 'SEED_PARTIALLY_READY_NOT_ACTIVE',
    activeRelease: 'STOP',
    records
  }
  return {
    ...manifestWithoutHash,
    contentSha256: sha256Json(manifestWithoutHash)
  }
}

function writeJson(filePath, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.writeFileSync(filePath, bytes, {
    encoding: 'utf8',
    flag: 'wx'
  })
  return sha256Bytes(bytes)
}

function writeSha256(filePath, sha256, label) {
  fs.writeFileSync(filePath, `${sha256}  ${label}\n`, {
    encoding: 'utf8',
    flag: 'wx'
  })
}

/**
 * 读取批准制品、核验审核包并以新目录一次性提交结果。
 *
 * 目标目录必须不存在；工作流在临时同级目录中写齐批准记录、种子清单、
 * 两份 SHA 和提交标记后才重命名目录。输入错误、批准缺失或目标已存在时，
 * 不会改写已有文件，也不会生成半成品目录。
 */
export function runTaxonomyHumanApprovalWorkflow({
  projectRoot,
  approvalArtifactPath,
  outputDirectory
}) {
  const resolvedProjectRoot = path.resolve(projectRoot)
  const approvalPath = path.resolve(approvalArtifactPath)
  const targetDirectory = path.resolve(outputDirectory)
  if (fs.existsSync(targetDirectory)) {
    throw new Error(`输出目录已存在，为避免覆盖而拒绝：${targetDirectory}`)
  }
  const approval = readJson(approvalPath, '人工批准制品')
  const reviewPacket = approval?.reviewPacket
  if (!isRecord(reviewPacket)) {
    throw new Error('人工批准制品缺少审核包 SHA 和路径')
  }
  const packet = loadReviewPacket({
    projectRoot: resolvedProjectRoot,
    reviewPacketPath: reviewPacket.path,
    reviewPacketSha256: reviewPacket.sha256
  })
  const seedManifest = buildSeedManifest({ approval, packet })
  const parentDirectory = path.dirname(targetDirectory)
  if (!fs.existsSync(parentDirectory) || !fs.statSync(parentDirectory).isDirectory()) {
    throw new Error(`输出目录的父目录不存在：${parentDirectory}`)
  }

  const temporaryDirectory = fs.mkdtempSync(
    path.join(parentDirectory, `.${path.basename(targetDirectory)}.tmp-`)
  )
  let committedSeedManifestSha256
  try {
    const approvalRecordSha256 = writeJson(
      path.join(temporaryDirectory, 'approval-record.json'),
      approval
    )
    writeSha256(
      path.join(temporaryDirectory, 'approval-record.sha256'),
      approvalRecordSha256,
      'approval-record.json'
    )
    const seedManifestSha256 = writeJson(
      path.join(temporaryDirectory, 'seed-manifest.json'),
      seedManifest
    )
    committedSeedManifestSha256 = seedManifestSha256
    writeSha256(
      path.join(temporaryDirectory, 'seed-manifest.sha256'),
      seedManifestSha256,
      'seed-manifest.json'
    )
    writeJson(path.join(temporaryDirectory, 'commit.json'), {
      workflowVersion: APPROVAL_VERSION,
      status: 'COMMITTED',
      approvalArtifactSha256: approvalRecordSha256,
      seedManifestSha256,
      activeRelease: 'STOP',
      committedAt: approval.approver.approvedAt
    })
    fs.renameSync(temporaryDirectory, targetDirectory)
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
    throw error
  }
  return {
    outputDirectory: targetDirectory,
    seedManifestSha256: committedSeedManifestSha256
  }
}

function parseCliArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) throw new Error(`不支持的参数：${argument}`)
    const key = argument.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`参数 ${argument} 缺少值`)
    options[key] = value
    index += 1
  }
  return options
}

function runCli() {
  const options = parseCliArguments(process.argv.slice(2))
  for (const key of ['project-root', 'approval', 'output-dir']) {
    requireNonEmptyText(options[key], `--${key}`)
  }
  const result = runTaxonomyHumanApprovalWorkflow({
    projectRoot: options['project-root'],
    approvalArtifactPath: options.approval,
    outputDirectory: options['output-dir']
  })
  console.log(JSON.stringify(result, null, 2))
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : null
if (invokedFile && currentFile === invokedFile) {
  try {
    runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
