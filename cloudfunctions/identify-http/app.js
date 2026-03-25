'use strict'

const https = require('https')
const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveHttpUserInfo
} = require('/opt/utils/http')
const { findCanonicalPlantMatch, recordIdentifySession } = require('/opt/utils/plant-knowledge')

const AK = process.env.BAIDU_AK || 'UGqylU0BgWoCLd8PfnH6pxpl'
const SK = process.env.BAIDU_SK || 'NVCAG44tKAfXmVn0BrRHDVFnJDAQRt0x'

function pickPlantMatchFields(plant) {
  if (!plant) return null
  return {
    id: plant.id || '',
    canonicalName: plant.canonicalName || '',
    matchAlias: plant.matchAlias || '',
    internetName: plant.internetName || ''
  }
}

function buildIdentifyId() {
  return `identify_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function processBaiduResult(baiduData) {
  const ingredientResults = baiduData?.result?.ingredient?.result || []
  const plantResults = baiduData?.result?.plant?.result || []

  if (ingredientResults.length === 0 && plantResults.length === 0) {
    return {
      valid: false,
      message: '识别失败，请重新上传图片'
    }
  }

  const topIngredient = ingredientResults[0] || { name: '', score: 0 }
  const topPlant = plantResults[0] || { name: '', score: 0 }
  const isIngredientNon = topIngredient.name === '非果蔬食材'
  const isPlantNon = topPlant.name === '非植物'

  if (isIngredientNon && isPlantNon) {
    return {
      valid: false,
      message: '无法识别，请上传清晰的植物或果蔬图片'
    }
  }

  if (isIngredientNon && !isPlantNon) {
    return {
      valid: true,
      data: {
        result: plantResults,
        type: 'plant',
        log_id: baiduData.log_id
      }
    }
  }

  if (isPlantNon && !isIngredientNon) {
    return {
      valid: true,
      data: {
        result: ingredientResults,
        type: 'ingredient',
        log_id: baiduData.log_id
      }
    }
  }

  return topIngredient.score > topPlant.score
    ? {
        valid: true,
        data: {
          result: ingredientResults,
          type: 'ingredient',
          log_id: baiduData.log_id
        }
      }
    : {
        valid: true,
        data: {
          result: plantResults,
          type: 'plant',
          log_id: baiduData.log_id
        }
      }
}

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'aip.baidubce.com',
      port: 443,
      path: `/oauth/2.0/token?grant_type=client_credentials&client_id=${AK}&client_secret=${SK}`,
      method: 'POST'
    }

    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.access_token) {
            resolve(result.access_token)
            return
          }
          reject(new Error('获取百度 access token 失败'))
        } catch (error) {
          reject(new Error('解析百度 access token 失败'))
        }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

function recognizePlant(imageUrl, accessToken) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      imgUrl: imageUrl,
      scenes: ['plant', 'ingredient']
    })

    const options = {
      hostname: 'aip.baidubce.com',
      port: 443,
      path: `/api/v1/solution/direct/imagerecognition/combination?access_token=${accessToken}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
        Accept: 'application/json'
      }
    }

    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.error_code) {
            reject(new Error(result.error_msg || '百度识别失败'))
            return
          }
          resolve(result)
        } catch (error) {
          reject(new Error('解析百度识别响应失败'))
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/identify/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (!path.includes('/identify/plant')) {
      return notFound(path)
    }

    if (!['GET', 'POST'].includes(method)) {
      return methodNotAllowed(method)
    }

    const payload = method === 'GET' ? request.query : request.body
    const userInfo = await resolveHttpUserInfo(request.headers, request.query, context)
    if (!userInfo?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }

    const imageUrl = payload.imageUrl
    if (!imageUrl) {
      return jsonResponse(400, { code: 400, message: '缺少图片 URL', data: null })
    }

    const accessToken = await getAccessToken()
    const baiduResult = await recognizePlant(imageUrl, accessToken)
    const processed = processBaiduResult(baiduResult)
    if (!processed.valid) {
      return jsonResponse(400, { code: 400, message: processed.message, data: null })
    }

    const topResult = processed.data.result?.[0] || {}
    const matches = await findCanonicalPlantMatch(topResult.name || '')
    const matchedPlant = matches[0] || null
    const simplifiedMatchedPlant = pickPlantMatchFields(matchedPlant)
    const simplifiedCandidates = matches.map(pickPlantMatchFields).filter(Boolean)
    const identifyId = buildIdentifyId()

    await recordIdentifySession({
      identifyId,
      openid: userInfo.openid,
      imageUrl,
      recognizedName: topResult.name || '',
      recognizedType: processed.data.type || 'plant',
      confidence: topResult.score || 0,
      canonicalPlantId: simplifiedMatchedPlant?.id || null,
      matchType: matchedPlant?.matchType || null,
      rawPayload: baiduResult,
      candidateMatches: simplifiedCandidates
    })

    return jsonResponse(200, {
      code: 200,
      data: {
        sessionId: identifyId,
        name: simplifiedMatchedPlant?.canonicalName || topResult.name || '未知植物',
        confidence: topResult.score || 0,
        type: processed.data.type || 'plant',
        matchedPlant: simplifiedMatchedPlant,
        candidates: simplifiedCandidates,
        raw: processed.data
      }
    })
  } catch (error) {
    console.error('identify-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = main
