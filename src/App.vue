<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { usePlantStore } from '@/store/plants'
import { startCacheTimer } from '@/utils/cacheTimer'

const plantStore = usePlantStore()

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

  getWeatherWithCache()
})

onShow(() => {
  console.log('App Show')

  if (!plantStore.defaultPlants.length) return

  const duration = plantStore.getRemainingTime()
  console.log('[Cache] 剩余时间:', Math.round(duration / 1000 / 60), '分钟')

  if (duration <= 0) {
    plantStore.defaultPlants = []
    return
  }

  startCacheTimer(() => {
    plantStore.defaultPlants = []
  }, duration)
})

onHide(() => {
  console.log('App Hide')
})

async function getWeatherWithCache() {
  try {
    const result = await wx.cloud.callFunction({ name: 'getWeather', data: {} })
    if (result.result.code === 200) {
      updateGlobalWeatherData(result.result.data)
    }
  } catch (error) {
    console.error('❌ [App] 获取天气异常:', error)
  }
}

function updateGlobalWeatherData(weatherData) {
  if (typeof getApp === 'function') {
    const app = getApp()
    if (app) {
      app.globalData = app.globalData || {}
      app.globalData.weather = weatherData
    }
  }
}
</script>

<style>
/*每个页面公共css */
</style>