<template>
  <view
    :id="`${idPrefix}-environment-${questionId}`"
    class="mt-4 flex flex-col gap-2.5"
    :class="{ 'pointer-events-none opacity-60': disabled }"
  >
    <!-- 有窗（居首）：作为 uni-ui 折叠面板的标题项，方位选择器/校准方位/离窗距离/位置选项/直射光均落在面板内部 -->
    <uni-collapse
      :key="windowCollapseRenderKey"
      :id="`${idPrefix}-window-detail-${questionId}`"
      v-model="windowCollapseName"
      accordion
      @change="handleCollapseChange"
    >
      <uni-collapse-item
        :name="`${idPrefix}-window-${windowOption.key}`"
        :open="isWindowCollapseOpen"
        :border="false"
        show-animation
        title-border="none"
        :key="windowOption.key"
      >
        <template v-slot:title>
          <view
            :id="`${idPrefix}-window-${windowOption.key}`"
            class="flex w-full items-center gap-3 px-4 py-3.5"
            @click.stop="selectWindow(windowOption.key)"
          >
            <view
              class="box-border h-5 w-5 rounded-full border-2 p-[3px]"
              :class="selectedWindowKey === 'window' ? 'border-[#00a63e]' : 'border-[#d1d5dc]'"
            >
              <view
                v-if="selectedWindowKey === 'window'"
                class="h-full w-full rounded-full bg-[#00a63e]"
              />
            </view>
            <text class="text-sm font-bold leading-5 text-[#1e2939]">{{ windowOption.label }}</text>
          </view>
        </template>

        <view class="ml-1 border-l-2 border-[#b9f8cf] pl-4">
          <!-- 方位选择器（对齐 Figma 220:62，页面居中） -->
          <view class="items-center pt-1" style="margin-left: -22px">
            <text class="mb-3 block text-center text-sm font-bold text-[#1e2939]">
              请选择您的窗户的方位
            </text>
            <view class="relative mx-auto h-[220px] w-[220px]">
              <!-- 外圆盘：fill #F5FBF7, stroke #C7E0D1 -->
              <view
                class="absolute left-[8px] top-[8px] h-[204px] w-[204px] rounded-full border border-[#C7E0D1] bg-[#F5FBF7]"
              />
              <!-- 内圈氛围：fill #EBF6EF opacity 0.64 -->
              <view
                class="absolute left-[54px] top-[54px] h-[112px] w-[112px] rounded-full bg-[#EBF6EF]"
                style="opacity: 0.64"
              />
              <!-- 4 主方位按钮 N/S/E/W：62px 圆形白色 + 阴影 + 箭头SVG + 标签 -->
              <view
                v-for="direction in cardinalDirections"
                :key="direction.key"
                :id="`${idPrefix}-facing-${direction.key}`"
                class="absolute z-10 flex h-[62px] w-[62px] flex-nowrap items-center justify-center whitespace-nowrap rounded-full border bg-white"
                :class="[
                  direction.layout === 'row' ? 'flex-row' : 'flex-col',
                  environment.facing === direction.key ? 'border-[#276845]' : 'border-[#C7E0D1]'
                ]"
                style="box-shadow: 0 6px 14px rgba(21, 58, 37, 0.12)"
                :style="direction.style"
                @click="selectFacing(direction.key)"
              >
                <image
                  :src="
                    environment.facing === direction.key
                      ? directionArrowActiveIcon
                      : directionArrowInactiveIcon
                  "
                  class="h-[26px] w-[26px] shrink-0"
                  mode="aspectFit"
                  :style="`transform: rotate(${direction.arrowRotation}deg)`"
                />
                <text
                  class="shrink-0 text-[11.5px] font-semibold leading-none"
                  :class="[
                    direction.layout === 'row' ? 'ml-2' : 'mt-2',
                    environment.facing === direction.key ? 'text-[#276845]' : 'text-[#2e4838]'
                  ]"
                >
                  {{ direction.label }}
                </text>
              </view>
              <!-- 4 对角方位按钮 NE/SE/SW/NW：仅箭头，无圆形背景 -->
              <view
                v-for="direction in diagonalDirections"
                :key="direction.key"
                :id="`${idPrefix}-facing-${direction.key}`"
                class="absolute z-10 flex h-[28px] w-[28px] items-center justify-center"
                :style="direction.style"
                @click="selectFacing(direction.key)"
              >
                <image
                  :src="
                    environment.facing === direction.key
                      ? directionArrowActiveIcon
                      : directionArrowInactiveIcon
                  "
                  class="h-[19px] w-[19px]"
                  mode="aspectFit"
                  :style="`transform: rotate(${direction.arrowRotation}deg)`"
                />
              </view>
              <!-- 中心不确定按钮：54px 圆形白色 + #C7E0D1 边框 + 阴影 -->
              <view
                :id="`${idPrefix}-facing-unknown`"
                class="absolute left-1/2 top-1/2 z-20 flex h-[54px] w-[54px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[#C7E0D1] bg-white"
                style="box-shadow: 0 4px 10px rgba(21, 58, 37, 0.05)"
                :class="environment.facing === 'unknown' ? 'ring-2 ring-[#276845]' : ''"
                @click="openDirectionDialog('unknown')"
              >
                <text class="text-[9px] font-medium leading-[13px] text-[#74907e]">不确定</text>
                <text
                  class="text-[11px] font-normal leading-[14px] text-[#74907e]"
                  style="opacity: 0.68"
                  >?</text
                >
              </view>
            </view>
          </view>

          <!-- 离窗距离 -->
          <view class="mt-4 flex items-center justify-between">
            <text class="text-sm leading-5 text-[#4a5565]">离窗距离</text>
            <view class="flex rounded-xl bg-[#f3f4f6] p-0.5">
              <text class="rounded-[10px] bg-white px-3 py-1 text-xs font-bold text-[#008236]"
                >米</text
              >
              <text class="px-3 py-1 text-xs font-bold text-[#6a7282]">步</text>
            </view>
          </view>

          <slider
            :id="`${idPrefix}-distance-slider-${questionId}`"
            class="mt-2"
            min="0"
            max="10"
            step="0.5"
            :value="environment.distance"
            activeColor="#00a63e"
            backgroundColor="#e5e7eb"
            block-color="#ffffff"
            block-size="20"
            :disabled="disabled"
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

          <!-- 位置选项 -->
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

          <!-- 每天有直射光 -->
          <view class="mt-3 flex items-center justify-between rounded-xl bg-[#f8faf9] px-3 py-2.5">
            <text class="text-xs font-bold text-[#4a5565]">每天有直射光</text>
            <switch
              :id="`${idPrefix}-direct-sun-${questionId}`"
              :checked="environment.hasDirectSun"
              color="#00a63e"
              :disabled="disabled"
              @change="handleDirectSunChange"
            />
          </view>
        </view>
      </uni-collapse-item>
    </uni-collapse>

    <!-- 无窗 / 补光灯：普通单选项 -->
    <view
      v-for="option in nonWindowOptions"
      :key="option.key"
      :id="`${idPrefix}-window-${option.key}`"
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

    <view v-if="errorText" class="mt-1 px-1">
      <text class="text-xs text-red-500">{{ errorText }}</text>
    </view>

    <!-- 校准方位弹框：罗盘指针直接对齐 Figma 节点 154:271 -->
    <view
      v-if="showDirectionDialog"
      :id="`${idPrefix}-direction-dialog`"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] px-6"
    >
      <view class="w-full max-w-[345px] rounded-2xl bg-white p-5 shadow-xl">
        <view class="flex items-center justify-between">
          <text class="text-base font-bold text-[#1e2939]">校准方位</text>
          <text
            :id="`${idPrefix}-direction-dialog-close`"
            class="px-1 text-2xl leading-none text-[#9aa4b2]"
            @click="closeDirectionDialog"
          >
            ×
          </text>
        </view>
        <text class="mt-3 block text-sm leading-[22px] text-[#4a5565]">
          请水平持握手机，走至植物所在位置，将手机顶端面向窗户后点击「确认」校准方位。
        </text>

        <!-- 罗盘：对齐 Figma 154:271，圆形容器 #f9fafb，N/S/E/W 标签 #9ca3af -->
        <view
          class="relative mx-auto mt-4 h-[112px] w-[112px] rounded-full border border-[#e5e7eb] bg-[#f9fafb]"
        >
          <text
            class="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] font-bold text-[#9ca3af]"
            >N</text
          >
          <text
            class="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#9ca3af]"
            >S</text
          >
          <text
            class="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#9ca3af]"
            >W</text
          >
          <text
            class="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#9ca3af]"
            >E</text
          >
          <!-- 指针：对齐 Figma 154:278，居中(inset 45.2%) + 旋转，默认 -116.8deg -->
          <view
            class="absolute left-1/2 top-1/2 h-0.5 w-10 origin-center rounded-full bg-[#00a63e]"
            :style="compassPointerStyle"
          />
          <view
            class="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#008236]"
          />
        </view>

        <text class="mt-4 block text-center text-sm font-bold text-[#008236]">
          当前朝向：{{ currentFacingText }}窗
        </text>
        <text class="mt-2 block text-center text-xs leading-5 text-[#6a7282]">
          {{ compassStatusText }}
        </text>
        <button
          :id="`${idPrefix}-direction-dialog-confirm`"
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  compassDirectionToFacing,
  createDefaultLightEnvironment,
  getLightFacingLabel,
  sanitizeLightEnvironment
} from '@/utils/light-environment.js'
import selectedDirectionArrowIcon from '@/assets/icons/direction-selected-arrow.svg'
import directionArrowActiveIcon from '@/assets/icons/direction-arrow-active.svg'
import directionArrowInactiveIcon from '@/assets/icons/direction-arrow-inactive.svg'

const props = defineProps({
  modelValue: { type: Object, default: () => createDefaultLightEnvironment() },
  questionId: { type: String, default: '' },
  idPrefix: { type: String, default: 'light-env' },
  disabled: { type: Boolean, default: false },
  errorText: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const showDirectionDialog = ref(false)
const windowOption = { key: 'window', label: '有窗' }
const environment = ref(sanitizeLightEnvironment(props.modelValue))
const windowCollapseItemName = computed(() => `${props.idPrefix}-window-${windowOption.key}`)
// 初始默认选中「有窗」时展开折叠面板，使方位/离窗距离等详情默认可见
const windowCollapseName = ref(
  environment.value.windowType === 'standard' ? windowCollapseItemName.value : ''
)
const windowCollapseRenderKey = ref(windowCollapseName.value)
const compassStatusText = ref('打开弹框后会尝试读取罗盘，也可以手动选择方向。')
let windowCollapseVersion = 0
let compassListener = null
let compassTimeout = null

const nonWindowOptions = [
  { key: 'no_window', label: '无窗' },
  { key: 'grow_light', label: '补光灯' }
]
// 4 主方位按钮（62px 圆形，对齐 Figma 220:62）
const cardinalDirections = [
  { key: 'north', label: '北', arrowRotation: 0, layout: 'col', style: 'left:79px; top:-3px;' },
  { key: 'east', label: '东', arrowRotation: 90, layout: 'row', style: 'left:160px; top:79px;' },
  { key: 'south', label: '南', arrowRotation: 180, layout: 'col', style: 'left:79px; top:161px;' },
  { key: 'west', label: '西', arrowRotation: -90, layout: 'row', style: 'left:-2px; top:79px;' }
]
// 4 对角方位按钮（28px 圆形，对齐 Figma 220:62）
const diagonalDirections = [
  { key: 'north_east', arrowRotation: 45, style: 'left:162px; top:30px;' },
  { key: 'south_east', arrowRotation: 135, style: 'left:162px; top:162px;' },
  { key: 'south_west', arrowRotation: -135, style: 'left:30px; top:162px;' },
  { key: 'north_west', arrowRotation: -45, style: 'left:30px; top:30px;' }
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
const isWindowCollapseOpen = computed(() => {
  return (
    selectedWindowKey.value === 'window' &&
    windowCollapseName.value === windowCollapseItemName.value
  )
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

// 校准方位弹框罗盘指针：对齐 Figma 154:271。
// Figma 指针组默认 rotate(-116.8deg)（指向东南方位基准），
// 在此基础上叠加当前 facing 相对南向(90°)的偏移，保持指针指向选中方位。
const compassPointerStyle = computed(() => {
  const angleMap = {
    north: 270,
    north_east: 315,
    east: 0,
    south_east: 45,
    south: 90,
    south_west: 135,
    west: 180,
    north_west: 225
  }
  const facingAngle = angleMap[environment.value.facing]
  if (facingAngle === undefined) {
    return 'transform:translate(-50%, -50%) rotate(-116.8deg);transform-origin:center;'
  }
  // 指针默认指向南（Figma 基准 -116.8deg 对应南），按 facing 相对南的偏移旋转
  const offset = facingAngle - 90
  const rotation = -116.8 + offset
  return `transform:translate(-50%, -50%) rotate(${rotation.toFixed(1)}deg);transform-origin:center;`
})

function commit(nextValue) {
  environment.value = sanitizeLightEnvironment(nextValue)
  emit('update:modelValue', environment.value)
  emit('change', environment.value)
}

// 折叠面板展开/收起只控制有窗详情的显隐，不改 windowType、不联动其它 radio。
// 选中「有窗」仅通过点击标题 radio（selectWindow('window')）触发，并在其中展开面板；
// 选中无窗/补光灯仅通过点击它们各自的 radio 触发，并在 watch(windowType) 中收起面板。
function handleCollapseChange(value) {
  if (Array.isArray(value)) {
    const [firstOpenName = ''] = value
    windowCollapseName.value = firstOpenName
    return
  }
  windowCollapseName.value = value || ''
}

function refreshWindowCollapseKey(windowType = environment.value.windowType) {
  windowCollapseVersion++
  windowCollapseRenderKey.value = `${windowCollapseItemName.value}:${windowType}:${windowCollapseName.value || 'closed'}:${windowCollapseVersion}`
}

function openWindowCollapse() {
  windowCollapseName.value = windowCollapseItemName.value
  refreshWindowCollapseKey('standard')
}

function closeWindowCollapse(windowType = environment.value.windowType) {
  windowCollapseName.value = ''
  refreshWindowCollapseKey(windowType)
  nextTick(() => {
    if (environment.value.windowType === 'standard') {
      return
    }
    windowCollapseName.value = ''
    refreshWindowCollapseKey(environment.value.windowType)
  })
}

function selectWindow(key) {
  if (props.disabled) {
    return
  }
  if (key === 'no_window') {
    closeWindowCollapse('no_window')
    commit({
      ...environment.value,
      windowType: 'no_window',
      facing: 'no_window',
      position: 'deep',
      hasDirectSun: false,
      distance: 10
    })
    closeWindowCollapse('no_window')
    return
  }
  if (key === 'grow_light') {
    closeWindowCollapse('grow_light')
    commit({
      ...environment.value,
      windowType: 'grow_light',
      facing: 'unknown',
      position: 'middle',
      hasDirectSun: false,
      distance: 2
    })
    closeWindowCollapse('grow_light')
    return
  }
  commit({
    ...environment.value,
    windowType: 'standard',
    facing: environment.value.facing === 'no_window' ? 'south' : environment.value.facing,
    distance: Math.min(environment.value.distance || 1, 3)
  })
  // 选中「有窗」时展开折叠面板，展示方位/距离等详情
  openWindowCollapse()
}

function selectFacing(facing) {
  if (props.disabled) {
    return
  }
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
  if (props.disabled) {
    return
  }
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
  if (props.disabled) {
    return
  }
  const distance = position === 'window_side' ? 1 : position === 'middle' ? 2.5 : 5
  commit({ ...environment.value, position, distance })
}

function handleDistanceChange(event) {
  if (props.disabled) {
    return
  }
  const distance = Number(event?.detail?.value)
  const position = distance <= 1.2 ? 'window_side' : distance <= 3.5 ? 'middle' : 'deep'
  commit({ ...environment.value, distance, position })
}

function handleDirectSunChange(event) {
  if (props.disabled) {
    return
  }
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

// 选中无窗/补光灯时收起有窗折叠面板；选中「有窗」时的展开由 selectWindow 主动控制，
// 这样用户手动折叠已选中的「有窗」不会被 watch 强制重新展开。
watch(
  () => environment.value.windowType,
  windowType => {
    if (windowType !== 'standard') {
      closeWindowCollapse()
    }
  },
  { immediate: true }
)
</script>
