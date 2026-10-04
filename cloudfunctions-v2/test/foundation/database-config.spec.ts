import { describe, expect, test } from 'vitest'

import {
  DatabaseConfigError,
  readDatabaseConnectionConfig
} from '../../src/foundation/config/database-config.js'

const validEnvironment = {
  V2_MYSQL_HOST: '10.0.0.8',
  V2_MYSQL_PORT: '3306',
  V2_MYSQL_DATABASE: 'qinghuazhi_v2_test',
  V2_MYSQL_USER: 'qhz_v2_app',
  V2_MYSQL_PASSWORD: 'never-print-this-secret'
}

/**
 * Expected 来源：AGENTS.md §2「受控显式凭证，不得写进仓库、日志、测试输出或公开响应」、§8.1「pending
 * 配置严禁私设默认值」（configuration-variable-catalog 中连接池与建连时限均为 pending，故本切片只读取
 * 必需的连接参数，缺失即失败关闭）。
 * 层次：L1 / unit_fake。只替换进程环境变量，不连接数据库。
 */
describe('数据库连接参数读取', () => {
  test('五项必需参数齐全时返回严格解析后的连接参数', () => {
    expect(readDatabaseConnectionConfig(validEnvironment)).toEqual({
      host: '10.0.0.8',
      port: Number('3306'),
      database: 'qinghuazhi_v2_test',
      user: 'qhz_v2_app',
      password: 'never-print-this-secret'
    })
  })

  test('任一参数缺失或为空时失败关闭，且错误只列变量名不含任何取值', () => {
    for (const missingName of Object.keys(validEnvironment)) {
      const environment: Record<string, string> = { ...validEnvironment, [missingName]: '' }
      let captured: unknown
      try {
        readDatabaseConnectionConfig(environment)
      } catch (error: unknown) {
        captured = error
      }
      expect(captured).toBeInstanceOf(DatabaseConfigError)
      const message = (captured as Error).message
      expect(message).toContain(missingName)
      expect(message).not.toContain('never-print-this-secret')
      expect(message).not.toContain('10.0.0.8')
    }
  })

  test('端口不是 1–65535 的十进制整数时失败关闭', () => {
    for (const port of ['0', '65536', '33o6', '3306.5', '-1', ' 3306']) {
      expect(() =>
        readDatabaseConnectionConfig({ ...validEnvironment, V2_MYSQL_PORT: port })
      ).toThrow(DatabaseConfigError)
    }
  })

  test('库名只允许字母、数字和下划线，拒绝可拼接 SQL 的名称', () => {
    for (const database of ['qhz-v2', 'qhz`; DROP', 'a'.repeat(Number('65'))]) {
      expect(() =>
        readDatabaseConnectionConfig({ ...validEnvironment, V2_MYSQL_DATABASE: database })
      ).toThrow(DatabaseConfigError)
    }
  })

  test('不读取连接池大小或超时等 pending 配置，也不产出默认值字段', () => {
    const config = readDatabaseConnectionConfig({
      ...validEnvironment,
      V2_MYSQL_POOL_SIZE: '50',
      V2_MYSQL_CONNECT_TIMEOUT_MS: '100'
    })
    expect(Object.keys(config).sort()).toEqual(['database', 'host', 'password', 'port', 'user'])
  })
})
