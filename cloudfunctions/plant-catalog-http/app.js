'use strict'

const { jsonResponse, notFound, methodNotAllowed, getHttpRequestData } = require('/opt/utils/http')
const {
  listPlantCatalog,
  getPlantCatalogById,
  findCanonicalPlantMatch
} = require('/opt/utils/plant-knowledge')

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/catalog/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (path.includes('/catalog/map')) {
      if (method !== 'GET') return methodNotAllowed(method)
      const keyword = request.query.keyword || ''
      const matches = await findCanonicalPlantMatch(keyword)
      return jsonResponse(200, { code: 200, data: { keyword, matches } })
    }

    if (path.includes('/catalog/plants')) {
      if (method !== 'GET') return methodNotAllowed(method)
      if (request.query.plantId) {
        const plant = await getPlantCatalogById(request.query.plantId)
        if (!plant) {
          return jsonResponse(404, { code: 404, message: '植物不存在', data: null })
        }
        return jsonResponse(200, { code: 200, data: plant })
      }

      const list = await listPlantCatalog({
        keyword: request.query.keyword || '',
        page: Number(request.query.page || 1),
        pageSize: Number(request.query.pageSize || request.query.limit || 10),
        offset: request.query.offset
      })
      return jsonResponse(200, { code: 200, data: list })
    }

    return notFound(path)
  } catch (error) {
    console.error('plant-catalog-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = main
