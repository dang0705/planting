<template>
  <view class="min-h-screen bg-[#F8F6F0]">
    <!-- 用户信息卡片 -->
    <view class="bg-gradient-to-br from-primary to-[#52B788] px-4 pt-12 pb-8">
      <view class="flex items-center mb-6">
        <image
          :src="userStore.avatar || '/static/logo.png'"
          class="w-20 h-20 rounded-full border-4 border-white mr-4"
        />
        <view class="flex-1">
          <text class="block text-xl font-bold text-white mb-1">{{ userStore.displayName }}</text>
          <view class="flex items-center">
            <view :class="membershipBadgeClass">
              <text class="text-xs font-semibold">{{ membershipText }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 会员状态 -->
      <view class="bg-white/20 backdrop-blur rounded-2xl p-4">
        <view class="flex items-center justify-between">
          <view>
            <text class="block text-white/80 text-xs mb-1">诊断次数</text>
            <text class="block text-white text-2xl font-bold">
              {{ userStore.isPremium ? '无限' : `${userStore.membership.freeQuota} 次` }}
            </text>
          </view>
          <view>
            <text class="block text-white/80 text-xs mb-1">已使用</text>
            <text class="block text-white text-2xl font-bold">{{ userStore.membership.usedCount }} 次</text>
          </view>
          <button
            v-if="!userStore.isPremium"
            class="bg-white text-primary font-semibold px-6 py-2 rounded-full"
            @click="upgradeMembership"
          >
            升级会员
          </button>
        </view>
      </view>
    </view>

    <!-- 会员权益 -->
    <view v-if="!userStore.isPremium" class="px-4 py-6">
      <text class="block text-lg font-bold text-gray-900 mb-4">✨ 会员权益</text>

      <view class="bg-white rounded-3xl p-6 shadow-sm">
        <view class="flex items-center justify-between mb-6">
          <view>
            <text class="block text-2xl font-bold text-gray-900 mb-1">¥19.9</text>
            <text class="block text-sm text-gray-600">首月特惠</text>
          </view>
          <view class="bg-[#D8F3DC] px-4 py-2 rounded-full">
            <text class="text-sm font-semibold text-primary">限时优惠</text>
          </view>
        </view>

        <view class="space-y-3 mb-6">
          <view v-for="benefit in memberBenefits" :key="benefit.id" class="flex items-start">
            <text class="text-lg mr-2">{{ benefit.icon }}</text>
            <view class="flex-1">
              <text class="block text-base font-semibold text-gray-900 mb-1">{{ benefit.title }}</text>
              <text class="block text-sm text-gray-600">{{ benefit.desc }}</text>
            </view>
          </view>
        </view>

        <button
          class="w-full bg-primary text-white font-semibold py-4 rounded-2xl"
          @click="upgradeMembership"
        >
          立即开通会员
        </button>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="px-4 pb-6">
      <view class="bg-white rounded-3xl p-5 shadow-sm mb-4">
        <view class="flex items-center justify-between mb-3">
          <view>
            <text class="block text-base font-semibold text-gray-900">微信支付测试</text>
            <text class="block text-sm text-gray-500 mt-1">创建订单 -> 拉起支付 -> 查询订单状态</text>
          </view>
          <text class="text-2xl">💳</text>
        </view>

        <view v-if="payFlow.lastOutTradeNo" class="bg-[#F6FBF7] rounded-2xl p-3 mb-3">
          <view class="flex items-center justify-between">
            <text class="text-xs text-gray-500">最近订单</text>
            <text class="text-xs text-gray-500">{{ payFlowUpdatedAtText }}</text>
          </view>
          <text class="block text-sm font-semibold text-gray-900 mt-1">{{ payFlow.lastOutTradeNo }}</text>
          <text v-if="payFlow.tradeState" class="block text-xs text-gray-600 mt-1">
            状态: {{ payFlow.tradeState }}{{ payFlow.tradeStateDesc ? ` (${payFlow.tradeStateDesc})` : '' }}
          </text>
        </view>

        <view class="flex gap-3">
          <button
            class="flex-1 bg-[#0F9D58] text-white font-semibold py-3 rounded-2xl"
            :loading="paying"
            @click="handleWechatPayTest"
          >
            1. 下单并支付
          </button>
          <button
            class="flex-1 bg-white border border-gray-200 text-gray-900 font-semibold py-3 rounded-2xl"
            :disabled="!payFlow.lastOutTradeNo || querying"
            :loading="querying"
            @click="handleQueryLastOrder"
          >
            2. 查询状态
          </button>
        </view>

        <text v-if="payFlow.tip" class="block text-xs text-gray-500 mt-2">{{ payFlow.tip }}</text>
      </view>

      <view class="bg-white rounded-3xl overflow-hidden shadow-sm">
        <view
          v-for="(item, index) in menuItems"
          :key="item.id"
          class="flex items-center justify-between px-4 py-4"
          :class="{ 'border-t border-gray-100': index > 0 }"
          @click="handleMenuClick(item)"
        >
          <view class="flex items-center">
            <text class="text-2xl mr-3">{{ item.icon }}</text>
            <text class="text-base text-gray-900">{{ item.title }}</text>
          </view>
          <text class="text-gray-400">›</text>
        </view>
      </view>
    </view>

    <!-- 诊断历史 -->
    <view class="px-4 pb-20">
      <view class="flex items-center justify-between mb-3">
        <text class="block text-lg font-bold text-gray-900">📋 诊断历史</text>
        <text class="text-sm text-primary" @click="viewAllHistory">查看全部</text>
      </view>

      <view v-if="diagnoseHistory.length === 0 && !loadingHistory" class="bg-white rounded-2xl p-6 text-center">
        <text class="block text-4xl mb-2">🔍</text>
        <text class="block text-sm text-gray-600">还没有诊断记录</text>
      </view>

      <view
        v-for="item in diagnoseHistory"
        :key="item._id"
        class="bg-white rounded-2xl p-4 mb-3 shadow-sm"
        @click="viewDiagnoseDetail(item)"
      >
        <view class="flex">
          <image
            v-if="item.imageUrl"
            :src="item.imageUrl"
            class="w-16 h-16 rounded-xl mr-3"
            mode="aspectFill"
          />
          <view
            v-else
            class="w-16 h-16 rounded-xl mr-3 flex items-center justify-center bg-gray-100"
          >
            <text class="text-3xl">🪴</text>
          </view>
          <view class="flex-1">
            <text class="block text-base font-semibold text-gray-900 mb-1">{{ item.plantName || '未知植物' }}</text>
            <text class="block text-sm text-gray-600 mb-1 line-clamp-1">{{ item.mainIssue || '诊断中...' }}</text>
            <text class="text-xs text-gray-400">{{ formatTime(item.createdAt) }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/user.js'
import { createWechatPayOrder, invokeWechatPayment, queryWechatPayOrder } from '@/api/payment'

const userStore = useUserStore()

// 诊断历史数据
const diagnoseHistory = ref([])
const loadingHistory = ref(false)
const paying = ref(false)
const querying = ref(false)

const payFlow = ref({
  lastOutTradeNo: '',
  tradeState: '',
  tradeStateDesc: '',
  updatedAt: 0,
  tip: ''
})

const payFlowUpdatedAtText = computed(() => {
  if (!payFlow.value.updatedAt) return ''
  const date = new Date(payFlow.value.updatedAt)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
})

// 会员状态
const membershipText = computed(() => {
  return userStore.isPremium ? '高级会员' : '免费用户'
})

const membershipBadgeClass = computed(() => {
  return userStore.isPremium
    ? 'bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full'
    : 'bg-white/30 text-white px-3 py-1 rounded-full'
})

// 会员权益
const memberBenefits = ref([
  {
    id: 1,
    icon: '🔍',
    title: '无限次诊断',
    desc: '不限次数使用 AI 诊断功能'
  },
  {
    id: 2,
    icon: '📅',
    title: '专属养护计划',
    desc: '根据植物特性定制养护方案'
  },
  {
    id: 3,
    icon: '💬',
    title: '优先客服支持',
    desc: '专属客服通道，快速响应'
  },
  {
    id: 4,
    icon: '📚',
    title: '养护知识库',
    desc: '解锁全部养护知识和技巧'
  }
])

// 功能菜单
const menuItems = ref([
  {
    id: 1,
    icon: '🌱',
    title: '我的植物',
    action: 'myPlants'
  },
  {
    id: 2,
    icon: '📖',
    title: '养护知识',
    action: 'knowledge'
  },
  {
    id: 3,
    icon: '⚙️',
    title: '设置',
    action: 'settings'
  },
  {
    id: 4,
    icon: '❓',
    title: '帮助与反馈',
    action: 'help'
  }
])

// 加载诊断历史
onMounted(() => {
  loadDiagnoseHistory()
})

async function loadDiagnoseHistory() {
  if (!userStore.isAuthenticated) return

  loadingHistory.value = true
  try {
    const result = await wx.cloud.callFunction({
      name: 'getDiagnoseHistory',
      data: {
        action: 'getList',
        data: {
          page: 1,
          pageSize: 5 // 只显示最近5条
        }
      }
    })

    if (result.result.code === 200) {
      diagnoseHistory.value = result.result.data.list
    }
  } catch (error) {
    console.error('加载诊断历史失败:', error)
  } finally {
    loadingHistory.value = false
  }
}

function upgradeMembership() {
  uni.showModal({
    title: '开通会员',
    content: '首月特惠 ¥19.9，立即开通享受无限次诊断',
    confirmText: '立即支付',
    success: (res) => {
      if (res.confirm) {
        // TODO: 调用微信支付
        uni.showToast({
          title: '支付功能开发中',
          icon: 'none'
        })
      }
    }
  })
}

async function handleWechatPayTest() {
  if (paying.value) return

  const loggedIn = await userStore.ensureLogin()
  if (!loggedIn) {
    uni.showToast({
      title: '请先完成微信登录',
      icon: 'none'
    })
    return
  }

  paying.value = true
  try {
    payFlow.value.tip = '正在创建订单...'
    const payData = await createWechatPayOrder({
      description: '微信支付测试订单',
      total: 1,
      openid: userStore.openid
    })

    payFlow.value.lastOutTradeNo = String(payData.outTradeNo || '')
    payFlow.value.updatedAt = Date.now()
    payFlow.value.tradeState = ''
    payFlow.value.tradeStateDesc = ''
    payFlow.value.tip = '已下单，正在拉起微信支付...'

    await invokeWechatPayment(payData)

    payFlow.value.tip = '支付已完成回调，正在查询订单状态...'
    await pollOrderStatus(payFlow.value.lastOutTradeNo)
  } catch (error) {
    console.error('微信支付测试失败:', error)
    payFlow.value.tip = '流程中断，可点击“查询状态”查看订单最终状态'
    uni.showToast({
      title: error.errMsg || error.message || '支付测试失败',
      icon: 'none',
      duration: 2500
    })
  } finally {
    paying.value = false
  }
}

async function handleQueryLastOrder() {
  if (!payFlow.value.lastOutTradeNo || querying.value) return
  querying.value = true
  try {
    await pollOrderStatus(payFlow.value.lastOutTradeNo, { once: true })
  } catch (e) {
    uni.showToast({
      title: e.errMsg || e.message || '查询失败',
      icon: 'none',
      duration: 2500
    })
  } finally {
    querying.value = false
  }
}

async function pollOrderStatus(outTradeNo, options = {}) {
  const once = Boolean(options.once)
  const maxTries = once ? 1 : 8
  const delayMs = 800

  for (let i = 0; i < maxTries; i += 1) {
    const data = await queryWechatPayOrder({
      outTradeNo,
      openid: userStore.openid
    })

    const tradeState = String(data.trade_state || '').trim()
    const tradeStateDesc = String(data.trade_state_desc || '').trim()

    payFlow.value.tradeState = tradeState
    payFlow.value.tradeStateDesc = tradeStateDesc
    payFlow.value.updatedAt = Date.now()

    if (once) return
    if (tradeState && tradeState !== 'USERPAYING') return

    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
}

function handleMenuClick(item) {
  switch (item.action) {
    case 'myPlants':
      uni.switchTab({
        url: '/pages/calendar/calendar'
      })
      break
    case 'knowledge':
    case 'settings':
    case 'help':
      uni.showToast({
        title: `${item.title}功能开发中`,
        icon: 'none'
      })
      break
  }
}

function viewAllHistory() {
  uni.navigateTo({
    url: '/pages/diagnose-history/diagnose-history'
  })
}

function viewDiagnoseDetail(item) {
  uni.navigateTo({
    url: `/pages/diagnose-detail/diagnose-detail?id=${item._id}`
  })
}

function formatTime(time) {
  const date = new Date(time)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}
</script>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
