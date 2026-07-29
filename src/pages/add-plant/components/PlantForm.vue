<template>
  <view :id="`${idPrefix}-form`">
    <!-- 植物照片 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">植物照片</text>
      <view
        :id="`${idPrefix}-photo-upload`"
        class="h-[120px] w-[120px] overflow-hidden rounded-2xl"
        @click="$emit('upload-photo')"
      >
        <image
          v-if="modelValue.image"
          :src="modelValue.image"
          class="w-full h-full"
          mode="aspectFill"
        />
        <view
          v-else
          class="w-full h-full bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center"
        >
          <text class="text-[32px] mb-2">📷</text>
          <text class="text-xs text-gray-400">添加照片</text>
        </view>
      </view>
    </view>

    <!-- 植物昵称 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3"
        >植物昵称 <text class="font-normal text-gray-400">(可选)</text></text
      >
      <input
        :id="`${idPrefix}-nickname-input`"
        :value="modelValue.nickname"
        @input="update('nickname', $event.detail.value)"
        class="w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm"
        placeholder="给它起个名字吧"
        placeholder-class="text-gray-300"
      />
    </view>

    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">
        养护城市 <text class="text-red-500">*</text>
      </text>
      <view
        class="flex items-center justify-between rounded-xl border bg-white px-4 py-3"
        :class="cityError ? 'border-red-300' : 'border-gray-200'"
      >
        <view class="min-w-0 flex-1">
          <text class="block text-sm font-semibold text-gray-800">{{
            selectedCareLocation?.cityName || '请选择城市'
          }}</text>
          <text class="mt-1 block text-xs text-gray-400">{{ locationStatusText }}</text>
        </view>
        <button
          :id="`${idPrefix}-city-button`"
          class="m-0 h-9 rounded-full border border-emerald-200 bg-emerald-50 px-4 text-xs font-semibold leading-9 text-[#016630]"
          @click="showCitySheet = true"
        >
          修改
        </button>
      </view>
      <text v-if="cityError" class="mt-2 block text-xs text-red-500">{{ cityError }}</text>
    </view>

    <view
      v-if="showCitySheet"
      :id="`${idPrefix}-city-sheet`"
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
                `当前定位：${selectedCareLocation?.cityName || '未选择'}`
              }}</text>
            </view>
          </view>
          <button
            :id="`${idPrefix}-city-sheet-close`"
            class="m-0 h-9 w-9 rounded-full bg-gray-100 p-0 text-xl leading-9 text-gray-500"
            @click="showCitySheet = false"
          >
            ×
          </button>
        </view>

        <ChipsSelector
          :items="cityOptions"
          :model-value="selectedCityValue"
          :id-prefix="`${idPrefix}-city-option`"
          value-key="value"
          label-key="label"
          :multiple="false"
          :get-item-id="item => item.id"
          @change="handleCityChange"
        />
      </view>
    </view>

    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">
        光照环境 <text class="font-normal text-gray-400">(可选)</text>
      </text>
      <LightEnvironmentPicker
        :id-prefix="`${idPrefix}-light`"
        question-id="profile"
        :model-value="modelValue.lightEnvironment"
        @change="value => update('lightEnvironment', value)"
      />
    </view>

    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">摆放位置</text>
      <view class="flex flex-wrap gap-2">
        <view
          v-for="loc in locations"
          :id="`${idPrefix}-location-${loc.key}`"
          :key="loc.value"
          class="py-2 px-4 bg-white border rounded-[20px] transition-all duration-300"
          :class="
            modelValue.location === loc.value ? 'bg-primary border-primary' : 'border-gray-300'
          "
          @click="update('location', loc.value)"
        >
          <text
            class="text-sm"
            :class="modelValue.location === loc.value ? 'text-white' : 'text-gray-600'"
            >{{ loc.label }}</text
          >
        </view>
      </view>
    </view>

    <!-- 种植日期 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">种植日期</text>
      <picker
        :id="`${idPrefix}-plant-date-picker`"
        mode="date"
        :value="modelValue.plantDate"
        @change="update('plantDate', $event.detail.value)"
      >
        <view
          class="flex items-center justify-between py-3 px-4 bg-white border border-gray-300 rounded-xl"
        >
          <text class="text-sm text-gray-800">{{ modelValue.plantDate || '选择日期' }}</text>
          <text class="text-lg text-gray-400">›</text>
        </view>
      </picker>
    </view>

    <!-- 备注 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3"
        >备注 <text class="font-normal text-gray-400">(可选)</text></text
      >
      <textarea
        :id="`${idPrefix}-notes-input`"
        :value="modelValue.notes"
        @input="update('notes', $event.detail.value)"
        class="w-full min-h-[100px] py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm"
        placeholder="记录一些特别的信息..."
        placeholder-class="text-gray-300"
        maxlength="200"
      />
      <text class="block text-right text-xs text-gray-400 mt-2"
        >{{ (modelValue.notes || '').length }}/200</text
      >
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { fetchHotCityWeatherLocations, resolveHotCityByGps } from '@/api/weather-hot-cities.js'
import {
  clearSelectedPlantCareLocation,
  normalizePlantCareLocation,
  saveSelectedPlantCareLocation
} from '@/utils/plant-care-location.js'
import ChipsSelector from '@/components/common/ChipsSelector.vue'
import LightEnvironmentPicker from '@/components/LightEnvironmentPicker.vue'

const INFO_STEP = 1
const props = defineProps({
  modelValue: { type: Object, required: true },
  cityError: { type: String, default: '' },
  activeStep: { type: Number, default: 0 },
  idPrefix: { type: String, default: 'add-plant' }
})
const emit = defineEmits(['update:modelValue', 'upload-photo', 'city-change'])

const locations = [
  { key: 'balcony', label: '阳台', value: '阳台' },
  { key: 'living-room', label: '客厅', value: '客厅' },
  { key: 'bedroom', label: '卧室', value: '卧室' },
  { key: 'study', label: '书房', value: '书房' },
  { key: 'office', label: '办公室', value: '办公室' },
  { key: 'other', label: '其他', value: '其他' }
]
const hotCities = ref([])
const showCitySheet = ref(false)
const locationStatus = ref('locating')
const weatherLocationInitialized = ref(false)
const selectedCareLocation = computed(() =>
  normalizePlantCareLocation(props.modelValue.careLocation)
)
const selectedCityValue = computed(() => selectedCareLocation.value?.locationKey || '')
const locationStatusText = computed(() => {
  if (locationStatus.value === 'gps_matched') {
    return '已按定位匹配养护城市'
  }
  if (locationStatus.value === 'manual_selected') {
    return '已手动选择养护城市'
  }
  if (locationStatus.value === 'match_failed') {
    return '定位未匹配热城，请手动选择'
  }
  if (locationStatus.value === 'locate_failed') {
    return '定位不可用，请手动选择'
  }
  return '正在尝试定位匹配'
})

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function applyCareLocation(careLocation, status) {
  const normalized = saveSelectedPlantCareLocation(careLocation)
  if (!normalized) {
    return
  }
  locationStatus.value = status
  emit('city-change', normalized)
  emit('update:modelValue', {
    ...props.modelValue,
    location: props.modelValue.location || normalized.cityName,
    careLocation: normalized
  })
}

function selectCity(city, source = 'manual_selected') {
  applyCareLocation({ ...city, source }, 'manual_selected')
  showCitySheet.value = false
}

const cityOptions = computed(() =>
  hotCities.value.map((city, index) => {
    const cityLabel = city?.cityName || ''
    return {
      value: city.locationKey || `fallback-city-${index}`,
      label: cityLabel,
      id: city.locationKey || index,
      city
    }
  })
)

function handleCityChange(payload) {
  const targetCityOption = cityOptions.value.find(item => item.value === payload.value)
  if (!targetCityOption?.city) {
    return
  }
  selectCity(targetCityOption.city, 'manual_selected')
}

async function loadHotCities() {
  hotCities.value = await fetchHotCityWeatherLocations()
}

function getGpsCoordinates() {
  return new Promise((resolve, reject) => {
    uni.getLocation({
      type: 'gcj02',
      success: res => resolve({ latitude: res.latitude, longitude: res.longitude }),
      fail: reject
    })
  })
}

async function matchGpsHotCity() {
  try {
    const location = await getGpsCoordinates()
    const resolved = await resolveHotCityByGps(location)
    if (resolved.matched && resolved.city) {
      applyCareLocation(resolved.city, 'gps_matched')
      return
    }
    locationStatus.value = 'match_failed'
    showCitySheet.value = true
  } catch {
    locationStatus.value = 'locate_failed'
    showCitySheet.value = true
  }
}

async function initWeatherLocation() {
  if (weatherLocationInitialized.value) {
    return
  }
  weatherLocationInitialized.value = true
  const hasExistingCareLocation = Boolean(selectedCareLocation.value)
  if (!hasExistingCareLocation) {
    clearSelectedPlantCareLocation()
  }
  try {
    await loadHotCities()
    if (!hasExistingCareLocation) {
      await matchGpsHotCity()
    } else {
      locationStatus.value = selectedCareLocation.value.source || 'manual_selected'
    }
  } catch {
    locationStatus.value = 'locate_failed'
    showCitySheet.value = true
  }
}

watch(
  () => props.activeStep,
  step => {
    if (step === INFO_STEP) {
      initWeatherLocation()
    }
  },
  { immediate: true }
)
</script>
