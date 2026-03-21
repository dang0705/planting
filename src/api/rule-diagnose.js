import { useUserStore } from '@/store/user'
import { BASE_URL } from '@/api/env'
import { getCloudbaseAccessToken } from '@/utils/cloudbase-auth'

const RULE_DIAGNOSE_BASE = `${BASE_URL}/diagnose-http`

function buildHeaders() {
  const userStore = useUserStore()
  const openid = userStore.openid || ''
  const token = userStore.token || ''
  const header = {
    'Content-Type': 'application/json'
  }

  if (token) header.Authorization = `Bearer ${token}`
  if (openid) {
    header['x-openid'] = openid
    header['x-wx-openid'] = openid
  }

  return header
}

function shouldRefreshToken(statusCode, responseData) {
  const message = String(responseData?.message || responseData?.error || '').toLowerCase()
  return (
    statusCode === 401 ||
    statusCode === 403 ||
    message.includes('token') ||
    message.includes('登录')
  )
}

async function refreshDiagnoseToken() {
  const userStore = useUserStore()
  const nextToken = await getCloudbaseAccessToken({ forceRefresh: true })
  userStore.token = nextToken || ''
  return nextToken
}

function doRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${RULE_DIAGNOSE_BASE}${path}?webfn=true`,
      method,
      header: buildHeaders(),
      data: data || undefined,
      success: resolve,
      fail: err => reject(new Error(err.errMsg || '网络请求失败'))
    })
  })
}

async function request(path, method = 'GET', data = null, options = {}) {
  const retryAuth = options.retryAuth !== false
  const response = await doRequest(path, method, data)
  const responseData = response.data

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return responseData
  }

  if (retryAuth && shouldRefreshToken(response.statusCode, responseData)) {
    await refreshDiagnoseToken()
    return request(path, method, data, { retryAuth: false })
  }

  throw new Error(responseData?.message || `请求失败(${response.statusCode})`)
}

export async function getSymptomCategories() {
  const res = await request('/rule-diagnose/symptoms', 'GET')
  return res?.data?.symptomCategories || []
}

export async function identifySymptoms(imageUrl, options = {}) {
  const res = await request('/rule-diagnose/identify-symptoms', 'POST', {
    image: imageUrl,
    filterLowScoreSymptoms: options.filterLowScoreSymptoms === true
  })
  if (res?.code !== 200) {
    throw new Error(res?.message || '症状识别失败')
  }
  return {
    symptoms: res.data?.symptoms || [],
    symptomTags: res.data?.symptomTags || [],
    evidence: res.data?.evidence || {
      symptoms: [],
      signs: [],
      pests: []
    }
  }
}

export async function matchCustomSymptom({ categoryId, text, allowAI = false }) {
  const res = await request('/rule-diagnose/match-symptom', 'POST', {
    categoryId,
    text,
    allowAI
  })
  if (res?.code !== 200) {
    throw new Error(res?.message || '症状匹配失败')
  }
  return res.data || {}
}

export async function runRuleDiagnose(
  symptoms,
  conditions = {},
  round = 0,
  symptomMatches = {},
  options = {}
) {
  const res = await request('/rule-diagnose/diagnose', 'POST', {
    symptoms,
    conditions,
    round,
    symptomMatches,
    plantName: options.plantName || '',
    plantGroup: options.plantGroup || ''
  })
  if (res?.code !== 200) {
    throw new Error(res?.message || '诊断请求失败')
  }
  return res.data
}
