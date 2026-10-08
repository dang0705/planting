import { spawnSync } from 'node:child_process'
import { createSecretKey, createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise'
import type { Server } from 'node:http'

import type { Mysql2QueryConnection } from '../../../src/foundation/database/mysql2-connection-source.js'
import { createMysql2ConnectionSource } from '../../../src/foundation/database/mysql2-connection-source.js'
import type { MysqlConnectionPoolPort } from '../../../src/foundation/database/mysql-transaction-driver.js'
import type { RequestChainAuditEvent } from '../../../src/foundation/http/request-chain.js'
import {
  calculateIdentitySessionPolicyContentSha256,
  resolveIdentitySessionPolicySnapshot,
  type IdentitySessionPolicySnapshot
} from '../../../src/configuration/identity-session-policy.js'
import {
  createVerifyPlatformCredentialUseCase,
  PlatformCredentialEvidenceError,
  type PlatformCredentialProvider,
  type VerifiedPlatformIdentityEvidence
} from '../../../src/identity/provider/platform-credential-evidence.js'
import { createIdentityServer } from '../../../src/identity/http/server.js'
import { createUserPlantServer } from '../../../src/user-plant/http/server.js'
import { closeTestServer, listenTestServer } from './http-test-server.js'
import { findProjectRoot } from '../../support/project-root.js'

const projectRoot = findProjectRoot()
const schemaRoot = path.join(projectRoot, 'docs/backend-v2/schema')
const schemaDatabaseName = `qinghuazhi_v2_identity_login_${String(process.pid)}`
const containerName = `qhz-v2-identity-login-${String(process.pid)}`
const appUser = 'qhz_v2_identity_login'
const appPassword = 'fixture-identity-login-password'
const mysqlReadyAttempts = Number('90')
const mysqlReadyIntervalMs = Number('250')
const dockerSuccess = Number('0')
const mysqlPort = Number('3306')
const firstArrayIndex = Number('0')
const grantedSessionTtlHours = Number('24')
const millisecondsPerHour = Number('3600000')
const appScope = 'qinghuazhi-wechat-test-app'
const capturedAt = '2026-09-27T14:00:00.000Z'
const nowMs = Date.parse(capturedAt)
const firstCode = 'wx-code-once-owner-first-001'
const nextCode = 'wx-code-once-owner-next-002'
const subjectCode = 'wx-code-once-other-subject-003'
const invalidCode = 'wx-code-invalid-004'
const concurrentCodeA = 'wx-code-concurrent-subject-a-005'
const concurrentCodeB = 'wx-code-concurrent-subject-b-006'
const rollbackCode = 'wx-code-rollback-subject-007'
const unknownCommitCode = 'wx-code-unknown-commit-008'
const afterUnknownCommitCode = 'wx-code-after-unknown-commit-009'
const ownerPlantRef = 'upl_identity_login_owner_0001'

/** SQL 计数读回仅返回符合查询条件的记录数，不带数据库主键或平台主体。 */
type CountRow = RowDataPacket & {
  /** 真实数据库中符合条件的记录数。 */
  readonly total: string
}

/** 仅供 MySQL HTTP 测试使用的登录响应安全字段读取器。 */
export type IdentityLoginReadback = {
  /** 登录成功时存在；错误响应不得包含该字段。 */
  readonly data?: {
    /** 首次成功响应一次性交付的青花植自签 Bearer。 */
    readonly accessToken?: string
    /** 会话的绝对失效时刻，采用 ISO 8601 UTC 格式。 */
    readonly expiresAt?: string
  }
  /** 登录拒绝时存在的稳定错误字段。 */
  readonly error?: {
    /** 可公开的稳定错误类别。 */
    readonly type?: string
    /** 不包含 Provider 原始错误、主体或凭证的中文提示。 */
    readonly message?: string
  }
}

/** 一次性微信登录纵向测试使用的真实 MySQL、HTTP 与受控替身资源。 */
export type IdentityWechatLoginMysqlFixture = {
  /** 隔离 MySQL 数据库连接池，仅用于测试中的受限读写与读回。 */
  readonly databasePool: Pool
  /** 经过真实 MySQL 的事务连接来源。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** Identity HTTP 服务地址。 */
  readonly identityBaseUrl: string
  /** 已有 user-plant GET HTTP 服务地址。 */
  readonly userPlantBaseUrl: string
  /** 测试合同规定的可信 UTC 毫秒时钟。 */
  readonly nowMs: number
  /** 已批准的 24 小时身份策略值，仅作为测试发布快照。 */
  readonly grantedSessionTtlHours: number
  /** 每小时的毫秒数。 */
  readonly millisecondsPerHour: number
  /** 测试使用的首个一次性 code。 */
  readonly firstCode: string
  /** 同一平台主体的新一次性 code。 */
  readonly nextCode: string
  /** 独立平台主体的一次性 code。 */
  readonly subjectCode: string
  /** 无效的一次性 code。 */
  readonly invalidCode: string
  /** 并发首登的第一个一次性 code。 */
  readonly concurrentCodeA: string
  /** 并发首登的第二个一次性 code。 */
  readonly concurrentCodeB: string
  /** 用于事务回滚探针的一次性 code。 */
  readonly rollbackCode: string
  /** 用于提交确认丢失探针的一次性 code。 */
  readonly unknownCommitCode: string
  /** 确认丢失后重新获取的一次性 code。 */
  readonly afterUnknownCommitCode: string
  /** 用于首次登录后读取的测试用户植物公开引用。 */
  readonly ownerPlantRef: string
  /** 容器名称，仅用于清理隔离测试容器。 */
  readonly containerName: string
  /** 测试数据库名称，供事务故障触发器限定范围。 */
  readonly schemaDatabaseName: string
  /** 运行测试 SQL，不输出或记录登录凭证。 */
  readonly runRootSql: (sql: string, database?: string) => string
  /** 将短时 code 通过一次性 fake Provider 解析为可信身份材料。 */
  readonly createOneTimeWechatCodeVerifier: () => (
    code: string
  ) => Promise<VerifiedPlatformIdentityEvidence>
  /** 创建模拟提交已成功但客户端未收到确认的连接来源。 */
  readonly createCommitAcknowledgementLossSource: (
    source: MysqlConnectionPoolPort<Mysql2QueryConnection>
  ) => {
    readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
    readonly connectionAcquisitions: () => number
  }
  /** 对 Bearer 原文执行 SHA-256，用于安全持久化读回。 */
  readonly hashBearer: (bearer: string) => string
  /** 发起 `{ platform: 'wechat', code }` 的身份登录请求。 */
  readonly login: (code: string, additionalHeaders?: Record<string, string>) => Promise<Response>
  /** 读回隔离库中的用户、平台绑定和会话记录数量。 */
  readonly identityCounts: () => Promise<{
    readonly users: number
    readonly bindings: number
    readonly sessions: number
  }>
  /** 当前 Provider 已处理的登录凭证数量，用于验证提前失败路径。 */
  readonly providerCallCount: () => number
  /** 替换或恢复当前 Identity 会话策略发布快照。 */
  readonly setActivePolicySnapshot: (
    snapshot: Readonly<IdentitySessionPolicySnapshot> | null
  ) => void
  /** 读取当前 Identity 会话策略发布快照，仅用于构造隔离故障探针。 */
  readonly getActivePolicySnapshot: () => Readonly<IdentitySessionPolicySnapshot> | null
  /** 启动一个随机端口 HTTP 服务，并返回其本机地址。 */
  readonly listen: (server: Server) => Promise<string>
  /** 安全停止当前测试启动的 HTTP 服务。 */
  readonly closeServer: (server: Server | undefined) => Promise<void>
  /** 按合同生成当前有效的 24 小时测试策略快照。 */
  readonly createActivePolicySnapshot: () => Readonly<IdentitySessionPolicySnapshot>
  /** 直接构造隔离 Identity 服务，供提交确认丢失及内部签名路由探针使用。 */
  readonly createIdentityServer: typeof createIdentityServer
  /** 停止 HTTP 服务、连接池和隔离 MySQL 容器。 */
  readonly dispose: () => Promise<void>
}

/** 执行隔离容器命令；失败时只保留 Docker 诊断，不输出业务凭证。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input,
    maxBuffer: Number('10485760')
  })
  if (result.status !== dockerSuccess) {
    throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 有界轮询 MySQL 的真实 SELECT 结果，避免把容器启动误判成数据库就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < mysqlReadyAttempts; attempt += Number('1')) {
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
    if (result.status === dockerSuccess && result.stdout.trim() === String(mysqlPort)) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, mysqlReadyIntervalMs))
  }
  throw new Error('隔离 MySQL 未在限定时间内就绪')
}

/** 通过隔离 MySQL 容器执行 DDL 和故障注入 SQL；不访问 CloudBase。 */
function runRootSql(sql: string, database?: string): string {
  const args = [
    'exec',
    '-i',
    containerName,
    'mysql',
    '--no-defaults',
    '-uroot',
    '--batch',
    '--skip-column-names'
  ]
  if (database) {
    args.push(database)
  }
  return runDocker(args, sql)
}

/** 读取 Docker 随机映射到宿主机的 MySQL 端口。 */
function resolvePublishedPort(): number {
  const port = Number(runDocker(['port', containerName, '3306/tcp']).split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('隔离 MySQL 随机端口无效')
  }
  return port
}

/** 按冻结合同构造显式有效的 24 小时会话策略 fixture。 */
function createActivePolicySnapshot(): Readonly<IdentitySessionPolicySnapshot> {
  const policy = {
    contractVersion: 'identity-session-policy/v1' as const,
    scopeCode: 'identity_sessions' as const,
    sessionTtlHours: grantedSessionTtlHours,
    refreshWindowHours: Number('0') as IdentitySessionPolicySnapshot['refreshWindowHours']
  }
  const release = {
    ...policy,
    releaseVersion: 'identity-session-test/v1',
    contentSha256: calculateIdentitySessionPolicyContentSha256(policy),
    releaseStatus: 'active' as const,
    effectiveAt: '2026-09-27T00:00:00.000Z'
  }
  const resolved = resolveIdentitySessionPolicySnapshot(release, capturedAt)
  if (!resolved.valid) {
    throw new Error('测试策略 fixture 不符合身份会话策略合同')
  }
  return resolved.snapshot
}

/** 创建只接受一次的 fake Provider；成功后再次提交同一 code 会被拒绝。 */
function createOneTimeWechatCodeVerifier(
  consumedCodes: Set<string>,
  normalizedSubjects: ReadonlyMap<string, string>,
  appScope: string,
  recordCall: () => void
): (code: string) => Promise<VerifiedPlatformIdentityEvidence> {
  const provider: PlatformCredentialProvider<string> = {
    verify: async ({ credential }) => {
      recordCall()
      if (consumedCodes.has(credential)) {
        throw new PlatformCredentialEvidenceError('PRINCIPAL_INVALID', '平台登录凭证无效')
      }
      const normalizedSubject = normalizedSubjects.get(credential)
      if (!normalizedSubject) {
        throw new PlatformCredentialEvidenceError('PRINCIPAL_INVALID', '平台登录凭证无效')
      }
      consumedCodes.add(credential)
      return { platform: 'wechat', appScope, normalizedSubject }
    }
  }
  const verify = createVerifyPlatformCredentialUseCase({
    provider,
    keyRing: {
      current: {
        keyVersion: 'identity-test-key-v1',
        secretKey: createSecretKey(Buffer.from('test-only-hmac-key-for-identity-login', 'utf8'))
      },
      retiring: []
    }
  })
  return async code => verify({ platform: 'wechat', appScope, credential: code })
}

/** 对数据库计数并安全停止 HTTP 服务的共享测试准备函数。 */
export async function createIdentityWechatLoginMysqlFixture(): Promise<IdentityWechatLoginMysqlFixture> {
  let activePolicySnapshot: Readonly<IdentitySessionPolicySnapshot> | null =
    createActivePolicySnapshot()
  let providerCallCount = Number('0')
  const consumedCodes = new Set<string>()
  const normalizedSubjects = new Map<string, string>([
    [firstCode, 'test-verified-wechat-subject-owner'],
    [nextCode, 'test-verified-wechat-subject-owner'],
    [subjectCode, 'test-verified-wechat-subject-other'],
    [concurrentCodeA, 'test-verified-wechat-subject-concurrent'],
    [concurrentCodeB, 'test-verified-wechat-subject-concurrent'],
    [rollbackCode, 'test-verified-wechat-subject-rollback'],
    [unknownCommitCode, 'test-verified-wechat-subject-unknown-commit'],
    [afterUnknownCommitCode, 'test-verified-wechat-subject-unknown-commit']
  ])

  runDocker([
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '-P',
    '--tmpfs',
    '/var/lib/mysql',
    '--env',
    'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
    'mysql:8.4'
  ])
  await waitForMysql()
  runRootSql(
    `CREATE DATABASE \`${schemaDatabaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  )

  const manifest = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'manifest.json'), 'utf8')) as {
    readonly files: readonly { readonly order: number; readonly file: string }[]
  }
  for (const [index, entry] of manifest.files.entries()) {
    if (entry.order !== index + Number('1')) {
      throw new Error('身份 MySQL fixture 迁移顺序与 schema manifest 不一致')
    }
    runRootSql(fs.readFileSync(path.join(schemaRoot, entry.file), 'utf8'), schemaDatabaseName)
  }

  runRootSql(
    `CREATE USER '${appUser}'@'%' IDENTIFIED BY '${appPassword}';
     GRANT SELECT, INSERT, UPDATE, DELETE ON \`${schemaDatabaseName}\`.* TO '${appUser}'@'%';
     FLUSH PRIVILEGES;`
  )

  const port = resolvePublishedPort()
  const databasePool = createPool({
    host: '127.0.0.1',
    port,
    database: schemaDatabaseName,
    user: appUser,
    password: appPassword,
    supportBigNumbers: true,
    bigNumberStrings: true
  })
  const connectionSource = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    database: schemaDatabaseName,
    user: appUser,
    password: appPassword
  })

  const verifyCode = () =>
    createOneTimeWechatCodeVerifier(consumedCodes, normalizedSubjects, appScope, () => {
      providerCallCount += Number('1')
    })

  const identityServer = createIdentityServer({
    connectionSource,
    // 多平台登录合同（用户 2026-10-09）：fake Provider 只接微信，其他平台按未配置失败关闭。
    verifyPlatformCode: (platform, code) => platform === 'wechat'
      ? verifyCode()(code)
      : Promise.reject(new PlatformCredentialEvidenceError('INTERNAL_IDENTITY_CONFIGURATION_INVALID', '平台登录配置缺失')),
    resolveSessionPolicy: async () => activePolicySnapshot,
    now: () => nowMs,
    writeAudit: (_event: RequestChainAuditEvent) => undefined,
    recordRollbackFailure: () => undefined
  })
  const identityBaseUrl = await listenTestServer(identityServer)

  const userPlantServer = createUserPlantServer({
    connectionSource,
    now: () => nowMs,
    resolveCapabilitySnapshot: async () => {
      throw new Error('GET 用户植物不应读取能力快照')
    },
    writeAudit: () => undefined,
    recordRollbackFailure: () => undefined
  })
  const userPlantBaseUrl = await listenTestServer(userPlantServer)

  async function identityCounts(): Promise<{
    readonly users: number
    readonly bindings: number
    readonly sessions: number
  }> {
    if (!databasePool) {
      throw new Error('身份 MySQL fixture 尚未就绪')
    }
    const [users] = await databasePool.query<CountRow[]>('SELECT COUNT(*) AS `total` FROM `users`')
    const [bindings] = await databasePool.query<CountRow[]>(
      'SELECT COUNT(*) AS `total` FROM `platform_identities`'
    )
    const [sessions] = await databasePool.query<CountRow[]>(
      'SELECT COUNT(*) AS `total` FROM `user_sessions`'
    )
    return {
      users: Number(users[firstArrayIndex]?.total ?? Number.NaN),
      bindings: Number(bindings[firstArrayIndex]?.total ?? Number.NaN),
      sessions: Number(sessions[firstArrayIndex]?.total ?? Number.NaN)
    }
  }

  return {
    databasePool,
    connectionSource,
    identityBaseUrl,
    userPlantBaseUrl,
    nowMs,
    grantedSessionTtlHours,
    millisecondsPerHour,
    firstCode,
    nextCode,
    subjectCode,
    invalidCode,
    concurrentCodeA,
    concurrentCodeB,
    rollbackCode,
    unknownCommitCode,
    afterUnknownCommitCode,
    ownerPlantRef,
    containerName,
    schemaDatabaseName,
    runRootSql,
    createOneTimeWechatCodeVerifier: verifyCode,
    createCommitAcknowledgementLossSource: source => {
      let acquisitions = Number('0')
      return {
        connectionSource: {
          getConnection: async () => {
            acquisitions += Number('1')
            const connection = await source.getConnection()
            return {
              ...connection,
              commit: async () => {
                await connection.commit()
                throw new Error('test-only commit acknowledgement loss')
              }
            }
          }
        },
        connectionAcquisitions: () => acquisitions
      }
    },
    hashBearer: bearer => createHash('sha256').update(bearer, 'utf8').digest('hex'),
    login: async (code, additionalHeaders = {}) =>
      fetch(`${identityBaseUrl}/api/v2/identity/sessions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...additionalHeaders
        },
        body: JSON.stringify({ platform: 'wechat', code })
      }),
    identityCounts,
    providerCallCount: () => providerCallCount,
    setActivePolicySnapshot: snapshot => {
      activePolicySnapshot = snapshot
    },
    getActivePolicySnapshot: () => activePolicySnapshot,
    listen: listenTestServer,
    closeServer: closeTestServer,
    createActivePolicySnapshot,
    createIdentityServer,
    dispose: async () => {
      await closeTestServer(identityServer)
      await closeTestServer(userPlantServer)
      await databasePool.end()
      spawnSync('docker', ['stop', containerName], { encoding: 'utf8' })
    }
  }
}
