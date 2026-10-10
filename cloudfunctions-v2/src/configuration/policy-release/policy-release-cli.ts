import type { DatabaseConnectionConfig } from '../../foundation/config/database-config.js'
import { readFunctionEnvironment, type EnvironmentSource } from '../environment.js'
import {
  activatePolicyRelease,
  listPolicyReleases,
  publishPolicyRelease,
  renderPolicySeedSql,
  rollbackPolicyRelease,
  type PolicyReleaseConnection,
  type PolicyReleaseOutcome
} from './policy-release-store.js'
import { loadPolicyReleaseDocument } from './release-document.js'

/**
 * 策略发布命令行（configuration-layers/v2 §6）。
 *
 * 命令：
 * - `validate <发布文档>`：按策略类型 AJV 校验并输出规范 SHA-256（不连数据库）。
 * - `publish <发布文档> [--apply]`：插入不可变 verified 版本，不切换指针。
 * - `activate --domain d --policy p --version v --expect-current <版本|none> --actor a --reason r --evidence e [--apply]`：条件切换指针并写审计。
 * - `list --domain d --policy p`：历史版本与当前指针。
 * - `rollback --domain d --policy p --expect-current v --actor a --reason r --evidence e [--apply]`：指回上一版并写审计。
 * - `render-seed-sql <发布文档...>`：输出空库种子 SQL（只打印，不执行）。
 * 默认 dry-run，只有显式 `--apply` 才写库。连接参数经 environment.ts 从 V2_MYSQL_* 读取；输出不含密码。
 * 退出码：0 成功 / dry-run / 已是目标状态；1 文档非法；2 期望版本不符或并发冲突；3 目标不存在；64 用法错误；70 内部错误。
 */

/** 可关闭的连接。 */
export type ClosablePolicyReleaseConnection = PolicyReleaseConnection & {
  /** 关闭数据库连接（命令结束后总会调用）。 */
  readonly end: () => Promise<void>
}

/** CLI 外部依赖（入口注入，测试可替换）。 */
export interface PolicyReleaseCliIo {
  /** 进程环境变量（只用于读取 V2_MYSQL_*）。 */
  readonly environment: EnvironmentSource
  /** 读取命令行给出的发布文档文件。 */
  readonly readFile: (path: string) => string
  /** 读取仓库内文件（发布文档的 policyFile，相对仓库根）。 */
  readonly readRepoFile: (relativePath: string) => string
  /** 按连接参数建立数据库连接。 */
  readonly connect: (config: DatabaseConnectionConfig) => Promise<ClosablePolicyReleaseConnection>
  /** 当前 UTC 毫秒。 */
  readonly now: () => number
  /** 输出一段文本（JSON）。 */
  readonly write: (text: string) => void
}

/** 退出码。 */
const exitCode = { ok: 0, invalid: 1, conflict: 2, notFound: 3, usage: 64, internal: 70 } as const

/** 解析 `--key value` 与 `--apply`；未知开关视为用法错误。 */
function parseArguments(argv: readonly string[], allowedFlags: readonly string[]): { positional: string[]; flags: Map<string, string>; apply: boolean } | null {
  const positional: string[] = []
  const flags = new Map<string, string>()
  let apply = false
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!
    if (token === '--apply') { apply = true; continue }
    if (token.startsWith('--')) {
      const name = token.slice(2)
      const value = argv[index + 1]
      if (!allowedFlags.includes(name) || value === undefined || value.startsWith('--') || flags.has(name)) { return null }
      flags.set(name, value)
      index += 1
      continue
    }
    positional.push(token)
  }
  return { positional, flags, apply }
}

/** 把仓储结果映射为退出码。 */
const codeOf = (outcome: PolicyReleaseOutcome) => outcome.status === 'conflict' ? exitCode.conflict : outcome.status === 'not_found' ? exitCode.notFound : exitCode.ok

/** 运行 CLI，返回退出码。 */
export async function runPolicyReleaseCli(argv: readonly string[], io: PolicyReleaseCliIo): Promise<number> {
  const [command, ...rest] = argv
  const print = (value: Record<string, unknown>) => { io.write(`${JSON.stringify(value)}\n`) }
  const load = (path: string) => {
    let raw: unknown
    try { raw = JSON.parse(io.readFile(path)) as unknown } catch { return { ok: false as const, reason: 'DOCUMENT_UNREADABLE' } }
    return loadPolicyReleaseDocument(raw, io.readRepoFile)
  }
  const scopeFlags = ['domain', 'policy']
  const actorFlags = ['actor', 'reason', 'evidence']
  const withConnection = async (work: (connection: ClosablePolicyReleaseConnection) => Promise<number>) => {
    const connection = await io.connect(readFunctionEnvironment(io.environment).database)
    try { return await work(connection) } finally { await connection.end().catch(() => undefined) }
  }
  try {
    if (command === 'validate' || command === 'publish') {
      const parsed = parseArguments(rest, [])
      if (parsed === null || parsed.positional.length !== 1 || (command === 'validate' && parsed.apply)) { return exitCode.usage }
      const loaded = load(parsed.positional[0]!)
      if (!loaded.ok) { print({ command, ok: false, reason: loaded.reason }); return exitCode.invalid }
      const summary = { domainCode: loaded.document.domainCode, policyCode: loaded.document.policyCode, schemaVersion: loaded.document.schemaVersion,
        releaseVersion: loaded.document.releaseVersion, contentSha256: loaded.contentSha256 }
      if (command === 'validate') { print({ command, ok: true, ...summary }); return exitCode.ok }
      return withConnection(async connection => {
        const outcome = await publishPolicyRelease(connection, loaded, { nowMs: io.now(), apply: parsed.apply })
        print({ command, dryRun: !parsed.apply, status: outcome.status, reason: outcome.reason, ...summary })
        return codeOf(outcome)
      })
    }
    if (command === 'activate' || command === 'rollback') {
      const allowed = [...scopeFlags, ...actorFlags, 'expect-current', ...(command === 'activate' ? ['version'] : [])]
      const parsed = parseArguments(rest, allowed)
      if (parsed === null || parsed.positional.length > 0 || allowed.some(name => !parsed.flags.has(name))) { return exitCode.usage }
      const flag = (name: string) => parsed.flags.get(name)!
      const expected = flag('expect-current')
      const actor = { actorRef: flag('actor'), reasonCode: flag('reason'), evidenceRef: flag('evidence') }
      const base = { domainCode: flag('domain'), policyCode: flag('policy'), actor, nowMs: io.now(), apply: parsed.apply }
      return withConnection(async connection => {
        const outcome = command === 'activate'
          ? await activatePolicyRelease(connection, { ...base, releaseVersion: flag('version'), expectedCurrentVersion: expected === 'none' ? null : expected })
          : await rollbackPolicyRelease(connection, { ...base, expectedCurrentVersion: expected })
        print({ command, dryRun: !parsed.apply, status: outcome.status, reason: outcome.reason, ...outcome.detail })
        return codeOf(outcome)
      })
    }
    if (command === 'list') {
      const parsed = parseArguments(rest, scopeFlags)
      if (parsed === null || parsed.apply || parsed.positional.length > 0 || scopeFlags.some(name => !parsed.flags.has(name))) { return exitCode.usage }
      return withConnection(async connection => {
        print({ command, ...(await listPolicyReleases(connection, { domainCode: parsed.flags.get('domain')!, policyCode: parsed.flags.get('policy')! })) })
        return exitCode.ok
      })
    }
    if (command === 'render-seed-sql') {
      const parsed = parseArguments(rest, ['issued-at'])
      if (parsed === null || parsed.apply || parsed.positional.length === 0) { return exitCode.usage }
      const issuedAtMs = Date.parse(parsed.flags.get('issued-at') ?? '2026-10-10T00:00:00Z')
      const documents = parsed.positional.map(load)
      const invalid = documents.find(document => !document.ok)
      if (invalid !== undefined && !invalid.ok) { print({ command, ok: false, reason: invalid.reason }); return exitCode.invalid }
      io.write(renderPolicySeedSql(documents as Extract<(typeof documents)[number], { ok: true }>[], { issuedAtMs }))
      return exitCode.ok
    }
    return exitCode.usage
  } catch (error: unknown) {
    // 只输出错误类名，不输出 SQL、连接参数或正文。
    print({ command: command ?? null, ok: false, reason: 'INTERNAL_ERROR', errorName: error instanceof Error ? error.name : 'unknown' })
    return exitCode.internal
  }
}
