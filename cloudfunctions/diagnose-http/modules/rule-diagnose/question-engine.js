'use strict'

const { followUpQuestions } = require('./data/questions')
const { diagnosisRules } = require('./data/rules')

/**
 * 计算某个问题对候选规则的区分度
 * 新格式: rule.conditions[questionId] = { value: weight }
 */
function computeQuestionImpact(candidateRuleIds, questionId) {
  const rules = diagnosisRules.filter(r => candidateRuleIds.includes(r.id))
  let values = []
  for (const rule of rules) {
    const mapping = rule.conditions?.[questionId]
    if (!mapping) continue
    values.push(...Object.values(mapping))
  }
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

/**
 * 根据已选症状过滤出相关的追问问题
 */
function getTriggeredQuestions(userSymptoms) {
  return followUpQuestions.filter(q => {
    // 无触发条件的问题（空数组）始终可用
    if (!q.triggerSymptoms || q.triggerSymptoms.length === 0) return true
    // 有触发条件的问题，需要用户选了对应症状
    return q.triggerSymptoms.some(s => userSymptoms.includes(s))
  })
}

/**
 * 选择下一个最有价值的追问问题
 * @param {string[]} userSymptoms      - 已选症状
 * @param {Object}  answeredConditions - 已回答的条件
 * @param {string[]} candidateRuleIds  - 当前候选规则 ID 列表
 * @returns {Object|null}
 */
function chooseNextQuestion(userSymptoms, answeredConditions, candidateRuleIds) {
  const available = getTriggeredQuestions(userSymptoms).filter(
    q => answeredConditions[q.id] === undefined
  )

  if (available.length === 0) return null

  let bestQuestion = null
  let bestImpact = -1

  for (const q of available) {
    const impact = computeQuestionImpact(candidateRuleIds, q.id)
    if (impact > bestImpact) {
      bestImpact = impact
      bestQuestion = q
    }
  }

  // 如果没找到高区分度问题，返回第一个未回答的问题（环境/养护类优先）
  if (!bestQuestion || bestImpact < 1) {
    const fallback = available.find(q =>
      ['environment', 'care'].includes(q.category)
    ) || available[0]
    return fallback || null
  }

  return bestQuestion
}

/**
 * 判断是否需要继续追问
 * @param {Array}  candidates  - 当前候选结果（score 为 0-100 整数）
 * @param {number} roundCount  - 已完成的追问轮数
 * @returns {boolean}
 */
function shouldContinueAsking(candidates, roundCount) {
  // 最多追问4轮
  if (roundCount >= 4) return false

  // 没有候选说明症状信息不足，继续追问（最多2轮）
  if (!candidates || candidates.length === 0) return roundCount < 2

  const topScore = candidates[0]?.score ?? 0

  // 第一轮：置信度不够高就追问
  if (roundCount === 0) return topScore < 88

  // 置信度非常高，不需要继续
  if (topScore >= 85) return false

  // 前两名分数差距很小，需要继续区分
  if (candidates.length >= 2 && (topScore - candidates[1].score) < 20) return true

  // 置信度偏低，继续追问
  if (topScore < 60) return true

  return false
}

module.exports = { chooseNextQuestion, shouldContinueAsking, getTriggeredQuestions }