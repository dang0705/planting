import pino from 'pino'

import { readFunctionEnvironment } from '../configuration/environment.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import {
  asVisualFilterIndexConnection,
  buildVisualFilterIndex
} from '../plant-knowledge/visual-filter-index/build-visual-filter-index.js'
import { createVisualFilterIndexBackfillHandler } from '../plant-knowledge/visual-filter-index/visual-filter-index-backfill-handler.js'

/**
 * 一次性事件函数 `visual-filter-index-backfill`（ClickUp z8v0kmvgab；用户 2026-10-10 授权在内网跑回填）。
 *
 * 本机无法直连测试库内网 MySQL，因此把离线回填模块包成普通（事件型）云函数，手动调用、可反复续跑。
 * 只读 V2_MYSQL_*（经 environment.ts 校验）；不监听端口、不挂 HTTP 网关、不配置定时触发器。
 * 日志只输出状态与计数，不输出连接参数、taxon、百科 id 或标签内容。用完后按删除证据规则另行下线。
 */

const environment = readFunctionEnvironment(process.env)

const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(environment.database)

const handler = createVisualFilterIndexBackfillHandler({
  // 每次调用独占一条连接：批次事务在同一连接内提交，结束即归还；失败销毁连接。
  build: async input => {
    const connection = await source.getConnection()
    try {
      const report = await buildVisualFilterIndex(asVisualFilterIndexConnection(connection), input)
      connection.release()
      return report
    } catch (error: unknown) {
      connection.destroy()
      throw error
    }
  },
  now: () => Date.now()
})

/** CloudBase 事件函数入口（Handler：`index.main`）。 */
export async function main(event: unknown, context: unknown) {
  const startedAt = Date.now()
  try {
    const result = await handler(event, context)
    logger.info(
      {
        event: 'visual_filter_index_backfill',
        function: 'visual-filter-index-backfill',
        ...result,
        durationMs: Date.now() - startedAt
      },
      '三轴筛选索引回填'
    )
    return result
  } catch (error: unknown) {
    logger.error(
      {
        event: 'visual_filter_index_backfill_failed',
        function: 'visual-filter-index-backfill',
        errorName: error instanceof Error ? error.name : 'unknown',
        durationMs: Date.now() - startedAt
      },
      '三轴筛选索引回填失败'
    )
    return { status: 'failed', reason: 'INTERNAL_ERROR' }
  }
}
