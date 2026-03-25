<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('App Launch')
  wx.cloud.init({
    env: 'cloud1-2grufevs395a9d5e',
    traceUser: true
  })

  try {
    if (wx.cloud.extend && wx.cloud.extend.AI) {
      console.log('✅ AI 扩展已初始化')
    } else {
      console.warn('⚠️ AI 扩展不可用，深度思考功能可能无法使用')
    }
  } catch (error) {
    console.error('❌ AI 扩展初始化失败:', error)
  }
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
