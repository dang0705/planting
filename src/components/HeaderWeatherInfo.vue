<template>
  <view id="header-weather-info" class="flex min-w-0 items-center gap-1.5">
    <view id="header-weather-location-button" class="min-w-0 max-w-[92px]" @click="openCityPicker">
      <view class="flex min-w-0 items-center">
        <text class="mr-0.5 text-[10px] leading-none">📍</text>
        <text class="truncate text-[13px] font-semibold leading-4 text-white">{{ location }}</text>
        <text class="ml-0.5 text-[9px] leading-none text-white/70">▼</text>
      </view>
      <text class="block truncate text-[10px] leading-3 text-white/90">{{ weather }}</text>
    </view>

    <view
      v-if="showCitySheet"
      class="fixed inset-0 z-50 flex items-end bg-black/30"
      @click.self="showCitySheet = false"
    >
      <view class="w-full rounded-t-[24px] bg-white px-4 pb-6 pt-4 shadow-2xl">
        <view class="mb-5 flex items-start justify-between gap-3">
          <view class="min-w-0 flex-1">
            <text class="block text-[20px] font-bold leading-7 text-gray-900">选择城市</text>
            <view class="mt-1 flex items-center gap-1.5">
              <text class="text-[14px] text-gray-500">⌖</text>
              <text class="text-[13px] leading-5 text-gray-500">{{
                `当前定位：${selectedCityLabel}`
              }}</text>
            </view>
          </view>
          <button
            class="m-0 h-9 w-9 rounded-full bg-gray-100 p-0 text-xl leading-9 text-gray-500"
            @click.stop="showCitySheet = false"
          >
            ×
          </button>
        </view>

        <view v-if="loadingCities" class="py-2 text-sm text-gray-500">正在加载城市...</view>
        <view v-else-if="!cityOptions.length" class="py-2 text-sm text-gray-500">
          未能获取热区城市
        </view>
        <ChipsSelector
          v-else
          :items="cityOptions"
          :model-value="selectedCityValue"
          id-prefix="header-weather-city-option"
          value-key="value"
          label-key="label"
          :get-item-id="item => item.id"
          @change="onCitySelect"
        />
      </view>
    </view>
    <!--    <view
      v-if="showCacheToggle"
      id="header-weather-cache-toggle"
      class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10"
      @click.stop="toggleCache"
    >
      <text class="text-[13px] leading-none">{{ cacheEnabled ? '🔵' : '🔴' }}</text>
    </view>-->
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { fetchHotCityWeatherLocations } from '@/api/weather-hot-cities.js'
import ChipsSelector from '@/components/diagnose-popup/ChipsSelector.vue'
import { useHeaderWeather } from './header-weather/useHeaderWeather.js'

defineProps({
  showCacheToggle: { type: Boolean, default: true }
})

const { location, gpsLocation, weather, setCityLocation } = useHeaderWeather()
const showCitySheet = ref(false)
const hotCities = ref([])
const loadingCities = ref(false)
const selectedCityValue = computed(() => resolveCityText(location.value))

function resolveCityText(city = '') {
  if (typeof city === 'string') {
    return city.trim()
  }
  if (!city || typeof city !== 'object') {
    return ''
  }
  const candidates = [
    city.cityName,
    city.city,
    city.name,
    city.displayName,
    city.cityNameCn,
    city.locationName,
    city.label,
    city.value
  ]
  for (const candidate of candidates) {
    const normalized = resolveCityText(candidate)
    if (normalized) {
      return normalized
    }
  }
  return ''
}

const selectedCityLabel = computed(() => {
  return resolveCityText(gpsLocation.value) || resolveCityText(location.value) || '当前位置'
})
const cityOptions = computed(() =>
  hotCities.value.map((city, index) => {
    const label = cityLabel(city)
    return {
      value: label || `fallback-city-${index}`,
      label,
      id: city.locationKey || index,
      city
    }
  })
)

function cityLabel(city) {
  return resolveCityText(city)
}

async function loadHotCities() {
  loadingCities.value = true
  try {
    hotCities.value = await fetchHotCityWeatherLocations()
  } catch {
    uni.showToast({ title: '加载城市失败', icon: 'none' })
  } finally {
    loadingCities.value = false
  }
}

async function selectCity(city) {
  const success = await setCityLocation(city)
  if (!success) {
    uni.showToast({ title: '选择失败，请重试', icon: 'none' })
    return
  }
  showCitySheet.value = false
  uni.showToast({ title: '城市已更新', icon: 'none' })
}

function onCitySelect(payload) {
  const selected = cityOptions.value.find(item => item.value === payload.value)
  if (!selected?.city) {
    return
  }
  selectCity(selected.city)
}

async function openCityPicker() {
  showCitySheet.value = true
  if (!hotCities.value.length) {
    await loadHotCities()
  }
}
</script>
