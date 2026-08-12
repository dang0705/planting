import fs from 'node:fs'
import path from 'node:path'

const LIVE_PROJECT_PATH = path.resolve(process.cwd(), 'dist', 'dev', 'mp-weixin')
const SNAPSHOT_MARKER = '.qa-runtime-snapshot.json'

function normalized(value) {
  return path.resolve(String(value || ''))
}

export function checkQaProjectSnapshot(projectPath) {
  const resolvedProjectPath = normalized(projectPath)
  if (resolvedProjectPath === LIVE_PROJECT_PATH) {
    return {
      ok: false,
      code: 'qa_live_project_path_forbidden',
      reason:
        '正式端上测试不得直接连接正在被 LAN watcher 写入的 dist/dev/mp-weixin；请使用 qa-run 创建的隔离项目快照。'
    }
  }

  const markerPath = path.join(resolvedProjectPath, SNAPSHOT_MARKER)
  if (!fs.existsSync(markerPath)) {
    return {
      ok: false,
      code: 'qa_project_snapshot_marker_missing',
      reason: `隔离项目快照标记不存在：${markerPath}。请通过统一 qa-run 启动端上测试。`
    }
  }

  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    if (
      marker?.version !== 1 ||
      !String(marker.session_id || '').trim() ||
      normalized(marker.snapshot_project_path) !== resolvedProjectPath
    ) {
      return {
        ok: false,
        code: 'qa_project_snapshot_marker_invalid',
        reason: `隔离项目快照标记无效：${markerPath}`
      }
    }
    return { ok: true, markerPath, marker }
  } catch (error) {
    return {
      ok: false,
      code: 'qa_project_snapshot_marker_unreadable',
      reason: `隔离项目快照标记无法读取：${markerPath}（${error.message}）`
    }
  }
}

export const qaProjectSnapshotMarkerName = SNAPSHOT_MARKER
