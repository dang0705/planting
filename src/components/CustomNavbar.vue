<template>
  <view
    class="fixed top-0 left-0 right-0 z-[999]"
    :style="{
      paddingTop: statusBarHeight + 'px',
      background: 'linear-gradient(135deg, #2D7A4F 0%, #52B788 100%)'
    }"
  >
    <view class="h-[44px] flex items-center px-4 relative">
      <!-- 左侧：返回按钮 -->
      <view v-if="showBack" class="w-8 flex items-center" @click="goBack">
        <text class="text-white text-[32px] font-light leading-none">‹</text>
      </view>
      <view v-else class="w-8"></view>

      <!-- 左中：位置和天气（在返回按钮和标题之间） -->
      <view class="flex-1 flex flex-col items-start ml-2" @click="selectLocation">
        <view class="flex items-center mb-0.5">
          <text class="text-xs mr-1">📍</text>
          <text class="text-white text-sm font-semibold">{{ location }}</text>
          <text class="text-white/70 text-[10px] ml-1">▼</text>
        </view>
        <text class="text-white/90 text-[11px]">{{ weather }}</text>
      </view>

      <!-- 中间：页面标题（绝对定位居中） -->
      <view class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <text class="text-white text-base font-semibold">{{ title }}</text>
      </view>

      <!-- 右侧：缓存开关 -->
      <view class="w-8 flex items-center justify-end" @click="toggleCache">
        <text class="text-white text-lg">{{ cacheEnabled ? '🔵' : '🔴' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '@/store/user.js'
import { WEATHER_CONFIG } from '@/config/weather'
import {
  getCurrentLocation,
  getWeatherInfo,
  formatWeatherDisplay,
  checkLocationPermission,
  openSettingForLocation,
  requestLocationPermission
} from '@/api/weather.js'

const props = defineProps({
  showBack: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  }
})

const userStore = useUserStore()
const statusBarHeight = ref(0)
const location = ref('获取位置...')
const weather = ref('🌤️ --°C')
const cacheEnabled = ref(WEATHER_CONFIG.USE_CACHE)

// 刷新定时器
let refreshTimer = null

onMounted(async () => {
  // 获取状态栏高度
  const systemInfo = uni.getSystemInfoSync()
  statusBarHeight.value = systemInfo.statusBarHeight || 0

  // 初始化位置和天气信息
  await initLocationAndWeather()

  // 设置定时刷新（每30分钟刷新一次天气）
  refreshTimer = setInterval(
    async () => {
      await refreshWeather()
    },
    30 * 60 * 1000
  )
})

onUnmounted(() => {
  // 清除定时器
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})

/**
 * 初始化位置和天气信息
 */
async function initLocationAndWeather() {
  try {
    // 冷启动时总是重新获取位置信息，确保UI立即更新
    await getCurrentLocationAndWeather()
  } catch (error) {
    console.error('初始化位置和天气失败:', error)

    // 如果获取位置失败，但有缓存的位置信息，使用缓存
    if (userStore.location.city && userStore.location.latitude && userStore.location.longitude) {
      location.value = userStore.location.city
      await refreshWeather()
    } else {
      location.value = '位置获取失败'
      weather.value = '🌤️ --°C'
    }
  }
}

/**
 * 获取当前位置和天气信息
 */
async function getCurrentLocationAndWeather() {
  try {
    location.value = '获取位置...'
    weather.value = '🌤️ --°C'

    // 检查位置权限
    const permissionStatus = await checkLocationPermission()
    console.log('位置权限状态:', permissionStatus)

    if (permissionStatus === 'denied') {
      console.log('位置权限已被拒绝')
      location.value = '位置权限未授权'
      weather.value = '🌤️ --°C'
      return
    }

    // 如果权限未请求过，先请求权限
    if (permissionStatus === 'notRequested') {
      console.log('首次请求位置权限')
      try {
        await requestLocationPermission()
        console.log('位置权限授权成功，开始获取位置信息')

        // 权限请求成功后，立即获取位置信息
        const locationData = await getCurrentLocation()
        console.log('获取位置信息成功:', locationData)

        // 立即更新UI
        location.value = locationData.city || '当前位置'

        // 保存到用户store
        userStore.setLocation({
          province: locationData.province,
          city: locationData.city,
          latitude: locationData.latitude,
          longitude: locationData.longitude
        })

        // 立即获取天气信息
        await refreshWeather()
        console.log('天气信息获取完成')
        return
      } catch (authError) {
        console.error('位置权限授权失败:', authError)
        location.value = '位置权限未授权'
        weather.value = '🌤️ --°C'
        return
      }
    }

    // 权限已授权，直接获取位置
    console.log('位置权限已授权，直接获取位置信息')
    const locationData = await getCurrentLocation()
    console.log('获取位置信息成功:', locationData)

    // 更新位置信息
    location.value = locationData.city || '当前位置'

    // 保存到用户store
    userStore.setLocation({
      province: locationData.province,
      city: locationData.city,
      latitude: locationData.latitude,
      longitude: locationData.longitude
    })

    // 获取天气信息
    await refreshWeather()
    console.log('天气信息获取完成')
  } catch (error) {
    console.error('获取位置和天气失败:', error)

    if (error.message === 'auth_denied' || (error.errMsg && error.errMsg.includes('auth deny'))) {
      location.value = '位置权限未授权'
      weather.value = '🌤️ --°C'
    } else if (error.message === 'location_failed') {
      location.value = '定位失败'
      weather.value = '🌤️ --°C'
    } else {
      location.value = '位置获取失败'
      weather.value = '🌤️ --°C'
    }
  }
}

/**
 * 切换缓存开关
 */
function toggleCache() {
  cacheEnabled.value = !cacheEnabled.value

  uni.showToast({
    title: cacheEnabled.value ? '缓存已启用' : '缓存已禁用',
    icon: 'none',
    duration: 1500
  })

  console.log(`[缓存开关] ${cacheEnabled.value ? '✅ 启用' : '❌ 禁用'}`)

  // 立即刷新天气数据
  refreshWeather()
}

/**
 * 刷新天气信息
 */
async function refreshWeather() {
  try {
    weather.value = '🌤️ 加载中...'

    const { latitude, longitude, city } = userStore.location
    console.log('🔍 [刷新天气] userStore.location:', userStore.location)
    console.log('🔍 [刷新天气] latitude:', latitude, 'longitude:', longitude, 'city:', city)

    const hasCoordinates =
      latitude !== undefined &&
      latitude !== null &&
      latitude !== '' &&
      longitude !== undefined &&
      longitude !== null &&
      longitude !== '' &&
      Number.isFinite(Number(latitude)) &&
      Number.isFinite(Number(longitude))

    if (hasCoordinates) {
      // 使用经纬度获取天气，使用缓存开关
      const weatherData = await getWeatherInfo({
        lat: latitude,
        lng: longitude,
        useCache: cacheEnabled.value
      })

      weather.value = formatWeatherDisplay(weatherData)
    } else {
      weather.value = '🌤️ --°C'
    }
  } catch (error) {
    console.error('刷新天气失败:', error)
    weather.value = '🌤️ --°C'
  }
}

function goBack() {
  uni.navigateBack()
}

async function selectLocation() {
  try {
    // 检查位置权限
    const permissionStatus = await checkLocationPermission()

    if (permissionStatus === 'denied') {
      // 权限已拒绝，引导用户去设置页面授权
      const result = await uni.showModal({
        title: '位置权限',
        content: '需要获取您的位置信息来显示天气，是否去设置页面开启位置权限？',
        showCancel: true,
        confirmText: '去设置',
        cancelText: '取消'
      })

      if (result.confirm) {
        // 打开设置页面
        const success = await openSettingForLocation()
        if (success) {
          // 用户授权成功，重新获取位置
          await getCurrentLocationAndWeather()
          uni.showToast({
            title: '位置权限已开启',
            icon: 'success',
            duration: 1500
          })
        }
      }
      return
    }

    // 重新获取位置
    await getCurrentLocationAndWeather()

    uni.showToast({
      title: '位置已更新',
      icon: 'success',
      duration: 1500
    })
  } catch (error) {
    console.error('选择位置失败:', error)

    if (error.message === 'auth_denied' || (error.errMsg && error.errMsg.includes('auth deny'))) {
      // 位置权限未授权，引导用户授权
      const result = await uni.showModal({
        title: '位置权限',
        content: '需要获取您的位置信息来显示天气，请在设置中开启位置权限',
        showCancel: false,
        confirmText: '知道了'
      })
    } else {
      uni.showToast({
        title: '位置获取失败',
        icon: 'none'
      })
    }
  }
}
</script>
