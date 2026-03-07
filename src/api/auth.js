import axios from 'axios'

const API_BASE = '/api' // 根据实际部署调整

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000
})

// 请求拦截器 - 添加认证头
api.interceptors.request.use(config => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器 - 处理认证错误
api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken')
      localStorage.removeItem('userInfo')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  // 用户注册
  register: (data) => {
    return api.post('/auth-user', {
      action: 'register',
      data: data
    })
  },

  // 用户登录
  login: (data) => {
    return api.post('/auth-user', {
      action: 'login',
      data: data
    })
  },

  // 检查AI权限
  checkAIPermission: (userId) => {
    return api.post('/auth-user', {
      action: 'checkAIPermission',
      data: { userId }
    })
  },

  // 记录AI调用
  recordAICall: (userId) => {
    return api.post('/auth-user', {
      action: 'recordAICall',
      data: { userId }
    })
  },

  // 获取套餐信息
  getPlans: () => {
    return api.post('/subscription-manager', {
      action: 'getPlans'
    })
  },

  // 升级套餐
  upgradePlan: (userId, planType, paymentId) => {
    return api.post('/subscription-manager', {
      action: 'upgradePlan',
      data: { userId, planType, paymentId }
    })
  },

  // 检查订阅状态
  checkSubscription: (userId) => {
    return api.post('/subscription-manager', {
      action: 'checkSubscription',
      data: { userId }
    })
  }
}

export const aiAPI = {
  // 生成诗歌
  generatePoetry: (input, token) => {
    return api.post('/ai-poetry', {
      action: 'generatePoetry',
      data: { input },
      token: token
    })
  },

  // 获取用户统计
  getUserStats: (token) => {
    return api.post('/ai-poetry', {
      action: 'getUserStats',
      token: token
    })
  },

  // 获取公开信息
  getPublicInfo: () => {
    return api.post('/ai-poetry', {
      action: 'publicInfo'
    })
  }
}