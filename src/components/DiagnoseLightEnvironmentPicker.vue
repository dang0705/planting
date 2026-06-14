<template>
  <view :id="`diagnose-light-environment-${questionId}`" class="mt-4 flex flex-col gap-2.5">
    <view
      v-for="option in windowOptions"
      :key="option.key"
      :id="`diagnose-light-window-${option.key}`"
      class="rounded-2xl border bg-white px-4 py-3.5"
      :class="
        selectedWindowKey === option.key ? 'border-[#00a63e] bg-[#f0fdf4]' : 'border-[#e5e7eb]'
      "
      @click="selectWindow(option.key)"
    >
      <view class="flex items-center gap-3">
        <view
          class="box-border h-5 w-5 rounded-full border-2 p-[3px]"
          :class="selectedWindowKey === option.key ? 'border-[#00a63e]' : 'border-[#d1d5dc]'"
        >
          <view
            v-if="selectedWindowKey === option.key"
            class="h-full w-full rounded-full bg-[#00a63e]"
          />
        </view>
        <text class="text-sm font-bold leading-5 text-[#1e2939]">{{ option.label }}</text>
      </view>
    </view>

    <view
      v-if="selectedWindowKey === 'window'"
      :id="`diagnose-light-window-detail-${questionId}`"
      class="ml-4 border-l-2 border-[#b9f8cf] pl-4"
    >
      <view class="items-center">
        <view class="relative mx-auto h-[220px] w-[220px] rounded-full bg-[#f8faf9]">
          <image
            v-if="selectedDirectionArrowStyle"
            id="diagnose-light-selected-direction-arrow"
            :src="selectedDirectionArrowIcon"
            class="pointer-events-none absolute z-0 h-[18px] w-[14px]"
            mode="aspectFit"
            :style="selectedDirectionArrowStyle"
          />
          <view
            v-for="direction in directionOptions"
            :key="direction.key"
            :id="`diagnose-light-facing-${direction.key}`"
            class="absolute z-10 flex h-10 w-10 items-center justify-center rounded-full border bg-white"
            :class="
              environment.facing === direction.key
                ? 'border-[#00a63e] text-[#008236]'
                : 'border-[#d8e4dc] text-[#43564a]'
            "
            :style="direction.style"
            @click="selectFacing(direction.key)"
          >
            <text class="text-[11px] font-medium leading-none">{{ direction.label }}</text>
          </view>
          <view
            id="diagnose-light-facing-unknown"
            class="absolute left-1/2 top-1/2 flex h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white"
            :class="
              environment.facing === 'unknown'
                ? 'border-[#00a63e] text-[#008236]'
                : 'border-[#d8e4dc] text-[#43564a]'
            "
            @click="openDirectionDialog('unknown')"
          >
            <text class="text-center text-[11px] leading-4">不确定</text>
          </view>
        </view>

        <button
          :id="`diagnose-light-calibrate-button-${questionId}`"
          class="mx-auto mt-2 h-9 rounded-full border border-[#b9f8cf] bg-white px-4 text-xs font-bold leading-9 text-[#008236]"
          @click="openDirectionDialog()"
        >
          校准方位
        </button>
      </view>

      <view class="mt-4 flex items-center justify-between">
        <text class="text-sm leading-5 text-[#4a5565]">离窗距离</text>
        <view class="flex rounded-xl bg-[#f3f4f6] p-0.5">
          <text class="rounded-[10px] bg-white px-3 py-1 text-xs font-bold text-[#008236]">米</text>
          <text class="px-3 py-1 text-xs font-bold text-[#6a7282]">步</text>
        </view>
      </view>

      <slider
        :id="`diagnose-light-distance-slider-${questionId}`"
        class="mt-2"
        min="0"
        max="10"
        step="0.5"
        :value="environment.distance"
        activeColor="#00a63e"
        backgroundColor="#e5e7eb"
        block-color="#ffffff"
        block-size="20"
        @change="handleDistanceChange"
        @changing="handleDistanceChange"
      />
      <view class="flex justify-between">
        <text class="text-xs text-[#99a1af]">0 m</text>
        <text class="text-xs text-[#99a1af]">10 m</text>
      </view>

      <view class="mt-2 flex items-center gap-2 rounded-xl bg-[#f0fdf4] px-3 py-2">
        <view class="h-2 w-2 rounded-full bg-[#00c950]" />
        <text class="text-sm font-bold text-[#016630]">{{ distanceBandText }}</text>
        <text class="ml-auto text-xs text-[#00a63e]">
          {{ distanceText }} 米 · 光照系数 {{ distanceFactorText }}
        </text>
      </view>

      <view class="mt-2 rounded-xl bg-[#fffbeb] px-3 py-2.5">
        <text class="text-xs leading-[19px] text-[#973c00]">
          距离只是估算：如果窗与植物之间有柜子、墙角、厚窗帘等遮挡，或站在植物位置基本看不到窗，建议改选房间中部或房间深处。
        </text>
      </view>

      <view class="mt-3 flex gap-2">
        <text
          v-for="item in positionOptions"
          :key="item.key"
          class="flex-1 rounded-xl border px-2 py-2 text-center text-xs font-bold"
          :class="
            environment.position === item.key
              ? 'border-[#00a63e] bg-[#f0fdf4] text-[#008236]'
              : 'border-[#e5e7eb] text-[#4a5565]'
          "
          @click="selectPosition(item.key)"
        >
          {{ item.label }}
        </text>
      </view>

      <view class="mt-3 flex items-center justify-between rounded-xl bg-[#f8faf9] px-3 py-2.5">
        <text class="text-xs font-bold text-[#4a5565]">每天有直射光</text>
        <switch
          :id="`diagnose-light-direct-sun-${questionId}`"
          :checked="environment.hasDirectSun"
          color="#00a63e"
          @change="handleDirectSunChange"
        />
      </view>
    </view>

    <view
      v-if="showDirectionDialog"
      id="diagnose-light-direction-dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] px-6"
    >
      <view class="w-full max-w-[345px] rounded-2xl bg-white p-5 shadow-xl">
        <view class="flex items-center justify-between">
          <text class="text-base font-bold text-[#1e2939]">校准方位</text>
          <text
            id="diagnose-light-direction-dialog-close"
            class="px-1 text-2xl leading-none text-[#9aa4b2]"
            @click="closeDirectionDialog"
          >
            ×
          </text>
        </view>
        <text class="mt-3 block text-sm leading-[22px] text-[#4a5565]">
          请水平持握手机，走至植物所在位置，将手机顶端面向窗户后点击「确认」校准方位。
        </text>
        <view
          class="relative mx-auto mt-4 h-28 w-28 rounded-full border border-[#e5e7eb] bg-[#f9fafb]"
        >
          <text class="absolute left-1/2 top-1 -translate-x-1/2 text-xs font-bold text-[#99a1af]"
            >N</text
          >
          <text class="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold text-[#99a1af]"
            >S</text
          >
          <text class="absolute left-1 top-1/2 -translate-y-1/2 text-xs font-bold text-[#99a1af]"
            >W</text
          >
          <text class="absolute right-1 top-1/2 -translate-y-1/2 text-xs font-bold text-[#99a1af]"
            >E</text
          >
          <view class="absolute left-[54px] top-[54px] h-2.5 w-2.5 rounded-full bg-[#008236]" />
          <view
            class="absolute left-[58px] top-[48px] h-1 w-11 origin-left rotate-[-10deg] rounded-full bg-[#00a63e]"
          />
        </view>
        <text class="mt-4 block text-center text-sm font-bold text-[#008236]">
          当前朝向：{{ currentFacingText }}窗
        </text>
        <text class="mt-2 block text-center text-xs leading-5 text-[#6a7282]">
          {{ compassStatusText }}
        </text>
        <button
          id="diagnose-light-direction-dialog-confirm"
          class="mt-4 h-11 rounded-2xl bg-[#00a63e] p-0 text-base font-bold leading-11 text-white"
          @click="confirmDirection"
        >
          确认
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  compassDirectionToFacing,
  createDefaultLightEnvironment,
  getLightFacingLabel,
  sanitizeLightEnvironment
} from '@/pages/diagnose/question-package/light-environment.js'
import selectedDirectionArrowIcon from '@/pages/diagnose/question-package/direction-selected-arrow.svg'

const props = defineProps({
  modelValue: { type: Object, default: () => createDefaultLightEnvironment() },
  questionId: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const showDirectionDialog = ref(false)
const environment = ref(sanitizeLightEnvironment(props.modelValue))
const compassStatusText = ref('打开弹框后会尝试读取罗盘，也可以手动选择方向。')
let compassListener = null
let compassTimeout = null

const windowOptions = [
  { key: 'window', label: '有窗' },
  { key: 'no_window', label: '无窗' },
  { key: 'grow_light', label: '补光灯' }
]
const directionOptions = [
  { key: 'north', label: '北', style: 'left:90px;top:0;' },
  { key: 'north_east', label: '东北', style: 'right:20px;top:24px;' },
  { key: 'east', label: '东', style: 'right:0;top:90px;' },
  { key: 'south_east', label: '东南', style: 'right:20px;bottom:24px;' },
  { key: 'south', label: '南', style: 'left:90px;bottom:0;' },
  { key: 'south_west', label: '西南', style: 'left:20px;bottom:24px;' },
  { key: 'west', label: '西', style: 'left:0;top:90px;' },
  { key: 'north_west', label: '西北', style: 'left:20px;top:24px;' }
]
const positionOptions = [
  { key: 'window_side', label: '窗边' },
  { key: 'middle', label: '房间中部' },
  { key: 'deep', label: '房间深处' }
]

const selectedWindowKey = computed(() => {
  if (environment.value.windowType === 'no_window') {
    return 'no_window'
  }
  if (environment.value.windowType === 'grow_light') {
    return 'grow_light'
  }
  return 'window'
})
const distanceText = computed(() => Number(environment.value.distance || 0).toFixed(1))
const distanceBandText = computed(() => {
  const value = Number(environment.value.distance || 0)
  if (value <= 1.2) {
    return '靠窗'
  }
  if (value <= 3.5) {
    return '房间中部'
  }
  return '房间深处'
})
const distanceFactorText = computed(() => {
  const value = Number(environment.value.distance || 0)
  const factor =
    value <= 1
      ? 1
      : value <= 3
        ? Math.max(0.82, 1 - (value - 1) * 0.08)
        : Math.max(0.42, 0.82 - (value - 3) * 0.06)
  return factor.toFixed(2)
})
const currentFacingText = computed(() => {
  return getLightFacingLabel(environment.value.facing)
})
const selectedDirectionArrowStyle = computed(() => {
  const angleMap = {
    east: 0,
    south_east: 45,
    south: 90,
    south_west: 135,
    west: 180,
    north_west: 225,
    north: 270,
    north_east: 315
  }
  const angle = angleMap[environment.value.facing]
  if (angle === undefined) {
    return ''
  }
  const radius = 55
  const radians = (angle * Math.PI) / 180
  const left = 110 + Math.cos(radians) * radius
  const top = 110 + Math.sin(radians) * radius
  return [
    `left:${left.toFixed(1)}px`,
    `top:${top.toFixed(1)}px`,
    `transform:translate(-50%, -50%) rotate(${angle + 90}deg)`,
    'transform-origin:center center'
  ].join(';')
})

function commit(nextValue) {
  environment.value = sanitizeLightEnvironment(nextValue)
  emit('update:modelValue', environment.value)
  emit('change', environment.value)
}

function selectWindow(key) {
  if (key === 'no_window') {
    commit({
      ...environment.value,
      windowType: 'no_window',
      facing: 'no_window',
      position: 'deep',
      hasDirectSun: false,
      distance: 10
    })
    return
  }
  if (key === 'grow_light') {
    commit({
      ...environment.value,
      windowType: 'grow_light',
      facing: 'unknown',
      position: 'middle',
      hasDirectSun: false,
      distance: 2
    })
    return
  }
  commit({
    ...environment.value,
    windowType: 'standard',
    facing: environment.value.facing === 'no_window' ? 'south' : environment.value.facing,
    distance: Math.min(environment.value.distance || 1, 3)
  })
}

function selectFacing(facing) {
  commit({ ...environment.value, facing })
}

function clearCompassTimeout() {
  if (!compassTimeout) {
    return
  }
  clearTimeout(compassTimeout)
  compassTimeout = null
}

function getWxCompassApi() {
  const wxApi = globalThis?.wx
  if (!wxApi || typeof wxApi !== 'object') {
    return null
  }
  if (typeof wxApi.onCompassChange !== 'function') {
    return null
  }
  return wxApi
}

function stopCompassWatch() {
  clearCompassTimeout()
  const wxApi = getWxCompassApi()
  if (wxApi && compassListener && typeof wxApi.offCompassChange === 'function') {
    wxApi.offCompassChange(compassListener)
  }
  if (wxApi && typeof wxApi.stopCompass === 'function') {
    wxApi.stopCompass()
  }
  compassListener = null
}

function applyCompassDirection(direction) {
  const facing = compassDirectionToFacing(direction)
  if (facing === 'unknown') {
    return
  }
  clearCompassTimeout()
  commit({ ...environment.value, facing })
  compassStatusText.value = `已自动选中${getLightFacingLabel(facing)}窗，可继续手动调整。`
}

function startCompassWatch() {
  stopCompassWatch()
  const wxApi = getWxCompassApi()
  if (!wxApi) {
    compassStatusText.value = '当前环境无法读取罗盘，请手动选择方向。'
    return
  }
  compassStatusText.value = '正在读取罗盘方向，也可以手动选择。'
  compassListener = result => {
    if (!showDirectionDialog.value) {
      return
    }
    applyCompassDirection(result?.direction)
  }
  try {
    wxApi.onCompassChange(compassListener)
    if (typeof wxApi.startCompass === 'function') {
      wxApi.startCompass({
        fail: () => {
          compassStatusText.value = '罗盘暂不可用，请手动选择方向。'
        }
      })
    }
    compassTimeout = setTimeout(() => {
      compassStatusText.value = '暂未读取到罗盘方向，请手动选择方向。'
    }, 4000)
  } catch (error) {
    stopCompassWatch()
    compassStatusText.value = '罗盘暂不可用，请手动选择方向。'
  }
}

function openDirectionDialog(nextFacing = '') {
  if (nextFacing) {
    commit({ ...environment.value, facing: nextFacing })
  }
  showDirectionDialog.value = true
  startCompassWatch()
}

function closeDirectionDialog() {
  showDirectionDialog.value = false
  stopCompassWatch()
}

function selectPosition(position) {
  const distance = position === 'window_side' ? 1 : position === 'middle' ? 2.5 : 5
  commit({ ...environment.value, position, distance })
}

function handleDistanceChange(event) {
  const distance = Number(event?.detail?.value)
  const position = distance <= 1.2 ? 'window_side' : distance <= 3.5 ? 'middle' : 'deep'
  commit({ ...environment.value, distance, position })
}

function handleDirectSunChange(event) {
  commit({ ...environment.value, hasDirectSun: Boolean(event?.detail?.value) })
}

function confirmDirection() {
  closeDirectionDialog()
}

onBeforeUnmount(() => {
  stopCompassWatch()
})

watch(
  () => props.modelValue,
  value => {
    environment.value = sanitizeLightEnvironment(value)
  },
  { deep: true }
)
</script>
