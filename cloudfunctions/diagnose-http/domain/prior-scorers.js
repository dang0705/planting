'use strict'

const { clamp01 } = require('../repositories/sql')
const { prior: priorConfig } = require('../constants/scoring')

function round(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function computeGenusFactor(genusSuitability) {
  return round(
    priorConfig.genusBase + priorConfig.genusWeight * clamp01(genusSuitability)
  )
}

function computeHostFactor(hostSuitability) {
  return round(
    priorConfig.hostBase + priorConfig.hostWeight * clamp01(hostSuitability)
  )
}

module.exports = {
  computeGenusFactor,
  computeHostFactor
}
