'use strict'

const { jsonResponse, resolveHttpUserInfo } = require('/opt/utils/http')
const { symptomCategories, followUpQuestions } = require('./data/questions')
const { diagnose } = require('./engine')
const { chooseNextQuestion, shouldContinueAsking } = require('./question-engine')
const { handleIdentifySymptoms } = require('./symptom-identifier')
const { handleMatchSymptom } = require('./symptom-matcher')

/**
 * GET /rule-diagnose/symptoms
 * 返回所有症状分类供前端展示
 */
async function handleGetSymptoms() {
  return jsonResponse(200, {
    code: 200,
    data: {
      symptomCategories: symptomCategories.map(category => ({
        id: category.id,
        label: category.label
      }))
    }
  })
}

/**
 * GET /rule-diagnose/questions
 * 返回所有追问问题
 */
async function handleGetQuestions() {
  return jsonResponse(200, {
    code: 200,
    data: { questions: followUpQuestions }
  })
}

/**
 * POST /rule-diagnose/diagnose
 * 执行规则诊断，返回候选结果 + 下一个追问问题
 *
 * Body:
 *   symptoms: string[]        已选症状 ID
 *   conditions: Object        已回答的条件 { soil_moisture: 'wet', ... }
 *   round: number             当前是第几轮（0=初始）
 */
async function handleRuleDiagnose(event, context, requestData) {
  const userInfo = await resolveHttpUserInfo(requestData.headers, {
    ...requestData.query,
    ...requestData.body
  })

  if (!userInfo || !userInfo.openid) {
    return jsonResponse(401, { code: 401, message: '需要登录才能使用诊断功能' })
  }

  const body = requestData.body || {}
  const symptoms = Array.isArray(body.symptoms) ? body.symptoms : []
  const conditions = body.conditions && typeof body.conditions === 'object' ? body.conditions : {}
  const symptomMatches =
    body.symptomMatches && typeof body.symptomMatches === 'object' ? body.symptomMatches : {}
  const round = Number(body.round) || 0

  if (symptoms.length === 0) {
    return jsonResponse(400, { code: 400, message: '请至少选择一个症状' })
  }

  // 运行诊断引擎
  const candidates = diagnose(symptoms, conditions, symptomMatches)
  const candidateRuleIds = candidates.map(c => c.id)

  console.log('[RuleDiagnose] symptoms:', JSON.stringify(symptoms))
  console.log('[RuleDiagnose] symptomMatches:', JSON.stringify(symptomMatches))
  console.log('[RuleDiagnose] conditions:', JSON.stringify(conditions))
  console.log('[RuleDiagnose] round:', round)
  console.log('[RuleDiagnose] candidates:', JSON.stringify(candidates))

  // 判断是否需要继续追问
  const needMore = shouldContinueAsking(candidates, round, conditions)
  let nextQuestion = null
  if (needMore) {
    nextQuestion = chooseNextQuestion(symptoms, conditions, candidateRuleIds)
  }

  console.log('[RuleDiagnose] needMore:', needMore, '| nextQuestion:', JSON.stringify(nextQuestion))

  const isDone = !needMore || !nextQuestion

  return jsonResponse(200, {
    code: 200,
    data: {
      candidates,
      nextQuestion: isDone ? null : nextQuestion,
      done: isDone,
      round,
      // 最终结果（done 时才有意义）
      ...(isDone
        ? {
            result: {
              mainIssue: candidates[0]?.name || '未发现明显问题',
              candidates,
              summary: buildSummary(candidates)
            }
          }
        : {})
    }
  })
}

function buildSummary(candidates) {
  if (!candidates || candidates.length === 0) {
    return '根据您描述的症状，植物整体状态良好，建议继续保持日常养护。'
  }
  const top = candidates[0]
  let summary = `当前最可能的问题是「${top.name}」。`
  if (top.solutions?.length) {
    summary += `建议：${top.solutions.slice(0, 2).join('、')}。`
  }
  if (candidates.length > 1) {
    summary += `同时也要留意「${candidates[1].name}」。`
  }
  return summary
}

function createRuleDiagnoseRouteTable() {
  return {
    getRuleSymptoms: {
      match: path => path.includes('/rule-diagnose/symptoms'),
      handler: handleGetSymptoms
    },
    getRuleQuestions: {
      match: path => path.includes('/rule-diagnose/questions'),
      handler: handleGetQuestions
    },
    identifySymptoms: {
      match: path => path.includes('/rule-diagnose/identify-symptoms'),
      handler: handleIdentifySymptoms
    },
    matchSymptom: {
      match: path => path.includes('/rule-diagnose/match-symptom'),
      handler: handleMatchSymptom
    },
    ruleDiagnose: {
      match: path => path.includes('/rule-diagnose/diagnose'),
      handler: handleRuleDiagnose
    }
  }
}

module.exports = { createRuleDiagnoseRouteTable }
