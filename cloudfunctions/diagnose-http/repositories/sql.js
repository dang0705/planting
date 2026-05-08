'use strict'

function escapeSqlLiteral(value) {
  return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

function sqlInList(values = []) {
  const safe = Array.from(
    new Set(
      (values || [])
        .map(value => String(value || '').trim())
        .filter(value => /^[a-z0-9_:-]+$/i.test(value))
    )
  )

  if (!safe.length) {
    return '(NULL)'
  }

  return `(${safe.map(escapeSqlLiteral).join(', ')})`
}

function clamp01(value) {
  const num = Number(value || 0)
  if (num < 0) {return 0}
  if (num > 1) {return 1}
  return num
}

module.exports = {
  sqlInList,
  clamp01
}
