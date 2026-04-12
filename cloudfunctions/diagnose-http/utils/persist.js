'use strict'

const { models } = require('/opt/utils/cloudbase')
const { deductQuota } = require('/opt/utils/quota')

function toNullableDecimalString(value, digits = 6) {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num.toFixed(digits)
}

async function saveDiagnosisSession(plantId, openid, result, image, description, recordId) {
  const sql = `
    INSERT INTO diagnosis_sessions (
      diagnosis_id, _openid, user_plant_id, plant_id, diagnosis_mode, image_url,
      user_description, ai_summary, health_score, health_status, top_problem_key,
      top_problem_score, reliability_score, needs_follow_up, final_problem_key,
      final_problem_cn, treatment, prevention
    )
    SELECT
      {{diagnosisId}}, {{openid}}, up.id, up.plant_id, {{diagnosisMode}}, {{imageUrl}},
      {{userDescription}}, {{aiSummary}}, {{healthScore}}, {{healthStatus}}, {{topProblemKey}},
      CASE
        WHEN NULLIF({{topProblemScore}}, '') <=> NULL THEN NULL
        ELSE CAST({{topProblemScore}} AS DECIMAL(12,6))
      END,
      {{reliabilityScore}}, {{needsFollowUp}}, {{finalProblemKey}},
      {{finalProblemCn}}, {{treatment}}, {{prevention}}
    FROM user_plant_instances up
    WHERE up.id = {{userPlantId}} AND up._openid = {{openid}}
    LIMIT 1
  `

  await models.$runSQL(sql, {
    diagnosisId: recordId,
    openid,
    userPlantId: Number(plantId),
    diagnosisMode: result.diagnosisMode || 'quick',
    imageUrl: '',
    userDescription: description || '',
    aiSummary: result.summary || result.symptoms || '',
    healthScore: result.healthScore || null,
    healthStatus: result.healthStatus || null,
    topProblemKey: result.topProblemKey || result.finalProblemKey || null,
    topProblemScore: toNullableDecimalString(result.topProblemScore ?? null),
    reliabilityScore: result.reliabilityScore || null,
    needsFollowUp: result.needsFollowUp ? 1 : 0,
    finalProblemKey: result.finalProblemKey || result.topProblemKey || null,
    finalProblemCn: result.finalProblemCn || result.mainIssue || null,
    treatment: result.treatment || '',
    prevention: result.prevention || ''
  })
}

async function saveDiagnosisSymptomObservations(result, recordId) {
  const observations = Array.isArray(result.observedSymptoms) ? result.observedSymptoms : []
  if (!observations.length) {
    return
  }

  const safeObservations = observations.filter(item => item?.symptomKey)
  if (!safeObservations.length) {
    return
  }

  const values = safeObservations.map((item, index) => `(
      {{diagnosisId}},
      {{symptomKey_${index}}},
      {{symptomCn_${index}}},
      {{evidenceSource_${index}}},
      1,
      {{confidence_${index}}}
    )`)

  const params = { diagnosisId: recordId }
  safeObservations.forEach((item, index) => {
    params[`symptomKey_${index}`] = item.symptomKey
    params[`symptomCn_${index}`] = item.symptomCn || item.symptomKey
    params[`evidenceSource_${index}`] = item.evidenceSource || 'llm'
    params[`confidence_${index}`] = Number(item.confidence || 0)
  })

  const sql = `
    INSERT INTO diagnosis_symptom_observations (
      diagnosis_id, symptom_key, symptom_cn, evidence_source, observed, confidence
    ) VALUES ${values.join(', ')}
  `
  await models.$runSQL(sql, params)
}

async function saveDiagnosisProblemRankings(result, recordId) {
  const rankings = Array.isArray(result.rankings) ? result.rankings : []
  if (!rankings.length) {
    return
  }

  const safeRankings = rankings.filter(item => item?.problemKey)
  if (!safeRankings.length) {
    return
  }

  const values = safeRankings.map((item, index) => `(
      {{diagnosisId}},
      {{problemKey_${index}}},
      {{problemCn_${index}}},
      {{problemType_${index}}},
      {{hostCompatibility_${index}}},
      {{symptomSupportScore_${index}}},
      {{evidenceCount_${index}}},
      {{weightedScore_${index}}},
      {{rankNo_${index}}},
      {{isDecisive_${index}}}
    )`)

  const params = { diagnosisId: recordId }
  safeRankings.forEach((item, index) => {
    params[`problemKey_${index}`] = item.problemKey
    params[`problemCn_${index}`] = item.problemCn || item.problemKey
    params[`problemType_${index}`] = item.problemType || ''
    params[`hostCompatibility_${index}`] = Number(item.hostCompatibility || 0)
    params[`symptomSupportScore_${index}`] = Number(item.symptomSupportScore || 0)
    params[`evidenceCount_${index}`] = Number(item.evidenceCount || 0)
    params[`weightedScore_${index}`] = Number(item.weightedScore || 0)
    params[`rankNo_${index}`] = Number(item.rankNo || 0)
    params[`isDecisive_${index}`] = item.isDecisive ? 1 : 0
  })

  const sql = `
    INSERT INTO diagnosis_problem_rankings (
      diagnosis_id, problem_key, problem_cn, problem_type, host_compatibility,
      symptom_support_score, evidence_count, weighted_score, rank_no, is_decisive
    ) VALUES ${values.join(', ')}
  `
  await models.$runSQL(sql, params)
}

async function saveDiagnosisFollowUps(result, recordId) {
  const followUps = Array.isArray(result.followUps) ? result.followUps : []
  if (!followUps.length) {
    return
  }

  const safeFollowUps = followUps.filter(item => item?.symptomKey)
  if (!safeFollowUps.length) {
    return
  }

  const values = safeFollowUps.map((item, index) => `(
      {{diagnosisId}},
      {{questionOrder_${index}}},
      {{symptomKey_${index}}},
      {{questionText_${index}}},
      {{rationale_${index}}},
      {{informationGain_${index}}},
      0,
      'pending'
    )`)

  const params = { diagnosisId: recordId }
  safeFollowUps.forEach((item, index) => {
    params[`questionOrder_${index}`] = Number(item.questionOrder || index + 1)
    params[`symptomKey_${index}`] = item.symptomKey
    params[`questionText_${index}`] = item.questionText || ''
    params[`rationale_${index}`] = item.rationale || ''
    params[`informationGain_${index}`] = Number(item.informationGain || 0)
  })

  const sql = `
    INSERT INTO diagnosis_follow_ups (
      diagnosis_id, question_order, symptom_key, question_text, rationale,
      information_gain, asked, status
    ) VALUES ${values.join(', ')}
  `
  await models.$runSQL(sql, params)
}

async function saveFollowUpAnswers(sourceDiagnosisId, followUpAnswers = []) {
  const safeAnswers = (Array.isArray(followUpAnswers) ? followUpAnswers : []).filter(
    item => item?.symptomKey && item?.answerValue
  )
  if (!sourceDiagnosisId || !safeAnswers.length) {
    return
  }

  for (const item of safeAnswers) {
    await models.$runSQL(
      `
        UPDATE diagnosis_follow_ups
        SET
          asked = 1,
          answer_value = {{answerValue}},
          answer_confidence = {{answerConfidence}},
          status = {{status}},
          answered_at = CURRENT_TIMESTAMP
        WHERE diagnosis_id = {{diagnosisId}} AND symptom_key = {{symptomKey}}
      `,
      {
        diagnosisId: sourceDiagnosisId,
        symptomKey: item.symptomKey,
        answerValue: item.answerValue,
        answerConfidence: Number(item.answerConfidence || 0),
        status: item.answerValue === 'yes' ? 'confirmed' : item.answerValue === 'no' ? 'rejected' : 'skipped'
      }
    )
  }
}

async function persistDiagnosisSideEffects({
  recordId,
  plantId,
  openid,
  result,
  image,
  description,
  sourceDiagnosisId = null,
  followUpAnswers = [],
  skipQuotaDeduction = false
}) {
  if (sourceDiagnosisId && followUpAnswers.length) {
    await saveFollowUpAnswers(sourceDiagnosisId, followUpAnswers)
  }

  await saveDiagnosisSession(plantId, openid, result, image, description, recordId)

  const tasks = [
    saveDiagnosisSymptomObservations(result, recordId),
    saveDiagnosisProblemRankings(result, recordId),
    saveDiagnosisFollowUps(result, recordId)
  ]
  if (!skipQuotaDeduction) {
    tasks.push(deductQuota(openid, 'diagnose'))
  }

  const settled = await Promise.allSettled(tasks)

  if (settled[0].status === 'rejected') {
    console.warn('写入诊断症状观测失败:', settled[0].reason?.message || settled[0].reason)
  }
  if (settled[1].status === 'rejected') {
    console.warn('写入诊断候选排序失败:', settled[1].reason?.message || settled[1].reason)
  }
  if (settled[2].status === 'rejected') {
    console.warn('写入诊断追问失败:', settled[2].reason?.message || settled[2].reason)
  }
  if (!skipQuotaDeduction && settled[3]?.status === 'rejected') {
    console.warn('扣减配额失败:', settled[3].reason?.message || settled[3].reason)
  }

  return recordId
}

module.exports = {
  persistDiagnosisSideEffects
}
