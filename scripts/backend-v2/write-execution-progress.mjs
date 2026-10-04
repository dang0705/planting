/** H5 文档进度投影：仅读取两个小记录，写固定数据制品；不读取架构、源码或旧模块快照。 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const progress = JSON.parse(await readFile(new URL('.codex/backend-v2/task-progress.json', root), 'utf8'))
const state = JSON.parse(await readFile(new URL('.codex/backend-v2/clickup-sync-state.json', root), 'utf8'))

if (!Number.isSafeInteger(progress.revision) || !Array.isArray(progress.tasks) || !state.entries) {
  throw new Error('进度记录缺失必要字段；停止投影，不扩大搜索')
}

/** 白名单投影不包含架构正文或未授权的业务数据，也不据此验收任务。 */
const tasks = progress.tasks.map(task => {
  if (!/^[a-z0-9]+$/u.test(task.id) || !Number.isSafeInteger(task.version) ||
      !Array.isArray(task.summary) || task.summary.length > 5 ||
      task.summary.some(line => typeof line !== 'string' || /[\r\n]/u.test(line)) ||
      (task.status === 'done' && (task.accepted !== true || !task.evidence?.length))) {
    throw new Error('任务进度不满足投影边界；停止生成，不自行修复或验收')
  }
  const synced = state.entries[task.id]
  return {
    id: task.id, step: task.step, version: task.version, status: task.status,
    stage: task.stage, accepted: task.accepted === true, summary: task.summary,
    evidence: task.evidence ?? [], blockingReason: task.blockingReason ?? null,
    nextAction: task.nextAction ?? null,
    sync: synced ? {
      version: synced.version, status: synced.status,
      matched: synced.version === task.version && synced.status === task.status &&
        synced.note === task.summary.join('\n'),
      readback: synced.readback ?? null
    } : null
  }
})

const document = {
  generatedAt: progress.updatedAt, sourceRevision: progress.revision,
  sourceUpdatedAt: progress.updatedAt, currentStep: progress.currentStep,
  currentTicketId: progress.currentTicketId, tasks,
  lastSuccessfulSyncAt: state.lastSuccessfulSyncAt ?? null,
  lastFailure: state.lastFailure ?? null
}
const output = new URL('docs/backend-v2/tracker/execution-progress.json', root)
const body = JSON.stringify(document, null, 2) + '\n'
const fingerprint = createHash('sha256').update(body).digest('hex')
if (state.h5Projection?.fingerprint === fingerprint) {
  console.log('H5 进度无变化，未写入')
  process.exit(0)
}
const temporary = new URL('docs/backend-v2/tracker/execution-progress.json.pending', root)
await writeFile(temporary, body)
await rename(temporary, output)
// 仅读回小同步记录合并投影凭据；不读取 H5 文件或源文档。
const statePath = new URL('.codex/backend-v2/clickup-sync-state.json', root)
const latestState = JSON.parse(await readFile(statePath, 'utf8'))
latestState.h5Projection = { fingerprint, sourceRevision: progress.revision, sourceUpdatedAt: progress.updatedAt }
await writeFile(statePath, JSON.stringify(latestState, null, 2) + '\n')
console.log(`H5 进度投影完成：版本 ${progress.revision}，${tasks.length} 张已登记票据；${fileURLToPath(output)}`)
