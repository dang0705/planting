import pino from 'pino'

import { readFunctionEnvironment } from '../configuration/environment.js'
import { RUNTIME_PARAMETERS } from '../configuration/runtime-parameters.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../foundation/database/mysql-transaction-driver.js'
import { createDiagnosisMaintenanceSweepEventHandler } from '../diagnosis/visual/event/diagnosis-maintenance-sweep-handler.js'
import { createDiagnosisMaintenanceSweepFromSource } from '../diagnosis/visual/visual-sweep-module.js'

/**
 * diagnosis 域事件函数 `diagnosis-maintenance-sweep`（主代理 2026-10-11 裁决）。
 * 定时触发器 cron 见配置目录 `diagnosis.maintenance_sweep`（与 care-maintenance-sweep 相同，必须与触发器一致）。
 * 一次运行两个独立阶段：AI 额度预占到期扫描（复用 subscription 逻辑）→ 回收卡在处理中超过整单时长的视觉诊断；各自有预算，互不影响。
 * 放在 diagnosis 而不是 care：care 函数不得调用 subscription / diagnosis 的仓储（按业务域拆分）；subscription 目前没有部署入口，
 * AI 额度的唯一调用方是视觉诊断，待 subscription 函数上线后把到期扫描迁过去。
 * Nodejs20.19、Handler `index.main`；不监听端口、不挂 HTTP 网关。
 */
const environment = readFunctionEnvironment(process.env)
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(environment.database)
const driver = createMysqlTransactionDriver(source, () => {
  logger.error(
    { event: 'transaction_rollback_failed', function: 'diagnosis-maintenance-sweep' },
    '事务回滚失败'
  )
})
const sweep = createDiagnosisMaintenanceSweepFromSource({
  source,
  driver,
  settings: RUNTIME_PARAMETERS.diagnosis.maintenanceSweep.value,
  now: () => Date.now()
})

/** CloudBase 事件函数入口（Handler：`index.main`）；只输出计数摘要。 */
const handler = createDiagnosisMaintenanceSweepEventHandler({ sweep })
export const main = async (event: unknown, context: unknown) => {
  const summary = await handler(event, context)
  const warn = summary.reservations.outcome === 'failed' || summary.sessions.outcome === 'failed'
  logger[warn ? 'warn' : 'info'](
    {
      event: 'diagnosis_maintenance_sweep_run',
      function: 'diagnosis-maintenance-sweep',
      ...summary
    },
    '诊断低频补扫'
  )
  return summary
}
