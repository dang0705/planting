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
  { name: 'user-plant', entry: 'src/entries/user-plant.ts' }
]

/** 生产依赖锁定版本；必须与 package.json 的 dependencies 完全一致。 */
const productionDependencies = { ajv: '8.20.0', mysql2: '3.24.4', pino: '10.3.1' }

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
async function bundleEntry(entryPath, outfile) {
  await build({
    entryPoints: [join(projectDir, entryPath)],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
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
 * @returns {Promise<string>} 清单 JSON 正文
 */
async function assemblePackage(bundlePath, packageDir) {
  await mkdir(join(packageDir, 'dist'), { recursive: true })
  await cp(bundlePath, join(packageDir, 'dist/server.cjs'))
  await cp(join(projectDir, 'scf_bootstrap'), join(packageDir, 'scf_bootstrap'))
  await cp(join(projectDir, 'package.json'), join(packageDir, 'package.json'))
  await cp(join(projectDir, 'package-lock.json'), join(packageDir, 'package-lock.json'))
  await chmod(join(packageDir, 'scf_bootstrap'), 0o755)

  // 部署目录仅按锁文件安装生产依赖，确保 TypeScript、Vitest、esbuild 和 Node 类型不会入包。
  execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: packageDir,
    stdio: 'inherit'
  })
  for (const typeOnlyPath of typeOnlyPackagesToPrune) {
    await rm(join(packageDir, typeOnlyPath), { recursive: true, force: true })
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

  /** 部署包清单：运行时、入口、生产依赖版本、产物摘要与文件列表。 */
  const manifest = {
    schemaVersion: 1,
    runtime: 'Nodejs22.21',
    entrypoint: 'dist/server.cjs',
    bootstrap: 'scf_bootstrap',
    productionDependencies,
    artifacts: { 'dist/server.cjs': await fileDigest(bundlePath) },
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
  await bundleEntry(functionEntry.entry, bundlePath)
  await assemblePackage(bundlePath, join(functionsDir, functionEntry.name))
}
