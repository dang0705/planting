'use strict'

const { causality: causalityConfig } = require('../constants/scoring')
const { clamp01 } = require('../repositories/sql')

function round(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function resolveRelationFactor(relationType = '') {
  const key = String(relationType || '').trim().toLowerCase()
  return causalityConfig.relationTypeFactors[key] || 0
}

function computeCausalityBoosts(rankings = [], edges = []) {
  if (!Array.isArray(rankings) || !rankings.length) {
    return {}
  }

  const sorted = [...rankings].sort((a, b) => b.baseScore - a.baseScore)
  const topK = sorted.slice(0, causalityConfig.topK)
  const topScoreMap = new Map(topK.map(item => [item.problemKey, Number(item.baseScore || 0)]))

  const boostMap = {}
  for (const candidate of sorted) {
    boostMap[candidate.problemKey] = 0
  }

  for (const edge of edges || []) {
    const cause = edge?.causeProblemKey
    const effect = edge?.effectProblemKey
    if (!cause || !effect) continue
    if (!topScoreMap.has(cause)) continue
    if (!(effect in boostMap)) continue

    const relationFactor = resolveRelationFactor(edge.relationType)
    if (relationFactor <= 0) continue

    const parentScore = Number(topScoreMap.get(cause) || 0)
    const relationStrength = clamp01(edge.relationStrength)
    const delta = parentScore * relationStrength * relationFactor
    boostMap[effect] += delta
  }

  return Object.fromEntries(
    Object.entries(boostMap).map(([key, value]) => [key, round(value)])
  )
}

module.exports = {
  computeCausalityBoosts
}
