'use strict'

const { resolveSchema } = require('./schema-resolver')

const VALID_TABLE_NAME = /^[a-z0-9_]+$/i

function table(envOrName, maybeName) {
  const name = maybeName === undefined ? envOrName : maybeName
  const env = maybeName === undefined ? undefined : envOrName
  const safeName = String(name || '').trim()

  if (!VALID_TABLE_NAME.test(safeName)) {
    throw new Error(`非法表名: ${safeName}`)
  }

  const schema = resolveSchema(env)
  return `\`${schema}\`.\`${safeName}\``
}

module.exports = {
  table
}

