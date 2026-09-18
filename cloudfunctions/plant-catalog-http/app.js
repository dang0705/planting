'use strict'

const {
  jsonResponse,
  internalServerError,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const {
  listPlantCatalog,
  getPlantCatalogById,
  findCanonicalPlantMatch
} = require('/opt/utils/plant-knowledge')
let cloudbaseUtils
let catalogImageUrlUtils
try {
  cloudbaseUtils = require('/opt/utils/cloudbase')
} catch {
  cloudbaseUtils = require('../layer/utils/cloudbase')
}
try {
  // 部署脚本把这一份受审计的共享实现放进函数包，避免远端 Layer 版本滞后。
  catalogImageUrlUtils = require('./catalog-image-url')
} catch {
  catalogImageUrlUtils = require('../layer/utils/catalog-image-url')
}
const { getCloudBase } = cloudbaseUtils
const {
  collectCatalogImageRefs,
  isRestrictedCatalogPlatform,
  mapCatalogPlantsForPlatform,
  resolveCatalogImageUrls
} = catalogImageUrlUtils

const CATALOG_IMAGE_URL_BATCH_LIMIT = 50

async function resolveCatalogImageUrlBatch(rawFileIds) {
  const requestedItems = (Array.isArray(rawFileIds) ? rawFileIds : []).map(imageFileId => ({
    imageFileId
  }))
  const fileIds = collectCatalogImageRefs(requestedItems)
  if (!fileIds.length) {
    return []
  }
  if (fileIds.length > CATALOG_IMAGE_URL_BATCH_LIMIT) {
    const error = new Error(`单次最多解析 ${CATALOG_IMAGE_URL_BATCH_LIMIT} 张目录图片`)
    error.statusCode = 400
    throw error
  }
  const imageUrls = await resolveCatalogImageUrls(
    fileIds.map(imageFileId => ({ imageFileId })),
    { app: getCloudBase() }
  )
  return fileIds.map(fileId => ({
    fileId,
    imageUrl: String(imageUrls.get(fileId) || '').trim()
  }))
}

async function adaptCatalogResponseForPlatform(payload, platform) {
  if (!payload || !isRestrictedCatalogPlatform(platform)) {
    return payload
  }

  const items = Array.isArray(payload?.list) ? payload.list : [payload]
  let imageUrls = new Map()
  try {
    imageUrls = await resolveCatalogImageUrls(items, { app: getCloudBase() })
  } catch (error) {
    // 图片地址解析失败不应让植物文字目录整体不可用。
    console.error('catalog image URL resolve failed:', {
      message: String(error?.message || error || '')
    })
  }

  if (Array.isArray(payload?.list)) {
    return {
      ...payload,
      list: mapCatalogPlantsForPlatform(payload.list, { platform, imageUrls })
    }
  }
  return mapCatalogPlantsForPlatform(payload, { platform, imageUrls })
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/catalog/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (path.includes('/catalog/image-urls')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const list = await resolveCatalogImageUrlBatch(request.body.fileIds)
      return jsonResponse(200, { code: 200, data: { list } })
    }

    if (path.includes('/catalog/map')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const keyword = request.query.keyword || ''
      const matches = await findCanonicalPlantMatch(keyword)
      return jsonResponse(200, { code: 200, data: { keyword, matches } })
    }

    if (path.includes('/catalog/plants')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      if (request.query.plantId) {
        const plant = await getPlantCatalogById(request.query.plantId)
        if (!plant) {
          return jsonResponse(404, { code: 404, message: '植物不存在', data: null })
        }
        const data = await adaptCatalogResponseForPlatform(plant, request.query.platform)
        return jsonResponse(200, { code: 200, data })
      }

      const list = await listPlantCatalog({
        keyword: request.query.keyword || '',
        page: Number(request.query.page || 1),
        pageSize: Number(request.query.pageSize || request.query.limit || 10),
        offset: request.query.offset
      })
      const data = await adaptCatalogResponseForPlatform(list, request.query.platform)
      return jsonResponse(200, { code: 200, data })
    }

    return notFound(path)
  } catch (error) {
    console.error('plant-catalog-http error:', error)
    if (Number(error?.statusCode) === 400) {
      return jsonResponse(400, { code: 400, message: error.message, data: null })
    }
    return internalServerError('植物目录暂时不可用，请稍后重试')
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
