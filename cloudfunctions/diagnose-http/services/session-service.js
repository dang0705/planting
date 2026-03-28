'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  fromResultId,
  toResultId,
  toProblemId
} = require('../mappers/public-id-mapper')

function buildSessionId() {
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function readRoundFromRationale(rationale) {
  const parsed = safeJsonParse(rationale, {}) || {}
  return Number(parsed.round || 1) || 1
}

function toPublicProblemId(problemValue = '') {
  const value = String(problemValue || '').trim()
  if (!value) return ''
  if (value.startsWith('p_')) return value
  return toProblemId(value)
}

async function upsertDiagnosisSession({
  sessionId,
  openid,
  plantContext,
  response,
  reliabilityScore = 0,
  mode = 'new_v13',
  image = '',
  description = ''
}) {
  const topRanking = Array.isArray(response?.rankings) ? response.rankings[0] : null
  const finalResult = response?.finalResult || null

  await models.$runSQL(
    `
      INSERT INTO diagnosis_sessions (
        diagnosis_id,
        _openid,
        user_plant_id,
        plant_id,
        diagnosis_mode,
        image_url,
        user_description,
        ai_summary,
        health_score,
        health_status,
        top_problem_key,
        top_problem_score,
        reliability_score,
        needs_follow_up,
        final_problem_key,
        final_problem_cn,
        treatment,
        prevention
      ) VALUES (
        {{diagnosisId}},
        {{openid}},
        {{userPlantId}},
        {{plantId}},
        {{diagnosisMode}},
        {{imageUrl}},
        {{userDescription}},
        {{aiSummary}},
        NULL,
        {{healthStatus}},
        {{topProblemKey}},
        {{topProblemScore}},
        {{reliabilityScore}},
        {{needsFollowUp}},
        {{finalProblemKey}},
        {{finalProblemCn}},
        {{treatment}},
        {{prevention}}
      )
      ON DUPLICATE KEY UPDATE
        diagnosis_mode = VALUES(diagnosis_mode),
        image_url = VALUES(image_url),
        user_description = VALUES(user_description),
        ai_summary = VALUES(ai_summary),
        health_status = VALUES(health_status),
        top_problem_key = VALUES(top_problem_key),
        top_problem_score = VALUES(top_problem_score),
        reliability_score = VALUES(reliability_score),
        needs_follow_up = VALUES(needs_follow_up),
        final_problem_key = VALUES(final_problem_key),
        final_problem_cn = VALUES(final_problem_cn),
        treatment = VALUES(treatment),
        prevention = VALUES(prevention),
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      diagnosisId: sessionId,
      openid,
      userPlantId: plantContext?.userPlantId || null,
      plantId: plantContext?.plantId || null,
      diagnosisMode: mode,
      imageUrl: image || '',
      userDescription: description || '',
      aiSummary: response?.topProblem?.summary || '',
      healthStatus: response?.topProblem ? 'warning' : 'unknown',
      topProblemKey: topRanking?.problemKey || null,
      topProblemScore: topRanking?.finalScore || null,
      reliabilityScore: Number(reliabilityScore || 0),
      needsFollowUp: response?.followUpRequired ? 1 : 0,
      finalProblemKey: finalResult?.problemId || topRanking?.problemKey || null,
      finalProblemCn: finalResult?.displayName || response?.topProblem?.displayName || null,
      treatment: response?.resultExplanation?.firstAid || '',
      prevention: response?.resultExplanation?.avoid || ''
    }
  )
}

async function replaceObservedSymptoms(sessionId, observedSymptoms = []) {
  await models.$runSQL(
    'DELETE FROM diagnosis_symptom_observations WHERE diagnosis_id = {{diagnosisId}}',
    { diagnosisId: sessionId }
  )

  const list = (Array.isArray(observedSymptoms) ? observedSymptoms : []).filter(item => item?.symptomKey)
  if (!list.length) return

  const values = list.map((item, index) => `(
    {{diagnosisId}},
    {{symptomKey_${index}}},
    {{symptomCn_${index}}},
    {{source_${index}}},
    1,
    {{confidence_${index}}}
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`symptomKey_${index}`] = item.symptomKey
    params[`symptomCn_${index}`] = item.symptomCn || item.symptomKey
    params[`source_${index}`] = item.source || 'mixed'
    params[`confidence_${index}`] = Number(item.confidence || 0)
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_symptom_observations (
        diagnosis_id,
        symptom_key,
        symptom_cn,
        evidence_source,
        observed,
        confidence
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function replaceProblemRankings(sessionId, rankings = []) {
  await models.$runSQL(
    'DELETE FROM diagnosis_problem_rankings WHERE diagnosis_id = {{diagnosisId}}',
    { diagnosisId: sessionId }
  )

  const list = (Array.isArray(rankings) ? rankings : []).filter(item => item?.problemKey)
  if (!list.length) return

  const values = list.map((item, index) => `(
    {{diagnosisId}},
    {{problemKey_${index}}},
    {{problemCn_${index}}},
    '',
    {{hostCompatibility_${index}}},
    {{supportScore_${index}}},
    {{evidenceCount_${index}}},
    {{weightedScore_${index}}},
    {{rankNo_${index}}},
    0
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`problemKey_${index}`] = item.problemKey
    params[`problemCn_${index}`] = item.problemCn || item.problemKey
    params[`hostCompatibility_${index}`] = Number(item.hostCompatibility || 0)
    params[`supportScore_${index}`] = Number(item.totalEvidence || 0)
    params[`evidenceCount_${index}`] = 0
    params[`weightedScore_${index}`] = Number(item.finalScore || 0)
    params[`rankNo_${index}`] = Number(item.rankNo || index + 1)
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_problem_rankings (
        diagnosis_id,
        problem_key,
        problem_cn,
        problem_type,
        host_compatibility,
        symptom_support_score,
        evidence_count,
        weighted_score,
        rank_no,
        is_decisive
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function appendFollowUpQuestions(sessionId, round, questions = []) {
  const list = (Array.isArray(questions) ? questions : []).filter(item => item?.questionKey)
  if (!list.length) return

  const values = list.map((item, index) => `(
    {{diagnosisId}},
    {{questionOrder_${index}}},
    {{questionKey_${index}}},
    {{questionText_${index}}},
    {{rationale_${index}}},
    0,
    0,
    'pending'
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`questionOrder_${index}`] = Number(index + 1)
    params[`questionKey_${index}`] = item.questionKey
    params[`questionText_${index}`] = item.text || item.questionText || ''
    params[`rationale_${index}`] = JSON.stringify({
      questionGroupKey: item.questionGroupKey || '',
      round: Number(round || 1)
    })
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_follow_ups (
        diagnosis_id,
        question_order,
        symptom_key,
        question_text,
        rationale,
        information_gain,
        asked,
        status
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function markFollowUpAnswers(sessionId, answers = []) {
  const list = (Array.isArray(answers) ? answers : []).filter(item => item?.questionKey && item?.optionKey)
  for (const answer of list) {
    const optionKey = String(answer.optionKey || '').toLowerCase()
    const status = optionKey === 'yes'
      ? 'confirmed'
      : optionKey === 'no'
        ? 'rejected'
        : 'skipped'

    const answerValue = optionKey === 'yes' ? 'yes' : optionKey === 'no' ? 'no' : 'unknown'

    await models.$runSQL(
      `
        UPDATE diagnosis_follow_ups
        SET
          asked = 1,
          answer_value = {{answerValue}},
          answer_confidence = 1,
          status = {{status}},
          answered_at = CURRENT_TIMESTAMP
        WHERE diagnosis_id = {{diagnosisId}}
          AND symptom_key = {{questionKey}}
          AND asked = 0
        ORDER BY id DESC
        LIMIT 1
      `,
      {
        diagnosisId: sessionId,
        questionKey: answer.questionKey,
        answerValue,
        status
      }
    )
  }
}

async function validateFollowUpAnswerOwnership(sessionId, answers = [], answerRound = 1) {
  const normalizedAnswers = (Array.isArray(answers) ? answers : [])
    .map(item => String(item?.questionKey || '').trim())
    .filter(Boolean)

  if (!normalizedAnswers.length) {
    return {
      ok: false,
      reason: 'missing_answers',
      invalidQuestionKeys: []
    }
  }

  const result = await models.$runSQL(
    `
      SELECT symptom_key, rationale
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY id ASC
    `,
    { diagnosisId: sessionId }
  )

  const allowed = new Set()
  for (const row of result?.data?.executeResultList || []) {
    const round = readRoundFromRationale(row.rationale)
    if (round === Number(answerRound || 1) && row.symptom_key) {
      allowed.add(row.symptom_key)
    }
  }

  const invalidQuestionKeys = normalizedAnswers.filter(key => !allowed.has(key))

  return {
    ok: invalidQuestionKeys.length === 0,
    reason: invalidQuestionKeys.length ? 'question_not_in_session_round' : '',
    invalidQuestionKeys
  }
}

async function getSessionState(openid, sessionId) {
  const sessionResult = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        user_plant_id,
        plant_id,
        needs_follow_up,
        created_at,
        updated_at
      FROM diagnosis_sessions
      WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { diagnosisId: sessionId, openid }
  )

  const session = sessionResult?.data?.executeResultList?.[0]
  if (!session) return null

  const followUpResult = await models.$runSQL(
    `
      SELECT
        symptom_key,
        status,
        asked,
        rationale,
        question_order,
        answer_value
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY id ASC
    `,
    { diagnosisId: sessionId }
  )

  const askedQuestionKeys = []
  const unknownStreakByGroup = {}
  let maxRound = 1

  for (const row of followUpResult?.data?.executeResultList || []) {
    const questionKey = row.symptom_key
    if (Number(row.asked || 0) === 1 && questionKey) {
      askedQuestionKeys.push(questionKey)
    }

    const rationale = safeJsonParse(row.rationale, {}) || {}
    const groupKey = rationale.questionGroupKey || '__default__'
    const round = Number(rationale.round || 1)
    if (round > maxRound) maxRound = round

    const answered = Number(row.asked || 0) === 1
    if (!answered) continue

    if (String(row.status || '').toLowerCase() === 'skipped') {
      unknownStreakByGroup[groupKey] = Number(unknownStreakByGroup[groupKey] || 0) + 1
    } else {
      unknownStreakByGroup[groupKey] = 0
    }
  }

  return {
    sessionId,
    userPlantId: session.user_plant_id || null,
    plantId: session.plant_id || null,
    askedQuestionKeys: Array.from(new Set(askedQuestionKeys)),
    unknownCountByGroup: unknownStreakByGroup,
    nextRound: maxRound + 1,
    hasPendingFollowUp: Number(session.needs_follow_up || 0) === 1
  }
}

async function getObservedSymptomsBySession(sessionId) {
  const result = await models.$runSQL(
    `
      SELECT symptom_key, symptom_cn, confidence, evidence_source
      FROM diagnosis_symptom_observations
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY confidence DESC, id ASC
    `,
    { diagnosisId: sessionId }
  )

  return (result?.data?.executeResultList || []).map(row => ({
    symptomKey: row.symptom_key,
    symptomCn: row.symptom_cn || row.symptom_key,
    confidence: Number(row.confidence || 0),
    source: row.evidence_source || 'history'
  }))
}

async function listDiagnosisHistory(openid, { plantId = null, page = 1, pageSize = 20 } = {}) {
  const limit = Math.max(1, Number(pageSize || 20))
  const currentPage = Math.max(1, Number(page || 1))
  const offset = (currentPage - 1) * limit

  const conditions = ['_openid = {{openid}}']
  const params = { openid, limit, offset }

  if (plantId) {
    conditions.push('user_plant_id = {{plantId}}')
    params.plantId = Number(plantId)
  }

  const whereSql = conditions.join(' AND ')

  const [listResult, countResult] = await Promise.all([
    models.$runSQL(
      `
        SELECT
          diagnosis_id,
          user_plant_id,
          final_problem_cn,
          top_problem_key,
          health_status,
          created_at
        FROM diagnosis_sessions
        WHERE ${whereSql}
        ORDER BY created_at DESC
        LIMIT {{limit}} OFFSET {{offset}}
      `,
      params
    ),
    models.$runSQL(
      `SELECT COUNT(*) AS total FROM diagnosis_sessions WHERE ${whereSql}`,
      params
    )
  ])

  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  const items = (listResult?.data?.executeResultList || []).map(row => ({
    historyId: row.diagnosis_id,
    resultId: toResultId(row.diagnosis_id, 1),
    createdAt: row.created_at,
    summary: {
      problemId: toPublicProblemId(row.top_problem_key),
      displayName: row.final_problem_cn || row.top_problem_key || '待确认',
      severity: row.health_status === 'danger' ? 'high' : 'medium'
    }
  }))

  return {
    items,
    page: currentPage,
    pageSize: limit,
    hasMore: offset + items.length < total
  }
}

async function getResultById(openid, { resultId = '', sessionId = '' } = {}) {
  const parsed = resultId ? fromResultId(resultId) : { sessionId: '', round: null }
  const finalSessionId = sessionId || parsed.sessionId || resultId
  if (!finalSessionId) return null

  const result = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        user_plant_id,
        plant_id,
        final_problem_key,
        final_problem_cn,
        ai_summary,
        treatment,
        prevention,
        created_at
      FROM diagnosis_sessions
      WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { diagnosisId: finalSessionId, openid }
  )

  const row = result?.data?.executeResultList?.[0]
  if (!row) return null

  return {
    resultId: resultId || toResultId(finalSessionId, parsed.round || 1),
    diagnosisSessionId: row.diagnosis_id,
    plantId: row.user_plant_id || row.plant_id,
    finalResult: {
      problemId: toPublicProblemId(row.final_problem_key),
      displayName: row.final_problem_cn || row.final_problem_key || '待确认',
      summary: row.ai_summary || '',
      severity: 'medium',
      urgency: 'medium'
    },
    explanation: {
      whyItHappens: row.ai_summary || '',
      whatToCheckNext: '',
      firstAid: row.treatment || '',
      avoid: row.prevention || ''
    },
    contributingFactors: [],
    intermediateStates: [],
    timeline: {
      createdAt: row.created_at
    }
  }
}

async function saveDiagnosisFeedback(openid, { resultId, feedback } = {}) {
  const parsed = fromResultId(resultId || '')
  const diagnosisId = parsed.sessionId || resultId

  try {
    await models.$runSQL(
      `
        INSERT INTO diagnosis_feedback (
          _openid,
          diagnosis_id,
          is_helpful,
          is_accurate,
          note
        ) VALUES (
          {{openid}},
          {{diagnosisId}},
          {{isHelpful}},
          {{isAccurate}},
          {{note}}
        )
      `,
      {
        openid,
        diagnosisId,
        isHelpful: feedback?.isHelpful ? 1 : 0,
        isAccurate: feedback?.isAccurate ? 1 : 0,
        note: feedback?.note || ''
      }
    )
  } catch (error) {
    console.warn('写入 diagnosis_feedback 失败（已降级忽略）:', error.message)
  }

  return { ok: true }
}

module.exports = {
  buildSessionId,
  upsertDiagnosisSession,
  replaceObservedSymptoms,
  replaceProblemRankings,
  appendFollowUpQuestions,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  getSessionState,
  getObservedSymptomsBySession,
  listDiagnosisHistory,
  getResultById,
  saveDiagnosisFeedback
}
