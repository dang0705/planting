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
    <Header
      v-if="renderAppHeader"
      :title="title"
      :left-action="leftAction"
      :left-action-id="leftActionId"
      :left-action-slot-provided="customLeftAction"
      :header-class="headerClass"
      :header-style="headerStyle"
      :status-bar-height="layoutStore.statusBarHeight"
      :nav-bar-height="layoutStore.navBarHeight"
      :scroll-transition="headerScrollTransition"
      :scroll-transition-target="headerTransitionTarget"
      :scroll-transition-offset="headerTransitionOffset"
      @back="goBack"
      @home="goHome"
    >
      <template v-if="customLeftAction" #left-action="slotProps">
        <slot name="left-action" :scrolled="slotProps.scrolled" :back="goBack" />
      </template>
      <template v-if="$slots['left-info']" #left-info="slotProps">
        <slot name="left-info" :scrolled="slotProps.scrolled" />
      </template>
      <template v-if="$slots.title" #title="slotProps">
        <slot name="title" :scrolled="slotProps.scrolled" />
      </template>
      <template v-else #title="slotProps">
        <text
          class="block max-w-[220px] truncate text-base font-semibold"
          :class="slotProps.scrolled ? 'text-[#0a0a0a]' : 'text-white'"
        >
          {{ title }}
        </text>
      </template>
      <template v-if="$slots.right" #right="slotProps">
        <slot name="right" :scrolled="slotProps.scrolled" />
      </template>
    </Header>

    <view :class="contentClass" :style="contentStyle">
      <slot />
    </view>

    <LoginModal
      :show="phoneLoginVisible"
      :message="phoneLoginMessage"
      @success="completePhoneLogin"
      @close="cancelPhoneLogin"
    />

    <MiniProgramUpdateGate
      :phase="miniProgramUpdateState.phase"
      :has-update="miniProgramUpdateState.hasUpdate"
      @retry="retryMiniProgramUpdate"
    />

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
/* oxlint-disable no-console -- 回退失败仅写入诊断日志，不向用户暴露内部错误。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import Header from '@/components/common/Header.vue'
import LoginModal from '@/components/LoginModal.vue'
import MiniProgramUpdateGate from '@/components/MiniProgramUpdateGate.vue'
import { useLayoutStore } from '@/store/layout.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import {
  cancelPhoneLogin,
  completePhoneLogin,
  getPhoneLoginGateSkipFlag,
  getPhoneLoginGateState
} from '@/utils/phone-login-gate.js'
import { usesPlatformNavigationChrome } from '@/utils/platform-capabilities.js'
import { miniProgramUpdateState, retryMiniProgramUpdate } from '@/utils/mini-program-update.js'

const QUESTION_PACKAGE_PAGE_ROUTE = 'subpackages/diagnosis/question-package'
const DIAGNOSIS_TAB_PAGE_ROUTE = 'pages/diagnose/diagnose'
const PREVIOUS_PAGE_OFFSET = 2

const props = defineProps({
  title: { type: String, default: '' },
  leftAction: { type: String, default: '' },
  leftActionId: { type: String, default: 'layout-left-action' },
  showHeader: { type: Boolean, default: true },
  headerClass: { type: String, default: '' },
  headerStyle: {
    type: Object,
    default: () => ({ background: 'linear-gradient(135deg, #2D7A4F, #52B788)' })
  },
  backgroundClass: { type: String, default: 'bg-[#F8F6F0]' },
  contentClass: { type: String, default: '' },
  contentPaddingTop: { type: Boolean, default: true },
  customLeftAction: { type: Boolean, default: false },
  backMode: { type: String, default: 'auto' },
  headerScrollTransition: { type: Boolean, default: false },
  headerTransitionTarget: { type: String, default: '' },
  headerTransitionOffset: { type: Number, default: 0 }
})
const layoutStore = useLayoutStore()
const userStore = useUserStore()
const actionSheetRef = ref(null)
const actionSheet = ref({ title: '', itemList: [], resolve: null, reject: null, settled: true })
const { visible: phoneLoginVisible, message: phoneLoginMessage } = getPhoneLoginGateState()
const platformNavigationChrome = usesPlatformNavigationChrome()
const renderAppHeader = computed(() => props.showHeader && !platformNavigationChrome)
const customLeftAction = computed(() => props.customLeftAction)
const contentStyle = computed(() => ({
  // 使用平台标准导航栏时，页面内容天然从平台导航栏下方开始。
  paddingTop: props.contentPaddingTop && renderAppHeader.value ? 'var(--app-header-height)' : '0px'
}))

onMounted(() => {
  const metrics = layoutStore.refreshHeaderMetrics()
  userStore.setNavbarHeight?.(metrics.headerHeight)
  uni.$on('app:bottom-sheet-action', openActionSheet)
})
onBeforeUnmount(() => uni.$off('app:bottom-sheet-action', openActionSheet))

function isActiveQuestionPackagePage(pages) {
  const currentRoute = pages[pages.length - 1]?.route
  return currentRoute === QUESTION_PACKAGE_PAGE_ROUTE
}

function navigateBackOrHome({ fallbackToHome = true } = {}) {
  uni.navigateBack({
    delta: 1,
    fail: error => {
      console.warn('[Layout.goBack] navigateBack failed', error)
      if (fallbackToHome) {
        goHome()
      }
    }
  })
}

function goBack() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (props.backMode === 'stack') {
    navigateBackOrHome({ fallbackToHome: false })
    return
  }
  if (isActiveQuestionPackagePage(pages)) {
    const previousRoute = pages[pages.length - PREVIOUS_PAGE_OFFSET]?.route
    if (previousRoute === DIAGNOSIS_TAB_PAGE_ROUTE) {
      navigateBackOrHome()
      return
    }
    goHome()
    return
  }
  if (pages.length > 1) {
    navigateBackOrHome()
    return
  }
  goHome()
}
function goHome() {
  uni.switchTab({
    url: '/pages/index/index',
    [getPhoneLoginGateSkipFlag()]: true
  })
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
