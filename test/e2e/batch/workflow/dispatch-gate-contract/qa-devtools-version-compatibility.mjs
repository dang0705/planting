import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEVTOOLS_UPGRADE_TARGET_VERSION,
  inspectInstalledDevToolsCompatibility,
  OFFICIAL_ELECTRON_RUNTIME,
  SYSTEM_APP_ASAR,
  SYSTEM_ELECTRON,
  SYSTEM_PRODUCT_HASH,
  isOfficialElectronBundle
} from '../../../../../scripts/qa/patch-wechat-devtools-launcher.mjs'
import {
  buildQaDevToolsEnvironment,
  buildTestOwnedDevToolsLaunch
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-devtools-launch.mjs'
import {
  buildEnrollmentEnvironment,
  buildLaunch as buildEnrollmentLaunch,
  isNewQaEnrollmentRecord
} from '../../../../../scripts/qa/launch-wechat-devtools.mjs'
import {
  directControlPortEvidence,
  isMainDevToolsProcess,
  userDataDirFromCommand
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-process-topology.mjs'

const current = inspectInstalledDevToolsCompatibility()
assert.equal(DEVTOOLS_UPGRADE_TARGET_VERSION, '2.02.2608070')
assert.equal(current.status, 'compatible')
assert.equal(current.code, 'devtools_version_compatible')
assert.equal(current.target_version, DEVTOOLS_UPGRADE_TARGET_VERSION)
assert.equal(isOfficialElectronBundle(), true)
assert.equal(current.observed.runtime_kind, 'official_electron')
assert.equal(current.observed.electron, SYSTEM_ELECTRON)
assert.equal(current.observed.app_asar, SYSTEM_APP_ASAR)
assert.equal(current.observed.release_version, DEVTOOLS_UPGRADE_TARGET_VERSION)
assert.equal(current.observed.product_hash, SYSTEM_PRODUCT_HASH)
assert.equal(OFFICIAL_ELECTRON_RUNTIME.kind, 'official_electron')
const officialLaunch = buildTestOwnedDevToolsLaunch({
  profile: path.join(
    os.homedir(),
    '.planting',
    'qa-devtools-home',
    'Library',
    'Application Support',
    '微信开发者工具',
    SYSTEM_PRODUCT_HASH
  ),
  userDataDir: path.join(
    os.homedir(),
    '.planting',
    'qa-devtools-home',
    'Library',
    'Application Support',
    '微信开发者工具'
  ),
  controlPort: 9422,
  projectPath: path.join(process.cwd(), 'dist', 'dev', 'mp-weixin')
})
assert.equal(officialLaunch.runtime_kind, 'official_electron')
assert.equal(officialLaunch.command, SYSTEM_ELECTRON)
assert.equal(officialLaunch.args[0], SYSTEM_APP_ASAR)
assert.equal(officialLaunch.args.includes('--package-dir'), false)
assert.equal(officialLaunch.args.includes('core.wxvpkg'), false)
assert.equal(officialLaunch.args.includes('--ide-http-port'), true)
assert.equal(officialLaunch.args[officialLaunch.args.indexOf('--ide-http-port') + 1], '9422')
const enrollmentLaunch = buildEnrollmentLaunch({
  role: 'qa',
  profile: officialLaunch.profile,
  installedBundle: {
    runtime_kind: 'official_electron',
    app_asar: SYSTEM_APP_ASAR,
    electron: SYSTEM_ELECTRON
  }
})
assert.equal(enrollmentLaunch.runtime_kind, 'official_electron')
assert.equal(enrollmentLaunch.command, SYSTEM_ELECTRON)
assert.equal(enrollmentLaunch.args[0], SYSTEM_APP_ASAR)
assert.equal(enrollmentLaunch.package_dir, null)
assert.equal(enrollmentLaunch.args.includes('--package-dir'), false)
const enrollmentEnvironment = buildEnrollmentEnvironment({
  role: 'qa',
  launch: enrollmentLaunch,
  baseEnv: { HOME: '/Users/jay', USERPROFILE: '/Users/jay' }
})
assert.equal(enrollmentEnvironment.HOME, '/Users/jay')
assert.equal(enrollmentEnvironment.USERPROFILE, '/Users/jay')
assert.equal(enrollmentEnvironment.WECHAT_QA_ENROLLMENT, '1')
const enrollmentRecord = {
  record_sha256: 'new-record',
  ticket_expired_at: 200,
  signature_expired_at: 300
}
const baselineEnrollmentRecord = {
  record_sha256: 'old-record',
  ticket_expired_at: 100,
  signature_expired_at: 150
}
assert.equal(isNewQaEnrollmentRecord(null, baselineEnrollmentRecord), false)
assert.equal(isNewQaEnrollmentRecord(enrollmentRecord, null), true)
assert.equal(isNewQaEnrollmentRecord(baselineEnrollmentRecord, baselineEnrollmentRecord), false)
assert.equal(isNewQaEnrollmentRecord(enrollmentRecord, baselineEnrollmentRecord), true)
const officialEnvironment = buildQaDevToolsEnvironment(
  {
    HOME: '/Users/jay',
    USERPROFILE: '/Users/jay',
    WECHAT_QA_LAUNCHER_NW_BINARY: '/stale/wechatdevtools',
    WECHAT_QA_LAUNCHER_PACKAGE_DIR: '/stale/package.nw',
    WECHAT_QA_EXTENSION_PATH: '/stale/extension',
    WECHAT_QA_CUSTOM_FRONTEND: 'stale'
  },
  { runtimeKind: 'official_electron' }
)
assert.equal(officialEnvironment.HOME, '/Users/jay')
assert.equal(officialEnvironment.USERPROFILE, '/Users/jay')
assert.equal(officialEnvironment.WECHAT_QA_RUNTIME_KIND, 'official_electron')
assert.equal(officialEnvironment.WECHAT_QA_LAUNCHER_NW_BINARY, '')
assert.equal(officialEnvironment.WECHAT_QA_LAUNCHER_PACKAGE_DIR, '')
assert.equal(officialEnvironment.WECHAT_QA_EXTENSION_PATH, '')
assert.equal(officialEnvironment.WECHAT_QA_CUSTOM_FRONTEND, '')
const legacyEnvironment = buildQaDevToolsEnvironment(
  { HOME: '/Users/jay', USERPROFILE: '/Users/jay' },
  { runtimeKind: 'legacy_native' }
)
assert.match(legacyEnvironment.HOME, /\.planting\/qa-devtools-home$/u)
assert.equal(legacyEnvironment.USERPROFILE, legacyEnvironment.HOME)
const officialCommand = [officialLaunch.command, ...officialLaunch.args].join(' ')
assert.equal(isMainDevToolsProcess(officialCommand), true)
assert.deepEqual(directControlPortEvidence(officialCommand), {
  port: 9422,
  source: 'main_devtools_ide_http_port'
})
assert.equal(userDataDirFromCommand(officialCommand), officialLaunch.user_data_dir)

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-devtools-version-'))
try {
  const infoPlist = path.join(root, 'Info.plist')
  const launcher = path.join(root, 'wechatwebdevtools')
  const nwBinary = path.join(root, 'wechatdevtools')
  const packageDir = path.join(root, 'package.nw')
  fs.mkdirSync(packageDir, { recursive: true })
  fs.writeFileSync(
    infoPlist,
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${DEVTOOLS_UPGRADE_TARGET_VERSION}</string><key>CFBundleVersion</key><string>future</string></dict></plist>`
  )
  for (const file of [launcher, nwBinary, path.join(packageDir, 'core.wxvpkg')]) {
    fs.writeFileSync(file, 'future-devtools-build')
  }
  const future = inspectInstalledDevToolsCompatibility({
    app: root,
    launcher,
    nwBinary,
    packageDir,
    infoPlist
  })
  assert.equal(future.status, 'revalidation_required')
  assert.equal(future.code, 'devtools_version_revalidation_required')
  assert.equal(future.observed.version, DEVTOOLS_UPGRADE_TARGET_VERSION)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('DevTools version compatibility contract passed')
