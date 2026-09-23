import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const CONTAINER_NAME = `qhz-v2-schema-manifest-${process.pid}`
const DATABASE_NAME = 'qinghuazhi_v2_schema_manifest'
const EXIT_SUCCESS = Number('0')
const NEXT_ATTEMPT = Number('1')
const MIN_MIGRATIONS = Number('10')
const MIN_TABLE_COUNT = Number('103')
const MYSQL_READY_ATTEMPTS = Number('60')
const MYSQL_READY_INTERVAL_MS = Number('250')
const DOCKER_MAX_BUFFER_BYTES = Number('10485760')

/** 在本次测试专用容器内执行命令，不连接任何 CloudBase 环境。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input,
    maxBuffer: DOCKER_MAX_BUFFER_BYTES
  })
  if (result.status !== EXIT_SUCCESS) {
    throw new Error(result.stderr || result.stdout || '隔离 Docker 命令失败')
  }
  return result.stdout.trim()
}

/** 在专用空库执行建表文件，并保留 MySQL 返回的真实错误。 */
function runMysql(sql: string): string {
  return runDocker(
    [
      'exec',
      '-i',
      CONTAINER_NAME,
      'mysql',
      '--no-defaults',
      '-uroot',
      '--batch',
      '--skip-column-names',
      DATABASE_NAME
    ],
    sql
  )
}

/** 等待服务端真正接受查询，避免把容器 running 错当成数据库就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = EXIT_SUCCESS; attempt < MYSQL_READY_ATTEMPTS; attempt += NEXT_ATTEMPT) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        CONTAINER_NAME,
        'mysql',
        '--no-defaults',
        '-uroot',
        '--batch',
        '--skip-column-names',
        '-e',
        'SELECT @@port;'
      ],
      { encoding: 'utf8' }
    )
    if (result.status === EXIT_SUCCESS && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, MYSQL_READY_INTERVAL_MS))
  }
  throw new Error('隔离 MySQL 未就绪')
}

beforeAll(async () => {
  runDocker([
    'run',
    '--detach',
    '--rm',
    '--name',
    CONTAINER_NAME,
    '--tmpfs',
    '/var/lib/mysql',
    '--env',
    'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
    'mysql:8.4'
  ])
  await waitForMysql()
  runDocker([
    'exec',
    CONTAINER_NAME,
    'mysql',
    '--no-defaults',
    '-uroot',
    '-e',
    `CREATE DATABASE ${DATABASE_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  ])
})

afterAll(() => {
  spawnSync('docker', ['stop', CONTAINER_NAME], { encoding: 'utf8' })
})

/**
 * Expected 来源：schema/README.md 的全新空库顺序初始化与读回门、schema/manifest.json 的版本和顺序。
 * 层次：unit_real_data / L3；使用隔离 MySQL 8.4，不经过 CloudBase、HTTP 或 CMS。
 */
test('全量 manifest 在一座空库中顺序建成并读回诊断审核撤销表', () => {
  const schemaRoot = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'manifest.json'), 'utf8')) as {
    files: Array<{ order: number; file: string; sha256: string }>
  }
  expect(manifest.files.length).toBeGreaterThanOrEqual(MIN_MIGRATIONS)

  for (const [index, entry] of manifest.files.entries()) {
    expect(entry.order).toBe(index + NEXT_ATTEMPT)
    const sql = fs.readFileSync(path.join(schemaRoot, entry.file), 'utf8')
    expect(createHash('sha256').update(sql).digest('hex')).toBe(entry.sha256)
    runMysql(sql)
  }

  expect(
    Number(
      runMysql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();')
    )
  ).toBeGreaterThanOrEqual(MIN_TABLE_COUNT)
  expect(
    runMysql(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'diagnosis_review_revocations';"
    )
  ).toBe('1')
  expect(
    runMysql(
      "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name LIKE 'diagnosis_%' AND column_comment = '';"
    )
  ).toBe('0')
})
