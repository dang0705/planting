'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  getPlantCatalogById,
  getUserPlantInstanceById
} = require('/opt/utils/plant-knowledge')
const { table } = require('../db/table-helper')
const {
  priorCache,
  pendingPriorCache,
  getCacheEntry,
  setCacheEntry,
  withPending,
  normalizeCareStrategy
} = require('./prior-cache')

async function getGenusCareProfile(genusName = '', familyName = '') {
  const safeGenusName = String(genusName || '').trim()
  if (!safeGenusName) {return null}
  const cacheKey = `${safeGenusName}::${String(familyName || '').trim()}`
  const cached = getCacheEntry(priorCache.genusCareProfileByGenusFamily, cacheKey)
  if (cached) {return cached}

  return withPending(pendingPriorCache.genusCareProfileByGenusFamily, cacheKey, async () => {
    const cachedAfterWait = getCacheEntry(priorCache.genusCareProfileByGenusFamily, cacheKey)
    if (cachedAfterWait) {return cachedAfterWait}

    const conditions = ['genus_name = {{genusName}}', 'is_active = 1']
    const params = { genusName: safeGenusName }
    if (String(familyName || '').trim()) {
      conditions.push('family_name_canonical = {{familyName}}')
      params.familyName = String(familyName || '').trim()
    }

    const result = await models.$runSQL(
      `
        SELECT
          CAST(watering_strategy_json AS CHAR) AS watering_strategy_json_text,
          CAST(fertilizing_strategy_json AS CHAR) AS fertilizing_strategy_json_text,
          CAST(light_strategy_json AS CHAR) AS light_strategy_json_text,
          CAST(airflow_strategy_json AS CHAR) AS airflow_strategy_json_text,
          temp_min_c,
          temp_max_c,
          humidity_min,
          humidity_max,
          review_status,
          evidence_level
        FROM ${table('genus_care_profiles')}
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          FIELD(review_status, 'audited', 'reviewed', 'pending'),
          updated_at DESC
        LIMIT 1
      `,
      params
    )

    const row = result?.data?.executeResultList?.[0] || null
    if (!row) {return null}
    const careProfile = {
      watering: normalizeCareStrategy(row.watering_strategy_json_text),
      fertilization: normalizeCareStrategy(row.fertilizing_strategy_json_text),
      sunning: normalizeCareStrategy(row.light_strategy_json_text),
      ventilation: normalizeCareStrategy(row.airflow_strategy_json_text),
      temperatureMin: row.temp_min_c === null || row.temp_min_c === undefined ? null : Number(row.temp_min_c),
      temperatureMax: row.temp_max_c === null || row.temp_max_c === undefined ? null : Number(row.temp_max_c),
      humidityMin: row.humidity_min === null || row.humidity_min === undefined ? null : Number(row.humidity_min),
      humidityMax: row.humidity_max === null || row.humidity_max === undefined ? null : Number(row.humidity_max),
      careAuditStatus: row.review_status || '',
      varianceLevel: row.evidence_level || ''
    }
    setCacheEntry(priorCache.genusCareProfileByGenusFamily, cacheKey, careProfile)
    return careProfile
  })
}

function buildResolvedPlantContext({
  userPlant = null,
  plant = null,
  plantId = null,
  careProfile = null
} = {}) {
  const normalizedPlantWatering = normalizeCareStrategy(plant?.watering || userPlant?.watering || null)
  const normalizedPlantFertilization = normalizeCareStrategy(plant?.fertilization || userPlant?.fertilization || null)
  const normalizedPlantSunning = normalizeCareStrategy(plant?.sunning || userPlant?.sunning || null)
  const normalizedPlantVentilation = normalizeCareStrategy(plant?.ventilation || userPlant?.ventilation || null)
  const resolvedPlantId =
    plant?.plantId ||
    userPlant?.plantId ||
    userPlant?.legacyPlantId ||
    (plantId !== null && plantId !== undefined ? String(plantId) : '')
  const resolvedPlantIdentityId = plant?.plantIdentityId || userPlant?.plantIdentityId || ''
  const resolvedIdentityStatus =
    userPlant?.identityResolutionStatus ||
    (resolvedPlantIdentityId ? 'matched' : 'unresolved')
  const resolvedDisplayName =
    userPlant?.displayName ||
    userPlant?.canonicalName ||
    userPlant?.recognizedName ||
    plant?.canonicalName ||
    '未知植物'

  return {
    userPlantId: userPlant ? Number(userPlant.id) : null,
    plantId: resolvedPlantId || null,
    plantDisplayName: resolvedDisplayName,
    plantIdentityId: resolvedPlantIdentityId,
    legacyPlantId: plant?.legacyPlantId || userPlant?.legacyPlantId || '',
    identityResolutionStatus: resolvedIdentityStatus,
    latestVisualCallBatchId: userPlant?.visualCallBatchId || '',
    recognizedName: userPlant?.recognizedName || '',
    sourceType: userPlant?.sourceType || '',
    recognitionType: userPlant?.recognitionType || '',
    recognitionConfidence:
      userPlant?.recognitionConfidence === null || userPlant?.recognitionConfidence === undefined
        ? null
        : Number(userPlant.recognitionConfidence),
    genus: plant?.genus || userPlant?.genus || '',
    family: plant?.familyEn || userPlant?.familyEn || '',
    category: plant?.categoryCn || plant?.categoryEn || '',
    watering: normalizedPlantWatering || careProfile?.watering || null,
    fertilization: normalizedPlantFertilization || careProfile?.fertilization || null,
    sunning: normalizedPlantSunning || careProfile?.sunning || null,
    ventilation: normalizedPlantVentilation || careProfile?.ventilation || null,
    temperatureMin:
      plant?.temperatureMin === null || plant?.temperatureMin === undefined
        ? careProfile?.temperatureMin ?? null
        : Number(plant.temperatureMin),
    temperatureMax:
      plant?.temperatureMax === null || plant?.temperatureMax === undefined
        ? careProfile?.temperatureMax ?? null
        : Number(plant.temperatureMax),
    humidityMin:
      plant?.humidityMin === null || plant?.humidityMin === undefined
        ? careProfile?.humidityMin ?? null
        : Number(plant.humidityMin),
    humidityMax:
      plant?.humidityMax === null || plant?.humidityMax === undefined
        ? careProfile?.humidityMax ?? null
        : Number(plant.humidityMax),
    careAuditStatus: plant?.careAuditStatus || careProfile?.careAuditStatus || '',
    varianceLevel: plant?.varianceLevel || careProfile?.varianceLevel || ''
  }
}

async function resolvePlantContext({ openid, plantId = null, userPlantId = null } = {}) {
  const candidateUserPlantId = userPlantId || plantId

  if (candidateUserPlantId !== null && candidateUserPlantId !== undefined && candidateUserPlantId !== '') {
    const userPlant = await getUserPlantInstanceById(openid, Number(candidateUserPlantId))
    if (userPlant) {
      const catalogLookupId = userPlant.plantIdentityId || userPlant.legacyPlantId || userPlant.plantId || ''
      const plant = catalogLookupId ? await getPlantCatalogById(String(catalogLookupId)) : null
      const careProfile = await getGenusCareProfile(plant?.genus || userPlant?.genus || '', plant?.familyEn || userPlant?.familyEn || '')
      console.log('diagnose-http plant-context resolved from userPlant:', {
        catalogLookupId,
        genus: plant?.genus || userPlant?.genus || '',
        family: plant?.familyEn || userPlant?.familyEn || '',
        plantHasWatering: Boolean(normalizeCareStrategy(plant?.watering || null)),
        careProfileHasWatering: Boolean(careProfile?.watering),
        careProfileHasLight: Boolean(careProfile?.sunning)
      })
      return buildResolvedPlantContext({ userPlant, plant, careProfile })
    }
  }

  if (!plantId) {
    throw new Error('缺少 plantId 或 userPlantId')
  }

  const plant = await getPlantCatalogById(String(plantId))
  if (!plant) {
    throw new Error('植物不存在或无权限访问')
  }

  const careProfile = await getGenusCareProfile(plant?.genus || '', plant?.familyEn || '')
  console.log('diagnose-http plant-context resolved from catalog:', {
    plantId: String(plantId),
    genus: plant?.genus || '',
    family: plant?.familyEn || '',
    plantHasWatering: Boolean(normalizeCareStrategy(plant?.watering || null)),
    careProfileHasWatering: Boolean(careProfile?.watering),
    careProfileHasLight: Boolean(careProfile?.sunning)
  })
  return buildResolvedPlantContext({ plant, plantId, careProfile })
}

module.exports = {
  resolvePlantContext
}
