import fs from 'node:fs'
import path from 'node:path'

const SCOPED_HASH_PATTERN = /data-v-[0-9a-f]{8}/gu

function readScopedHashes(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  return new Set(source.match(SCOPED_HASH_PATTERN) || [])
}

/**
 * 校验 uni-app 小程序产物中模板与 scoped 样式是否来自同一份编译结果。
 *
 * 增量 watcher 在组件重命名或样式热更新后可能留下旧 wxss；微信运行时不会
 * 报错，只会让 scoped 选择器全部失效，最终表现为页面布局“全崩”。
 */
export function findMpWeixinScopedStyleMismatches(outputDir) {
  const root = path.resolve(outputDir)
  if (!fs.existsSync(root)) {
    return []
  }

  const mismatches = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(filePath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.wxml')) {
        continue
      }
      const wxssPath = filePath.slice(0, -'.wxml'.length) + '.wxss'
      if (!fs.existsSync(wxssPath)) {
        continue
      }
      const wxmlHashes = readScopedHashes(filePath)
      const wxssHashes = readScopedHashes(wxssPath)
      // Only a wxss hash means the file contains scoped selectors that must be
      // attached to the template. A template-only hash can be produced by an
      // empty <style scoped> block and is harmless.
      if (wxssHashes.size && !setsEqual(wxmlHashes, wxssHashes)) {
        mismatches.push({
          wxml: path.relative(root, filePath),
          wxss: path.relative(root, wxssPath),
          wxmlHashes: [...wxmlHashes].sort(),
          wxssHashes: [...wxssHashes].sort()
        })
      }
    }
  }
  visit(root)
  return mismatches
}

export function assertMpWeixinScopedStyleConsistency(outputDir) {
  const mismatches = findMpWeixinScopedStyleMismatches(outputDir)
  if (!mismatches.length) {
    return { outputDir: path.resolve(outputDir), mismatches: [] }
  }
  const details = mismatches
    .map(item => `${item.wxml}(${item.wxmlHashes.join(',')}) != ${item.wxss}(${item.wxssHashes.join(',')})`)
    .join('; ')
  const error = new Error(`mp-weixin 模板与 scoped 样式产物不一致：${details}`)
  error.code = 'mp_weixin_scoped_style_mismatch'
  error.mismatches = mismatches
  throw error
}

function setsEqual(left, right) {
  if (left.size !== right.size) {
    return false
  }
  return [...left].every(item => right.has(item))
}
