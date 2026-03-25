import { BASE_URL } from '@/api/env'
import { getCloudbaseAccessToken } from '@/utils/cloudbase-auth'

function buildQueryString(query = {}) {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (!entries.length) return ''
  const search = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return `?${search}`
}

function getStoredUserOpenId() {
  try {
    const rawUser = uni.getStorageSync('user')
    const user =
      typeof rawUser === 'string'
        ? (() => {
            try {
              return JSON.parse(rawUser)
            } catch (error) {
              return {}
            }
          })()
        : rawUser || {}
    return user.openid || user.wechat_openid || ''
  } catch (error) {
    return ''
  }
}

export async function requestHttpFunction(functionPath, { method = 'GET', query, body, auth = true } = {}) {
  const queryString = buildQueryString(query)
  const joiner = queryString ? '&' : '?'
  const url = `${BASE_URL}/${functionPath}${queryString}${joiner}webfn=true`
  const token = auth ? await getCloudbaseAccessToken() : ''
  const openid = getStoredUserOpenId()

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: body,
      header: {
        'Content-Type': 'application/json',
        ...(openid ? { 'x-wx-openid': openid, 'x-openid': openid } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        reject(new Error(res.data?.message || `HTTP ${res.statusCode}`))
      },
      fail: reject
    })
  })
}
