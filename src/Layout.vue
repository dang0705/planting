<template>
  <view
    class="min-h-screen"
    :class="backgroundClass"
    :style="{
      '--app-header-height': layoutStore.headerHeight + 'px',
      '--app-status-bar-height': layoutStore.statusBarHeight + 'px',
      '--app-navbar-height': layoutStore.navBarHeight + 'px'
    }"
  >
    <view v-if="showHeader" class="fixed left-0 right-0 top-0 z-[999]" :class="headerClass">
      <view :style="{ height: layoutStore.statusBarHeight + 'px' }" />
      <view
        class="grid items-center px-4"
        :style="{ height: layoutStore.navBarHeight + 'px', gridTemplateColumns: '1fr auto 1fr' }"
      >
        <view class="min-w-0 justify-self-start">
          <view class="flex min-w-0 items-center gap-2">
            <slot name="left-action">
              <view
                v-if="leftAction === 'back'"
                :id="leftActionId"
                class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15"
                @click="goBack"
              >
                <text class="text-[30px] font-light leading-none text-white">‹</text>
              </view>
              <view
                v-else-if="leftAction === 'home'"
                :id="leftActionId"
                class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15"
                @click="goHome"
              >
                <text class="text-[18px] leading-none text-white">⌂</text>
              </view>
            </slot>
            <slot name="left-info" />
          </view>
        </view>
        <view class="min-w-0 justify-self-center px-3">
          <slot name="title">
            <text class="block max-w-[220px] truncate text-base font-semibold text-white">
              {{ title }}
            </text>
          </slot>
        </view>
        <view class="min-w-0 justify-self-end">
          <slot name="right" />
        </view>
      </view>
    </view>

    <view :class="contentClass" :style="contentStyle">
      <slot />
    </view>

    <BottomSheet
      ref="actionSheetRef"
      panel-id="layout-action-sheet"
      content-id="layout-action-sheet-content"
      close-id="layout-action-sheet-close-button"
      :title="actionSheet.title"
      @close="cancelActionSheet"
    >
      <view class="pb-2">
        <view
          v-for="(item, index) in actionSheet.itemList"
          :id="`layout-action-sheet-option-${index}`"
          :key="`${item}-${index}`"
          class="border-b border-gray-100 py-4 text-center"
          @click="chooseActionSheetItem(index)"
        >
          <text class="text-base font-medium text-gray-900">{{ item }}</text>
        </view>
      </view>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import BottomSheet from '@/components/diagnose-popup/BottomSheet.vue'
import { useLayoutStore } from '@/store/layout.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'

const props = defineProps({
  title: { type: String, default: '' },
  leftAction: { type: String, default: '' },
  leftActionId: { type: String, default: 'layout-left-action' },
  showHeader: { type: Boolean, default: true },
  headerClass: { type: String, default: 'bg-gradient-to-br from-[#2D7A4F] to-[#52B788]' },
  backgroundClass: { type: String, default: 'bg-[#F8F6F0]' },
  contentClass: { type: String, default: '' },
  contentPaddingTop: { type: Boolean, default: true }
})
const layoutStore = useLayoutStore()
const userStore = useUserStore()
const actionSheetRef = ref(null)
const actionSheet = ref({ title: '', itemList: [], resolve: null, reject: null, settled: true })
const contentStyle = computed(() => ({
  paddingTop: props.showHeader && props.contentPaddingTop ? 'var(--app-header-height)' : '0px'
}))

onMounted(() => {
  const metrics = layoutStore.refreshHeaderMetrics()
  userStore.setNavbarHeight?.(metrics.headerHeight)
  uni.$on('app:bottom-sheet-action', openActionSheet)
})
onBeforeUnmount(() => uni.$off('app:bottom-sheet-action', openActionSheet))

function goBack() {
  const pages = getCurrentPages?.() || []
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  goHome()
}
function goHome() {
  uni.switchTab({ url: '/pages/index/index' })
}
async function openActionSheet(payload) {
  actionSheet.value = {
    title: payload?.title || '请选择',
    itemList: Array.isArray(payload?.itemList) ? payload.itemList : [],
    resolve: payload?.resolve,
    reject: payload?.reject,
    settled: false
  }
  await nextTick()
  callComponentMethod(actionSheetRef, 'open')
}
function chooseActionSheetItem(index) {
  const current = actionSheet.value
  current.settled = true
  current.resolve?.({ tapIndex: index })
  callComponentMethod(actionSheetRef, 'close')
}
function cancelActionSheet() {
  const current = actionSheet.value
  if (!current.settled) {
    current.settled = true
    current.reject?.({ errMsg: 'showActionSheet:fail cancel' })
  }
}
</script>
