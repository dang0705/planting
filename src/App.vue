<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { CLOUDBASE_ENV_ID } from '@/utils/runtime-env'
// #ifdef MP-WEIXIN
import { getCloudbaseAccessToken } from '@/utils/cloudbase-auth'
// #endif

// #ifdef MP-WEIXIN
function initMiniProgramCloud() {
  wx.cloud.init({
    env: CLOUDBASE_ENV_ID,
    traceUser: true
  })

  // 正式线上预检与业务请求共用同一 CloudBase 登录态。只暴露一个按需取令牌
  // 的函数，不把令牌写入页面数据或业务 store。
  wx.cloud.__plantingGetCloudbaseAccessToken = getCloudbaseAccessToken
  if (typeof getApp === 'function') {
    const app = getApp()
    if (app) {
      app.globalData = app.globalData || {}
      app.globalData.__plantingGetCloudbaseAccessToken = getCloudbaseAccessToken
    }
  }

  try {
    if (wx.cloud?.extend?.AI) {
      console.log('云能力已初始化')
      return
    }
    console.warn('云能力扩展不可用')
  } catch (error) {
    console.error('云能力扩展初始化失败:', error)
  }
}
// #endif

onLaunch(() => {
  console.log('App Launch')

  // #ifdef MP-WEIXIN
  initMiniProgramCloud()
  // #endif

  // #ifdef H5
  console.log('ℹ️ 当前为 H5 环境，跳过小程序 wx.cloud 初始化')
  // #endif

  // #ifdef APP-PLUS
  console.log('ℹ️ 当前为 App 环境，跳过小程序 wx.cloud 初始化')
  // #endif
})

onShow(() => {
  console.log('App Show')
})

onHide(() => {
  console.log('App Hide')
})
</script>

<style>
/*每个页面公共css */
</style>
