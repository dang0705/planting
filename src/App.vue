<script>
export default {
  onLaunch: function () {
    console.log('App Launch')
    wx.cloud.init({
      env: 'cloud1-2grufevs395a9d5e', // 比如：cloud1-xxxxx
      traceUser: true
    })

    // 初始化 AI 扩展（用于智能体调用）
    try {
      if (wx.cloud.extend && wx.cloud.extend.AI) {
        console.log('✅ AI 扩展已初始化')
      } else {
        console.warn('⚠️ AI 扩展不可用，深度思考功能可能无法使用')
      }
    } catch (error) {
      console.error('❌ AI 扩展初始化失败:', error)
    }

    // 冷启动后获取天气数据，使用前端缓存策略确保每24小时只触发一次API请求
    this.getWeatherWithCache()
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  },
  methods: {
    /**
     * 🔴 测试模式：获取天气数据（重构版，无缓存）
     */
    async getWeatherWithCache() {
      try {
        console.log('🔴 [App] 测试模式：无缓存，直接调用云函数')

        const result = await wx.cloud.callFunction({
          name: 'getWeather',
          data: {} // 使用默认位置（上海）
        })

        console.log('✅ [App] 云函数响应:', result)

        if (result.result.code === 200) {
          const weatherData = result.result.data

          console.log('📊 [App] 温度:', weatherData.temperature, '℃')
          console.log('📊 [App] 湿度:', weatherData.humidity, '%')
          console.log('📊 [App] 天气:', weatherData.weather)
          console.log('📊 [App] 体感温度:', weatherData.feelsLike, '℃')
          console.log('📊 [App] 风向:', weatherData.windDir)
          console.log('📊 [App] 原始数据:', weatherData.raw)
          console.log('📊 [App] 完整数据:', JSON.stringify(weatherData))

          // 更新全局天气数据
          this.updateGlobalWeatherData(weatherData)

          return weatherData
        } else {
          console.error('❌ [App] 获取天气失败:', result.result.message)
          return null
        }
      } catch (error) {
        console.error('❌ [App] 获取天气异常:', error)
        return null
      }
    },

    /**
     * 更新全局天气数据
     * 可以根据项目使用的状态管理工具（如Vuex、Pinia）进行适配
     */
    updateGlobalWeatherData(weatherData) {
      // 这里可以根据项目实际情况存储到全局状态
      // 例如：Vuex store、Pinia store、全局变量或事件总线

      // 示例：存储到全局变量
      if (typeof getApp === 'function') {
        const app = getApp()
        if (app) {
          app.globalData = app.globalData || {}
          app.globalData.weather = weatherData
          console.log('全局天气数据已更新')
        }
      }

      // 可以根据项目需要，在这里触发自定义事件或更新状态管理
      // 例如：Vuex store.commit('setWeather', weatherData)
      // 或 Pinia store.weather = weatherData
    }
  }
}
</script>

<style>
/*每个页面公共css */
</style>
