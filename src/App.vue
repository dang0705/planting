<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { CLOUDBASE_ENV_ID } from '@/utils/runtime-env'

// #ifdef MP-WEIXIN
function initMiniProgramCloud() {
  wx.cloud.init({
    env: CLOUDBASE_ENV_ID,
    traceUser: true
  })

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
