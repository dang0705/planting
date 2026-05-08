'use strict'

function normalizePrimitive(value) {
  if (value === undefined) {return null}
  if (value === null) {return null}

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  return value
}

function normalizeRow(row = {}, config = {}) {
  const numericColumns = new Set(config.numericColumns || [])
  const jsonColumns = new Set(config.jsonColumns || [])
  const columns = config.columns || Object.keys(row || {})
  const result = {}

  for (const column of columns) {
    const value = normalizePrimitive(row[column])

    if (value === null) {
      result[column] = null
      continue
    }

    if (numericColumns.has(column)) {
      const numberValue = Number(value)
      result[column] = Number.isFinite(numberValue) ? numberValue : null
      continue
    }

    if (jsonColumns.has(column)) {
      if (typeof value === 'string') {
        try {
          JSON.parse(value)
          result[column] = value
        } catch (error) {
          result[column] = JSON.stringify(value)
        }
      } else {
        result[column] = JSON.stringify(value)
      }
      continue
    }

    result[column] = value
  }

  return result
}

module.exports = {
  normalizeRow
}

