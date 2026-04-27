'use strict'

const { models } = require('/opt/utils/cloudbase')

async function insertFollowUpQuestionsRows(sessionId, list = []) {
  if (!list.length) return

  const values = list.map((_, index) => `(
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
    params[`questionOrder_${index}`] = item.questionOrder
    params[`questionKey_${index}`] = item.questionKey
    params[`questionText_${index}`] = item.questionText
    params[`rationale_${index}`] = item.rationale
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

async function listFollowUpRows(sessionId) {
  const result = await models.$runSQL(
    `
      SELECT id, symptom_key, rationale, asked, question_order, question_text, answer_value, status
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY id ASC
    `,
    {
      diagnosisId: sessionId
    }
  )

  return result?.data?.executeResultList || []
}

async function markFollowUpAnswerRow({
  rowId,
  answerValue,
  answerConfidence,
  status
} = {}) {
  await models.$runSQL(
    `
      UPDATE diagnosis_follow_ups
      SET
        asked = 1,
        answer_value = {{answerValue}},
        answer_confidence = {{answerConfidence}},
        status = {{status}},
        answered_at = CURRENT_TIMESTAMP
      WHERE id = {{rowId}}
    `,
    {
      rowId,
      answerValue,
      answerConfidence,
      status
    }
  )
}

module.exports = {
  insertFollowUpQuestionsRows,
  listFollowUpRows,
  markFollowUpAnswerRow
}
