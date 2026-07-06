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
      class="bottom-sheet-panel flex flex-col overflow-hidden rounded-t-[20px] bg-white"
      :style="panelStyle"
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
        v-if="isFullHeightMode"
        :id="contentId"
        :scroll-y="true"
        :scroll-into-view="effectiveScrollIntoView"
        :scroll-top="effectiveScrollTop"
        :scroll-with-animation="scrollWithAnimation"
        :scroll-anchoring="scrollAnchoring"
        :enable-flex="true"
        class="bottom-sheet-scroll-view min-h-0 flex-1 px-4"
        :class="showHeader ? 'pt-3' : 'pt-4'"
      >
        <slot />
      </scroll-view>
      <view
        v-else
        :id="contentId"
        class="bottom-sheet-content min-h-0 px-4"
        :class="showHeader ? 'pt-3' : 'pt-4'"
      >
        <slot />
      </view>

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
import { computed, nextTick, onMounted, ref } from 'vue'
import { useLayoutStore } from '@/store/layout.js'
import { callComponentMethod } from '@/utils/component-ref.js'

const HEIGHT_MODE_AUTO = 'auto'
const HEIGHT_MODE_FULL_HEIGHT = 'fullHeight'
const MIN_PANEL_HEIGHT = 320
const FALLBACK_PANEL_HEIGHT = 520

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
  heightMode: {
    type: String,
    default: 'auto',
    validator: value => ['auto', 'fullHeight'].includes(value)
  },
  scrollIntoView: { type: String, default: '' },
  scrollTop: { type: Number, default: 0 },
  scrollWithAnimation: { type: Boolean, default: true },
  scrollAnchoring: { type: Boolean, default: true },
  onConfirm: { type: Function, default: null }
})
const emit = defineEmits(['change', 'close', 'confirm'])
const popupRef = ref(null)
const layoutStore = useLayoutStore()
const panelMaxHeight = computed(() => `${getMaxAvailableHeight()}px`)
const isFullHeightMode = computed(() => props.heightMode === HEIGHT_MODE_FULL_HEIGHT)
const panelStyle = computed(() => {
  if (isFullHeightMode.value) {
    return { height: panelMaxHeight.value, maxHeight: panelMaxHeight.value }
  }
  return { maxHeight: panelMaxHeight.value }
})
const internalScrollIntoView = ref('')
const internalScrollTop = ref(0)
const effectiveScrollIntoView = computed(() => internalScrollIntoView.value || props.scrollIntoView)
const effectiveScrollTop = computed(() =>
  internalScrollIntoView.value ? internalScrollTop.value : props.scrollTop
)

onMounted(() => {
  layoutStore.ensureHeaderMetrics()
})

function open() {
  layoutStore.ensureHeaderMetrics()
  callComponentMethod(popupRef, 'open')
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
  emit('change', event)
  if (!event?.show) {
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
  return Math.max(
    MIN_PANEL_HEIGHT,
    windowHeight ? windowHeight - headerHeight : FALLBACK_PANEL_HEIGHT
  )
}

defineExpose({ open, close, refreshLayout: () => {}, scrollToAnchor, scrollToTop })
</script>
