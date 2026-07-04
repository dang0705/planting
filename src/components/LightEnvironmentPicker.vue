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
              :class="selectedWindowKey === 'window' ? 'border-brand' : 'border-ink-inactiveBorder'"
            >
              <view
                v-if="selectedWindowKey === 'window'"
                class="h-full w-full rounded-full bg-brand"
              />
            </view>
            <text class="text-sm font-bold leading-5 text-ink-title">{{ windowOption.label }}</text>
          </view>
        </template>

        <view class="ml-1 border-l-2 border-brand-border pl-4">
          <!-- 方位选择器（对齐 Figma 220:62，页面居中） -->
          <view class="items-center pt-1" style="margin-left: -22px">
            <text class="mb-3 block text-center text-sm font-bold text-ink-title">
              请选择您的窗户的方位
            </text>
            <view class="relative mx-auto h-[220px] w-[220px]">
              <!-- 外圆盘：fill #F5FBF7, stroke #C7E0D1 -->
              <view
                class="absolute left-[8px] top-[8px] h-[204px] w-[204px] rounded-full border border-lightEnv-dialStroke bg-lightEnv-dialFill"
              />
              <!-- 内圈氛围：fill #EBF6EF opacity 0.64 -->
              <view
                class="absolute left-[54px] top-[54px] h-[112px] w-[112px] rounded-full bg-lightEnv-innerAmbient"
                style="opacity: 0.64"
              />
              <!-- 4 主方位按钮 N/S/E/W：62px 圆形白色 + 阴影 + 箭头SVG + 标签 -->
              <view
                v-for="direction in cardinalDirections"
                :key="direction.key"
                :id="`${idPrefix}-facing-${direction.key}`"
                class="absolute z-10 flex h-[62px] w-[62px] flex-nowrap items-center justify-center whitespace-nowrap rounded-full border bg-white shadow-facing-btn"
                :class="[
                  direction.layout === 'row' ? 'flex-row' : 'flex-col',
                  environment.facing === direction.key
                    ? 'border-lightEnv-facingActive'
                    : 'border-lightEnv-dialStroke'
                ]"
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
                    environment.facing === direction.key
                      ? 'text-lightEnv-facingActive'
                      : 'text-lightEnv-facingText'
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
                class="absolute left-1/2 top-1/2 z-20 flex h-[54px] w-[54px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-lightEnv-dialStroke bg-white shadow-uncertain-btn"
                :class="environment.facing === 'unknown' ? 'ring-2 ring-lightEnv-facingActive' : ''"
                @click="openDirectionDialog('unknown')"
              >
                <text class="text-[9px] font-medium leading-[13px] text-lightEnv-uncertain"
                  >不确定</text
                >
                <text
                  class="text-[11px] font-normal leading-[14px] text-lightEnv-uncertain"
                  style="opacity: 0.68"
                  >?</text
                >
              </view>
            </view>
          </view>

          <!-- 离窗距离 -->
          <view class="mt-4 flex items-center justify-between">
            <text class="text-sm leading-5 text-ink-body">离窗距离</text>
            <view class="flex rounded-xl bg-gray-100 p-0.5">
              <text class="rounded-[10px] bg-white px-3 py-1 text-xs font-bold text-brand-dark"
                >米</text
              >
              <text class="px-3 py-1 text-xs font-bold text-ink-faint">步</text>
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
            <text class="text-xs text-ink-muted">0 m</text>
            <text class="text-xs text-ink-muted">10 m</text>
          </view>

          <view class="mt-2 flex items-center gap-2 rounded-xl bg-brand-tint px-3 py-2">
            <view class="h-2 w-2 rounded-full bg-brand-accent" />
            <text class="text-sm font-bold text-brand-darker">{{ distanceBandText }}</text>
            <text class="ml-auto text-xs text-brand">
              {{ distanceText }} 米 · 光照系数 {{ distanceFactorText }}
            </text>
          </view>

          <view class="mt-2 rounded-xl bg-status-hintBg px-3 py-2.5">
            <text class="text-xs leading-[19px] text-status-hintText">
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
                  ? 'border-brand bg-brand-tint text-brand-dark'
                  : 'border-gray-200 text-ink-body'
              "
              @click="selectPosition(item.key)"
            >
              {{ item.label }}
            </text>
          </view>

          <!-- 每天有直射光 -->
          <view
            class="mt-3 flex items-center justify-between rounded-xl bg-status-directSunBg px-3 py-2.5"
          >
            <text class="text-xs font-bold text-ink-body">每天有直射光</text>
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
      :class="selectedWindowKey === option.key ? 'border-brand bg-brand-tint' : 'border-gray-200'"
      @click="selectWindow(option.key)"
    >
      <view class="flex items-center gap-3">
        <view
          class="box-border h-5 w-5 rounded-full border-2 p-[3px]"
          :class="selectedWindowKey === option.key ? 'border-brand' : 'border-ink-inactiveBorder'"
        >
          <view
            v-if="selectedWindowKey === option.key"
            class="h-full w-full rounded-full bg-brand"
          />
        </view>
        <text class="text-sm font-bold leading-5 text-ink-title">{{ option.label }}</text>
      </view>
    </view>

    <view v-if="errorText" class="mt-1 px-1">
      <text class="text-xs text-red-500">{{ errorText }}</text>
    </view>

    <!-- 校准方位弹框：罗盘指针直接对齐 Figma 节点 154:271 -->
    <view
      v-if="showDirectionDialog"
      :id="`${idPrefix}-direction-dialog`"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
    >
      <view class="w-full max-w-[345px] rounded-2xl bg-white p-5 shadow-xl">
        <view class="flex items-center justify-between">
          <text class="text-base font-bold text-ink-title">校准方位</text>
          <text
            :id="`${idPrefix}-direction-dialog-close`"
            class="px-1 text-2xl leading-none text-ink-close"
            @click="closeDirectionDialog"
          >
            ×
          </text>
        </view>
        <text class="mt-3 block text-sm leading-[22px] text-ink-body">
          请水平持握手机，走至植物所在位置，将手机顶端面向窗户后点击「确认」校准方位。
        </text>

        <!-- 罗盘：对齐 Figma 154:271，圆形容器 #f9fafb，N/S/E/W 标签 #9ca3af -->
        <view
          class="relative mx-auto mt-4 h-[112px] w-[112px] rounded-full border border-gray-200 bg-status-compassBg"
        >
          <text class="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] font-bold text-gray-400"
            >N</text
          >
          <text
            class="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-400"
            >S</text
          >
          <text class="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400"
            >W</text
          >
          <text
            class="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400"
            >E</text
          >
          <!-- 指针：对齐 Figma 154:278，居中(inset 45.2%) + 旋转，默认 -116.8deg -->
          <view
            class="absolute left-1/2 top-1/2 h-0.5 w-10 origin-center rounded-full bg-brand"
            :style="compassPointerStyle"
          />
          <view
            class="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-dark"
          />
        </view>

        <text class="mt-4 block text-center text-sm font-bold text-brand-dark">
          当前朝向：{{ currentFacingText }}窗
        </text>
        <text class="mt-2 block text-center text-xs leading-5 text-ink-faint">
          {{ compassStatusText }}
        </text>
        <button
          :id="`${idPrefix}-direction-dialog-confirm`"
          class="mt-4 h-11 rounded-2xl bg-brand p-0 text-base font-bold leading-11 text-white"
          @click="confirmDirection"
        >
          确认
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  createDefaultLightEnvironment,
  getLightFacingLabel,
  sanitizeLightEnvironment
} from '@/utils/light-environment.js'
import selectedDirectionArrowIcon from '@/assets/icons/direction-selected-arrow.svg'
import directionArrowActiveIcon from '@/assets/icons/direction-arrow-active.svg'
import directionArrowInactiveIcon from '@/assets/icons/direction-arrow-inactive.svg'
import { useCompassCalibration } from '@/composables/useCompassCalibration.js'
import { useWindowCollapsePanel } from '@/composables/useWindowCollapsePanel.js'
import {
  CARDINAL_DIRECTIONS,
  DIAGONAL_DIRECTIONS,
  NON_WINDOW_OPTIONS,
  POSITION_DEFAULT_DISTANCE,
  POSITION_OPTIONS,
  WINDOW_OPTION,
  resolveCompassPointerStyle,
  resolveDirectionArrowStyle,
  resolveDistanceBand,
  resolveDistanceFactor,
  resolveDistancePosition
} from './light-env-constants.js'

const props = defineProps({
  modelValue: { type: Object, default: () => createDefaultLightEnvironment() },
  questionId: { type: String, default: '' },
  idPrefix: { type: String, default: 'light-env' },
  disabled: { type: Boolean, default: false },
  errorText: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const environment = ref(sanitizeLightEnvironment(props.modelValue))

const {
  showDirectionDialog,
  compassStatusText,
  openDirectionDialog,
  closeDirectionDialog,
  confirmDirection
} = useCompassCalibration({
  disabled: () => props.disabled,
  getEnvironment: () => environment.value,
  commit
})

const {
  windowCollapseItemName,
  windowCollapseName,
  windowCollapseRenderKey,
  openWindowCollapse,
  closeWindowCollapse,
  handleCollapseChange
} = useWindowCollapsePanel({
  idPrefix: () => props.idPrefix,
  getEnvironment: () => environment.value
})

function commit(nextValue) {
  environment.value = sanitizeLightEnvironment(nextValue)
  emit('update:modelValue', environment.value)
  emit('change', environment.value)
}

const selectedWindowKey = computed(() => {
  if (environment.value.windowType === 'no_window') {
    return 'no_window'
  }
  if (environment.value.windowType === 'grow_light') {
    return 'grow_light'
  }
  return 'window'
})

// 暴露给模板的驼峰别名（保持模板引用不变）
const windowOption = WINDOW_OPTION
const nonWindowOptions = NON_WINDOW_OPTIONS
const cardinalDirections = CARDINAL_DIRECTIONS
const diagonalDirections = DIAGONAL_DIRECTIONS
const positionOptions = POSITION_OPTIONS
const isWindowCollapseOpen = computed(() => {
  return (
    selectedWindowKey.value === 'window' &&
    windowCollapseName.value === windowCollapseItemName.value
  )
})
const distanceText = computed(() => Number(environment.value.distance || 0).toFixed(1))
const distanceBandText = computed(() => resolveDistanceBand(environment.value.distance))
const distanceFactorText = computed(() =>
  resolveDistanceFactor(environment.value.distance).toFixed(2)
)
const currentFacingText = computed(() => getLightFacingLabel(environment.value.facing))
const selectedDirectionArrowStyle = computed(() =>
  resolveDirectionArrowStyle(environment.value.facing)
)
const compassPointerStyle = computed(() => resolveCompassPointerStyle(environment.value.facing))

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

function selectPosition(position) {
  if (props.disabled) {
    return
  }
  commit({ ...environment.value, position, distance: POSITION_DEFAULT_DISTANCE[position] })
}

function handleDistanceChange(event) {
  if (props.disabled) {
    return
  }
  const distance = Number(event?.detail?.value)
  commit({ ...environment.value, distance, position: resolveDistancePosition(distance) })
}

function handleDirectSunChange(event) {
  if (props.disabled) {
    return
  }
  commit({ ...environment.value, hasDirectSun: Boolean(event?.detail?.value) })
}

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
