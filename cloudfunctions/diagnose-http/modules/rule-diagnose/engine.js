'use strict'

const { diagnosisRules } = require('./data/rules')

/**
 * 核心诊断算法 v2
 * 新规则格式:
 *   symptoms: { id: weight }  正数=支持, 负数=排除
 *   conditions: { key: { value: weight } }
 *
 * @param {string[]} userSymptoms   - 用户选择的症状 ID 列表
 * @param {Object}  userConditions  - 用户回答的条件 { soil_moisture: 'wet', light: 'low', ... }
 * @param {Object}  symptomMatches  - 症状初始匹配度 { yellow_leaves: 0.8, ... }
 * @returns {Array} 候选诊断结果，按分数降序排列
 */
function diagnose(userSymptoms, userConditions, symptomMatches = {}) {
  const allConditions = { ...userConditions }
  let candidates = []

  for (const rule of diagnosisRules) {
    const symptomsMap = rule.symptoms || {}

    // 1. 症状得分（正负合并在同一个 map 里）
    let positiveSum = 0
    let negativeSum = 0
    let positiveMax = 0
    let negativeMax = 0

    for (const [sid, w] of Object.entries(symptomsMap)) {
      if (w > 0) positiveMax += w
      else negativeMax += Math.abs(w)
    }

    userSymptoms.forEach(s => {
      const w = symptomsMap[s] ?? 0
      const matchScore = normalizeMatchScore(symptomMatches[s])
      if (w > 0) positiveSum += w * matchScore
      else if (w < 0) negativeSum += Math.abs(w) * matchScore
    })

    const symptomScore =
      (positiveMax > 0 ? positiveSum / positiveMax : 0) -
      (negativeMax > 0 ? negativeSum / negativeMax : 0)

    // 如果症状完全不匹配（正分为0），跳过
    if (positiveSum === 0) continue

    // 2. 条件得分
    let conditionScore = 0
    let conditionCount = 0
    for (const [key, map] of Object.entries(rule.conditions || {})) {
      const val = allConditions[key]
      if (val !== undefined && map[val] !== undefined) {
        conditionScore += map[val]
        conditionCount++
      }
    }
    // 归一化条件分（避免条件数量影响总分）
    const normalizedCondition = conditionCount > 0
      ? conditionScore / (conditionCount * 7) // 7 是单条件最大权重
      : 0

    // 3. 最终分数
    let finalScore = 0.7 * Math.max(0, symptomScore) + 0.3 * normalizedCondition
    finalScore = Math.max(-0.2, Math.min(1, finalScore))

    if (finalScore > 0.08) {
      candidates.push({
        rule,
        score: finalScore,
        priorityAdjusted: finalScore * (rule.priority || 5)
      })
    }
  }

  // 互斥处理
  candidates.sort((a, b) => b.priorityAdjusted - a.priorityAdjusted)
  for (let i = 0; i < candidates.length; i++) {
    const curr = candidates[i]
    for (let j = i + 1; j < candidates.length; j++) {
      if (curr.rule.mutuallyExclusiveWith?.includes(candidates[j].rule.id)) {
        candidates[j].score *= 0.25
        candidates[j].priorityAdjusted *= 0.25
      }
    }
  }

  candidates.sort((a, b) => b.priorityAdjusted - a.priorityAdjusted)

  return candidates.slice(0, 3).map(c => ({
    id: c.rule.id,
    name: c.rule.name,
    score: Math.round(c.score * 100),
    confidence: scoreToConfidence(c.score),
    solutions: c.rule.solutions,
    prevention: c.rule.prevention
  }))
}

function scoreToConfidence(score) {
  if (score >= 0.75) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}

function normalizeMatchScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.max(0.05, Math.min(1, number))
}

/**
 * 根据候选结果计算健康评分 (0-100)
 */
function calcHealthScore(candidates) {
  if (!candidates || candidates.length === 0) return 90
  const topScore = candidates[0].score
  if (topScore >= 75) return Math.max(20, 70 - topScore)
  if (topScore >= 50) return Math.max(40, 80 - topScore * 0.5)
  return Math.max(60, 90 - topScore * 0.3)
}

/**
 * 根据候选结果判断健康状态
 */
function calcHealthStatus(candidates) {
  if (!candidates || candidates.length === 0) return 'healthy'
  const topScore = candidates[0].score
  if (topScore >= 70) return 'sick'
  if (topScore >= 45) return 'warning'
  return 'healthy'
}

module.exports = { diagnose, calcHealthScore, calcHealthStatus }
