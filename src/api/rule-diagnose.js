import { useUserStore } from '@/store/user'
import { BASE_URL } from '@/api/env'

const RULE_DIAGNOSE_BASE = `${BASE_URL}/diagnose-http`

/**
 * 发起 HTTP 请求到规则诊断接口（小程序兼容，无 URLSearchParams）
 */
function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const userStore = useUserStore()
    const openid = userStore.openid || ''
    const token = userStore.token || ''

    const url = `${RULE_DIAGNOSE_BASE}${path}?webfn=true`

    const header = {
      'Content-Type': 'application/json'
    }
    if (token) header['Authorization'] = `Bearer ${token}`
    if (openid) {
      header['x-openid'] = openid
      header['x-wx-openid'] = openid
    }

    wx.request({
      url,
      method,
      header,
      data: data || undefined,
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(res.data?.message || `请求失败(${res.statusCode})`))
        }
      },
      fail: err => reject(new Error(err.errMsg || '网络请求失败'))
    })
  })
}

/**
 * 获取所有症状分类
 * @returns {Promise<Array>} symptomCategories
 */
export async function getSymptomCategories() {
  const res = await request('/rule-diagnose/symptoms', 'GET')
  return res?.data?.symptomCategories || []
}

/**
 * 执行规则诊断 / 追问更新
 * @param {string[]} symptoms   - 已选症状 ID 列表
 * @param {Object}  conditions  - 已回答的追问条件 { soil_moisture: 'wet', ... }
 * @param {number}  round       - 当前轮次（0 = 初始）
 * @returns {Promise<{ candidates, nextQuestion, done, result }>}
 */
export async function runRuleDiagnose(symptoms, conditions = {}, round = 0) {
  const res = await request('/rule-diagnose/diagnose', 'POST', {
    symptoms,
    conditions,
    round
  })
  if (res?.code !== 200) {
    throw new Error(res?.message || '诊断请求失败')
  }
  return res.data
}
