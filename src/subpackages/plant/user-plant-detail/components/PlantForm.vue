<template>
  <view :id="`${idPrefix}-form`" class="space-y-4">
    <view
      :id="`${idPrefix}-basic-info-section`"
      class="rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-4"
    >
      <view class="mb-4">
        <text class="block text-base font-semibold text-[#1f2937]">基本信息</text>
        <text class="mt-1 block text-xs leading-5 text-[#6b7280]">
          {{ showPhoto ? '照片、昵称和种植时间' : '昵称、种植时间和备注' }}
        </text>
      </view>

      <view v-if="showPhoto" class="mb-5">
        <text class="mb-3 block text-sm font-semibold text-gray-800">植物照片</text>
        <view
          :id="`${idPrefix}-photo-upload`"
          class="h-[120px] w-[120px] overflow-hidden rounded-2xl"
          @click="$emit('upload-photo')"
        >
          <image
            v-if="displayImage"
            :id="`${idPrefix}-photo-preview`"
            :src="displayImage"
            class="h-full w-full"
            mode="aspectFill"
            @error="handleImageError"
          />
          <view
            v-else
            class="flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-100"
          >
            <text class="mb-2 text-[32px]">📷</text>
            <text class="text-xs text-gray-400">添加照片</text>
          </view>
        </view>
      </view>

      <view class="mb-5">
        <text class="mb-3 block text-sm font-semibold text-gray-800">
          植物昵称 <text class="font-normal text-gray-400">(可选)</text>
        </text>
        <view
          class="box-border flex w-full items-center rounded-xl border border-solid border-gray-300 bg-white px-4 py-3"
        >
          <input
            :id="`${idPrefix}-nickname-input`"
            :value="modelValue.nickname"
            class="box-border min-w-0 flex-1 border-none bg-transparent p-0 text-sm"
            placeholder="给它起个名字吧"
            placeholder-class="text-gray-300"
            @input="update('nickname', $event.detail.value)"
          />
        </view>
      </view>

      <view class="mb-5">
        <text class="mb-3 block text-sm font-semibold text-gray-800">种植日期</text>
        <picker
          :id="`${idPrefix}-plant-date-picker`"
          mode="date"
          :value="modelValue.plantDate"
          @change="update('plantDate', $event.detail.value)"
        >
          <view
            class="flex items-center justify-between rounded-xl border border-gray-300 bg-white px-4 py-3"
          >
            <text class="text-sm text-gray-800">{{ modelValue.plantDate || '选择日期' }}</text>
            <text class="text-lg text-gray-400">›</text>
          </view>
        </picker>
      </view>

      <view>
        <text class="mb-3 block text-sm font-semibold text-gray-800">
          备注 <text class="font-normal text-gray-400">(可选)</text>
        </text>
        <view
          class="box-border w-full rounded-xl border border-solid border-gray-300 bg-white px-4 py-3"
        >
          <textarea
            :id="`${idPrefix}-notes-input`"
            :value="modelValue.notes"
            class="box-border min-h-[100px] w-full border-none bg-transparent p-0 text-sm"
            placeholder="记录一些特别的信息..."
            placeholder-class="text-gray-300"
            maxlength="200"
            @input="update('notes', $event.detail.value)"
          />
        </view>
        <text class="mt-2 block text-right text-xs text-gray-400">
          {{ (modelValue.notes || '').length }}/200
        </text>
      </view>
    </view>

    <view
      :id="`${idPrefix}-care-info-section`"
      class="rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-4"
    >
      <view class="mb-4">
        <text class="block text-base font-semibold text-[#1f2937]">养护信息</text>
        <text class="mt-1 block text-xs leading-5 text-[#6b7280]"
          >养护地点和环境会影响后续建议</text
        >
      </view>

      <view class="mb-5">
        <text class="mb-3 block text-sm font-semibold text-gray-800">
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

      <view v-if="showLightEnvironment">
        <LightEnvironmentPicker
          :id-prefix="`${idPrefix}-light`"
          question-id="profile"
          :model-value="modelValue.lightEnvironment"
          :plant-name="modelValue.nickname || '植物'"
          @change="value => update('lightEnvironment', value)"
        />
      </view>

      <slot name="care-settings" />
    </view>

    <view
      v-if="showPotProfile"
      :id="`${idPrefix}-pot-info-section`"
      class="rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-4"
    >
      <view class="mb-4">
        <text class="block text-base font-semibold text-[#1f2937]">盆信息</text>
        <text class="mt-1 block text-xs leading-5 text-[#6b7280]">盆型和基质用于估算浇水量</text>
      </view>
      <view
        :id="`${idPrefix}-pot-profile-button`"
        class="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3"
        @click="$emit('open-pot-profile')"
      >
        <view class="min-w-0 flex-1">
          <text class="block text-sm font-semibold text-gray-800">{{ potProfileTitle }}</text>
          <text class="mt-1 block text-xs text-gray-400">{{ potProfileSummary }}</text>
        </view>
        <text class="ml-3 text-lg text-gray-400">›</text>
      </view>
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
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useFileUrl } from '@/composables/useCloudFile.js'
import { fetchHotCityWeatherLocations, resolveHotCityByGps } from '@/api/weather-hot-cities.js'
import {
  clearSelectedPlantCareLocation,
  normalizePlantCareLocation,
  saveSelectedPlantCareLocation
} from '@/utils/plant-care-location.js'
import ChipsSelector from '@/components/common/ChipsSelector.vue'
import LightEnvironmentPicker from '@/components/LightEnvironmentPicker.vue'

const INFO_STEP = 1
const INITIAL_IMAGE_RETRY_COUNT = 0
const IMAGE_RETRY_LIMIT = 1
const props = defineProps({
  modelValue: { type: Object, required: true },
  cityError: { type: String, default: '' },
  activeStep: { type: Number, default: 0 },
  idPrefix: { type: String, default: 'add-plant' },
  showLightEnvironment: { type: Boolean, default: true },
  showPhoto: { type: Boolean, default: true },
  showPotProfile: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'upload-photo', 'city-change', 'open-pot-profile'])

const { url: remoteImageUrl, resolve: resolveImageUrl, refresh: refreshImageUrl } = useFileUrl()
const imageRetryCount = ref(INITIAL_IMAGE_RETRY_COUNT)
const displayImage = computed(() =>
  props.modelValue.imageFileId ? remoteImageUrl.value : props.modelValue.image || ''
)

watch(
  () => props.modelValue.imageFileId,
  nextFileId => {
    imageRetryCount.value = INITIAL_IMAGE_RETRY_COUNT
    resolveImageUrl(nextFileId)
  },
  { immediate: true }
)

async function handleImageError() {
  if (!props.modelValue.imageFileId || imageRetryCount.value >= IMAGE_RETRY_LIMIT) {
    remoteImageUrl.value = ''
    return
  }
  imageRetryCount.value += 1
  await refreshImageUrl()
}

const hotCities = ref([])
const showCitySheet = ref(false)
const locationStatus = ref('locating')
const weatherLocationInitialized = ref(false)
const selectedCareLocation = computed(() =>
  normalizePlantCareLocation(props.modelValue.careLocation)
)
const selectedCityValue = computed(() => selectedCareLocation.value?.locationKey || '')
const potProfileTitle = computed(() =>
  props.modelValue.potProfile ? '已设置盆型信息' : '补充盆型信息'
)
const potProfileSummary = computed(() => {
  const profile = props.modelValue.potProfile
  if (!profile) {
    return '可填写尺寸、排水孔和盆土构成'
  }
  const dimensions = profile.potTopDiameterCm ? `口径 ${profile.potTopDiameterCm}cm` : '尺寸未填写'
  const drainage =
    profile.hasDrainageHole === 'true'
      ? '有排水孔'
      : profile.hasDrainageHole === 'false'
        ? '无排水孔'
        : '排水孔不确定'
  return `${dimensions} · ${drainage}`
})
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
