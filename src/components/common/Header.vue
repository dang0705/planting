<template>
  <view
    :id="headerId"
    class="app-header fixed left-0 right-0 top-0 z-[999]"
    :class="[headerClass, headerToneClass]"
    :style="resolvedStyle"
  >
    <view :style="{ height: statusBarHeight + 'px' }" />
    <view
      class="grid items-center px-4"
      :style="{ height: navBarHeight + 'px', gridTemplateColumns: '1fr auto 1fr' }"
    >
      <view class="min-w-0 justify-self-start">
        <view class="flex min-w-0 items-center gap-2">
          <slot v-if="leftActionSlotProvided" name="left-action" :scrolled="isScrolled" />
          <view
            v-else-if="leftAction === 'back'"
            :id="leftActionId"
            class="flex size-9 shrink-0 items-center justify-center rounded-full"
            :class="backActionClass"
            @click="emit('back')"
          >
            <view class="app-header__back-icon" :class="backIconClass" />
          </view>
          <view
            v-else-if="leftAction === 'home'"
            :id="leftActionId"
            class="flex size-9 shrink-0 items-center justify-center rounded-full"
            :class="backActionClass"
            @click="emit('home')"
          >
            <text class="text-[18px] leading-none" :class="foregroundClass">⌂</text>
          </view>
          <slot name="left-info" :scrolled="isScrolled" />
        </view>
      </view>
      <view class="min-w-0 justify-self-center px-3">
        <slot name="title" :scrolled="isScrolled">
          <text
            class="block max-w-[220px] truncate text-base font-semibold"
            :class="foregroundClass"
          >
            {{ title }}
          </text>
        </slot>
      </view>
      <view class="min-w-0 justify-self-end">
        <slot name="right" :scrolled="isScrolled" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onPageScroll } from '@dcloudio/uni-app'

const DEFAULT_SCROLL_OFFSET = 0
const SCROLL_REFRESH_DELAY_MS = 16

const props = defineProps({
  title: { type: String, default: '' },
  leftAction: { type: String, default: '' },
  leftActionId: { type: String, default: 'layout-left-action' },
  leftActionSlotProvided: { type: Boolean, default: false },
  headerId: { type: String, default: 'layout-header' },
  headerClass: { type: String, default: '' },
  headerStyle: { type: Object, default: () => ({}) },
  statusBarHeight: { type: Number, default: 0 },
  navBarHeight: { type: Number, default: 44 },
  scrollTransition: { type: Boolean, default: false },
  scrollTransitionTarget: { type: String, default: '' },
  scrollTransitionOffset: { type: Number, default: 0 }
})

const emit = defineEmits(['back', 'home'])
const isScrolled = ref(false)
let refreshTimer = null

const foregroundClass = computed(() =>
  props.scrollTransition && isScrolled.value ? 'text-[#0a0a0a]' : 'text-white'
)
const headerToneClass = computed(() => (props.scrollTransition ? 'app-header--transition' : ''))
const backActionClass = computed(() => {
  if (!props.scrollTransition) {
    return 'bg-white/15'
  }
  return isScrolled.value ? 'bg-black/5' : 'bg-black/30 backdrop-blur-[8px]'
})
const backIconClass = computed(() => (foregroundClass.value === 'text-white' ? 'is-light' : ''))
const resolvedStyle = computed(() => {
  const baseStyle = { ...props.headerStyle }
  if (!props.scrollTransition) {
    return baseStyle
  }
  return {
    ...baseStyle,
    background: isScrolled.value ? 'rgba(255, 255, 255, 0.96)' : 'transparent',
    boxShadow: isScrolled.value ? '0 1px 1.5px rgba(0, 0, 0, 0.1)' : 'none',
    borderBottom: isScrolled.value ? '1rpx solid rgba(45, 122, 79, 0.15)' : '0 solid transparent'
  }
})

function normalizeSelector(value) {
  const selector = String(value || '').trim()
  if (!selector) {
    return ''
  }
  return /^[.#[]/.test(selector) ? selector : `#${selector}`
}

function refreshScrollState() {
  if (!props.scrollTransition || !normalizeSelector(props.scrollTransitionTarget)) {
    return
  }
  const query = uni.createSelectorQuery?.()
  if (!query?.select) {
    return
  }
  query
    .select(normalizeSelector(props.scrollTransitionTarget))
    .boundingClientRect(rect => {
      if (!rect) {
        return
      }
      const top = Number(rect.top)
      const height = Number(rect.height)
      const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height
      if (!Number.isFinite(bottom)) {
        return
      }
      const nextScrolled = bottom <= Number(props.scrollTransitionOffset || DEFAULT_SCROLL_OFFSET)
      if (nextScrolled !== isScrolled.value) {
        isScrolled.value = nextScrolled
      }
    })
    .exec()
}

function scheduleScrollStateRefresh() {
  if (refreshTimer || !props.scrollTransition) {
    return
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshScrollState()
  }, SCROLL_REFRESH_DELAY_MS)
}

onPageScroll(() => scheduleScrollStateRefresh())

onMounted(() => {
  nextTick(refreshScrollState)
})

watch(
  () => [props.scrollTransition, props.scrollTransitionTarget, props.scrollTransitionOffset],
  () => {
    isScrolled.value = false
    nextTick(refreshScrollState)
  }
)

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
})

defineExpose({ refreshScrollState })
</script>

<style scoped>
.app-header {
  transition:
    background-color 220ms ease,
    box-shadow 220ms ease,
    border-color 220ms ease;
}

.app-header__back-icon {
  width: 10px;
  height: 10px;
  border-left: 1.5px solid #0a0a0a;
  border-bottom: 1.5px solid #0a0a0a;
  transform: rotate(45deg) translate(1px, -1px);
}

.app-header__back-icon.is-light {
  border-color: #ffffff;
}
</style>
