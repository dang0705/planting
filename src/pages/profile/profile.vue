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
      <view class="bg-white rounded-3xl overflow-hidden shadow-sm">
        <view
          v-for="(item, index) in visibleMenuItems"
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
import { getDiagnosisHistory } from '@/api/plants-http.js'
import { isDevelopmentAppEnv } from '@/utils/runtime-env.js'

const userStore = useUserStore()

// 诊断历史数据
const diagnoseHistory = ref([])
const loadingHistory = ref(false)

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
  },
  {
    id: 5,
    icon: '🧾',
    title: '池外视觉审核',
    action: 'outOfPoolReview',
    devOnly: true
  },
  {
    id: 6,
    icon: '诊',
    title: '诊断记录管理',
    action: 'diagnosisReview',
    devOnly: true
  }
])

const visibleMenuItems = computed(() =>
  menuItems.value.filter(item => {
    if (!item?.devOnly) return true
    return isDevelopmentAppEnv()
  })
)

// 加载诊断历史
onMounted(() => {
  loadDiagnoseHistory()
})

async function loadDiagnoseHistory() {
  if (!userStore.isAuthenticated) return

  loadingHistory.value = true
  try {
    const result = await getDiagnosisHistory({
      page: 1,
      pageSize: 5
    })

    diagnoseHistory.value = (result?.items || []).map(item => ({
      _id: item.resultId || item.historyId || '',
      plantName: '植物',
      mainIssue: item?.summary?.displayName || '诊断记录',
      createdAt: item.createdAt,
      imageUrl: '',
      severity: item?.summary?.severity || 'medium'
    }))
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
    case 'outOfPoolReview':
      uni.navigateTo({
        url: '/pages/profile/out-of-pool-review'
      })
      break
    case 'diagnosisReview':
      uni.navigateTo({
        url: '/pages/profile/diagnosis-review'
      })
      break
  }
}

function viewAllHistory() {
  uni.navigateTo({
    url: '/pages/diagnose/diagnose'
  })
}

function viewDiagnoseDetail(item) {
  uni.navigateTo({
    url: `/pages/diagnose/diagnose?id=${item._id}`
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
