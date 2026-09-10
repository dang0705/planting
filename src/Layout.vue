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
    <view
      v-if="renderAppHeader"
      class="fixed left-0 right-0 top-0 z-[999]"
      :class="headerClass"
      :style="headerStyle"
    >
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

    <view v-if="renderDouyinWeatherHeader" id="douyin-weather-header" class="relative bg-[#2D7A4F]">
      <view
        v-if="douyinWeatherExpanded"
        id="douyin-weather-dismiss-area"
        class="fixed inset-x-0 bottom-0 z-[998] bg-transparent"
        :style="{ top: 'var(--app-header-height)' }"
        @click="closeDouyinWeather"
      />
      <view
        id="douyin-weather-trigger-row"
        class="relative z-[999] flex min-h-[42px] items-center justify-end px-4"
        @click="closeDouyinWeather"
      >
        <view
          id="douyin-weather-trigger"
          class="flex h-7 items-center gap-1 rounded-full bg-white/15 px-3 active:bg-white/25"
          @click.stop="toggleDouyinWeather"
        >
          <text class="text-[12px] font-medium leading-none text-white">天气</text>
          <text class="text-[13px] leading-none text-white/80">
            {{ douyinWeatherExpanded ? '⌃' : '⌄' }}
          </text>
        </view>
      </view>
      <view
        v-if="douyinWeatherExpanded"
        id="douyin-weather-panel"
        class="relative z-[999] px-4 pb-3 pt-1"
        @click.stop
      >
        <HeaderWeatherInfo />
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
import BottomSheet from '@/components/common/BottomSheet.vue'
import HeaderWeatherInfo from '@/components/HeaderWeatherInfo.vue'
import { useLayoutStore } from '@/store/layout.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { usesPlatformNavigationChrome } from '@/utils/platform-capabilities.js'

const QUESTION_PACKAGE_PAGE_ROUTE = 'subpackages/diagnosis/question-package'
const DIAGNOSIS_TAB_PAGE_ROUTE = 'pages/diagnose/diagnose'
const PREVIOUS_PAGE_OFFSET = 2

const props = defineProps({
  title: { type: String, default: '' },
  leftAction: { type: String, default: '' },
  leftActionId: { type: String, default: 'layout-left-action' },
  showHeader: { type: Boolean, default: true },
  showWeatherHeader: { type: Boolean, default: false },
  headerClass: { type: String, default: '' },
  headerStyle: {
    type: Object,
    default: () => ({ background: 'linear-gradient(135deg, #2D7A4F, #52B788)' })
  },
  backgroundClass: { type: String, default: 'bg-[#F8F6F0]' },
  contentClass: { type: String, default: '' },
  contentPaddingTop: { type: Boolean, default: true }
})
const layoutStore = useLayoutStore()
const userStore = useUserStore()
const actionSheetRef = ref(null)
const actionSheet = ref({ title: '', itemList: [], resolve: null, reject: null, settled: true })
const platformNavigationChrome = usesPlatformNavigationChrome()
const douyinWeatherExpanded = ref(false)
const renderAppHeader = computed(() => props.showHeader && !platformNavigationChrome)
const renderDouyinWeatherHeader = computed(
  () => props.showWeatherHeader && platformNavigationChrome
)
const contentStyle = computed(() => ({
  // 抖音使用标准导航栏时，页面内容天然从平台导航栏下方开始；天气条保持在页面流内。
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

function goBack() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (isActiveQuestionPackagePage(pages)) {
    const previousRoute = pages[pages.length - PREVIOUS_PAGE_OFFSET]?.route
    if (previousRoute === DIAGNOSIS_TAB_PAGE_ROUTE) {
      uni.navigateBack({
        fail: error => {
          console.warn('[Layout.goBack] navigateBack failed', error)
        }
      })
      return
    }
    goHome()
    return
  }
  if (pages.length > 1) {
    uni.navigateBack({
      fail: error => {
        console.warn('[Layout.goBack] navigateBack failed', error)
      }
    })
    return
  }
  goHome()
}
function goHome() {
  uni.switchTab({ url: '/pages/index/index' })
}
function toggleDouyinWeather() {
  douyinWeatherExpanded.value = !douyinWeatherExpanded.value
}
function closeDouyinWeather() {
  douyinWeatherExpanded.value = false
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
