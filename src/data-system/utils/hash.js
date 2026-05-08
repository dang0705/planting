'use strict'

const crypto = require('crypto')

function stableJson(value) {
  if (value === null || value === undefined) {return null}

  if (Array.isArray(value)) {
    return value.map(stableJson)
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return new Date(value).toISOString()
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableJson(value[key])
        return acc
      }, {})
  }

  return value
}

function computeRowHash(row = {}, columns = []) {
  const payload = {}
  for (const column of columns) {
    payload[column] = row[column] ?? null
  }

  const serialized = JSON.stringify(stableJson(payload))
  return crypto.createHash('sha256').update(serialized).digest('hex')
}

module.exports = {
  computeRowHash
}

