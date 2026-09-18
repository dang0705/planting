'use strict'

const { models } = require('./cloudbase')

const TEMPORARY_PLANT_IMAGE_IDS = new Set(['', 'temp', 'identify'])

function normalizeFileIds(fileIds) {
  const values = Array.isArray(fileIds) ? fileIds : []
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
}

function getRows(result) {
  return result?.data?.executeResultList || []
}

async function getOwnedPlantImage({ openid, fileId }) {
  const result = await models.$runSQL(
    `SELECT _id, _openid, plantId, fileId
     FROM plant_images
     WHERE _openid = {{openid}} AND fileId = {{fileId}}
     LIMIT 1`,
    { openid: String(openid || '').trim(), fileId: String(fileId || '').trim() }
  )
  return getRows(result)[0] || null
}

async function assertOwnedPlantImage({ openid, fileId }) {
  const image = await getOwnedPlantImage({ openid, fileId })
  if (!image) {
    const error = new Error('无权访问该图片')
    error.statusCode = 403
    throw error
  }
  return image
}

async function assertOwnedUserPlant({ openid, plantId }) {
  const result = await models.$runSQL(
    `SELECT id
     FROM user_plant_instances
     WHERE id = {{plantId}} AND _openid = {{openid}}
     LIMIT 1`,
    { openid: String(openid || '').trim(), plantId: Number(plantId) }
  )
  const plant = getRows(result)[0] || null
  if (!plant) {
    const error = new Error('未找到该植物或无权操作')
    error.statusCode = 403
    throw error
  }
  return plant
}

async function assertOwnedTemporaryPlantImages({ openid, fileIds }) {
  const normalizedFileIds = normalizeFileIds(fileIds)
  for (const fileId of normalizedFileIds) {
    const image = await assertOwnedPlantImage({ openid, fileId })
    if (!TEMPORARY_PLANT_IMAGE_IDS.has(String(image.plantId || '').trim())) {
      const error = new Error('图片已绑定到其他植物，不能重复使用')
      error.statusCode = 409
      throw error
    }
  }
  return normalizedFileIds
}

async function assertOwnedPlantImagesForPlant({ openid, plantId, fileIds }) {
  const normalizedPlantId = String(plantId || '').trim()
  const normalizedFileIds = normalizeFileIds(fileIds)
  const temporaryFileIds = []

  for (const fileId of normalizedFileIds) {
    const image = await assertOwnedPlantImage({ openid, fileId })
    const currentPlantId = String(image.plantId || '').trim()
    if (currentPlantId === normalizedPlantId) {
      continue
    }
    if (TEMPORARY_PLANT_IMAGE_IDS.has(currentPlantId)) {
      temporaryFileIds.push(fileId)
      continue
    }
    const error = new Error('图片已绑定到其他植物，不能重复使用')
    error.statusCode = 409
    throw error
  }

  return { fileIds: normalizedFileIds, temporaryFileIds }
}

async function bindOwnedTemporaryPlantImages({ openid, plantId, fileIds }) {
  const normalizedPlantId = Number(plantId)
  if (!normalizedPlantId) {
    return []
  }

  const normalizedFileIds = await assertOwnedTemporaryPlantImages({ openid, fileIds })
  if (!normalizedFileIds.length) {
    return []
  }

  await assertOwnedUserPlant({ openid, plantId: normalizedPlantId })
  for (const fileId of normalizedFileIds) {
    await models.$runSQL(
      `UPDATE plant_images
       SET plantId = {{plantId}}
       WHERE _openid = {{openid}}
         AND fileId = {{fileId}}
         AND plantId IN ('', 'temp', 'identify')`,
      {
        openid: String(openid || '').trim(),
        plantId: normalizedPlantId,
        fileId
      }
    )
  }
  return normalizedFileIds
}

module.exports = {
  TEMPORARY_PLANT_IMAGE_IDS,
  normalizeFileIds,
  getOwnedPlantImage,
  assertOwnedPlantImage,
  assertOwnedUserPlant,
  assertOwnedTemporaryPlantImages,
  assertOwnedPlantImagesForPlant,
  bindOwnedTemporaryPlantImages
}
