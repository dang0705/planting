const https = require('https')
const { getUserInfo } = require('/opt/utils/cloudbase')

const AK = 'sQuf9i4w0PGNqNn4QLkaT66Q'
const SK = '7PIOESfBc4GsMaJwYgoHuHBUU7v9bwUS'

// 腾讯云函数入口
exports.main = async (event, context) => {
  try {
    // 使用 CloudBase Node SDK 获取用户身份
    const userInfo = getUserInfo(context)
    const openid = userInfo.OPENID

    if (!openid) {
      return { code: 401, message: '请先登录', data: null }
    }

    const { imageUrl } = event

    if (!imageUrl) {
      return { code: 400, message: '缺少图片URL参数', data: null }
    }

    // 获取百度 Access Token
    const accessToken = await getAccessToken()

    // 调用百度植物识别 API
    const result = await recognizePlant(imageUrl, accessToken)

    return {
      code: 200,
      data: result,
      message: '识别成功'
    }
  } catch (error) {
    console.error('识别失败:', error)
    return {
      code: 500,
      message: error.message || '识别失败',
      data: null
    }
  }
}

/**
 * 使用 HTTPS 调用百度植物识别 API
 */
function recognizePlant(imageUrl, accessToken) {
  return new Promise((resolve, reject) => {
    // 使用 JSON 格式
    const postData = JSON.stringify({
      url: imageUrl,
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

      res.on('data', chunk => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.error_code) {
            reject(new Error(result.error_msg || '百度API调用失败'))
          } else {
            resolve(result)
          }
        } catch (e) {
          reject(new Error('解析响应失败'))
        }
      })
    })

    req.on('error', error => {
      reject(error)
    })

    req.write(postData)
    req.end()
  })
}

/**
 * 使用 AK，SK 生成鉴权签名（Access Token）
 */
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

      res.on('data', chunk => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.access_token) {
            resolve(result.access_token)
          } else {
            reject(new Error('获取Access Token失败'))
          }
        } catch (e) {
          reject(new Error('解析Access Token失败'))
        }
      })
    })

    req.on('error', error => {
      reject(error)
    })

    req.end()
  })
}
