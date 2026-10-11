import { inspect } from 'node:util'

/**
 * v2 云函数连接 MySQL 所需的最小参数。
 *
 * 只读取连接必需项；连接池上限、建连/事务时限等在 configuration-variable-catalog 中仍为 pending，
 * 按 AGENTS.md §8.1 不得在源码或环境变量中私设默认值，因此本模块不读取也不产出这些字段。
 */
export type DatabaseConnectionConfig = {
  /** 数据库私有网络地址；只能来自受控环境变量，不得记录日志。 */
  readonly host: string
  /** 数据库端口，1–65535 的十进制整数。 */
  readonly port: number
  /** 目标库名，只允许字母、数字和下划线，防止拼接注入。 */
  readonly database: string
  /** 应用账号名；不得出现在公开响应或日志中。 */
  readonly user: string
  /** 应用账号密码；只在创建连接时使用，不得序列化、记录或回显。 */
  readonly password: string
}

/** 连接参数缺失或非法；消息只包含变量名，不包含任何取值。 */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseConfigError'
  }
}

const environmentNames = {
  host: 'V2_MYSQL_HOST',
  port: 'V2_MYSQL_PORT',
  database: 'V2_MYSQL_DATABASE',
  user: 'V2_MYSQL_USER',
  password: 'V2_MYSQL_PASSWORD'
} as const

const portPattern = /^[1-9][0-9]{0,4}$/u
const maximumPort = 65_535
const databaseNamePattern = /^[A-Za-z0-9_]{1,64}$/u

/** 脱敏占位文本，与 configuration/environment.ts 的凭证容器保持一致。 */
const redactedText = '[已脱敏]'

/**
 * 在源头为连接参数挂上脱敏：password 不可枚举（对象展开、Object.keys/values 均拿不到），
 * JSON.stringify / util.inspect / 字符串拼接只输出端口与库名，主机、账号、密码一律为 `[已脱敏]`。
 * 调用方无需自行记得脱敏；Adapter 仍按属性名 `config.password` 读取原值。
 */
function redactConnectionConfig(config: DatabaseConnectionConfig): DatabaseConnectionConfig {
  const safeView = () => ({ host: redactedText, port: config.port, database: config.database, user: redactedText, password: redactedText })
  Object.defineProperty(config, 'password', { enumerable: false })
  Object.defineProperty(config, 'toJSON', { value: safeView, enumerable: false })
  Object.defineProperty(config, 'toString', { value: () => redactedText, enumerable: false })
  Object.defineProperty(config, inspect.custom, { value: () => inspect(safeView()), enumerable: false })
  return Object.freeze(config)
}

/**
 * 从环境变量严格读取数据库连接参数；任一项缺失或非法时抛出 `DatabaseConfigError`，
 * 由入口在启动阶段失败关闭，不回退到任何默认值。
 */
export function readDatabaseConnectionConfig(
  environment: Readonly<Record<string, string | undefined>>
): DatabaseConnectionConfig {
  const missing = Object.values(environmentNames).filter(name => !environment[name])
  if (missing.length > 0) {
    throw new DatabaseConfigError(`数据库连接参数缺失：${missing.join(', ')}`)
  }

  const rawPort = environment[environmentNames.port] ?? ''
  const port = Number(rawPort)
  if (!portPattern.test(rawPort) || port > maximumPort) {
    throw new DatabaseConfigError(`数据库连接参数不合法：${environmentNames.port}`)
  }

  const database = environment[environmentNames.database] ?? ''
  if (!databaseNamePattern.test(database)) {
    throw new DatabaseConfigError(`数据库连接参数不合法：${environmentNames.database}`)
  }

  return redactConnectionConfig({
    host: environment[environmentNames.host] ?? '',
    port,
    database,
    user: environment[environmentNames.user] ?? '',
    password: environment[environmentNames.password] ?? ''
  })
}
