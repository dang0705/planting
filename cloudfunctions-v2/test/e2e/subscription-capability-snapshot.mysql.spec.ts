import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type {
  UserCapabilitySnapshotDto,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'
import type { CanonicalJsonValue } from '../../src/foundation/json/canonical-json-sha256.js'
import { createResolveFirstLoginCapabilitySnapshot } from '../../src/subscription/application/resolve-first-login-capability-snapshot.js'
import { createResolveOnDemandCapabilitySnapshot } from '../../src/subscription/application/resolve-on-demand-capability-snapshot.js'
import { createMysqlCapabilitySnapshotReader } from '../../src/subscription/repository/mysql-capability-snapshot-reader.js'
import { createMysqlCapabilitySnapshotRepository } from '../../src/subscription/repository/mysql-capability-snapshot-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const mysqlImage = 'mysql:8.4'
const databaseName = 'qinghuazhi_v2_first_login_capability_snapshot'
const containerName = `qhz-v2-capability-snapshot-${String(process.pid)}`
const readinessAttempts = Number('60')
const readinessIntervalMs = Number('250')
const setupTimeoutMs = 30_000
const fixedNowMs = Date.parse('2026-09-27T12:00:00.000Z')
const secondsPerMinute = Number('60')
const minutesPerHour = Number('60')
const millisecondsPerSecond = Number('1000')
const minutesInFortyFive = Number('45')
const hoursInTwentyThree = Number('23')
const hoursPerDay = Number('24')
const hoursInTwo = Number('2')
const minutesInFive = Number('5')
const sha256HexLength = Number('64')
const oneSnapshot = Number('1')
const oneHourMs = secondsPerMinute * minutesPerHour * millisecondsPerSecond
const oneDayMs = hoursPerDay * oneHourMs
const fortyFiveMinutesMs = minutesInFortyFive * secondsPerMinute * millisecondsPerSecond
const registeredTwentyThreeHoursFortyFiveMinutesAgoMs =
  fixedNowMs - (hoursInTwentyThree * oneHourMs + fortyFiveMinutesMs)
const registeredExactlyOneDayAgoMs = fixedNowMs - oneDayMs
const capabilityReleaseExpiresAtMs = fixedNowMs + hoursInTwo * oneHourMs
const capabilityReleaseRef = 'bpr_test_capability_snapshot_0001'
const capabilityReleaseVersion = 'subscription/2026-09-27.1'
const trialSourceVersion = 'trial-fixture/2026-09-27.1'
const plantLimitSourceVersion = 'plant-limit-fixture/2026-09-27.1'
const testOnlySourceHash = 'f'.repeat(sha256HexLength)
const identityTrialAnchors = new Map<
  UserRef,
  { readonly userRef: UserRef; readonly status: 'active'; readonly createdAtMs: number }
>()

type ConfigurationCatalogDocument = {
  readonly variables: readonly {
    readonly id: string
    readonly currentValue: unknown
  }[]
}

/** 读取已冻结变量目录中的能力目录正文，只用于向本地隔离库装载发布夹具。 */
function readApprovedCapabilityCatalog(): unknown {
  const catalogPath = path.join(
    projectRoot,
    'docs/backend-v2/architecture/configuration-variable-catalog.json'
  )
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as ConfigurationCatalogDocument
  const entry = catalog.variables.find(
    variable => variable.id === 'subscription.capability.catalog'
  )
  if (
    entry === undefined ||
    typeof entry.currentValue !== 'object' ||
    entry.currentValue === null
  ) {
    throw new Error('已冻结能力目录正文缺失或不是对象')
  }
  return entry.currentValue
}

const capabilityContentSha256 = calculateCanonicalJsonSha256(
  readApprovedCapabilityCatalog() as CanonicalJsonValue
)

/** 执行隔离 MySQL Docker 命令；仅把本地测试错误输出交给失败诊断。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input,
    maxBuffer: Number('10485760')
  })
  if (result.status !== Number('0')) {
    throw new Error(`隔离 MySQL Docker 命令失败：${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/** 在有界时间内等待隔离 MySQL 接受真实查询。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < readinessAttempts; attempt += Number('1')) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        containerName,
        'mysql',
        '--no-defaults',
        '-uroot',
        '--batch',
        '--skip-column-names',
        '-e',
        'SELECT @@port;'
      ],
      { encoding: 'utf8' }
    )
    if (result.status === Number('0') && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, readinessIntervalMs))
  }
  throw new Error('隔离 MySQL 未能在有界等待时间内就绪')
}

/** 在本地一次性数据库执行 SQL 并返回批量查询文本。 */
function runMysql(sql: string): string {
  return runDocker(
    [
      'exec',
      '-i',
      containerName,
      'mysql',
      '--no-defaults',
      '-uroot',
      '--batch',
      '--skip-column-names',
      databaseName
    ],
    sql
  )
}

/** 用仓库冻结顺序创建一次性测试 schema；不复用旧库或 CloudBase 资源。 */
function applySchema(): void {
  runDocker([
    'exec',
    containerName,
    'mysql',
    '--no-defaults',
    '-uroot',
    '-e',
    `CREATE DATABASE \`${databaseName}\`;`
  ])
  for (const fileName of ['001_identity.sql', '007_configuration.sql', '005_subscription.sql']) {
    const sql = fs.readFileSync(path.join(projectRoot, 'docs/backend-v2/schema', fileName), 'utf8')
    runDocker(['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot', databaseName], sql)
  }
}

/** 解析 Docker 自动分配的本机端口，避免并行测试争抢固定端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', containerName, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析隔离 MySQL 的本机映射端口')
  }
  return port
}

/** 向本地真实 MySQL 发布目录策略；目录正文来自冻结配置目录，版本仅为测试夹具。 */
function publishCapabilityCatalog(): void {
  const policyJson = readApprovedCapabilityCatalog()
  runMysql(`
    INSERT INTO business_policy_releases
      (_openid, release_ref, domain_code, policy_code, schema_version, release_version,
       content_sha256, policy_json, status, effective_at_ms, expires_at_ms,
       verified_at_ms, created_at_ms, updated_at_ms)
    VALUES ('', '${capabilityReleaseRef}', 'subscription', 'capability_catalog',
       'subscription-capability-catalog/v1', '${capabilityReleaseVersion}',
       '${capabilityContentSha256}', CAST('${JSON.stringify(policyJson).replaceAll("'", "''")}' AS JSON), 'active',
       ${String(fixedNowMs - oneDayMs)}, ${String(capabilityReleaseExpiresAtMs)}, ${String(fixedNowMs - oneDayMs)},
       ${String(fixedNowMs - oneDayMs)}, ${String(fixedNowMs - oneDayMs)});

    INSERT INTO active_business_policy_releases
      (_openid, domain_code, policy_code, release_internal_id, active_release_version,
       active_content_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
    SELECT '', policy_release.domain_code, policy_release.policy_code, policy_release.id, policy_release.release_version,
       policy_release.content_sha256, 1, ${String(fixedNowMs - oneDayMs)},
       ${String(fixedNowMs - oneDayMs)}, ${String(fixedNowMs - oneDayMs)}
    FROM business_policy_releases AS policy_release
    WHERE policy_release.release_ref = '${capabilityReleaseRef}';
  `)
}

/** 建立真实数据库用户；创建时刻将由测试中的 Identity 只读端口返回。 */
function insertUser(userRef: UserRef, createdAtMs: number): void {
  runMysql(`
    INSERT INTO users
      (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
    VALUES ('', '${userRef}', 'active', 1, ${String(createdAtMs)}, ${String(createdAtMs)});
  `)
  identityTrialAnchors.set(userRef, { userRef, status: 'active', createdAtMs })
}

/** 构造登录域已经解析的统一用户主体；测试不会携带或读取微信主体标识。 */
function createPrincipal(userRef: UserRef, expiresAtMs: number): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userRef,
    sessionVersion: 1,
    authenticatedVia: 'wechat',
    issuedAt: new Date(fixedNowMs - oneHourMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString()
  }
}

/** 创建带明确来源版本信息的试用与植物上限策略输入。 */
function createVerifiedPolicyInputs() {
  return {
    trialEligibility: {
      sourceRef: 'subscription.trial.duration_hours#local-test-input',
      releaseVersion: trialSourceVersion,
      contentSha256: testOnlySourceHash,
      status: 'active',
      effectiveAtMs: fixedNowMs - oneDayMs,
      expiresAtMs: null,
      durationHours: 24
    },
    userPlantLimit: {
      sourceRef: 'user-plant.free.active_limit#local-test-input',
      releaseVersion: plantLimitSourceVersion,
      contentSha256: testOnlySourceHash,
      status: 'active',
      effectiveAtMs: fixedNowMs - oneDayMs,
      expiresAtMs: null,
      appliesToTiers: ['free', 'trial'],
      activeUserPlantLimit: 1
    }
  } as const
}

/** 只证明 snapshot DTO 的字段，不把策略发布来源元数据伪装成 DTO.policyVersion。 */
function expectedSnapshot(input: {
  readonly snapshotRef: string
  readonly userRef: UserRef
  readonly tier: 'free' | 'trial'
  readonly validUntilMs: number
  readonly policyVersion?: string
}): UserCapabilitySnapshotDto {
  const trialCapabilities = [
    'PLANT_IDENTIFICATION',
    'FIXED_DIAGNOSIS',
    'INDEPENDENT_WATERING',
    'SOIL_VISUAL_EVIDENCE',
    'USER_PLANT_CREATE',
    'POINTS_LEVEL_QUERY',
    'REWARDED_AI',
    'USER_AGENT_TEXT',
    'USER_DIAGNOSIS_TEXT',
    'USER_DIAGNOSIS_VISUAL'
  ] as const
  const freeCapabilities = [
    'PLANT_IDENTIFICATION',
    'FIXED_DIAGNOSIS',
    'INDEPENDENT_WATERING',
    'SOIL_VISUAL_EVIDENCE',
    'USER_PLANT_CREATE',
    'POINTS_LEVEL_QUERY',
    'REWARDED_AI'
  ] as const

  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: input.snapshotRef,
    subjectType: 'user',
    user_id: input.userRef,
    tier: input.tier,
    allowedCapabilities: [...(input.tier === 'trial' ? trialCapabilities : freeCapabilities)],
    rewardedAiScopes: ['USER_AGENT_TEXT', 'USER_DIAGNOSIS_TEXT', 'USER_DIAGNOSIS_VISUAL'],
    activeUserPlantLimit: 1,
    generatedAt: new Date(fixedNowMs).toISOString(),
    validUntil: new Date(input.validUntilMs).toISOString(),
    policyVersion: input.policyVersion ?? capabilityReleaseVersion
  }
}

/** 创建真实 MySQL Repository 与事务执行器，并替换仅外部的 Identity/试用/植物策略读取边界。 */
function createService(input: {
  readonly source: ReturnType<typeof createMysql2ConnectionSource>
  readonly snapshotRef: string
  readonly nowMs?: number
}) {
  const nowMs = input.nowMs ?? fixedNowMs
  const repository = createMysqlCapabilitySnapshotRepository(input.source)
  const transactionDriver = createMysqlTransactionDriver(input.source, () => undefined)
  const policyInputs = createVerifiedPolicyInputs()

  return createResolveFirstLoginCapabilitySnapshot({
    readIdentityTrialAnchor: async userRef => identityTrialAnchors.get(userRef) ?? null,
    readActiveCapabilityCatalog: repository.readActiveCapabilityCatalog,
    readTrialEligibilityPolicy: async () => policyInputs.trialEligibility,
    readUserPlantLimitPolicy: async () => policyInputs.userPlantLimit,
    transactionDriver,
    repository,
    now: () => nowMs,
    createSnapshotRef: () => input.snapshotRef
  })
}

/**
 * Expected 来源：冻结 `principal-and-capability.md` DTO、`care-points-and-ai-quota.md` 的 24h
 * 注册锚点与惰性 AI grant 规则，以及配置目录中能力目录/1 株上限；测试层次：L3 /
 * `unit_real_data`。Real path：Subscription 应用服务、真实能力策略活动指针、真实 v2 DDL、
 * InnoDB 事务、真实快照 Repository 与独立 SQL 读回。只替换 Identity 内部只读 API 和当前
 * 缺少运行时读取器的 trial/植物上限策略输入；这些测试来源版本会透传到应用结果，但当前
 * capability_snapshots DDL 只保存 capability_catalog 版本，不证明两项来源的回放链。
 * 未覆盖：CloudBase 网络/服务签名、Identity HTTP 路由、完整发布治理、user-plant API/E2E。
 */
describe('首次登录试用能力快照真实 MySQL 切片', () => {
  let source: ReturnType<typeof createMysql2ConnectionSource> | undefined

  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--tmpfs',
      '/var/lib/mysql',
      '--publish',
      '127.0.0.1::3306',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      mysqlImage
    ])
    await waitForMysql()
    applySchema()
    publishCapabilityCatalog()

    source = createMysql2ConnectionSource({
      host: '127.0.0.1',
      port: resolvePublishedPort(),
      database: databaseName,
      user: 'root',
      password: ''
    })
  }, setupTimeoutMs)

  afterAll(async () => {
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  test('注册 23 小时后生成 trial / 1 株快照，事务提交后完整读回且不物化 AI 额度', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const userRef = 'usr_snapshot_trial_0001' as UserRef
    const snapshotRef = 'cps_snapshot_trial_0001'
    const trialExpiresAtMs = registeredTwentyThreeHoursFortyFiveMinutesAgoMs + oneDayMs
    const principalExpiresAtMs = fixedNowMs + hoursInTwo * oneDayMs
    insertUser(userRef, registeredTwentyThreeHoursFortyFiveMinutesAgoMs)

    const resolveSnapshot = createService({ source, snapshotRef })
    const result = await resolveSnapshot(createPrincipal(userRef, principalExpiresAtMs))
    const expected = expectedSnapshot({
      snapshotRef,
      userRef,
      tier: 'trial',
      validUntilMs: trialExpiresAtMs
    })

    expect(result.snapshot).toEqual(expected)
    expect(result.policySourceVersions).toEqual({
      capabilityCatalog: {
        releaseRef: capabilityReleaseRef,
        releaseVersion: capabilityReleaseVersion,
        contentSha256: capabilityContentSha256
      },
      trialEligibility: {
        sourceRef: 'subscription.trial.duration_hours#local-test-input',
        releaseVersion: trialSourceVersion,
        contentSha256: testOnlySourceHash
      },
      userPlantLimit: {
        sourceRef: 'user-plant.free.active_limit#local-test-input',
        releaseVersion: plantLimitSourceVersion,
        contentSha256: testOnlySourceHash
      }
    })

    const readBack = await createMysqlCapabilitySnapshotReader(
      source,
      () => fixedNowMs
    )(createPrincipal(userRef, principalExpiresAtMs))
    expect(readBack).toEqual(expected)
    expect(
      runMysql(`
        SELECT tier, active_user_plant_limit, capability_policy_release_version,
               generated_at_ms, valid_until_ms
        FROM capability_snapshots WHERE snapshot_ref = '${snapshotRef}';
      `)
    ).toBe(
      `trial\t1\t${capabilityReleaseVersion}\t${String(fixedNowMs)}\t${String(trialExpiresAtMs)}`
    )
    expect(
      runMysql(`
        SELECT
          (SELECT COUNT(*) FROM trial_entitlements) +
          (SELECT COUNT(*) FROM ai_quota_grants) +
          (SELECT COUNT(*) FROM care_point_ledger) +
          (SELECT COUNT(*) FROM ai_quota_ledger);
      `)
    ).toBe('0')
  })

  /**
   * Expected 来源：principal-and-capability.md §3 与用户确认的“首次需鉴权功能自动生成或刷新”。
   * 层次：L3 / unit_real_data。真实路径：已认证 Principal → Subscription 首次裁决 →
   * MySQL 策略活动指针、快照事务写入与新连接读回；仅替换尚未接通的 Identity 内部
   * 锚点接口及试用/植物上限策略读取边界。不覆盖 HTTP、真实微信、CloudBase 部署。
   */
  test('首次需要能力时自动生成并复用快照，不要求预置记录', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const userRef = 'usr_snapshot_on_demand_0001' as UserRef
    const snapshotRef = 'cps_snapshot_on_demand_0001'
    const principal = createPrincipal(userRef, fixedNowMs + oneDayMs)
    insertUser(userRef, fixedNowMs - oneHourMs)
    expect(
      runMysql(`SELECT COUNT(*) FROM capability_snapshots WHERE snapshot_ref = '${snapshotRef}';`)
    ).toBe('0')

    let generationCount = Number('0')
    const generate = createService({ source, snapshotRef })
    const resolve = createResolveOnDemandCapabilitySnapshot({
      read: createMysqlCapabilitySnapshotReader(source, () => fixedNowMs),
      generate: async authenticatedPrincipal => {
        generationCount += Number('1')
        return (await generate(authenticatedPrincipal)).snapshot
      }
    })

    const first = await resolve(principal)
    expect(first).toMatchObject({ user_id: userRef, tier: 'trial', activeUserPlantLimit: 1 })
    expect(await resolve(principal)).toEqual(first)
    expect(generationCount).toBe(oneSnapshot)
    expect(
      runMysql(`SELECT COUNT(*) FROM capability_snapshots WHERE snapshot_ref = '${snapshotRef}';`)
    ).toBe('1')
  })

  /**
   * Expected 来源：principal-and-capability.md §3 的过期后重新裁决，以及用户确认的首次使用自动刷新。
   * 层次：L3 / unit_real_data；旧快照与新快照均经 Subscription 真实事务写入及 MySQL 读回。
   */
  test('已有快照过期时重新生成，不把过期记录直接用于创建植物', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const connectionSource = source
    const userRef = 'usr_snapshot_refresh_0001' as UserRef
    const oldSnapshotRef = 'cps_snapshot_refresh_old_0001'
    const newSnapshotRef = 'cps_snapshot_refresh_new_0001'
    const earlierMs = fixedNowMs - oneHourMs
    insertUser(userRef, earlierMs - oneHourMs)
    await createService({
      source: connectionSource,
      snapshotRef: oldSnapshotRef,
      nowMs: earlierMs
    })(
      createPrincipal(userRef, earlierMs + minutesInFive * secondsPerMinute * millisecondsPerSecond)
    )

    const principal = createPrincipal(userRef, fixedNowMs + oneDayMs)
    const resolve = createResolveOnDemandCapabilitySnapshot({
      read: createMysqlCapabilitySnapshotReader(connectionSource, () => fixedNowMs),
      generate: async authenticatedPrincipal =>
        (
          await createService({ source: connectionSource, snapshotRef: newSnapshotRef })(
            authenticatedPrincipal
          )
        ).snapshot
    })
    const refreshed = await resolve(principal)

    expect(refreshed.snapshotRef).toBe(newSnapshotRef)
    expect(refreshed.validUntil).toBe(new Date(capabilityReleaseExpiresAtMs).toISOString())
    expect(
      runMysql(`SELECT COUNT(*) FROM capability_snapshots WHERE user_internal_id =
        (SELECT id FROM users WHERE public_user_id = '${userRef}');`)
    ).toBe('2')
  })

  test('达到 created_at_ms + 24 小时的同一毫秒回落为免费并沿用 1 株上限', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const userRef = 'usr_snapshot_boundary_0001' as UserRef
    const snapshotRef = 'cps_snapshot_boundary_0001'
    const principalExpiresAtMs = fixedNowMs + oneDayMs
    insertUser(userRef, registeredExactlyOneDayAgoMs)

    const resolveSnapshot = createService({ source, snapshotRef })
    const result = await resolveSnapshot(createPrincipal(userRef, principalExpiresAtMs))
    const expected = expectedSnapshot({
      snapshotRef,
      userRef,
      tier: 'free',
      validUntilMs: capabilityReleaseExpiresAtMs
    })

    expect(result.snapshot).toEqual(expected)
    expect(
      await createMysqlCapabilitySnapshotReader(
        source,
        () => fixedNowMs
      )(createPrincipal(userRef, principalExpiresAtMs))
    ).toEqual(expected)
  })

  test('validUntil 取会话、试用截止与能力策略截止中最早且未来的时刻', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const userRef = 'usr_snapshot_session_0001' as UserRef
    const snapshotRef = 'cps_snapshot_session_0001'
    const registeredAtMs = fixedNowMs - oneHourMs
    const sessionExpiresAtMs = fixedNowMs + minutesInFive * secondsPerMinute * millisecondsPerSecond
    insertUser(userRef, registeredAtMs)

    const resolveSnapshot = createService({ source, snapshotRef })
    const result = await resolveSnapshot(createPrincipal(userRef, sessionExpiresAtMs))

    expect(result.snapshot.validUntil).toBe(new Date(sessionExpiresAtMs).toISOString())
    expect(Date.parse(result.snapshot.validUntil)).toBeGreaterThan(fixedNowMs)
  })

  test('已验证能力策略的 expiresAt 早于试用与会话时成为快照截止时刻', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const userRef = 'usr_snapshot_policy_expiry_0001' as UserRef
    const snapshotRef = 'cps_snapshot_policy_expiry_0001'
    const registeredAtMs = fixedNowMs - oneHourMs
    const principalExpiresAtMs = fixedNowMs + oneDayMs
    insertUser(userRef, registeredAtMs)

    const result = await createService({ source, snapshotRef })(
      createPrincipal(userRef, principalExpiresAtMs)
    )

    expect(result.snapshot.validUntil).toBe(new Date(capabilityReleaseExpiresAtMs).toISOString())
    expect(
      await createMysqlCapabilitySnapshotReader(
        source,
        () => fixedNowMs
      )(createPrincipal(userRef, principalExpiresAtMs))
    ).toMatchObject({ validUntil: new Date(capabilityReleaseExpiresAtMs).toISOString() })
  })

  test('Identity 锚点与已认证 principal 不匹配时失败关闭且不写快照', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const userRef = 'usr_snapshot_mismatch_0001' as UserRef
    const otherUserRef = 'usr_snapshot_other_0001' as UserRef
    const snapshotRef = 'cps_snapshot_mismatch_0001'
    insertUser(userRef, registeredTwentyThreeHoursFortyFiveMinutesAgoMs)

    const resolveSnapshot = createResolveFirstLoginCapabilitySnapshot({
      readIdentityTrialAnchor: async () => ({
        userRef: otherUserRef,
        status: 'active',
        createdAtMs: registeredTwentyThreeHoursFortyFiveMinutesAgoMs
      }),
      readActiveCapabilityCatalog:
        createMysqlCapabilitySnapshotRepository(source).readActiveCapabilityCatalog,
      readTrialEligibilityPolicy: async () => createVerifiedPolicyInputs().trialEligibility,
      readUserPlantLimitPolicy: async () => createVerifiedPolicyInputs().userPlantLimit,
      transactionDriver: createMysqlTransactionDriver(source, () => undefined),
      repository: createMysqlCapabilitySnapshotRepository(source),
      now: () => fixedNowMs,
      createSnapshotRef: () => snapshotRef
    })

    await expect(
      resolveSnapshot(createPrincipal(userRef, fixedNowMs + oneDayMs))
    ).rejects.toMatchObject({ reason: 'TRIAL_ANCHOR_USER_MISMATCH' })
    expect(
      runMysql(`SELECT COUNT(*) FROM capability_snapshots WHERE snapshot_ref = '${snapshotRef}';`)
    ).toBe('0')
  })

  test('MySQL 唯一键写入中断时事务回滚且独立读回没有第二条快照', async () => {
    if (source === undefined) {
      throw new Error('真实 MySQL 连接来源未初始化')
    }
    const firstUserRef = 'usr_snapshot_rollback_a_0001' as UserRef
    const secondUserRef = 'usr_snapshot_rollback_b_0001' as UserRef
    const duplicateSnapshotRef = 'cps_snapshot_rollback_0001'
    insertUser(firstUserRef, registeredTwentyThreeHoursFortyFiveMinutesAgoMs)
    insertUser(secondUserRef, registeredTwentyThreeHoursFortyFiveMinutesAgoMs)

    await createService({ source, snapshotRef: duplicateSnapshotRef })(
      createPrincipal(firstUserRef, fixedNowMs + oneDayMs)
    )
    await expect(
      createService({ source, snapshotRef: duplicateSnapshotRef })(
        createPrincipal(secondUserRef, fixedNowMs + oneDayMs)
      )
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' })

    expect(
      runMysql(
        `SELECT COUNT(*) FROM capability_snapshots WHERE snapshot_ref = '${duplicateSnapshotRef}';`
      )
    ).toBe('1')
    expect(
      await createMysqlCapabilitySnapshotReader(
        source,
        () => fixedNowMs
      )(createPrincipal(firstUserRef, fixedNowMs + oneDayMs))
    ).toMatchObject({
      snapshotRef: duplicateSnapshotRef,
      user_id: firstUserRef,
      tier: 'trial',
      activeUserPlantLimit: 1
    })
  })
})
