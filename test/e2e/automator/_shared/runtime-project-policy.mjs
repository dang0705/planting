import fs from 'node:fs'
import path from 'node:path'
import {
  QA_RUNTIME_MANIFEST_ROOT,
  QA_RUNTIME_RUNTIMES_ROOT,
  deriveQaRuntime,
  readQaRuntimeManifest,
  runtimeManifestIsReady
} from '../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'

const LIVE_PROJECT_PATH = path.resolve(process.cwd(), 'dist', 'dev', 'mp-weixin')
const SNAPSHOT_MARKER = '.project.json'

function normalized(value) {
  return path.resolve(String(value || ''))
}

export function checkQaProjectSnapshot(projectPath) {
  const resolvedProjectPath = normalized(projectPath)
  // The reusable mp-e2e runner deliberately executes a copied compiled
  // asset.  It has no QA-runtime mirror manifest, so the asset sidecar is the
  // explicit contract boundary for this mode; legacy catalog runs keep the
  // stricter mirror-only policy below.
  if (process.env.MP_E2E_COMPILED_ASSET === '1') {
    const sidecarPath = path.join(resolvedProjectPath, 'mp-e2e.contract.json')
    try {
      const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
      if (sidecar?.contractVersion === 1 && sidecar?.platform === 'wechat-miniprogram') {
        return { ok: true, mode: 'compiled_asset_sidecar', sidecarPath }
      }
    } catch {
      // Fall through to the legacy mirror checks so the failure remains
      // explicit instead of silently accepting an incomplete asset.
    }
  }
  if (resolvedProjectPath === LIVE_PROJECT_PATH) {
    return {
      ok: false,
      code: 'qa_live_project_path_forbidden',
      reason:
        '正式端上测试不得直接连接正在被 LAN watcher 写入的 dist/dev/mp-weixin；请使用 qa-run 创建的隔离项目快照。'
    }
  }

  const runtimeParent = path.dirname(resolvedProjectPath)
  const runtimeKey = path.basename(runtimeParent)
  if (
    !runtimeParent.startsWith(`${path.resolve(QA_RUNTIME_RUNTIMES_ROOT)}${path.sep}`) ||
    !/^[a-f0-9]{32}$/u.test(runtimeKey) ||
    path.basename(resolvedProjectPath) !== 'mp-weixin'
  ) {
    return {
      ok: false,
      code: 'qa_project_runtime_path_invalid',
      reason: `正式端上项目必须位于 QA runtime mirror：${resolvedProjectPath}`
    }
  }

  const markerPath = path.join(QA_RUNTIME_MANIFEST_ROOT, `${runtimeKey}${SNAPSHOT_MARKER}`)
  const manifestPath = path.join(QA_RUNTIME_MANIFEST_ROOT, `${runtimeKey}.json`)
  if (!fs.existsSync(markerPath) || !fs.existsSync(manifestPath)) {
    return {
      ok: false,
      code: 'qa_runtime_manifest_missing',
      reason: `QA runtime 外部身份 manifest 不完整：${manifestPath}`
    }
  }

  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    const manifest = readQaRuntimeManifest(resolvedProjectPath)
    if (
      marker?.schema_version !== 3 ||
      !String(marker.session_id || '').trim() ||
      normalized(marker.project_path) !== resolvedProjectPath ||
      marker.runtime_key !== runtimeKey ||
      !manifest
    ) {
      return {
        ok: false,
        code: 'qa_runtime_manifest_invalid',
        reason: `隔离项目快照标记无效：${markerPath}`
      }
    }
    const sourceRuntime = deriveQaRuntime({ sourceProjectPath: marker.source_project_path })
    if (
      manifest.schema_version !== 3 ||
      manifest.project_path !== resolvedProjectPath ||
      manifest.runtime_key !== marker.runtime_key ||
      !runtimeManifestIsReady(sourceRuntime, manifest)
    ) {
      return {
        ok: false,
        code: 'qa_runtime_manifest_invalid',
        reason: `QA runtime manifest 无效：${manifestPath}`
      }
    }
    if (
      sourceRuntime.runtimeKey !== manifest.runtime_key ||
      sourceRuntime.sourceHead !== manifest.source_head ||
      sourceRuntime.sourceFingerprint !== manifest.source_fingerprint
    ) {
      return {
        ok: false,
        code: 'qa_runtime_source_stale',
        reason: `QA runtime mirror 已落后于当前源码：${manifestPath}`
      }
    }
    return { ok: true, markerPath, manifestPath, marker, manifest }
  } catch (error) {
    return {
      ok: false,
      code: 'qa_runtime_marker_unreadable',
      reason: `隔离项目快照标记无法读取：${markerPath}（${error.message}）`
    }
  }
}

export const qaProjectSnapshotMarkerName = SNAPSHOT_MARKER
