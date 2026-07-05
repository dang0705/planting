<template>
  <uni-popup
    ref="popupRef"
    type="bottom"
    :safe-area="false"
    :is-mask-click="maskClick"
    @change="handleChange"
  >
    <view
      :id="panelId"
      class="bottom-sheet-panel flex max-h-[var(--bottom-sheet-max-height)] flex-col overflow-hidden rounded-t-[20px] bg-white"
      :style="{ '--bottom-sheet-max-height': maxHeight }"
    >
      <view class="bottom-sheet-grip mx-auto mt-2.5 h-1 w-14 rounded-full bg-gray-200" />
      <view
        v-if="showHeader"
        class="bottom-sheet-header grid grid-cols-[1fr_auto] items-start gap-3 px-4 pt-4"
      >
        <view class="min-w-0">
          <slot name="header">
            <text v-if="title" class="block text-lg font-semibold text-gray-900">{{ title }}</text>
            <text v-if="subtitle" class="mt-1 block text-xs leading-4 text-gray-500">
              {{ subtitle }}
            </text>
          </slot>
        </view>
        <view
          v-if="showClose"
          :id="closeId"
          class="flex size-8 items-center justify-center rounded-full bg-gray-100"
          @click="close"
        >
          <text class="text-base leading-none text-gray-500">×</text>
        </view>
      </view>

      <scroll-view
        :id="contentId"
        scroll-y
        class="min-h-0 flex-1 px-4"
        :class="showHeader ? 'pt-3' : 'pt-4'"
        :style="{ height: scrollHeight }"
      >
        <slot />
      </scroll-view>

      <view
        v-if="showConfirm || $slots.confirm"
        class="bottom-sheet-confirm bg-white px-4 pb-4 pt-3"
      >
        <slot name="confirm" :confirm="confirm" :close="close">
          <button
            :id="confirmId"
            class="m-0 w-full rounded-[14px] bg-primary py-3 text-[15px] font-semibold text-white after:border-0 disabled:bg-gray-300"
            hover-class="none"
            :disabled="confirmDisabled || confirmLoading"
            @click="confirm"
          >
            {{ confirmLoading ? loadingText : confirmText }}
          </button>
        </slot>
      </view>
    </view>
  </uni-popup>
</template>

<script setup>
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  watch
} from 'vue'
import { useLayoutStore } from '@/store/layout.js'
import { callComponentMethod } from '@/utils/component-ref.js'

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  panelId: { type: String, default: 'bottom-sheet-panel' },
  contentId: { type: String, default: 'bottom-sheet-content' },
  closeId: { type: String, default: 'bottom-sheet-close-button' },
  confirmId: { type: String, default: 'bottom-sheet-confirm-button' },
  confirmText: { type: String, default: '确认' },
  loadingText: { type: String, default: '处理中...' },
  confirmDisabled: { type: Boolean, default: false },
  confirmLoading: { type: Boolean, default: false },
  showClose: { type: Boolean, default: true },
  showConfirm: { type: Boolean, default: false },
  showHeader: { type: Boolean, default: true },
  maskClick: { type: Boolean, default: true },
  closeOnConfirm: { type: Boolean, default: false },
  onConfirm: { type: Function, default: null }
})
const emit = defineEmits(['change', 'close', 'confirm'])
const popupRef = ref(null)
const instance = getCurrentInstance()
const layoutStore = useLayoutStore()
const maxHeight = computed(() => `calc(100vh - ${Number(layoutStore.headerHeight || 0)}px)`)
const scrollHeight = ref('320px')
const visible = ref(false)
let measureTimer = null

onMounted(() => {
  layoutStore.ensureHeaderMetrics()
  setFallbackScrollHeight()
})
onBeforeUnmount(() => {
  if (measureTimer) {
    clearTimeout(measureTimer)
    measureTimer = null
  }
})
onUpdated(() => {
  if (visible.value) {
    scheduleMeasure()
  }
})

watch(
  () => [
    props.title,
    props.subtitle,
    props.showHeader,
    props.showConfirm,
    props.confirmText,
    props.confirmLoading,
    props.confirmDisabled,
    layoutStore.headerHeight
  ],
  () => {
    if (visible.value) {
      scheduleMeasure()
    }
  }
)

function open() {
  layoutStore.ensureHeaderMetrics()
  setFallbackScrollHeight()
  callComponentMethod(popupRef, 'open')
  scheduleMeasure(80)
}
function close() {
  callComponentMethod(popupRef, 'close')
}
async function confirm() {
  if (props.confirmDisabled || props.confirmLoading) {
    return
  }
  emit('confirm')
  if (props.onConfirm) {
    await props.onConfirm()
  }
  if (props.closeOnConfirm) {
    close()
  }
}
function handleChange(event) {
  visible.value = Boolean(event?.show)
  emit('change', event)
  if (event?.show) {
    scheduleMeasure(80)
  } else {
    emit('close')
  }
}

function getWindowHeight() {
  try {
    const systemInfo = uni.getSystemInfoSync()
    return Number(systemInfo.windowHeight || systemInfo.screenHeight || 0)
  } catch {
    return 0
  }
}

function getMaxAvailableHeight() {
  const windowHeight = getWindowHeight()
  const headerHeight = Number(layoutStore.headerHeight || 0)
  return Math.max(160, windowHeight ? windowHeight - headerHeight : 520)
}

function setFallbackScrollHeight() {
  const reservedHeight = props.showHeader ? 104 : 64
  scrollHeight.value = `${Math.max(160, getMaxAvailableHeight() - reservedHeight)}px`
}

function scheduleMeasure(delay = 0) {
  if (measureTimer) {
    clearTimeout(measureTimer)
  }
  measureTimer = setTimeout(async () => {
    measureTimer = null
    await measureScrollHeight()
  }, delay)
}

async function measureScrollHeight() {
  await nextTick()
  const proxy = instance?.proxy
  if (!proxy) {
    setFallbackScrollHeight()
    return
  }

  const query = uni.createSelectorQuery().in(proxy)
  query.select('.bottom-sheet-grip').boundingClientRect()
  query.select('.bottom-sheet-header').boundingClientRect()
  query.select('.bottom-sheet-confirm').boundingClientRect()
  query.exec(rects => {
    const [gripRect, headerRect, confirmRect] = Array.isArray(rects) ? rects : []
    const gripHeight = Number(gripRect?.height || 0)
    const headerHeight = props.showHeader ? Number(headerRect?.height || 0) : 0
    const confirmHeight =
      props.showConfirm || proxy.$slots?.confirm ? Number(confirmRect?.height || 0) : 0
    const verticalPadding = props.showHeader ? 12 : 16
    const nextHeight =
      getMaxAvailableHeight() - gripHeight - headerHeight - confirmHeight - verticalPadding
    scrollHeight.value = `${Math.max(160, Math.floor(nextHeight))}px`
  })
}

defineExpose({ open, close, refreshLayout: measureScrollHeight })
</script>
