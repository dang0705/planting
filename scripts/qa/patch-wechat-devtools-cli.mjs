import crypto from 'node:crypto'
import fs from 'node:fs'

// The native QA bundle derives its default profile from its own
// Contents/MacOS path. Keep the CLI/runtime hash aligned with that native
// value so macOS `open` cannot append a different profile later.
export const QA_PRODUCT_HASH = '7a30d6576abfa238418b33c3c50ac14e'
export const QA_CLI_PATCH_REVISION = 'cli-qa-bundle-product-hash-v3'

const SYSTEM_CLI_SHA256 = '3255cc686abdb38416094c63b7465f209c7e2cb13b2d63f6973e032f6135b273'
const PRODUCT_HASH_NEEDLE = 'e.productHash=r.generateMd5(e.installPath)'
const PACKAGE_SIGNATURE_NEEDLE = 'if(o.checkSignature(i,a.signature.core))return!0'
const RUNTIME_CLI_PRODUCT_HASH_NEEDLE =
  'global.productHash=(0,C.generateMd5)(global.installPath+global.nwVersion)'
const RUNTIME_CLI_SOURCE_SHA256 = '62ef813d6e281fa0d2f24c15ad3df2c619aa6aae23563a0722cc486f45f4cf7f'
const RUNTIME_CLI_DIRECT_PROFILE_MARKER = 'WECHAT_QA_LAUNCHER_PACKAGE_DIR'
const RUNTIME_CLI_DARWIN_START_NEEDLE =
  'if(s){const n=r.join(global.installPath,"../../");e="open",a=[n,"--args","--cli","--remote-port",parseInt(t.toString(),10).toString(),p?"--rdm":"",u?"--disable-gpu":"",global.enableCLI?"--enable-service-port":""]}'

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function patchQaDevToolsCli({ sourcePath, targetPath = sourcePath } = {}) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`DevTools CLI is missing: ${sourcePath || 'unspecified'}`)
  }
  const source = fs.readFileSync(sourcePath, 'utf8')
  const sourceHash = sha256File(sourcePath)
  const alreadyPatched =
    source.includes(`e.productHash="${QA_PRODUCT_HASH}"`) &&
    source.includes('if(o.checkSignature(i,a.signature.core)||t===c.installPkgPath)return!0')
  if (!alreadyPatched && sourceHash !== SYSTEM_CLI_SHA256) {
    throw new Error(`unsupported DevTools CLI build: ${sourceHash}`)
  }
  if (alreadyPatched) {
    return { source_hash: sourceHash, patched_hash: sourceHash, changed: false }
  }
  if (source.split(PRODUCT_HASH_NEEDLE).length !== 2) {
    throw new Error('DevTools CLI product hash boundary is not unique')
  }
  if (source.split(PACKAGE_SIGNATURE_NEEDLE).length !== 2) {
    throw new Error('DevTools CLI package signature boundary is not unique')
  }
  const patched = source
    .replace(PRODUCT_HASH_NEEDLE, `e.productHash="${QA_PRODUCT_HASH}"`)
    .replace(
      PACKAGE_SIGNATURE_NEEDLE,
      'if(o.checkSignature(i,a.signature.core)||t===c.installPkgPath)return!0'
    )
  fs.writeFileSync(targetPath, patched, { mode: 0o644 })
  fs.chmodSync(targetPath, 0o644)
  return {
    source_hash: sourceHash,
    patched_hash: sha256File(targetPath),
    changed: true
  }
}

export function patchQaDevToolsRuntimeCli({ sourcePath, targetPath = sourcePath } = {}) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`DevTools runtime CLI is missing: ${sourcePath || 'unspecified'}`)
  }
  const source = fs.readFileSync(sourcePath, 'utf8')
  const sourceHash = sha256File(sourcePath)
  const alreadyPatched = source.includes(`global.productHash="${QA_PRODUCT_HASH}"`)
  if (!alreadyPatched && sourceHash !== RUNTIME_CLI_SOURCE_SHA256) {
    throw new Error(`unsupported DevTools runtime CLI build: ${sourceHash}`)
  }
  if (alreadyPatched && source.includes(RUNTIME_CLI_DIRECT_PROFILE_MARKER)) {
    return { source_hash: sourceHash, patched_hash: sourceHash, changed: false }
  }
  let patched = source
  let occurrenceCount = 0
  if (!alreadyPatched) {
    occurrenceCount = source.split(RUNTIME_CLI_PRODUCT_HASH_NEEDLE).length - 1
    if (occurrenceCount !== 2) {
      throw new Error(
        `DevTools runtime CLI product hash boundary count mismatch: ${occurrenceCount}`
      )
    }
    patched = patched.replaceAll(
      RUNTIME_CLI_PRODUCT_HASH_NEEDLE,
      `global.productHash="${QA_PRODUCT_HASH}"`
    )
  }
  if (!patched.includes(RUNTIME_CLI_DIRECT_PROFILE_MARKER)) {
    if (patched.split(RUNTIME_CLI_DARWIN_START_NEEDLE).length !== 2) {
      throw new Error('DevTools runtime CLI darwin start boundary is not unique')
    }
    const directStart =
      'if(s){const qaPackage=process.env.WECHAT_QA_LAUNCHER_PACKAGE_DIR||".",qaProfile=process.env.WECHAT_QA_PROFILE_PATH||r.dirname(global.userDirPath),qaExtension=process.env.WECHAT_QA_EXTENSION_PATH,qaFrontend=process.env.WECHAT_QA_CUSTOM_FRONTEND;e="open",a=[r.join(global.installPath,"../../"),"--args",qaPackage,"--cli","--remote-port",parseInt(t.toString(),10).toString(),p?"--rdm":"",u?"--disable-gpu":"",global.enableCLI?"--enable-service-port":"","--user-data-dir="+qaProfile,"--package-dir="+qaPackage,qaExtension?"--load-extension="+qaExtension:"",qaFrontend?"--custom-devtools-frontend="+qaFrontend:""]}'
    patched = patched.replace(RUNTIME_CLI_DARWIN_START_NEEDLE, directStart)
  }
  fs.writeFileSync(targetPath, patched, { mode: 0o644 })
  fs.chmodSync(targetPath, 0o644)
  return {
    source_hash: sourceHash,
    patched_hash: sha256File(targetPath),
    changed: true,
    occurrence_count: occurrenceCount
  }
}
