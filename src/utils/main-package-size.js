/**
 * 微信小程序主包逻辑字节统计核心逻辑
 *
 * 只读取构建产物目录，不修改任何文件。读取根目录 app.json，
 * 将 subPackages（兼容 subpackages）中每个 root 目录从主包统计中排除，
 * 统计主包所有文件的逻辑字节总和（stat.size）。
 *
 * 安全边界：
 * - 每个 root 必须是非空、相对构建根的 POSIX 路径。
 * - 拒绝绝对路径、Windows drive 路径、`.`、`..`、空路径段和任何包含 `..` 的 traversal。
 * - root 解析后的 realpath 必须仍位于 built root 的 realpath 内。
 * - 文件遍历不跟随指向构建根外部的符号链接目录。
 *
 * app.json 缺失、JSON 无效、分包 root 缺失/非目录、root 重叠/嵌套、
 * 文件 stat 失败时抛出错误，CLI 层捕获后非零退出。
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * 解析命令行参数，提取 builtRoot、mode、limit。
 * @param {string[]} argv
 * @returns {{ builtRoot: string, mode: string, limitBytes: number }}
 */
export function parseArgs(argv) {
  const positional = []
  let mode = ''
  let limitBytes = 0

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--mode=')) {
      mode = arg.slice('--mode='.length).trim()
    } else if (arg.startsWith('--limit=')) {
      const raw = arg.slice('--limit='.length).trim()
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`invalid --limit value: ${raw}`)
      }
      limitBytes = Math.floor(parsed)
    } else if (arg.startsWith('--')) {
      // 未知参数忽略，保持向前兼容
    } else {
      positional.push(arg)
    }
  }

  if (positional.length === 0) {
    throw new Error('missing <built-root> positional argument')
  }
  if (positional.length > 1) {
    throw new Error(`unexpected extra positional arguments: ${positional.slice(1).join(', ')}`)
  }

  const builtRoot = positional[0]
  if (!mode) {
    throw new Error('missing --mode argument (development|production)')
  }
  if (!['development', 'production'].includes(mode)) {
    throw new Error(`invalid --mode value: ${mode} (expected development|production)`)
  }
  if (!limitBytes) {
    throw new Error('missing --limit=<bytes> argument')
  }

  return { builtRoot, mode, limitBytes }
}

/**
 * 安全读取并解析 app.json。
 * @param {string} root
 * @returns {{ subPackages: Array<{ root: string }>, raw: object }}
 */
export function readAppJson(root) {
  const appJsonPath = path.join(root, 'app.json')
  if (!fs.existsSync(appJsonPath) || !fs.statSync(appJsonPath).isFile()) {
    throw new Error(`app.json not found at: ${appJsonPath}`)
  }

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
  } catch (error) {
    throw new Error(`app.json is not valid JSON: ${error.message}`)
  }

  const subPackagesRaw = raw.subPackages || raw.subpackages || []
  if (!Array.isArray(subPackagesRaw)) {
    throw new Error('app.json subPackages/subpackages must be an array')
  }

  const subPackages = subPackagesRaw.map((pkg, index) => {
    if (!pkg || typeof pkg !== 'object') {
      throw new Error(`app.json subPackages[${index}] must be an object`)
    }
    const rootDir = String(pkg.root || '').trim()
    if (!rootDir) {
      throw new Error(`app.json subPackages[${index}].root is missing or empty`)
    }
    return { root: rootDir }
  })

  return { subPackages, raw }
}

/**
 * 校验并规范化分包 root 为 POSIX 风格相对路径（无前后斜杠）。
 *
 * 拒绝：绝对路径（/ 或 \ 开头）、Windows drive 路径（C:\）、
 * `.`、`..`、空路径段、任何包含 `..` 的 traversal 形式。
 *
 * @param {string} rootDir
 * @returns {string} 规范化后的相对 POSIX 路径
 * @throws {Error} 当 root 包含非法形式时
 */
export function validateAndNormalizeSubRoot(rootDir) {
  // 先统一为 POSIX 风格
  const posix = String(rootDir).replace(/\\/g, '/')

  // 拒绝绝对路径（/ 开头）
  if (posix.startsWith('/')) {
    throw new Error(`subPackage root must be relative, got absolute path: ${rootDir}`)
  }

  // 拒绝 Windows drive 路径（如 C:/、C:\）
  if (/^[a-zA-Z]:[\\/]/.test(posix)) {
    throw new Error(`subPackage root must not be a Windows drive path: ${rootDir}`)
  }

  // 去除首尾斜杠
  const trimmed = posix.replace(/^\/+/, '').replace(/\/+$/, '')

  if (!trimmed) {
    throw new Error(`subPackage root is empty after normalization: ${rootDir}`)
  }

  // 按路径段校验，拒绝空段、. 和 ..
  const segments = trimmed.split('/')
  for (const segment of segments) {
    if (segment === '') {
      throw new Error(`subPackage root contains empty path segment: ${rootDir}`)
    }
    if (segment === '.') {
      throw new Error(`subPackage root must not contain '.': ${rootDir}`)
    }
    if (segment === '..') {
      throw new Error(`subPackage root must not contain '..' traversal: ${rootDir}`)
    }
  }

  return trimmed
}

/**
 * 检测分包 root 之间的重叠或越界（嵌套）关系。
 * @param {Array<{ root: string }>} subPackages
 */
export function assertNoOverlappingRoots(subPackages) {
  const normalized = subPackages.map(pkg => validateAndNormalizeSubRoot(pkg.root))
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i]
      const b = normalized[j]
      // a 是 b 的祖先或 b 是 a 的祖先
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
        throw new Error(
          `subPackage roots overlap or nest: "${subPackages[i].root}" and "${subPackages[j].root}"`
        )
      }
    }
  }
}

/**
 * 判断一个相对文件路径是否落在某个分包 root 目录内（完整路径边界）。
 * @param {string} relFile POSIX 风格相对路径
 * @param {string[]} subRoots 已规范化的分包 root 列表
 * @returns {boolean}
 */
export function isUnderSubPackage(relFile, subRoots) {
  for (const subRoot of subRoots) {
    if (relFile === subRoot || relFile.startsWith(`${subRoot}/`)) {
      return true
    }
  }
  return false
}

/**
 * 确认 resolvedPath 的 realpath 位于 rootRealpath 目录内（含自身）。
 * 防止 path.join 语义把校验带出构建根，或 root 为指向外部的符号链接。
 *
 * @param {string} resolvedPath 已 join 的绝对路径
 * @param {string} rootRealpath built root 的 realpath
 * @returns {boolean}
 */
function isPathWithinRoot(resolvedPath, rootRealpath) {
  let targetReal
  try {
    targetReal = fs.realpathSync(resolvedPath)
  } catch {
    return false
  }

  if (targetReal === rootRealpath) {
    return true
  }

  // 必须严格位于 rootRealpath 之下（带尾部分隔符，防止前缀部分匹配）
  return targetReal.startsWith(`${rootRealpath}${path.sep}`)
}

/**
 * 递归遍历目录，返回所有文件的绝对路径列表。
 * 不跟随指向构建根外部的符号链接目录；文件 stat 失败时抛出错误。
 *
 * @param {string} root 构建根的 realpath
 * @returns {string[]}
 */
export function walkFiles(root) {
  const rootReal = fs.realpathSync(root)
  const results = []
  const stack = [root]

  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (error) {
      throw new Error(`failed to read directory ${current}: ${error.message}`)
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)

      if (entry.isSymbolicLink()) {
        // 符号链接：仅当 realpath 仍在构建根内时才跟随，否则跳过
        if (!isPathWithinRoot(full, rootReal)) {
          continue
        }
        // realpath 在构建根内，按其真实类型处理
        let realStat
        try {
          realStat = fs.statSync(full)
        } catch {
          // realpath 解析失败，跳过
          continue
        }
        if (realStat.isDirectory()) {
          stack.push(full)
        } else if (realStat.isFile()) {
          results.push(full)
        }
        continue
      }

      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        results.push(full)
      }
    }
  }
  return results
}

/**
 * 获取文件逻辑字节大小（stat.size）。
 * @param {string} filePath
 * @returns {number}
 */
export function getFileBytes(filePath) {
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch (error) {
    throw new Error(`failed to stat file ${filePath}: ${error.message}`)
  }
  if (!stat.isFile()) {
    return 0
  }
  return stat.size
}

/**
 * 统计主包与分包的字节数，返回可审计的结构。
 * @param {string} builtRoot
 * @param {string} mode
 * @param {number} limitBytes
 * @returns {object}
 */
export function computePackageStats(builtRoot, mode, limitBytes) {
  const { subPackages } = readAppJson(builtRoot)
  assertNoOverlappingRoots(subPackages)

  const subRoots = subPackages.map(pkg => validateAndNormalizeSubRoot(pkg.root))

  // builtRoot 的 realpath，用于后续边界校验
  const builtRootReal = fs.realpathSync(builtRoot)

  // 校验分包 root 目录存在且 realpath 位于构建根内
  for (const subRoot of subRoots) {
    const full = path.join(builtRoot, subRoot)
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
      throw new Error(`subPackage root directory missing: ${subRoot}`)
    }
    if (!isPathWithinRoot(full, builtRootReal)) {
      throw new Error(`subPackage root escapes build root via symlink: ${subRoot}`)
    }
  }

  const allFiles = walkFiles(builtRoot)
  const mainFiles = []
  const subpackageBytes = {}

  for (const subRoot of subRoots) {
    subpackageBytes[subRoot] = 0
  }

  for (const full of allFiles) {
    const rel = path.relative(builtRoot, full).replace(/\\/g, '/')
    const bytes = getFileBytes(full)

    let matched = null
    for (const subRoot of subRoots) {
      if (rel === subRoot || rel.startsWith(`${subRoot}/`)) {
        matched = subRoot
        break
      }
    }

    if (matched) {
      subpackageBytes[matched] += bytes
    } else {
      mainFiles.push({ rel, bytes })
    }
  }

  const mainBytes = mainFiles.reduce((sum, f) => sum + f.bytes, 0)

  const topFiles = [...mainFiles]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20)
    .map(f => ({ path: f.rel, bytes: f.bytes }))

  const passed = mainBytes <= limitBytes

  return {
    mode,
    root: builtRoot,
    limitBytes,
    mainBytes,
    passed,
    subpackageBytes,
    topFiles
  }
}
