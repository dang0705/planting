import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseArgs,
  readAppJson,
  validateAndNormalizeSubRoot,
  assertNoOverlappingRoots,
  isUnderSubPackage,
  walkFiles,
  getFileBytes,
  computePackageStats
} from '../../../../src/utils/main-package-size.js'

/**
 * 创建临时构建目录并在 finally 中清理测试自有文件。
 * @param {object} structure - { relativePath: content(string) | null(目录) }
 * @returns {{ root: string, cleanup: () => void }}
 */
function createTempBuildRoot(structure = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pkg-size-'))
  for (const [rel, content] of Object.entries(structure)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    if (content === null) {
      fs.mkdirSync(full, { recursive: true })
    } else {
      fs.writeFileSync(full, content, 'utf8')
    }
  }
  return {
    root,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
}

const cleanupAll = []

try {
  // ---------- parseArgs ----------
  {
    const { builtRoot, mode, limitBytes } = parseArgs([
      'node',
      'script.mjs',
      '/tmp/build',
      '--mode=production',
      '--limit=2048000'
    ])
    assert.equal(builtRoot, '/tmp/build')
    assert.equal(mode, 'production')
    assert.equal(limitBytes, 2048000)
  }

  {
    const { mode } = parseArgs(['node', 'script.mjs', '/x', '--mode=development', '--limit=100'])
    assert.equal(mode, 'development')
  }

  assert.throws(
    () => parseArgs(['node', 'script.mjs', '/x', '--mode=bad', '--limit=100']),
    /invalid --mode value/
  )
  assert.throws(
    () => parseArgs(['node', 'script.mjs', '/x', '--mode=production']),
    /missing --limit/
  )
  assert.throws(
    () => parseArgs(['node', 'script.mjs', '--mode=production', '--limit=100']),
    /missing <built-root>/
  )
  assert.throws(
    () => parseArgs(['node', 'script.mjs', '/x', '/y', '--mode=production', '--limit=100']),
    /unexpected extra positional arguments/
  )
  assert.throws(
    () => parseArgs(['node', 'script.mjs', '/x', '--mode=production', '--limit=0']),
    /invalid --limit value/
  )

  // ---------- validateAndNormalizeSubRoot: 合法值 ----------
  assert.equal(validateAndNormalizeSubRoot('subA/'), 'subA')
  assert.equal(validateAndNormalizeSubRoot('subB'), 'subB')
  assert.equal(validateAndNormalizeSubRoot('sub\\C'), 'sub/C')
  assert.equal(validateAndNormalizeSubRoot('pkg/deep'), 'pkg/deep')

  // ---------- validateAndNormalizeSubRoot: 绝对路径拒绝 ----------
  assert.throws(() => validateAndNormalizeSubRoot('/etc/passwd'), /must be relative/)
  assert.throws(() => validateAndNormalizeSubRoot('/subA'), /must be relative/)

  // ---------- validateAndNormalizeSubRoot: Windows drive 路径拒绝 ----------
  assert.throws(() => validateAndNormalizeSubRoot('C:\\subA'), /Windows drive/)
  assert.throws(() => validateAndNormalizeSubRoot('D:/pkg'), /Windows drive/)

  // ---------- validateAndNormalizeSubRoot: .. traversal 拒绝 ----------
  assert.throws(() => validateAndNormalizeSubRoot('../outside'), /traversal/)
  assert.throws(() => validateAndNormalizeSubRoot('pkg/../outside'), /traversal/)
  assert.throws(() => validateAndNormalizeSubRoot('..'), /traversal/)
  assert.throws(() => validateAndNormalizeSubRoot('a/b/../../c'), /traversal/)

  // ---------- validateAndNormalizeSubRoot: . 和空段拒绝 ----------
  assert.throws(() => validateAndNormalizeSubRoot('.'), /must not contain '.'/)
  assert.throws(() => validateAndNormalizeSubRoot('pkg/./sub'), /must not contain '.'/)
  assert.throws(() => validateAndNormalizeSubRoot('pkg//sub'), /empty path segment/)
  assert.throws(() => validateAndNormalizeSubRoot(''), /empty after normalization/)

  // ---------- isUnderSubPackage ----------
  assert.equal(isUnderSubPackage('subA/index.js', ['subA']), true)
  assert.equal(isUnderSubPackage('subA/deep/file.js', ['subA']), true)
  assert.equal(
    isUnderSubPackage('subAB/index.js', ['subA']),
    false,
    'prefix must not partial match'
  )
  assert.equal(isUnderSubPackage('main.js', ['subA']), false)

  // ---------- assertNoOverlappingRoots ----------
  assertNoOverlappingRoots([{ root: 'subA' }, { root: 'subB' }])
  assert.throws(
    () => assertNoOverlappingRoots([{ root: 'subA' }, { root: 'subA/deep' }]),
    /overlap or nest/
  )
  assert.throws(
    () => assertNoOverlappingRoots([{ root: 'subA' }, { root: 'subA' }]),
    /overlap or nest/
  )
  // assertNoOverlappingRoots 也应拒绝 traversal root
  assert.throws(() => assertNoOverlappingRoots([{ root: '../outside' }]), /traversal/)

  // ---------- readAppJson: 缺失 ----------
  {
    const { root, cleanup } = createTempBuildRoot({})
    cleanupAll.push(cleanup)
    assert.throws(() => readAppJson(root), /app.json not found/)
  }

  // ---------- readAppJson: 无效 JSON ----------
  {
    const { root, cleanup } = createTempBuildRoot({ 'app.json': '{ invalid json' })
    cleanupAll.push(cleanup)
    assert.throws(() => readAppJson(root), /not valid JSON/)
  }

  // ---------- 无分包场景：主包字节求和 ----------
  {
    const fileA = 'a'.repeat(100)
    const fileB = 'b'.repeat(200)
    const appJson = JSON.stringify({ pages: [{ path: 'pages/index/index' }] })
    const appJsonBytes = Buffer.byteLength(appJson, 'utf8')
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': fileA,
      'utils/helper.js': fileB
    })
    cleanupAll.push(cleanup)

    const expectedMain = appJsonBytes + 100 + 200
    const stats = computePackageStats(root, 'production', 1000)
    assert.equal(stats.mode, 'production')
    assert.equal(stats.root, root)
    assert.equal(stats.mainBytes, expectedMain)
    assert.equal(stats.passed, true)
    assert.equal(Object.keys(stats.subpackageBytes).length, 0)
    assert.ok(stats.topFiles.length <= 20)
    assert.equal(stats.topFiles[0].path, 'utils/helper.js')
    assert.equal(stats.topFiles[0].bytes, 200)
  }

  // ---------- 无分包场景：limit 失败 ----------
  {
    const content = 'x'.repeat(500)
    const appJson = JSON.stringify({ pages: [] })
    const appJsonBytes = Buffer.byteLength(appJson, 'utf8')
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'big.js': content
    })
    cleanupAll.push(cleanup)

    const stats = computePackageStats(root, 'production', 100)
    assert.equal(stats.mainBytes, appJsonBytes + 500)
    assert.equal(stats.passed, false)
  }

  // ---------- 正常分包场景：分包文件从主包排除 ----------
  {
    const mainContent = 'm'.repeat(300)
    const subContent = 's'.repeat(700)
    const appJson = JSON.stringify({
      pages: [{ path: 'pages/index/index' }],
      subPackages: [{ root: 'packageA', pages: [{ path: 'pages/sub/index' }] }]
    })
    const appJsonBytes = Buffer.byteLength(appJson, 'utf8')
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': mainContent,
      'packageA/sub.js': subContent,
      'packageA/deep/nested.js': 'n'.repeat(100)
    })
    cleanupAll.push(cleanup)

    const stats = computePackageStats(root, 'production', 500)
    assert.equal(stats.mainBytes, appJsonBytes + 300)
    assert.equal(stats.subpackageBytes['packageA'], 800)
    assert.equal(stats.passed, true)
  }

  // ---------- subpackages 兼容（小写） ----------
  {
    const appJson = JSON.stringify({
      subpackages: [{ root: 'pkgB', pages: [] }]
    })
    const appJsonBytes = Buffer.byteLength(appJson, 'utf8')
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': 'a'.repeat(50),
      'pkgB/sub.js': 'b'.repeat(150)
    })
    cleanupAll.push(cleanup)

    const stats = computePackageStats(root, 'development', 1000)
    assert.equal(stats.mainBytes, appJsonBytes + 50)
    assert.equal(stats.subpackageBytes['pkgB'], 150)
  }

  // ---------- 分包 root 缺失 ----------
  {
    const appJson = JSON.stringify({
      subPackages: [{ root: 'missingPkg', pages: [] }]
    })
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': 'a'.repeat(10)
    })
    cleanupAll.push(cleanup)

    assert.throws(
      () => computePackageStats(root, 'production', 1000),
      /subPackage root directory missing: missingPkg/
    )
  }

  // ---------- 分包 root 重叠/嵌套 ----------
  {
    const appJson = JSON.stringify({
      subPackages: [{ root: 'pkgA' }, { root: 'pkgA/inner' }]
    })
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': 'a'.repeat(10),
      'pkgA/sub.js': 'b'.repeat(10),
      'pkgA/inner/deep.js': 'c'.repeat(10)
    })
    cleanupAll.push(cleanup)

    assert.throws(() => computePackageStats(root, 'production', 1000), /overlap or nest/)
  }

  // ---------- 绝对路径 root 被 computePackageStats 拒绝 ----------
  {
    const appJson = JSON.stringify({
      subPackages: [{ root: '/absolute/path' }]
    })
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': 'a'.repeat(10)
    })
    cleanupAll.push(cleanup)

    assert.throws(() => computePackageStats(root, 'production', 1000), /must be relative/)
  }

  // ---------- .. traversal root 被 computePackageStats 拒绝 ----------
  {
    const appJson = JSON.stringify({
      subPackages: [{ root: '../outside' }]
    })
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': 'a'.repeat(10)
    })
    cleanupAll.push(cleanup)

    assert.throws(() => computePackageStats(root, 'production', 1000), /traversal/)
  }

  // ---------- 嵌套 traversal root 被 computePackageStats 拒绝 ----------
  {
    const appJson = JSON.stringify({
      subPackages: [{ root: 'pkg/../../outside' }]
    })
    const { root, cleanup } = createTempBuildRoot({
      'app.json': appJson,
      'main.js': 'a'.repeat(10)
    })
    cleanupAll.push(cleanup)

    assert.throws(() => computePackageStats(root, 'production', 1000), /traversal/)
  }

  // ---------- root 外部 symlink 被拒绝 ----------
  // 创建一个指向构建根外部的 symlink 作为分包 root
  // 在支持 symlink 的平台上验证；不支持时跳过
  {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-outside-'))
    fs.writeFileSync(path.join(outsideDir, 'leaked.js'), 'secret-data')
    const { root, cleanup } = createTempBuildRoot({
      'app.json': JSON.stringify({
        subPackages: [{ root: 'escapePkg', pages: [] }]
      }),
      'main.js': 'a'.repeat(10)
    })
    cleanupAll.push(cleanup)
    cleanupAll.push(() => fs.rmSync(outsideDir, { recursive: true, force: true }))

    const symlinkPath = path.join(root, 'escapePkg')
    try {
      fs.symlinkSync(outsideDir, symlinkPath, 'dir')
    } catch {
      // 平台不支持 symlink 创建（如无权限），跳过此用例
      console.log('symlink test skipped: platform does not support symlink creation')
    }

    assert.throws(
      () => computePackageStats(root, 'production', 1000),
      /escapes build root via symlink|directory missing/
    )
  }

  // ---------- walkFiles + getFileBytes 逻辑字节求和 ----------
  {
    const { root, cleanup } = createTempBuildRoot({
      'a.txt': '12345',
      'dir/b.txt': 'ab'
    })
    cleanupAll.push(cleanup)

    const files = walkFiles(root)
    assert.equal(files.length, 2)
    const total = files.reduce((sum, f) => sum + getFileBytes(f), 0)
    assert.equal(total, 7)
  }

  console.log('check-main-package-size unit tests passed')
} finally {
  for (const cleanup of cleanupAll) {
    try {
      cleanup()
    } catch {
      // 忽略清理失败
    }
  }
}
