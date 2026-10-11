import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

/** 本脚本所在目录（`scripts/`）。 */
const currentDir = dirname(fileURLToPath(import.meta.url))
/** 云函数包根目录（`cloudfunctions-v2/`）。 */
const projectDir = resolve(currentDir, '..')
/** esbuild 输出目录。 */
const buildDir = join(projectDir, 'dist')
/** 可部署产物目录（含 bootstrap、锁文件与生产依赖）。 */
const deploymentDir = join(projectDir, 'deployment')
/** 打包后的入口产物路径。 */
const artifactPath = join(buildDir, 'server.cjs')
/** 按业务域拆分的云函数部署包根目录；每个子目录是一个可独立上传的 HTTP 云函数。 */
const functionsDir = join(buildDir, 'functions')

/**
 * 业务域云函数入口清单。函数名按 AGENTS.md §1 使用业务域名；
 * 部署到共享环境时由部署命令追加隔离前缀，不在构建产物中改名。
 */
const functionEntries = [
  { name: 'identity', entry: 'src/entries/identity.ts' },
  { name: 'plant-knowledge', entry: 'src/entries/plant-knowledge.ts' },
  { name: 'user-plant', entry: 'src/entries/user-plant.ts' },
  { name: 'diagnosis', entry: 'src/entries/diagnosis.ts' },
  { name: 'weather', entry: 'src/entries/weather.ts' },
  { name: 'care', entry: 'src/entries/care.ts' },
  // 定时触发只支持普通（事件型）云函数（long-term-care-contract.md §12.7）：care 域计划过期扫描。
  { name: 'care-plan-expiry', entry: 'src/entries/care-plan-expiry.ts', kind: 'event' },
  // 定时事件函数（user-plant-timeline.md §5，每分钟一次）：care 发件箱时间线事件派发。
  { name: 'care-outbox-dispatch', entry: 'src/entries/care-outbox-dispatch.ts', kind: 'event' },
  // 用户 2026-10-10 裁决：合并低频补扫；上面两个旧函数待 care-maintenance-sweep 上线验证后按退役清单下线（docs/backend-v2/architecture/care-maintenance-sweep-migration-2026-10-10.md）。
  { name: 'care-maintenance-sweep', entry: 'src/entries/care-maintenance-sweep.ts', kind: 'event' },
  // 主代理 2026-10-11 裁决：diagnosis 域低频补扫（AI 额度预占到期扫描 + 卡住的视觉诊断回收），cron 与 care-maintenance-sweep 相同。
  { name: 'diagnosis-maintenance-sweep', entry: 'src/entries/diagnosis-maintenance-sweep.ts', kind: 'event' },
  // 一次性事件函数（ClickUp z8v0kmvgab，用户 2026-10-10 授权）：在内网分批回填三轴筛选预计算索引，手动调用、可续跑，用完下线。
  { name: 'visual-filter-index-backfill', entry: 'src/entries/visual-filter-index-backfill.ts', kind: 'event' }
]

/**
 * 函数包形态。HTTP 函数：`dist/server.cjs` + `scf_bootstrap`，Node 22；
 * 事件函数：根目录 `index.js` 导出 `main`（Handler `index.main`），无 bootstrap。
 * CloudBase 事件函数运行时清单最高为 Nodejs20.19（cloudbase 知识库 manageFunctions 运行时说明），故按 node20 产出 CommonJS。
 */
const packageKinds = {
  http: { target: 'node22', runtime: 'Nodejs22.21', entrypoint: 'dist/server.cjs', bootstrap: 'scf_bootstrap', handler: null },
  event: { target: 'node20', runtime: 'Nodejs20.19', entrypoint: 'index.js', bootstrap: null, handler: 'index.main' }
}

/** 生产依赖锁定版本；必须与 package.json 的 dependencies 完全一致。 */
const productionDependencies = { ajv: '8.20.0', mysql2: '3.24.4', pino: '10.3.1', sharp: '0.35.5', suncalc: '2.1.0' }

/**
 * 函数包按 CloudBase 运行平台安装依赖（用户 2026-10-11 裁决）：sharp 的原生二进制必须是 linux-x64 glibc 版本，
 * 不能把构建机（例如 macOS arm64）的二进制打进包。npm 按这三个参数挑选 lockfile 中对应平台的可选依赖。
 */
const targetPlatformArgs = ['--os=linux', '--cpu=x64', '--libc=glibc']

/** 需要 sharp 的函数（视觉诊断服务端压缩图片）；其他函数包移除 sharp 以免平白增加约 20MB。 */
const sharpConsumers = new Set(['diagnosis', 'probe'])
/** sharp 及其平台二进制所在路径（只在非消费方函数包中移除）。 */
const sharpPackagePaths = ['node_modules/sharp', 'node_modules/@img']
/** 消费方函数包里必须存在的 linux-x64 原生文件；缺失即构建失败。 */
const requiredLinuxSharpFiles = [
  'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node',
  'node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7'
]

/**
 * mysql2 把 `@types/node` 声明为运行时依赖，但运行时从不加载它；这两个纯类型包在
 * `npm ci --omit=dev` 后按固定路径移除，其余开发依赖仍由禁入检查失败关闭。
 */
const typeOnlyPackagesToPrune = ['node_modules/@types/node', 'node_modules/undici-types']

/**
 * 清空并重建固定生成目录。
 * 只删除 v2 固定生成目录，禁止接收环境变量、命令行参数或通配符作为删除目标。
 */
async function recreateGeneratedDirs() {
  await rm(buildDir, { recursive: true, force: true })
  await rm(deploymentDir, { recursive: true, force: true })
  await mkdir(buildDir, { recursive: true })
  await mkdir(join(deploymentDir, 'dist'), { recursive: true })
}

/**
 * 递归列出目录下全部文件，返回相对根目录、统一为正斜杠的路径，并按字典序排序。
 * @param {string} dir 待遍历目录
 * @param {string} [rootDir=dir] 相对路径计算根
 */
async function listFilesRecursive(dir, rootDir = dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolutePath, rootDir)))
    } else if (entry.isFile()) {
      files.push(relative(rootDir, absolutePath).split('\\').join('/'))
    }
  }
  return files.sort()
}

/** 计算文件内容的 SHA-256 十六进制摘要。 */
async function fileDigest(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex')
}

/** 用固定参数把单个 TypeScript 入口打包为 CommonJS 产物，依赖保持外部引用。 */
async function bundleEntry(entryPath, outfile, target = packageKinds.http.target) {
  await build({
    entryPoints: [join(projectDir, entryPath)],
    outfile,
    bundle: true,
    platform: 'node',
    target,
    format: 'cjs',
    packages: 'external',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning'
  })
}

/**
 * 把已打包产物组装为可上传的函数包：bootstrap、锁文件、仅生产依赖与文件清单。
 * @param {string} bundlePath esbuild 产物路径
 * @param {string} packageDir 函数包目录
 * @param {'http' | 'event'} [kind='http'] 函数包形态
 * @param {string} [functionName='probe'] 函数名，用于判断是否需要 sharp
 * @returns {Promise<string>} 清单 JSON 正文
 */
async function assemblePackage(bundlePath, packageDir, kind = 'http', functionName = 'probe') {
  const shape = packageKinds[kind]
  await mkdir(dirname(join(packageDir, shape.entrypoint)), { recursive: true })
  await cp(bundlePath, join(packageDir, shape.entrypoint))
  if (shape.bootstrap !== null) {
    await cp(join(projectDir, 'scf_bootstrap'), join(packageDir, shape.bootstrap))
    await chmod(join(packageDir, shape.bootstrap), 0o755)
  }
  await cp(join(projectDir, 'package.json'), join(packageDir, 'package.json'))
  await cp(join(projectDir, 'package-lock.json'), join(packageDir, 'package-lock.json'))

  // 部署目录仅按锁文件安装生产依赖，确保 TypeScript、Vitest、esbuild 和 Node 类型不会入包。
  execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', ...targetPlatformArgs], {
    cwd: packageDir,
    stdio: 'inherit'
  })
  for (const typeOnlyPath of typeOnlyPackagesToPrune) {
    await rm(join(packageDir, typeOnlyPath), { recursive: true, force: true })
  }
  if (!sharpConsumers.has(functionName)) {
    for (const sharpPath of sharpPackagePaths) {
      await rm(join(packageDir, sharpPath), { recursive: true, force: true })
    }
  }

  /** 安装生产依赖后部署目录内的实际文件清单（尚未写入 manifest）。 */
  const initialFiles = await listFilesRecursive(packageDir)
  /** 最终清单中的文件列表（含即将写入的 package-manifest.json）。 */
  const files = [...initialFiles, 'package-manifest.json'].sort()
  /** 不允许出现在部署包中的源码或开发依赖路径。 */
  const forbiddenPaths = files.filter(
    file =>
      file.startsWith('src/') ||
      file.startsWith('test/') ||
      file.startsWith('node_modules/typescript/') ||
      file.startsWith('node_modules/vitest/') ||
      file.startsWith('node_modules/esbuild/') ||
      file.startsWith('node_modules/@types/')
  )
  if (forbiddenPaths.length > 0) {
    throw new Error(`部署包混入源码或开发依赖：${forbiddenPaths.join(', ')}`)
  }
  /** 混入的非 linux-x64 glibc 平台二进制（例如构建机的 darwin 包）。 */
  const foreignNativePaths = files.filter(
    file => file.startsWith('node_modules/@img/') && !/^node_modules\/@img\/(sharp-linux-x64|sharp-libvips-linux-x64|colour)\//.test(file)
  )
  if (foreignNativePaths.length > 0) {
    throw new Error(`部署包混入非 linux-x64 的 sharp 二进制：${foreignNativePaths.slice(0, 5).join(', ')}`)
  }
  if (sharpConsumers.has(functionName)) {
    const missing = requiredLinuxSharpFiles.filter(file => !files.includes(file))
    if (missing.length > 0) {
      throw new Error(`部署包缺少 sharp 的 linux-x64 二进制：${missing.join(', ')}`)
    }
  }

  /** 部署包清单：运行时、入口、生产依赖版本、产物摘要与文件列表。 */
  const manifest = {
    schemaVersion: 1,
    runtime: shape.runtime,
    entrypoint: shape.entrypoint,
    ...(shape.bootstrap === null ? {} : { bootstrap: shape.bootstrap }),
    ...(shape.handler === null ? {} : { handler: shape.handler }),
    productionDependencies,
    artifacts: { [shape.entrypoint]: await fileDigest(bundlePath) },
    files
  }
  /** 清单 JSON 正文（末尾换行，便于与其他制品对齐）。 */
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(join(packageDir, 'package-manifest.json'), manifestBody, 'utf8')
  return manifestBody
}

const declaredDependencies = JSON.parse(
  await readFile(join(projectDir, 'package.json'), 'utf8')
).dependencies
if (JSON.stringify(declaredDependencies) !== JSON.stringify(productionDependencies)) {
  throw new Error('构建脚本锁定的生产依赖与 package.json 不一致')
}

await recreateGeneratedDirs()

await bundleEntry('src/server.ts', artifactPath)
const probeManifestBody = await assemblePackage(artifactPath, deploymentDir)
await writeFile(join(projectDir, 'package-manifest.json'), probeManifestBody, 'utf8')

for (const functionEntry of functionEntries) {
  const bundlePath = join(buildDir, 'bundles', `${functionEntry.name}.cjs`)
  const kind = functionEntry.kind ?? 'http'
  await bundleEntry(functionEntry.entry, bundlePath, packageKinds[kind].target)
  await assemblePackage(bundlePath, join(functionsDir, functionEntry.name), kind, functionEntry.name)
}
