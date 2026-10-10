// 三轴筛选索引回填 CLI 启动器（运维工具，非产品代码）：把 TypeScript 入口打包到系统临时目录后执行。
// 用法（在 cloudfunctions-v2 目录）：node scripts/visual-filter-index.mjs build --release models/policy-releases/plant-knowledge.public_search.v2.release.json --batch-size 5000 [--apply]
// 默认 dry-run；真正写库须显式 --apply。连接参数只从 V2_MYSQL_* 环境变量读取（经 src/configuration/environment.ts 校验）。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = mkdtempSync(join(tmpdir(), 'qhz-visual-filter-index-'))
const outfile = join(workDir, 'visual-filter-index.cjs')
try {
  await build({
    entryPoints: [join(projectDir, 'src/entries/visual-filter-index-cli.ts')],
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile, logLevel: 'silent'
  })
  const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env, cwd: process.cwd() })
  process.exitCode = result.status ?? 70
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
