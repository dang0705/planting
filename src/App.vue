<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('App Launch')

  // #ifdef MP-WEIXIN
  // 云能力按需初始化，避免 App 启动时触发 DevTools 旧 access_token 校验；
  // 远端业务请求在实际调用前再初始化 wx.cloud，手机号授权和云文件能力
  // 也沿用按需初始化。
  console.log('云能力按需初始化')
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
