import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  patchQaDevToolsCli,
  patchQaDevToolsRuntimeCli,
  QA_CLI_PATCH_REVISION,
  QA_PRODUCT_HASH
} from './patch-wechat-devtools-cli.mjs'
import { patchPackage, SHARED_AUTH_PATCH_REVISION } from './patch-wechat-devtools-shared-auth.mjs'

export const SYSTEM_DEVTOOLS_APP = '/Applications/wechatwebdevtools.app'
export const SYSTEM_LAUNCHER = path.join(
  SYSTEM_DEVTOOLS_APP,
  'Contents',
  'MacOS',
  'wechatwebdevtools'
)
// DevTools 2.02.2608070 no longer ships the legacy NW executable/package.nw
// pair.  Its supported runtime entrypoint is Electron + app.asar; keep this
// boundary explicit so QA does not accidentally treat a missing legacy
// package as a bad install or patch the installed application in place.
export const SYSTEM_ELECTRON = path.join(SYSTEM_DEVTOOLS_APP, 'Contents', 'MacOS', 'Electron')
export const SYSTEM_APP_ASAR = path.join(
  SYSTEM_DEVTOOLS_APP,
  'Contents',
  'Resources',
  'app.asar'
)
export const SYSTEM_APP_ASAR_UNPACKED = path.join(
  SYSTEM_DEVTOOLS_APP,
  'Contents',
  'Resources',
  'app.asar.unpacked'
)
export const SYSTEM_NW_BINARY = path.join(
  SYSTEM_DEVTOOLS_APP,
  'Contents',
  'MacOS',
  'wechatdevtools'
)
export const SYSTEM_CLI = path.join(SYSTEM_DEVTOOLS_APP, 'Contents', 'MacOS', 'cli')
export const SYSTEM_INFO_PLIST = path.join(SYSTEM_DEVTOOLS_APP, 'Contents', 'Info.plist')
export const SYSTEM_PACKAGE = path.join(SYSTEM_DEVTOOLS_APP, 'Contents', 'Resources', 'package.nw')

function infoPlistForApp(app) {
  return path.join(app, 'Contents', 'Info.plist')
}

function md5String(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex')
}

// The official CLI derives productHash from the installPath string, not from
// the app.asar bytes. This is why a release can keep the same profile hash
// while its app.asar checksum changes during an IDE update.
export const SYSTEM_PRODUCT_HASH = md5String(SYSTEM_APP_ASAR)
export const QA_LAUNCHER_APP = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'devtools',
  'launcher.app'
)
export const QA_LAUNCHER = path.join(QA_LAUNCHER_APP, 'Contents', 'MacOS', 'wechatwebdevtools')
export const QA_CLI = path.join(QA_LAUNCHER_APP, 'Contents', 'MacOS', 'cli')
export const QA_NW_BINARY = path.join(QA_LAUNCHER_APP, 'Contents', 'MacOS', 'wechatdevtools')
export const QA_LAUNCHER_PACKAGE = path.join(QA_LAUNCHER_APP, 'Contents', 'Resources', 'package.nw')
export const QA_FORMAL_LAUNCHER_APP = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'devtools',
  'formal-launcher.app'
)
export const QA_FORMAL_LAUNCHER = path.join(
  QA_FORMAL_LAUNCHER_APP,
  'Contents',
  'MacOS',
  'wechatwebdevtools'
)
export const QA_FORMAL_NW_BINARY = path.join(
  QA_FORMAL_LAUNCHER_APP,
  'Contents',
  'MacOS',
  'wechatdevtools'
)
export const QA_FORMAL_LAUNCHER_PACKAGE = path.join(
  QA_FORMAL_LAUNCHER_APP,
  'Contents',
  'Resources',
  'package.nw'
)
export const QA_FORMAL_LAUNCHER_MARKER = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'devtools',
  'formal-launcher.json'
)
export const QA_LAUNCHER_MARKER = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'devtools',
  'launcher.json'
)
export const QA_SHARED_AUTH_PACKAGE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'devtools',
  'package.nw-v10'
)
export const QA_SHARED_AUTH_PACKAGE_MARKER = path.join(
  QA_SHARED_AUTH_PACKAGE_DIR,
  '.qa-shared-auth-package.json'
)
const QA_PROFILE_ROOT = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'qa-devtools-home'
)
export const QA_EXTENSION_SNAPSHOT_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'devtools',
  'extension'
)
export const QA_EXTENSION_SNAPSHOT_MARKER = path.join(
  QA_EXTENSION_SNAPSHOT_DIR,
  '.qa-extension.json'
)
export const QA_HOME_PLUGIN_ROOT = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'qa-devtools-home',
  'WeappPlugin'
)
export const QA_HOME_PLUGIN_MANIFEST = path.join(QA_HOME_PLUGIN_ROOT, 'manifest.json')
export const QA_HOME_PLUGIN_MANIFEST_MARKER = path.join(
  QA_HOME_PLUGIN_ROOT,
  '.qa-home-plugin-manifest.json'
)

const SYSTEM_LAUNCHER_SHA256 = '25702d572c842171be9c4f9d9f6fe67e5714405a2fe6d09ad7b1cc7929f77677'
const SYSTEM_NW_BINARY_SHA256 = 'de60e41a69563f9e8fc503f0e11bf245b72b5c61f7c87078328ac92ae1914f8c'
const SYSTEM_PACKAGE_CORE_SHA256 =
  '36ea578486f64195798d14d41474d2e54ee6dc55b80cc0df2fd2497ab8b678e5'
const PATCH_REVISION = 'launcher-package-validation-qa-v13-runtime-cli-bundle-profile'
const QA_BUNDLE_IDENTIFIER = 'com.tencent.webplusdevtools.qa.automator'
// 当前安装并经 QA 流程使用的官方稳定版。升级到其他版本前必须重新验证
// Electron 启动、隔离 profile、9421/9422 与 Automator 协议，不能静默放宽。
export const DEVTOOLS_UPGRADE_TARGET_VERSION = '2.02.2608070'

export const OFFICIAL_ELECTRON_RUNTIME = Object.freeze({
  kind: 'official_electron',
  // The marketing/build version is 2.02.2608070 while the Electron bundle's
  // Info.plist reports its internal Chromium bundle version (36.6.0).  Keep
  // both values available instead of comparing the wrong one at runtime.
  release: '2.02.2608070',
  electron: SYSTEM_ELECTRON,
  app_asar: SYSTEM_APP_ASAR,
  app_asar_unpacked: SYSTEM_APP_ASAR_UNPACKED,
  product_hash: SYSTEM_PRODUCT_HASH
})

export function isOfficialElectronBundle({
  electron = SYSTEM_ELECTRON,
  appAsar = SYSTEM_APP_ASAR,
  cli = SYSTEM_CLI
} = {}) {
  return Boolean(
    fs.existsSync(electron) &&
    fs.existsSync(appAsar) &&
    fs.existsSync(cli) &&
    fs.existsSync(SYSTEM_INFO_PLIST)
  )
}

// Allow-list only: an unknown DevTools build must not silently reuse binary
// patch offsets or shared-auth assumptions from an older release.
export const DEVTOOLS_COMPATIBILITY_MATRIX = Object.freeze({
  '1.06.2504060': Object.freeze({
    bundle_version: '4240.111',
    nw_sha256: SYSTEM_NW_BINARY_SHA256,
    package_core_sha256: SYSTEM_PACKAGE_CORE_SHA256,
    launcher_sha256: SYSTEM_LAUNCHER_SHA256
  })
})

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function readOfficialReleaseVersion(appAsar) {
  const packagePath = path.join(path.dirname(appAsar), 'app.asar.unpacked', 'package.json')
  try {
    const value = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    return typeof value?.version === 'string' && value.version ? value.version : null
  } catch {
    return null
  }
}

function sha256Directory(directory, excludedNames = new Set()) {
  const entries = []
  const visit = current => {
    for (const name of fs.readdirSync(current).sort()) {
      if (current === directory && excludedNames.has(name)) {
        continue
      }
      const absolute = path.join(current, name)
      const relative = path.relative(directory, absolute).replaceAll(path.sep, '/')
      const stat = fs.lstatSync(absolute)
      if (stat.isSymbolicLink()) {
        entries.push(`${relative}\0link\0${fs.readlinkSync(absolute)}`)
      } else if (stat.isDirectory()) {
        visit(absolute)
      } else if (stat.isFile()) {
        entries.push(
          `${relative}\0file\0${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`
        )
      }
    }
  }
  visit(directory)
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex')
}

function plistValue(infoPlist, key) {
  const result = spawnSync('/usr/bin/plutil', ['-extract', key, 'raw', infoPlist], {
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    return null
  }
  const value = String(result.stdout || '').trim()
  return value || null
}

export function readInstalledDevToolsVersion({ infoPlist = SYSTEM_INFO_PLIST } = {}) {
  return {
    short_version: plistValue(infoPlist, 'CFBundleShortVersionString'),
    bundle_version: plistValue(infoPlist, 'CFBundleVersion'),
    info_plist: infoPlist
  }
}

export function inspectInstalledDevToolsCompatibility({
  app = SYSTEM_DEVTOOLS_APP,
  launcher = SYSTEM_LAUNCHER,
  nwBinary = SYSTEM_NW_BINARY,
  packageDir = SYSTEM_PACKAGE,
  electron = null,
  appAsar = null,
  cli = null,
  infoPlist = SYSTEM_INFO_PLIST
} = {}) {
  const version = readInstalledDevToolsVersion({ infoPlist })
  const resolvedElectron = electron || path.join(app, 'Contents', 'MacOS', 'Electron')
  const resolvedAppAsar = appAsar || path.join(app, 'Contents', 'Resources', 'app.asar')
  const resolvedCli = cli || path.join(app, 'Contents', 'MacOS', 'cli')
  const officialElectron =
    fs.existsSync(resolvedElectron) && fs.existsSync(resolvedAppAsar) && fs.existsSync(resolvedCli)
  if (officialElectron) {
    const releaseVersion = readOfficialReleaseVersion(resolvedAppAsar)
    const observed = {
      app,
      runtime_kind: 'official_electron',
      electron: resolvedElectron,
      app_asar: resolvedAppAsar,
      app_asar_sha256: sha256File(resolvedAppAsar),
      product_hash: md5String(resolvedAppAsar),
      release_version: releaseVersion,
      version: version.short_version,
      bundle_version: version.bundle_version,
      cli: resolvedCli,
      legacy_package_dir: fs.existsSync(packageDir) ? packageDir : null
    }
    const compatible = releaseVersion === DEVTOOLS_UPGRADE_TARGET_VERSION
    return {
      status: compatible ? 'compatible' : 'revalidation_required',
      code: compatible ? 'devtools_version_compatible' : 'devtools_version_revalidation_required',
      target_version: DEVTOOLS_UPGRADE_TARGET_VERSION,
      observed,
      expected: {
        runtime_kind: 'official_electron',
        release: DEVTOOLS_UPGRADE_TARGET_VERSION,
        app_asar: resolvedAppAsar,
        product_hash: observed.product_hash
      },
      known_versions: [...Object.keys(DEVTOOLS_COMPATIBILITY_MATRIX), DEVTOOLS_UPGRADE_TARGET_VERSION]
    }
  }
  const observed = {
    app,
    launcher,
    nw_binary: nwBinary,
    package_dir: packageDir,
    version: version.short_version,
    bundle_version: version.bundle_version,
    launcher_sha256: fs.existsSync(launcher) ? sha256File(launcher) : null,
    nw_sha256: fs.existsSync(nwBinary) ? sha256File(nwBinary) : null,
    package_core_sha256: fs.existsSync(path.join(packageDir, 'core.wxvpkg'))
      ? sha256File(path.join(packageDir, 'core.wxvpkg'))
      : null
  }
  const expected = DEVTOOLS_COMPATIBILITY_MATRIX[observed.version] || null
  const compatible = Boolean(
    expected &&
    expected.bundle_version === observed.bundle_version &&
    expected.launcher_sha256 === observed.launcher_sha256 &&
    expected.nw_sha256 === observed.nw_sha256 &&
    expected.package_core_sha256 === observed.package_core_sha256
  )
  return {
    status: compatible ? 'compatible' : 'revalidation_required',
    code: compatible ? 'devtools_version_compatible' : 'devtools_version_revalidation_required',
    target_version: DEVTOOLS_UPGRADE_TARGET_VERSION,
    observed,
    expected,
    known_versions: Object.keys(DEVTOOLS_COMPATIBILITY_MATRIX)
  }
}

function validateExtensionSnapshot(directory) {
  const manifestPath = path.join(directory, 'manifest.json')
  const inspectorPath = path.join(directory, 'inspector')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (
    manifest?.manifest_version !== 2 ||
    typeof manifest.devtools_page !== 'string' ||
    !manifest.devtools_page ||
    !fs.existsSync(path.join(directory, manifest.devtools_page)) ||
    !fs.statSync(inspectorPath, { throwIfNoEntry: false })?.isDirectory()
  ) {
    const error = new Error(`qa_extension_manifest_invalid: ${manifestPath}`)
    error.code = 'qa_extension_manifest_invalid'
    throw error
  }
  return {
    path: directory,
    manifest: manifestPath,
    devtools_page: manifest.devtools_page,
    inspector: inspectorPath
  }
}

export function ensureQaHomePluginManifest({
  targetRoot = QA_HOME_PLUGIN_ROOT,
  sourceManifest = path.join(SYSTEM_PACKAGE, 'js', 'ideplugin', 'manifest.json')
} = {}) {
  if (path.resolve(targetRoot) !== path.resolve(QA_HOME_PLUGIN_ROOT)) {
    const error = new Error(`qa_home_plugin_target_forbidden: ${targetRoot}`)
    error.code = 'qa_home_plugin_target_forbidden'
    throw error
  }
  if (
    path.resolve(sourceManifest) !==
    path.resolve(path.join(SYSTEM_PACKAGE, 'js', 'ideplugin', 'manifest.json'))
  ) {
    const error = new Error(`qa_home_plugin_source_forbidden: ${sourceManifest}`)
    error.code = 'qa_home_plugin_source_forbidden'
    throw error
  }
  if (!fs.existsSync(sourceManifest)) {
    const error = new Error(`qa_home_plugin_manifest_source_missing: ${sourceManifest}`)
    error.code = 'qa_home_plugin_manifest_source_missing'
    throw error
  }
  const source = fs.readFileSync(sourceManifest, 'utf8')
  const sourceHash = crypto.createHash('sha256').update(source).digest('hex')
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    const error = new Error(`qa_home_plugin_manifest_source_invalid: ${sourceManifest}`)
    error.code = 'qa_home_plugin_manifest_source_invalid'
    throw error
  }
  if (parsed?.manifest_version !== 2 || typeof parsed.devtools_page !== 'string') {
    const error = new Error(`qa_home_plugin_manifest_source_invalid: ${sourceManifest}`)
    error.code = 'qa_home_plugin_manifest_source_invalid'
    throw error
  }

  ensureDirectory(targetRoot)
  const existing = fs.existsSync(QA_HOME_PLUGIN_MANIFEST)
    ? fs.readFileSync(QA_HOME_PLUGIN_MANIFEST, 'utf8')
    : null
  if (existing !== null && existing !== source) {
    const error = new Error(`qa_home_plugin_manifest_untrusted: ${QA_HOME_PLUGIN_MANIFEST}`)
    error.code = 'qa_home_plugin_manifest_untrusted'
    throw error
  }
  if (existing === null) {
    const temporary = `${QA_HOME_PLUGIN_MANIFEST}.${process.pid}.${Date.now()}.tmp`
    try {
      fs.writeFileSync(temporary, source, { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(temporary, QA_HOME_PLUGIN_MANIFEST)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
  }
  let marker = null
  try {
    marker = JSON.parse(fs.readFileSync(QA_HOME_PLUGIN_MANIFEST_MARKER, 'utf8'))
  } catch {
    // The manifest itself is the compatibility fact; a missing marker is repaired below.
  }
  if (
    marker?.schema_version !== 1 ||
    marker.source_manifest !== sourceManifest ||
    marker.source_sha256 !== sourceHash
  ) {
    const temporary = `${QA_HOME_PLUGIN_MANIFEST_MARKER}.${process.pid}.${Date.now()}.tmp`
    try {
      fs.writeFileSync(
        temporary,
        `${JSON.stringify(
          {
            schema_version: 1,
            source_manifest: sourceManifest,
            source_sha256: sourceHash,
            prepared_at: new Date().toISOString()
          },
          null,
          2
        )}\n`,
        { encoding: 'utf8', mode: 0o600 }
      )
      fs.renameSync(temporary, QA_HOME_PLUGIN_MANIFEST_MARKER)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
  }
  return {
    root: targetRoot,
    manifest: QA_HOME_PLUGIN_MANIFEST,
    marker: QA_HOME_PLUGIN_MANIFEST_MARKER,
    source_manifest: sourceManifest,
    source_sha256: sourceHash
  }
}

export function ensureQaExtensionSnapshot({
  sourceExtension = path.join(SYSTEM_PACKAGE, 'js', 'ideplugin'),
  targetExtension = QA_EXTENSION_SNAPSHOT_DIR
} = {}) {
  if (path.resolve(sourceExtension) !== path.resolve(SYSTEM_PACKAGE, 'js', 'ideplugin')) {
    const error = new Error(`qa_extension_source_forbidden: ${sourceExtension}`)
    error.code = 'qa_extension_source_forbidden'
    throw error
  }
  if (path.resolve(targetExtension) !== path.resolve(QA_EXTENSION_SNAPSHOT_DIR)) {
    const error = new Error(`qa_extension_target_forbidden: ${targetExtension}`)
    error.code = 'qa_extension_target_forbidden'
    throw error
  }
  if (!fs.existsSync(sourceExtension)) {
    const error = new Error(`qa_extension_source_missing: ${sourceExtension}`)
    error.code = 'qa_extension_source_missing'
    throw error
  }
  const sourceHash = sha256Directory(sourceExtension)
  try {
    const marker = JSON.parse(
      fs.readFileSync(path.join(targetExtension, '.qa-extension.json'), 'utf8')
    )
    if (
      marker?.schema_version === 1 &&
      marker.source_extension === sourceExtension &&
      marker.source_sha256 === sourceHash &&
      sha256Directory(targetExtension, new Set(['.qa-extension.json'])) === sourceHash
    ) {
      return validateExtensionSnapshot(targetExtension)
    }
  } catch (error) {
    if (error?.code === 'qa_extension_manifest_invalid') {
      throw error
    }
  }

  const existing = fs.lstatSync(targetExtension, { throwIfNoEntry: false })
  if (existing) {
    if (!existing.isDirectory()) {
      const error = new Error(`qa_extension_snapshot_untrusted: ${targetExtension}`)
      error.code = 'qa_extension_snapshot_untrusted'
      throw error
    }
    let marker = null
    try {
      marker = JSON.parse(fs.readFileSync(path.join(targetExtension, '.qa-extension.json'), 'utf8'))
    } catch {
      // An unmarked directory is never overwritten because it may not be QA-owned.
    }
    if (marker?.schema_version !== 1 || marker?.source_extension !== sourceExtension) {
      const error = new Error(`qa_extension_snapshot_untrusted: ${targetExtension}`)
      error.code = 'qa_extension_snapshot_untrusted'
      throw error
    }
    fs.rmSync(targetExtension, { recursive: true, force: true })
  }

  const parent = path.dirname(targetExtension)
  const temporary = path.join(parent, `.extension.${process.pid}.${Date.now()}`)
  ensureDirectory(parent)
  try {
    fs.cpSync(sourceExtension, temporary, { recursive: true, dereference: false })
    validateExtensionSnapshot(temporary)
    fs.writeFileSync(
      path.join(temporary, '.qa-extension.json'),
      `${JSON.stringify(
        {
          schema_version: 1,
          source_extension: sourceExtension,
          source_sha256: sourceHash,
          prepared_at: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
    fs.renameSync(temporary, targetExtension)
    return validateExtensionSnapshot(targetExtension)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

export function ensureQaProfileExtension({
  profile,
  extension = ensureQaExtensionSnapshot()
} = {}) {
  const resolvedProfile = path.resolve(String(profile || ''))
  const qaHome = path.resolve(
    path.join(
      process.env.HOME || process.env.USERPROFILE || '/tmp',
      '.planting',
      'qa-devtools-home'
    )
  )
  const qaProductRoot = path.join(qaHome, 'Library', 'Application Support', '微信开发者工具')
  const expectedProfileRoot = `${qaProductRoot}${path.sep}`
  if (!resolvedProfile.startsWith(expectedProfileRoot)) {
    const error = new Error(`qa_profile_extension_target_forbidden: ${resolvedProfile}`)
    error.code = 'qa_profile_extension_target_forbidden'
    throw error
  }
  const targetExtension = path.join(resolvedProfile, 'WeappPlugin')
  const markerPath = path.join(targetExtension, '.qa-profile-extension.json')
  const sourceHash = sha256Directory(extension.path, new Set(['.qa-extension.json']))
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    if (
      marker?.schema_version === 1 &&
      marker.source_extension === extension.path &&
      marker.source_sha256 === sourceHash &&
      sha256Directory(
        targetExtension,
        new Set(['.qa-extension.json', '.qa-profile-extension.json'])
      ) === sourceHash
    ) {
      return validateExtensionSnapshot(targetExtension)
    }
    if (
      marker?.schema_version === 2 &&
      marker.mode === 'preserved_native_profile' &&
      marker.existing_sha256 ===
        sha256Directory(targetExtension, new Set(['.qa-profile-extension.json']))
    ) {
      return { ...validateExtensionSnapshot(targetExtension), preserved_native_profile: true }
    }
  } catch {
    // A missing marker is handled below; an untrusted existing directory is never overwritten.
  }
  const existing = fs.lstatSync(targetExtension, { throwIfNoEntry: false })
  if (existing) {
    if (!existing.isDirectory()) {
      const error = new Error(`qa_profile_extension_untrusted: ${targetExtension}`)
      error.code = 'qa_profile_extension_untrusted'
      throw error
    }
    const validated = validateExtensionSnapshot(targetExtension)
    const existingHash = sha256Directory(
      targetExtension,
      new Set(['.qa-extension.json', '.qa-profile-extension.json'])
    )
    fs.writeFileSync(
      markerPath,
      `${JSON.stringify(
        {
          schema_version: 2,
          mode: 'preserved_native_profile',
          existing_sha256: existingHash,
          preserved_at: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
    return { ...validated, preserved_native_profile: true }
  }
  const parent = path.dirname(targetExtension)
  const temporary = path.join(parent, `.qa-profile-extension.${process.pid}.${Date.now()}`)
  ensureDirectory(parent)
  try {
    fs.cpSync(extension.path, temporary, { recursive: true, dereference: false })
    validateExtensionSnapshot(temporary)
    fs.writeFileSync(
      path.join(temporary, '.qa-profile-extension.json'),
      `${JSON.stringify(
        {
          schema_version: 1,
          source_extension: extension.path,
          source_sha256: sourceHash,
          prepared_at: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
    fs.renameSync(temporary, targetExtension)
    return validateExtensionSnapshot(targetExtension)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true })
}

function quarantineUntrustedSharedAuthPackage(targetPackage, reason) {
  const expectedTarget = path.resolve(QA_SHARED_AUTH_PACKAGE_DIR)
  const resolvedTarget = path.resolve(targetPackage)
  if (resolvedTarget !== expectedTarget) {
    const error = new Error(`qa_shared_auth_package_target_forbidden: ${targetPackage}`)
    error.code = 'qa_shared_auth_package_target_forbidden'
    throw error
  }
  const existing = fs.lstatSync(targetPackage, { throwIfNoEntry: false })
  if (!existing) {
    return null
  }
  const quarantinePath = path.join(
    path.dirname(targetPackage),
    `.package.nw-quarantine-${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  )
  // The target is QA-owned generated state. Rename it atomically instead of
  // deleting or executing it; this preserves forensic evidence and makes a
  // stale/corrupt package recoverable on the next startup.
  fs.renameSync(targetPackage, quarantinePath)
  return { path: quarantinePath, reason }
}

export function assertInstalledDevToolsBundle({
  app = SYSTEM_DEVTOOLS_APP,
  nwBinary = SYSTEM_NW_BINARY,
  packageDir = SYSTEM_PACKAGE
} = {}) {
  const electron = path.join(app, 'Contents', 'MacOS', 'Electron')
  const appAsar = path.join(app, 'Contents', 'Resources', 'app.asar')
  const appAsarUnpacked = path.join(app, 'Contents', 'Resources', 'app.asar.unpacked')
  const cli = path.join(app, 'Contents', 'MacOS', 'cli')
  if (
    fs.existsSync(electron) &&
    fs.existsSync(appAsar) &&
    fs.existsSync(appAsarUnpacked) &&
    fs.existsSync(cli) &&
    fs.existsSync(infoPlistForApp(app))
  ) {
    const compatibility = inspectInstalledDevToolsCompatibility({
      app,
      launcher: SYSTEM_LAUNCHER,
      nwBinary,
      packageDir,
      electron,
      appAsar,
      cli,
      infoPlist: infoPlistForApp(app)
    })
    if (compatibility.status !== 'compatible') {
      const error = new Error(
        `DevTools version requires compatibility revalidation: ${
          compatibility.observed.version || 'unknown'
        }`
      )
      error.code = 'devtools_version_revalidation_required'
      error.details = compatibility
      throw error
    }
    return {
      app,
      runtime_kind: 'official_electron',
      electron,
      app_asar: appAsar,
      app_asar_unpacked: appAsarUnpacked,
      cli,
      app_asar_sha256: sha256File(appAsar),
      product_hash: md5String(appAsar),
      version: compatibility.observed.version,
      bundle_version: compatibility.observed.bundle_version,
      release_version: compatibility.observed.release_version,
      source: 'installed_system_bundle'
    }
  }
  const core = path.join(packageDir, 'core.wxvpkg')
  for (const target of [app, nwBinary, packageDir, core]) {
    if (!fs.existsSync(target)) {
      const error = new Error(`installed DevTools bundle is missing: ${target}`)
      error.code = 'qa_installed_devtools_bundle_missing'
      throw error
    }
  }
  if (nwBinary === SYSTEM_NW_BINARY && packageDir === SYSTEM_PACKAGE) {
    const compatibility = inspectInstalledDevToolsCompatibility({
      app,
      launcher: SYSTEM_LAUNCHER,
      nwBinary,
      packageDir,
      infoPlist: SYSTEM_INFO_PLIST
    })
    if (compatibility.status !== 'compatible') {
      const error = new Error(
        `DevTools version requires compatibility revalidation: ${
          compatibility.observed.version || 'unknown'
        }`
      )
      error.code = 'devtools_version_revalidation_required'
      error.details = compatibility
      throw error
    }
  }
  const nwHash = sha256File(nwBinary)
  if (nwBinary === SYSTEM_NW_BINARY && nwHash !== SYSTEM_NW_BINARY_SHA256) {
    const error = new Error(`unsupported installed DevTools NW build: ${nwHash}`)
    error.code = 'qa_installed_devtools_bundle_unsupported'
    throw error
  }
  const coreHash = sha256File(core)
  if (packageDir === SYSTEM_PACKAGE && coreHash !== SYSTEM_PACKAGE_CORE_SHA256) {
    const error = new Error(`unsupported installed DevTools package core: ${coreHash}`)
    error.code = 'qa_installed_devtools_bundle_unsupported'
    throw error
  }
  return {
    app,
    nw_binary: nwBinary,
    package_dir: packageDir,
    nw_sha256: nwHash,
    package_core_sha256: coreHash,
    source: 'installed_system_bundle'
  }
}

export function ensureQaPatchedSharedAuthPackage({
  sourcePackage = path.join(SYSTEM_DEVTOOLS_APP, 'Contents', 'Resources', 'package.nw'),
  targetPackage = QA_SHARED_AUTH_PACKAGE_DIR
} = {}) {
  const error = new Error(
    'qa_patched_runtime_retired: formal QA must use the installed native DevTools package'
  )
  error.code = 'qa_patched_runtime_retired'
  error.sourcePackage = sourcePackage
  error.targetPackage = targetPackage
  throw error

  /* c8 ignore start -- retained only as historical migration code */
  const sourceCore = path.join(sourcePackage, 'core.wxvpkg')
  const markerPath = path.join(targetPackage, '.qa-shared-auth-package.json')
  const sourceHash = sha256File(sourceCore)
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    if (
      marker?.schema_version === 1 &&
      marker.source_sha256 === sourceHash &&
      marker.patch_revision === SHARED_AUTH_PATCH_REVISION &&
      fs.existsSync(path.join(targetPackage, 'core.wxvpkg'))
    ) {
      return targetPackage
    }
  } catch {
    // The package is prepared below when there is no trusted marker.
  }

  if (fs.lstatSync(targetPackage, { throwIfNoEntry: false })) {
    let existingMarker = null
    try {
      existingMarker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    } catch {
      quarantineUntrustedSharedAuthPackage(targetPackage, 'marker_missing_or_unreadable')
    }
    const trustedPriorRevision =
      existingMarker?.schema_version === 1 &&
      existingMarker?.source_package === sourcePackage &&
      existingMarker?.source_sha256 === sourceHash &&
      [
        'legacy-login-shared-auth-v9-single-writer-v3',
        'legacy-login-shared-auth-v10-broker-v3',
        'legacy-login-shared-auth-v11-force-refresh-broker-v3',
        'legacy-login-shared-auth-v12-capability-retry-observer-v3',
        'legacy-login-shared-auth-v20-consumption-retry',
        'legacy-login-shared-auth-v21-consumption-retry-delayed',
        SHARED_AUTH_PATCH_REVISION
      ].includes(existingMarker?.patch_revision)
    if (!trustedPriorRevision) {
      quarantineUntrustedSharedAuthPackage(targetPackage, 'marker_provenance_invalid')
    }
    // A trusted prior revision is QA-owned generated state. It can be
    // replaced only after its provenance is known, and the replacement is
    // still performed through the atomic staging directory below.
    if (fs.lstatSync(targetPackage, { throwIfNoEntry: false })) {
      fs.rmSync(targetPackage, { recursive: true, force: true })
    }
  }

  const parent = path.dirname(targetPackage)
  const temporary = path.join(parent, `.package.nw-v8.${process.pid}.${Date.now()}`)
  ensureDirectory(parent)
  try {
    fs.cpSync(sourcePackage, temporary, { recursive: true, dereference: false })
    const patchedCore = `${path.join(temporary, 'core.wxvpkg')}.tmp`
    const result = patchPackage(sourceCore, patchedCore)
    fs.renameSync(patchedCore, path.join(temporary, 'core.wxvpkg'))
    fs.writeFileSync(
      path.join(temporary, '.qa-shared-auth-package.json'),
      `${JSON.stringify(
        {
          schema_version: 1,
          source_package: sourcePackage,
          source_sha256: sourceHash,
          patched_sha256: result.sha256,
          patch_revision: SHARED_AUTH_PATCH_REVISION,
          prepared_at: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
    fs.renameSync(temporary, targetPackage)
    return targetPackage
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}
/* c8 ignore stop */

/**
 * The persistent profile's WeappCode package is part of DevTools' native
 * bootstrap. It must remain byte-compatible with the installed build. The
 * shared-auth patch belongs only to the explicit QA runtime package; copying
 * it into the profile package can leave renderer processes alive while the
 * IDE control plane never starts.
 *
 * Repair is deliberately limited to the QA-owned core.wxvpkg and its QA
 * provenance marker. Login, storage, project list, simulator data, and
 * WeappLocalData are never touched.
 */
export function ensureQaProfileNativePackage({ profile } = {}) {
  const expectedProfile = path.join(
    QA_PROFILE_ROOT,
    'Library',
    'Application Support',
    '微信开发者工具',
    QA_PRODUCT_HASH
  )
  const resolvedProfile = path.resolve(String(profile || ''))
  if (resolvedProfile !== path.resolve(expectedProfile)) {
    const error = new Error(`qa_profile_native_package_target_forbidden: ${profile}`)
    error.code = 'qa_profile_native_package_target_forbidden'
    throw error
  }
  const targetPackage = path.join(resolvedProfile, 'WeappCode', 'package.nw')
  const sourceCore = path.join(SYSTEM_PACKAGE, 'core.wxvpkg')
  const targetCore = path.join(targetPackage, 'core.wxvpkg')
  const targetMarkerPath = path.join(targetPackage, '.qa-shared-auth-package.json')
  if (!fs.existsSync(sourceCore)) {
    const error = new Error('qa_profile_native_package_source_incomplete')
    error.code = 'qa_profile_native_package_source_incomplete'
    throw error
  }
  if (!fs.existsSync(targetCore) || !fs.existsSync(targetPackage)) {
    const error = new Error('qa_profile_native_package_target_incomplete')
    error.code = 'qa_profile_native_package_target_incomplete'
    throw error
  }
  const sourceHash = sha256File(sourceCore)
  const targetHash = sha256File(targetCore)
  if (targetHash === sourceHash) {
    if (fs.existsSync(targetMarkerPath)) {
      fs.rmSync(targetMarkerPath, { force: true })
    }
    return {
      status: 'ready',
      code: 'qa_profile_native_package_unchanged',
      targetPackage,
      sourceHash,
      repaired: false
    }
  }
  let targetMarker
  try {
    targetMarker = JSON.parse(fs.readFileSync(targetMarkerPath, 'utf8'))
  } catch {
    targetMarker = null
  }
  if (
    targetMarker?.schema_version !== 1 ||
    targetMarker?.source_package !== path.resolve(QA_SHARED_AUTH_PACKAGE_DIR) ||
    targetMarker?.patched_sha256 !== targetHash ||
    !String(targetMarker?.patch_revision || '').startsWith('legacy-login-shared-auth-')
  ) {
    const error = new Error('qa_profile_native_package_untrusted')
    error.code = 'qa_profile_native_package_untrusted'
    error.target_hash = targetHash
    throw error
  }
  const temporaryCore = `${targetCore}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.copyFileSync(sourceCore, temporaryCore, fs.constants.COPYFILE_FICLONE)
    fs.renameSync(temporaryCore, targetCore)
  } finally {
    fs.rmSync(temporaryCore, { force: true })
  }
  if (sha256File(targetCore) !== sourceHash) {
    const error = new Error('qa_profile_native_package_repair_verification_failed')
    error.code = 'qa_profile_native_package_repair_verification_failed'
    throw error
  }
  fs.rmSync(targetMarkerPath, { force: true })
  return {
    status: 'ready',
    code: 'qa_profile_native_package_repaired',
    targetPackage,
    sourceHash,
    repaired: true,
    preserved: ['Default', 'WeappLocalData', 'WeappApplication', 'WeappCache', 'WeappSimulator']
  }
}

// Kept as a compatibility name for older QA entrypoints. It now repairs the
// profile back to the native package and never copies shared-auth code into it.
export function ensureQaProfileSharedAuthPackage({ profile } = {}) {
  return ensureQaProfileNativePackage({ profile })
}

function rewriteSystemAbsoluteSymlinks(root) {
  const queue = [root]
  while (queue.length) {
    const current = queue.pop()
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(current)
      if (linkTarget.startsWith(`${SYSTEM_DEVTOOLS_APP}/`)) {
        const qaTarget = path.join(
          QA_LAUNCHER_APP,
          linkTarget.slice(SYSTEM_DEVTOOLS_APP.length + 1)
        )
        const relativeTarget = path.relative(path.dirname(current), qaTarget)
        fs.unlinkSync(current)
        fs.symlinkSync(relativeTarget, current)
      }
      continue
    }
    if (!stat.isDirectory()) {
      continue
    }
    for (const name of fs.readdirSync(current)) {
      queue.push(path.join(current, name))
    }
  }
}

function patchArm64Instruction(buffer, fileOffset, expected, replacement, label) {
  const actual = buffer.readUInt32LE(fileOffset)
  if (actual !== expected && actual !== replacement) {
    throw new Error(
      `${label} instruction mismatch at 0x${fileOffset.toString(16)}: ` +
        `expected 0x${expected.toString(16)}, got 0x${actual.toString(16)}`
    )
  }
  if (actual === expected) {
    buffer.writeUInt32LE(replacement, fileOffset)
  }
  return actual === expected
}

function patchLauncherBinary(sourcePath, targetPath) {
  const sourceHash = sha256File(sourcePath)
  const expectedHash = sourcePath === SYSTEM_LAUNCHER ? SYSTEM_LAUNCHER_SHA256 : null
  if (expectedHash && sourceHash !== expectedHash) {
    throw new Error(`unsupported DevTools launcher build: ${sourceHash}`)
  }
  const buffer = Buffer.from(fs.readFileSync(sourcePath))
  const changed = [
    // main.main: do not run the installed package's consistency table against
    // a QA copy whose core.wxvpkg is intentionally patched.
    patchArm64Instruction(buffer, 0x14c2f0, 0x97ffefa8, 0x52800020, 'consistency call'),
    // main.main: keep the success path after the synthetic true result.
    patchArm64Instruction(buffer, 0x14c2f4, 0x370000e0, 0x14000007, 'CheckConsistency gate'),
    // main.GetPackagePath: the second branch is the installed-package
    // signature result. The QA bundle is a deliberate, marker-validated copy
    // whose core.wxvpkg contains the shared-auth bridge, so continue through
    // the normal success return after the signature check. The first branch
    // above handles a valid user-data hot-patch package and must remain intact.
    patchArm64Instruction(buffer, 0x14dedc, 0x36000400, 0x14000033, 'package signature gate')
  ]
  fs.writeFileSync(targetPath, buffer, { mode: 0o755 })
  fs.chmodSync(targetPath, 0o755)
  return { source_hash: sourceHash, patched_hash: sha256File(targetPath), changed }
}

export function ensureQaPatchedDevToolsLauncher({ packageDir } = {}) {
  const error = new Error(
    'qa_patched_runtime_retired: formal QA must use the installed native DevTools executable/package'
  )
  error.code = 'qa_patched_runtime_retired'
  error.packageDir = packageDir || null
  throw error

  /* c8 ignore start -- retained only as historical migration code */
  if (
    !fs.existsSync(SYSTEM_LAUNCHER) ||
    !fs.existsSync(SYSTEM_NW_BINARY) ||
    !fs.existsSync(SYSTEM_INFO_PLIST)
  ) {
    throw new Error('installed DevTools launcher is missing')
  }
  if (!packageDir) {
    throw new Error('patched package directory is required')
  }

  const contents = path.join(QA_LAUNCHER_APP, 'Contents')
  const macos = path.join(contents, 'MacOS')
  const resources = path.join(contents, 'Resources')
  const infoPlist = path.join(contents, 'Info.plist')
  const markerPath = QA_LAUNCHER_MARKER
  const sourceLauncherHash = sha256File(SYSTEM_LAUNCHER)
  const sourceNwHash = sha256File(SYSTEM_NW_BINARY)
  if (sourceNwHash !== SYSTEM_NW_BINARY_SHA256) {
    throw new Error(`unsupported DevTools NW build: ${sourceNwHash}`)
  }
  const sourceInfoHash = sha256File(SYSTEM_INFO_PLIST)
  const sourceCliHash = sha256File(path.join(SYSTEM_DEVTOOLS_APP, 'Contents', 'MacOS', 'cli.js'))
  const sourceRuntimeCliHash = sha256File(
    path.join(
      SYSTEM_DEVTOOLS_APP,
      'Contents',
      'Resources',
      'package.nw',
      'js',
      'common',
      'cli',
      'index.js'
    )
  )
  const packageCoreHash = sha256File(path.join(packageDir, 'core.wxvpkg'))
  let marker = null
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch {
    // A missing marker means the QA bundle must be rebuilt and revalidated.
  }
  if (
    marker?.patch_revision === PATCH_REVISION &&
    marker?.source_launcher_sha256 === sourceLauncherHash &&
    marker?.source_nw_sha256 === sourceNwHash &&
    marker?.source_info_plist_sha256 === sourceInfoHash &&
    marker?.source_cli_sha256 === sourceCliHash &&
    marker?.source_runtime_cli_sha256 === sourceRuntimeCliHash &&
    marker?.cli_patch_revision === QA_CLI_PATCH_REVISION &&
    marker?.qa_product_hash === QA_PRODUCT_HASH &&
    marker?.bundle_identifier === QA_BUNDLE_IDENTIFIER &&
    marker?.package_core_sha256 === packageCoreHash &&
    marker?.package_dir === packageDir &&
    fs.existsSync(QA_LAUNCHER) &&
    fs.existsSync(QA_NW_BINARY) &&
    fs.existsSync(path.join(QA_LAUNCHER_PACKAGE, 'core.wxvpkg'))
  ) {
    return QA_LAUNCHER
  }

  const existingApp = fs.lstatSync(QA_LAUNCHER_APP, { throwIfNoEntry: false })
  if (existingApp && !existingApp.isDirectory()) {
    throw new Error(`refusing to replace unexpected QA launcher app: ${QA_LAUNCHER_APP}`)
  }
  if (existingApp) {
    if (
      !String(marker?.patch_revision || '').startsWith('launcher-package-validation-qa-v') ||
      marker?.source_app !== SYSTEM_DEVTOOLS_APP
    ) {
      throw new Error(`refusing to replace unverified QA launcher app: ${QA_LAUNCHER_APP}`)
    }
    fs.rmSync(QA_LAUNCHER_APP, { recursive: true, force: true })
  }
  // Copy the installed bundle as a complete bundle. Framework symlinks are
  // retained, but absolute links into /Applications are made relative to the
  // QA bundle so the QA app never executes through the system bundle.
  fs.cpSync(SYSTEM_DEVTOOLS_APP, QA_LAUNCHER_APP, { recursive: true, dereference: false })
  rewriteSystemAbsoluteSymlinks(QA_LAUNCHER_APP)
  ensureDirectory(macos)
  ensureDirectory(resources)

  patchLauncherBinary(SYSTEM_LAUNCHER, QA_LAUNCHER)
  if (!fs.lstatSync(QA_NW_BINARY).isFile()) {
    throw new Error(`QA NW launcher binary is not a file: ${QA_NW_BINARY}`)
  }
  fs.chmodSync(QA_NW_BINARY, 0o755)
  fs.copyFileSync(
    path.join(packageDir, 'core.wxvpkg'),
    path.join(QA_LAUNCHER_PACKAGE, 'core.wxvpkg')
  )
  const cliResult = patchQaDevToolsCli({
    sourcePath: path.join(macos, 'cli.js')
  })
  const runtimeCliResult = patchQaDevToolsRuntimeCli({
    sourcePath: path.join(QA_LAUNCHER_PACKAGE, 'js', 'common', 'cli', 'index.js')
  })
  const plistPatch = spawnSync(
    '/usr/bin/plutil',
    ['-replace', 'CFBundleIdentifier', '-string', QA_BUNDLE_IDENTIFIER, infoPlist],
    { encoding: 'utf8' }
  )
  if (plistPatch.status !== 0) {
    throw new Error(
      `failed to isolate QA launcher bundle identity: ${plistPatch.stderr || plistPatch.stdout}`
    )
  }
  const signResult = spawnSync(
    '/usr/bin/codesign',
    ['--force', '--deep', '--sign', '-', '--identifier', QA_BUNDLE_IDENTIFIER, QA_LAUNCHER_APP],
    { encoding: 'utf8' }
  )
  if (signResult.status !== 0) {
    throw new Error(`failed to sign QA launcher bundle: ${signResult.stderr || signResult.stdout}`)
  }
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        schema_version: 1,
        patch_revision: PATCH_REVISION,
        source_app: SYSTEM_DEVTOOLS_APP,
        source_launcher_sha256: sourceLauncherHash,
        source_nw_sha256: sourceNwHash,
        source_info_plist_sha256: sourceInfoHash,
        source_cli_sha256: sourceCliHash,
        source_runtime_cli_sha256: sourceRuntimeCliHash,
        cli_patch_revision: QA_CLI_PATCH_REVISION,
        qa_product_hash: QA_PRODUCT_HASH,
        bundle_identifier: QA_BUNDLE_IDENTIFIER,
        package_core_sha256: packageCoreHash,
        patched_launcher_sha256: sha256File(QA_LAUNCHER),
        patched_cli_sha256: cliResult.patched_hash,
        patched_runtime_cli_sha256: runtimeCliResult.patched_hash,
        package_dir: packageDir,
        prepared_at: new Date().toISOString()
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  )
  return QA_LAUNCHER
}

export function ensureQaFormalDevToolsLauncher({
  sourceApp = QA_LAUNCHER_APP,
  targetApp = QA_FORMAL_LAUNCHER_APP,
  markerPath = QA_FORMAL_LAUNCHER_MARKER
} = {}) {
  if (path.resolve(sourceApp) !== path.resolve(QA_LAUNCHER_APP)) {
    throw new Error(`qa_formal_launcher_source_forbidden: ${sourceApp}`)
  }
  if (path.resolve(targetApp) !== path.resolve(QA_FORMAL_LAUNCHER_APP)) {
    throw new Error(`qa_formal_launcher_target_forbidden: ${targetApp}`)
  }
  if (path.resolve(markerPath) !== path.resolve(QA_FORMAL_LAUNCHER_MARKER)) {
    throw new Error(`qa_formal_launcher_marker_forbidden: ${markerPath}`)
  }
  const sourceFiles = [
    QA_LAUNCHER,
    QA_NW_BINARY,
    QA_LAUNCHER_PACKAGE,
    path.join(QA_LAUNCHER_PACKAGE, 'core.wxvpkg'),
    QA_LAUNCHER_MARKER
  ]
  if (sourceFiles.some(filePath => !fs.existsSync(filePath))) {
    throw new Error('qa_formal_launcher_source_incomplete')
  }
  const sourceMarkerHash = sha256File(QA_LAUNCHER_MARKER)
  const sourceCoreHash = sha256File(path.join(QA_LAUNCHER_PACKAGE, 'core.wxvpkg'))
  let marker = null
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch {
    // The formal bundle is prepared below when its provenance marker is absent.
  }
  if (
    marker?.schema_version === 1 &&
    marker.source_app === sourceApp &&
    marker.source_marker_sha256 === sourceMarkerHash &&
    marker.source_core_sha256 === sourceCoreHash &&
    fs.existsSync(QA_FORMAL_LAUNCHER) &&
    fs.existsSync(QA_FORMAL_NW_BINARY) &&
    fs.existsSync(path.join(QA_FORMAL_LAUNCHER_PACKAGE, 'core.wxvpkg')) &&
    sha256File(path.join(QA_FORMAL_LAUNCHER_PACKAGE, 'core.wxvpkg')) === sourceCoreHash &&
    marker.patched_launcher_sha256 === sha256File(QA_FORMAL_LAUNCHER)
  ) {
    return {
      app: targetApp,
      launcher: QA_FORMAL_LAUNCHER,
      nw_binary: QA_FORMAL_NW_BINARY,
      package_dir: QA_FORMAL_LAUNCHER_PACKAGE,
      marker: markerPath
    }
  }

  const existing = fs.lstatSync(targetApp, { throwIfNoEntry: false })
  if (existing && !existing.isDirectory()) {
    throw new Error(`qa_formal_launcher_target_unexpected: ${targetApp}`)
  }
  if (existing) {
    const quarantine = `${targetApp}.quarantine-${Date.now()}-${process.pid}`
    fs.renameSync(targetApp, quarantine)
  }
  const parent = path.dirname(targetApp)
  const temporary = path.join(parent, `.formal-launcher.${process.pid}.${Date.now()}.app`)
  ensureDirectory(parent)
  try {
    const copyResult = spawnSync('/usr/bin/ditto', [sourceApp, temporary], {
      encoding: 'utf8'
    })
    if (copyResult.status !== 0) {
      throw new Error(`qa_formal_launcher_copy_failed: ${copyResult.stderr || copyResult.stdout}`)
    }
    const infoPlist = path.join(temporary, 'Contents', 'Info.plist')
    const plistPatch = spawnSync(
      '/usr/bin/plutil',
      [
        '-replace',
        'CFBundleIdentifier',
        '-string',
        'com.tencent.webplusdevtools.qa.formal',
        infoPlist
      ],
      { encoding: 'utf8' }
    )
    if (plistPatch.status !== 0) {
      throw new Error(`qa_formal_launcher_plist_failed: ${plistPatch.stderr || plistPatch.stdout}`)
    }
    const signResult = spawnSync(
      '/usr/bin/codesign',
      [
        '--force',
        '--deep',
        '--sign',
        '-',
        '--identifier',
        'com.tencent.webplusdevtools.qa.formal',
        temporary
      ],
      { encoding: 'utf8' }
    )
    if (signResult.status !== 0) {
      throw new Error(
        `qa_formal_launcher_codesign_failed: ${signResult.stderr || signResult.stdout}`
      )
    }
    fs.renameSync(temporary, targetApp)
    const sourceMarker = JSON.parse(fs.readFileSync(QA_LAUNCHER_MARKER, 'utf8'))
    const markerValue = {
      ...sourceMarker,
      schema_version: 1,
      source_app: sourceApp,
      source_marker_sha256: sourceMarkerHash,
      source_core_sha256: sourceCoreHash,
      bundle_identifier: QA_BUNDLE_IDENTIFIER,
      patched_launcher_sha256: sha256File(QA_FORMAL_LAUNCHER),
      prepared_at: new Date().toISOString()
    }
    const markerTemporary = `${markerPath}.${process.pid}.${Date.now()}.tmp`
    try {
      fs.writeFileSync(markerTemporary, `${JSON.stringify(markerValue, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      })
      fs.renameSync(markerTemporary, markerPath)
    } finally {
      fs.rmSync(markerTemporary, { force: true })
    }
    return {
      app: targetApp,
      launcher: QA_FORMAL_LAUNCHER,
      nw_binary: QA_FORMAL_NW_BINARY,
      package_dir: QA_FORMAL_LAUNCHER_PACKAGE,
      marker: markerPath
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

export function assertQaPatchedDevToolsBundle({
  launcher = QA_LAUNCHER,
  nwBinary = QA_NW_BINARY,
  packageDir = QA_LAUNCHER_PACKAGE,
  markerPath = QA_LAUNCHER_MARKER
} = {}) {
  let marker
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch (error) {
    const failure = new Error(`qa patched DevTools marker is missing or unreadable: ${markerPath}`)
    failure.code = 'qa_patched_devtools_marker_invalid'
    failure.cause = error
    throw failure
  }
  const core = path.join(packageDir, 'core.wxvpkg')
  for (const target of [launcher, nwBinary, packageDir, core]) {
    if (!fs.existsSync(target)) {
      const failure = new Error(`qa patched DevTools bundle is missing: ${target}`)
      failure.code = 'qa_patched_devtools_bundle_missing'
      throw failure
    }
  }
  const launcherHash = sha256File(launcher)
  const coreHash = sha256File(core)
  if (
    marker.patch_revision !== PATCH_REVISION ||
    marker.bundle_identifier !== QA_BUNDLE_IDENTIFIER ||
    marker.patched_launcher_sha256 !== launcherHash ||
    marker.package_core_sha256 !== coreHash ||
    marker.package_dir !== path.resolve(QA_SHARED_AUTH_PACKAGE_DIR)
  ) {
    const failure = new Error('qa patched DevTools bundle marker does not match its files')
    failure.code = 'qa_patched_devtools_bundle_untrusted'
    failure.details = {
      marker_patch_revision: marker.patch_revision,
      marker_bundle_identifier: marker.bundle_identifier,
      marker_patched_launcher_sha256: marker.patched_launcher_sha256,
      actual_launcher_sha256: launcherHash,
      marker_package_core_sha256: marker.package_core_sha256,
      actual_package_core_sha256: coreHash,
      marker_package_dir: marker.package_dir
    }
    throw failure
  }
  return {
    launcher,
    nw_binary: nwBinary,
    package_dir: packageDir,
    launcher_sha256: launcherHash,
    package_core_sha256: coreHash,
    source: 'qa_patched_shared_auth_bundle',
    patch_revision: marker.patch_revision,
    bundle_identifier: marker.bundle_identifier
  }
}
/* c8 ignore stop */

if (import.meta.url === `file://${process.argv[1]}`) {
  const packageDir = process.argv[2]
  const launcher = ensureQaPatchedDevToolsLauncher({ packageDir })
  console.log(JSON.stringify({ status: 'ready', launcher, package_dir: packageDir }, null, 2))
}
