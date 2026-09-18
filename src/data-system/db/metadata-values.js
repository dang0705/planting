'use strict'

const NUMERIC_DATE_TYPES = new Set([
  'bigint',
  'int',
  'integer',
  'mediumint',
  'smallint',
  'tinyint',
  'decimal',
  'double',
  'float',
  'number'
])

function isDateObject(value) {
  return Object.prototype.toString.call(value) === '[object Date]'
}

function toEpochMilliseconds(value) {
  if (isDateObject(value)) {
    const timestamp = value.getTime()
    return Number.isNaN(timestamp) ? value : timestamp
  }

  if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(value)) {
    const timestamp = new Date(value).getTime()
    if (!Number.isNaN(timestamp)) {
      return timestamp
    }
  }

  return value
}

function normalizeDateForColumn(value, columnMetadata = {}) {
  if (value === null || value === undefined) {
    return value
  }

  const dataType = String(columnMetadata.dataType || columnMetadata.columnType || '')
    .toLowerCase()
    .split('(')[0]

  if (NUMERIC_DATE_TYPES.has(dataType)) {
    return toEpochMilliseconds(value)
  }

  return value
}

function normalizeDateMetadataPayload(payload = {}, columnMetadata = {}) {
  const normalized = { ...payload }
  for (const column of ['created_at', 'updated_at', 'published_at']) {
    if (!Object.prototype.hasOwnProperty.call(normalized, column)) {
      continue
    }
    normalized[column] = normalizeDateForColumn(normalized[column], columnMetadata[column])
  }
  return normalized
}

module.exports = {
  normalizeDateForColumn,
  normalizeDateMetadataPayload,
  toEpochMilliseconds
}
