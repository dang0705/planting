import type { DatabaseConnectionConfig } from '../../foundation/config/database-config.js'
import { readFunctionEnvironment, type EnvironmentSource } from '../../configuration/environment.js'
import { loadPolicyReleaseDocument } from '../../configuration/policy-release/release-document.js'
import { PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY } from '../../configuration/business-policies/index.js'
import {
  buildVisualFilterIndex,
  type VisualFilterIndexConnection
} from './build-visual-filter-index.js'

/**
 * 三轴筛选索引回填命令行（运维工具，非 HTTP 产品代码）。
 *
 * 用法：`build --release <public_search 发布文档> --batch-size <1–20000> [--apply]`
 * - 三轴数据版本只取自经策略类型校验的发布文档（与线上读取方计算同一个 source_key）。
 * - 默认 dry-run 只读；显式 `--apply` 才写 031 的三张表；可重复执行（幂等、断点续跑）。
 * - 连接参数经 environment.ts 从 V2_MYSQL_* 读取；输出只含报告，不含密码或数据正文。
 * 退出码：0 成功 / 演练 / 已就绪；1 文档非法；64 用法错误；70 内部错误。
 */

/** 可关闭的回填连接。 */
export type ClosableVisualFilterIndexConnection = VisualFilterIndexConnection & {
  /** 关闭数据库连接（命令结束后总会调用）。 */
  readonly end: () => Promise<void>
}

/** CLI 外部依赖（入口注入，测试可替换）。 */
export interface VisualFilterIndexCliIo {
  /** 进程环境变量（只用于读取 V2_MYSQL_*）。 */
  readonly environment: EnvironmentSource
  /** 读取命令行给出的发布文档文件。 */
  readonly readFile: (path: string) => string
  /** 读取仓库内文件（发布文档引用的正文文件）。 */
  readonly readRepoFile: (relativePath: string) => string
  /** 按连接参数建立数据库连接。 */
  readonly connect: (
    config: DatabaseConnectionConfig
  ) => Promise<ClosableVisualFilterIndexConnection>
  /** 当前 UTC 毫秒。 */
  readonly now: () => number
  /** 输出一段文本（JSON）。 */
  readonly write: (text: string) => void
}

const exitCode = { ok: 0, invalid: 1, usage: 64, internal: 70 } as const

/** 运行 CLI，返回退出码。 */
export async function runVisualFilterIndexCli(
  argv: readonly string[],
  io: VisualFilterIndexCliIo
): Promise<number> {
  const print = (value: Record<string, unknown>) => {
    io.write(`${JSON.stringify(value)}\n`)
  }
  const [command, ...rest] = argv
  if (command !== 'build') {
    return exitCode.usage
  }
  const flags = new Map<string, string>()
  let apply = false
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!
    if (token === '--apply') {
      apply = true
      continue
    }
    const name = token.startsWith('--') ? token.slice(2) : ''
    const value = rest[index + 1]
    if (
      !['release', 'batch-size'].includes(name) ||
      value === undefined ||
      value.startsWith('--') ||
      flags.has(name)
    ) {
      return exitCode.usage
    }
    flags.set(name, value)
    index += 1
  }
  const releasePath = flags.get('release')
  const batchSize = Number(flags.get('batch-size'))
  if (
    !releasePath ||
    !/^[1-9][0-9]{0,4}$/u.test(flags.get('batch-size') ?? '') ||
    batchSize > 20_000
  ) {
    return exitCode.usage
  }
  try {
    let raw: unknown
    try {
      raw = JSON.parse(io.readFile(releasePath)) as unknown
    } catch {
      print({ command, ok: false, reason: 'DOCUMENT_UNREADABLE' })
      return exitCode.invalid
    }
    const loaded = loadPolicyReleaseDocument(raw, io.readRepoFile)
    if (!loaded.ok) {
      print({ command, ok: false, reason: loaded.reason })
      return exitCode.invalid
    }
    const isPublicSearch =
      loaded.document.domainCode === 'plant-knowledge' &&
      loaded.document.policyCode === 'public_search'
    const rules = isPublicSearch
      ? PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY.resolve(loaded.policy, loaded.document.schemaVersion)
      : null
    if (!rules?.visualAxisSources) {
      print({ command, ok: false, reason: 'NOT_A_VISUAL_FILTER_RELEASE' })
      return exitCode.invalid
    }
    const connection = await io.connect(readFunctionEnvironment(io.environment).database)
    try {
      const report = await buildVisualFilterIndex(connection, {
        sources: rules.visualAxisSources,
        batchSize,
        apply,
        nowMs: io.now()
      })
      print({
        command,
        dryRun: !apply,
        releaseVersion: loaded.document.releaseVersion,
        ...report,
        filterSetId: report.filterSetId === null ? null : String(report.filterSetId)
      })
      return exitCode.ok
    } finally {
      await connection.end().catch(() => undefined)
    }
  } catch (error: unknown) {
    // 只输出错误类名与中文说明，不输出 SQL、连接参数或数据正文。
    print({
      command,
      ok: false,
      reason: 'INTERNAL_ERROR',
      errorName: error instanceof Error ? error.name : 'unknown',
      message:
        error instanceof Error && error.message.startsWith('三轴筛选索引回填')
          ? error.message
          : undefined
    })
    return exitCode.internal
  }
}
