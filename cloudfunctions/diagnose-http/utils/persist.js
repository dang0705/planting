'use strict'

const { models } = require('/opt/utils/cloudbase')
const { deductQuota } = require('/opt/utils/quota')

async function saveDiagnoseRecord(plantId, openid, result, image, description, recordId) {
  const now = Date.now()

  const sql = `
    INSERT INTO diagnose_records (
      _id, _openid, plantId, healthScore, healthStatus,
      mainIssue, symptoms, treatment, prevention,
      imageUrl, description, createdAt, updatedAt
    ) VALUES (
      {{recordId}}, {{openid}}, {{plantId}}, {{healthScore}}, {{healthStatus}},
      {{mainIssue}}, {{symptoms}}, {{treatment}}, {{prevention}},
      {{imageUrl}}, {{description}}, {{createdAt}}, {{updatedAt}}
    )
  `

  await models.$runSQL(sql, {
    recordId,
    openid,
    plantId,
    healthScore: result.healthScore,
    healthStatus: result.healthStatus,
    mainIssue: result.mainIssue,
    symptoms: result.symptoms,
    treatment: result.treatment,
    prevention: result.prevention,
    imageUrl: image || '',
    description: description || '',
    createdAt: now,
    updatedAt: now
  })

  return recordId
}

async function updatePlantHealthFromDiagnosis(plantId, openid, result) {
  const now = Date.now()
  const sql = `
    UPDATE plants
    SET health_score = {{healthScore}},
        health_status = {{healthStatus}},
        updatedAt = {{updatedAt}},
        updateBy = {{updateBy}}
    WHERE _id = {{plantId}}
  `

  await models.$runSQL(sql, {
    healthScore: result.healthScore,
    healthStatus: result.healthStatus,
    updatedAt: now,
    updateBy: openid,
    plantId
  })
}

async function persistDiagnosisSideEffects({ recordId, plantId, openid, result, image, description }) {
  const tasks = [
    saveDiagnoseRecord(plantId, openid, result, image, description, recordId),
    updatePlantHealthFromDiagnosis(plantId, openid, result),
    deductQuota(openid, 'diagnose')
  ]

  const settled = await Promise.allSettled(tasks)
  const saveResult = settled[0]
  if (saveResult.status !== 'fulfilled') {
    throw saveResult.reason
  }

  if (settled[1].status === 'rejected') {
    console.warn('更新植物健康状态失败:', settled[1].reason?.message || settled[1].reason)
  }
  if (settled[2].status === 'rejected') {
    console.warn('扣减配额失败:', settled[2].reason?.message || settled[2].reason)
  }

  return recordId
}

module.exports = {
  persistDiagnosisSideEffects
}

