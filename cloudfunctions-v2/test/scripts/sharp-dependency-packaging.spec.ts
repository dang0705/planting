import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-11 裁决（协调方转达）——安装 sharp，锁定精确版本 0.35.5；
 * 必须装 linux-x64 的预编译包并能打进云函数部署包，同时本机 darwin 测试能跑；
 * 依赖审查报告 docs/backend-v2/architecture/image-compression-dependency-review-2026-10-11.md §3
 * （lockfile 必须包含 @img/sharp-linux-x64 0.35.5 与 @img/sharp-libvips-linux-x64 1.3.4，按 glibc 安装）。
 * 测试层次：unit_real_data（读取仓库内 package.json、package-lock.json 与构建脚本）；
 * 不覆盖：真实部署后 CloudBase 运行时能否加载 .node 文件（需测试环境冒烟，由协调方统一部署后验证）。
 * RED 证据：2026-10-11 以同名 .red.spec.ts 落盘，裁决写入前全部失败；改动后转绿，并入默认套件。
 */
const backendDir = path.join(findProjectRoot(), 'cloudfunctions-v2')

interface LockPackage {
  /** 锁定的精确版本号。 */
  version?: string
  /** 下载包的完整性摘要（sha512）。 */
  integrity?: string
  /** 允许安装的操作系统列表。 */
  os?: string[]
  /** 允许安装的 CPU 架构列表。 */
  cpu?: string[]
  /** 允许安装的 C 运行库列表（glibc / musl）。 */
  libc?: string[]
}

const packageJson = JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}
const lock = JSON.parse(fs.readFileSync(path.join(backendDir, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, LockPackage>
}
const buildScript = fs.readFileSync(path.join(backendDir, 'scripts/build.mjs'), 'utf8')

describe('sharp 依赖锁定与 linux-x64 打包', () => {
  test('package.json 以精确版本 0.35.5 声明 sharp', () => {
    expect(packageJson.dependencies.sharp).toBe('0.35.5')
  })

  test('lockfile 锁定 sharp 本体与 linux-x64（glibc）预编译包，并带完整性摘要', () => {
    expect(lock.packages['node_modules/sharp']).toMatchObject({ version: '0.35.5' })
    expect(lock.packages['node_modules/@img/sharp-linux-x64']).toMatchObject({
      version: '0.35.5',
      os: ['linux'],
      cpu: ['x64'],
      libc: ['glibc']
    })
    expect(lock.packages['node_modules/@img/sharp-libvips-linux-x64']).toMatchObject({
      version: '1.3.4',
      os: ['linux'],
      cpu: ['x64'],
      libc: ['glibc']
    })
    for (const name of ['sharp', '@img/sharp-linux-x64', '@img/sharp-libvips-linux-x64']) {
      expect(lock.packages[`node_modules/${name}`]?.integrity).toMatch(/^sha512-/)
    }
  })

  test('构建脚本锁定 sharp 版本，并按 linux-x64 glibc 目标安装函数包依赖', () => {
    expect(buildScript).toContain("sharp: '0.35.5'")
    expect(buildScript).toContain("'--os=linux'")
    expect(buildScript).toContain("'--cpu=x64'")
    expect(buildScript).toContain("'--libc=glibc'")
  })
})
