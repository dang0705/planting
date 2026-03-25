import { defineStore } from 'pinia'
import { loginWithCode, loginWithPhone, getAccessToken } from '@/api/wechat'
import { requestHttpFunction } from '@/api/http'

export const useUserStore = defineStore('user', {
  state: () => ({
    // 用户基本信息
    userId: '', // 用户 ID
    openid: '', // 微信 openid
    union_id: '', // 微信 union_id
    username: '', // 用户名
    nickname: '植物爱好者', // 昵称
    avatar: '', // 头像
    email: '', // 邮箱（可选）
    phoneNumber: '', // 手机号（可选）

    // 位置信息
    location: {
      province: '',
      city: '',
      latitude: 0,
      longitude: 0
    },

    // 会员信息
    membership: {
      type: 'free', // free | premium
      expireTime: null,
      freeQuota: 5, // 剩余免费诊断次数
      usedCount: 0
    },

    // 登录状态
    isLoggedIn: false,
    token: '',

    // 上次刷新时间（用于控制刷新频率）
    lastRefreshTime: 0,

    // UI 状态（不持久化）
    navbarHeight: 88 // 默认高度，会在页面加载时通过 uni API 获取实际值
  }),

  getters: {
    isPremium: state => state.membership.type === 'premium',
    canDiagnose: state => {
      if (state.membership.type === 'premium') return true
      return state.membership.freeQuota > 0
    },
    displayName: state => state.nickname || state.username || '植物爱好者',
    isAuthenticated: state => !!state.openid
  },

  actions: {
    /**
     * 微信登录（使用 code）
     */
    async wechatLogin() {
      try {
        const loginData = await loginWithCode()
        this.setLoginInfo(loginData)
        return loginData
      } catch (error) {
        console.error('微信登录失败:', error)
        throw error
      }
    },

    /**
     * 手机号登录
     * @param {string} phoneCode - 手机号授权 code
     */
    async phoneLogin(phoneCode) {
      try {
        const loginData = await loginWithPhone(phoneCode)
        this.setLoginInfo(loginData)
        return loginData
      } catch (error) {
        console.error('手机号登录失败:', error)
        throw error
      }
    },

    /**
     * 检查登录状态
     * @returns {boolean} 是否已登录
     */
    checkLoginStatus() {
      return this.isAuthenticated
    },

    /**
     * 确保用户已登录（用于需要登录的功能）
     * @returns {Promise<boolean>} 是否已登录
     */
    async ensureLogin() {
      // 如果已登录，检查是否需要刷新用户信息
      if (this.isAuthenticated) {
        this.maybeRefreshUserInfo()
        return true
      }

      // 尝试从本地恢复登录状态（现在由 Pinia 插件自动处理）
      if (this.isAuthenticated) {
        this.maybeRefreshUserInfo()
        return true
      }

      // 需要用户登录
      return false
    },

    /**
     * 按需刷新用户信息（每5分钟最多刷新一次）
     */
    maybeRefreshUserInfo() {
      const now = Date.now()
      const REFRESH_INTERVAL = 5 * 60 * 1000 // 5分钟

      if (now - this.lastRefreshTime > REFRESH_INTERVAL) {
        this.lastRefreshTime = now
        this.refreshUserInfo()
      }
    },

    /**
     * 设置用户登录信息
     */
    async setLoginInfo(loginData) {
      const user = loginData.user || {}

      this.userId = user._id || user.id || loginData.userId || ''
      this.openid = user.wechat_openid || user._openid || loginData.openid || ''
      this.union_id = user.wechat_unionid || user.union_id || ''
      this.username = user.username || ''
      this.nickname = user.profile_wechatNickname || user.nickname || user.username || '植物爱好者'
      this.avatar = user.profile_wechatAvatar || user.avatar || user.profile_avatar || ''
      this.email = user.email || ''
      this.phoneNumber = user.phoneNumber || ''

      // 从 getAccessToken 获取 token
      try {
        this.token = await getAccessToken()
        console.log('获取到 access token:', this.token)
      } catch (error) {
        console.error('获取 access token 失败:', error)
        this.token = loginData.token || ''
      }

      this.isLoggedIn = true
      console.log(this.isLoggedIn, 'this.isLoggedIn')

      // 从服务端同步会员信息
      this.membership = {
        type: user.subscription_plan || 'free',
        expireTime: user.subscription_endDate || null,
        // premium 用户无限次，free 用户根据月度使用情况计算剩余次数（每月5次）
        freeQuota:
          user.subscription_plan === 'premium'
            ? 999
            : Math.max(0, 5 - (user.usage_diagnoseMonth || 0)),
        usedCount: user.usage_diagnoseTotal || 0
      }
    },

    /**
     * 设置用户信息
     */
    setUserInfo(userInfo) {
      this.openid = userInfo.wechat_openid || userInfo.openid || this.openid
      this.union_id = userInfo.wechat_unionid || userInfo.union_id || this.union_id
      this.username = userInfo.username || this.username
      this.nickname = userInfo.nickname || this.nickname
      this.avatar = userInfo.avatar || this.avatar
      this.email = userInfo.email || this.email
      this.phoneNumber = userInfo.phoneNumber || this.phoneNumber
    },

    /**
     * 更新邮箱
     */
    updateEmail(email) {
      this.email = email
    },

    /**
     * 更新手机号
     */
    updatePhoneNumber(phoneNumber) {
      this.phoneNumber = phoneNumber
    },

    /**
     * 设置位置信息
     */
    setLocation(location) {
      this.location = { ...this.location, ...location }
    },

    /**
     * 更新会员信息
     */
    updateMembership(membership) {
      this.membership = { ...this.membership, ...membership }
    },

    /**
     * 使用AI配额
     */
    useAIQuota() {
      if (this.membership.type === 'free' && this.membership.freeQuota > 0) {
        this.membership.freeQuota--
        this.membership.usedCount++
      } else if (this.membership.type === 'premium') {
        this.membership.usedCount++
      }
    },

    /**
     * 升级为付费用户
     */
    upgradeToPremium(expireTime) {
      this.membership.type = 'premium'
      this.membership.expireTime = expireTime
    },

    /**
     * 登出
     */
    logout() {
      this.userId = ''
      this.openid = ''
      this.union_id = ''
      this.username = ''
      this.nickname = '植物爱好者'
      this.avatar = ''
      this.email = ''
      this.phoneNumber = ''
      this.token = ''
      this.isLoggedIn = false
      this.membership = {
        type: 'free',
        expireTime: null,
        freeQuota: 5,
        usedCount: 0
      }
    },

    /**
     * 从服务端刷新用户信息（同步会员状态等）
     */
    async refreshUserInfo() {
      if (!this.openid) {
        return false
      }

      try {
        const result = await requestHttpFunction('auth-user-http/auth/user', {
          method: 'POST',
          body: {
            action: 'getUserByOpenid',
            data: { openid: this.openid }
          }
        })

        if (result.code === 200) {
          const user = result.data

          // 更新会员信息
          this.membership = {
            type: user.subscription_plan || 'free',
            expireTime: user.subscription_endDate || null,
            freeQuota:
              user.subscription_plan === 'premium'
                ? 999
                : Math.max(0, 5 - (user.usage_diagnoseMonth || 0)),
            usedCount: user.usage_diagnoseTotal || 0
          }

          // 更新其他可能变化的信息
          this.nickname = user.profile_wechatNickname || user.nickname || this.nickname
          this.avatar = user.profile_wechatAvatar || user.profile_avatar || this.avatar
          this.email = user.email || this.email
          this.phoneNumber = user.phoneNumber || this.phoneNumber

          return true
        }
      } catch (error) {
        console.error('刷新用户信息失败:', error)
      }
      return false
    },

    /**
     * 设置导航栏高度
     * @param {number} height - 导航栏高度
     */
    setNavbarHeight(height) {
      this.navbarHeight = height
    }
  },

  // Pinia 持久化配置
  persist: {
    pick: [
      'userId',
      'openid',
      'union_id',
      'username',
      'nickname',
      'avatar',
      'email',
      'phoneNumber',
      'location',
      'membership',
      'isLoggedIn',
      'token',
      'lastRefreshTime'
    ]
  }
})
