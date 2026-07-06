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
      class="bottom-sheet-panel overflow-hidden rounded-t-[20px] bg-white"
      :style="{ maxHeight: panelMaxHeight }"
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
        :scroll-y="true"
        :scroll-into-view="effectiveScrollIntoView"
        :scroll-top="effectiveScrollTop"
        :scroll-with-animation="scrollWithAnimation"
        :scroll-anchoring="scrollAnchoring"
        :enable-flex="true"
        class="bottom-sheet-scroll-view px-4"
        :class="showHeader ? 'pt-3' : 'pt-4'"
        :style="{ height: scrollHeight }"
      >
        <view class="bottom-sheet-scroll-content">
          <slot />
        </view>
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
  scrollIntoView: { type: String, default: '' },
  scrollTop: { type: Number, default: 0 },
  scrollWithAnimation: { type: Boolean, default: true },
  scrollAnchoring: { type: Boolean, default: true },
  onConfirm: { type: Function, default: null }
})
const emit = defineEmits(['change', 'close', 'confirm'])
const popupRef = ref(null)
const instance = getCurrentInstance()
const layoutStore = useLayoutStore()
const panelMaxHeight = computed(() => `${getMaxAvailableHeight()}px`)
const scrollHeight = ref('320px')
const internalScrollIntoView = ref('')
const internalScrollTop = ref(0)
const effectiveScrollIntoView = computed(() => internalScrollIntoView.value || props.scrollIntoView)
const effectiveScrollTop = computed(() =>
  internalScrollIntoView.value ? internalScrollTop.value : props.scrollTop
)
const confirmReservedHeight = ref(0)
const hasConfirmArea = computed(
  () => props.showConfirm || Boolean(instance?.proxy?.$slots?.confirm)
)
const scrollContentPaddingBottom = computed(() =>
  hasConfirmArea.value ? `${Math.max(24, confirmReservedHeight.value + 16)}px` : '16px'
)
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
async function scrollToAnchor(anchorId = '') {
  const nextAnchorId = String(anchorId || '').trim()
  if (!nextAnchorId) {
    return
  }
  internalScrollIntoView.value = ''
  await nextTick()
  internalScrollIntoView.value = nextAnchorId
}
function scrollToTop() {
  internalScrollIntoView.value = ''
  internalScrollTop.value = internalScrollTop.value === 0 ? 1 : 0
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
  confirmReservedHeight.value = hasConfirmArea.value ? 72 : 0
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
    confirmReservedHeight.value = confirmHeight
    const verticalPadding = props.showHeader ? 12 : 16
    const nextHeight =
      getMaxAvailableHeight() - gripHeight - headerHeight - confirmHeight - verticalPadding
    scrollHeight.value = `${Math.max(160, Math.floor(nextHeight))}px`
  })
}

defineExpose({ open, close, refreshLayout: measureScrollHeight, scrollToAnchor, scrollToTop })
</script>
