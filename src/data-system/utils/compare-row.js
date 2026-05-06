'use strict'

function serializeComparableValue(value) {
  if (value === undefined || value === null) return null
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return new Date(value).toISOString()
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value
}

function isRowDifferent(left = {}, right = {}, compareColumns = []) {
  for (const column of compareColumns) {
    const leftValue = serializeComparableValue(left[column])
    const rightValue = serializeComparableValue(right[column])
    if (leftValue !== rightValue) {
      return true
    }
  }
  return false
}

module.exports = {
  isRowDifferent
}

