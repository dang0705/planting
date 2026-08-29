<template>
  <Layout title="我的" background-class="bg-[#F8F6F0]">
    <view class="min-h-screen bg-[#F8F6F0]">
      <!-- 用户信息卡片 -->
      <view class="px-4 pt-12 pb-8" style="background: linear-gradient(135deg, #2d7a4f, #52b788)">
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

        <!-- 当前可用次数；付费入口在 MVP 阶段不展示。 -->
        <view class="bg-white/20 backdrop-blur rounded-2xl p-4">
          <view class="flex items-center">
            <view>
              <text class="block text-white/80 text-xs mb-1">本月可用次数</text>
              <text class="block text-white text-2xl font-bold">
                {{ remainingDiagnosisQuotaText }}
              </text>
            </view>
            <view class="ml-12">
              <text class="block text-white/80 text-xs mb-1">已使用</text>
              <text class="block text-white text-2xl font-bold"
                >{{ userStore.membership?.usedCount || 0 }} 次</text
              >
            </view>
          </view>
        </view>
      </view>

      <!-- 功能菜单 -->
      <view class="px-4 pb-6">
        <view class="bg-white rounded-3xl overflow-hidden shadow-sm">
          <view
            v-for="(item, index) in menuItems"
            :key="item.id"
            :id="`profile-menu-${item.action}`"
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
      <view id="profile-diagnose-history-section" class="px-4 pb-20">
        <view class="flex items-center justify-between mb-3">
          <text class="block text-lg font-bold text-gray-900">📋 最近诊断</text>
          <text class="text-xs text-gray-400">最多显示 5 条</text>
        </view>

        <view
          v-if="historyError"
          id="profile-diagnose-history-error"
          class="bg-white rounded-2xl p-6 text-center"
        >
          <text class="block text-sm text-gray-600">{{ historyError }}</text>
          <button
            id="profile-diagnose-history-retry"
            class="mt-3 rounded-full bg-[#EEF3EF] px-4 py-2 text-sm text-primary"
            @click="loadDiagnoseHistory"
          >
            重新加载
          </button>
        </view>

        <view v-else-if="loadingHistory" class="bg-white rounded-2xl p-6 text-center">
          <text class="block text-sm text-gray-500">正在加载诊断记录...</text>
        </view>

        <view
          v-else-if="diagnoseHistory.length === 0"
          id="profile-diagnose-history-empty"
          class="bg-white rounded-2xl p-6 text-center"
        >
          <text class="block text-4xl mb-2">🔍</text>
          <text class="block text-sm text-gray-600">还没有诊断记录</text>
        </view>

        <view
          v-for="item in diagnoseHistory"
          :key="item._id"
          :id="`profile-diagnose-record-${item._id}`"
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
              <text class="block text-base font-semibold text-gray-900 mb-1">{{
                item.plantName || '未知植物'
              }}</text>
              <text class="block text-sm text-gray-600 mb-1 line-clamp-1">{{
                item.mainIssue || '诊断中...'
              }}</text>
              <text class="text-xs text-gray-400">{{ formatTime(item.createdAt) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </Layout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import Layout from '@/Layout.vue'
import { useUserStore } from '@/store/user.js'
import { getDiagnosisHistory } from '@/api/diagnosis-history.js'

const userStore = useUserStore()

// 诊断历史数据
const diagnoseHistory = ref([])
const loadingHistory = ref(false)
const historyError = ref('')

// 会员状态
const membershipText = computed(() => {
  return userStore.isPremium ? '高级账户' : '当前账户'
})

const membershipBadgeClass = computed(() => {
  return userStore.isPremium
    ? 'bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full'
    : 'bg-white/30 text-white px-3 py-1 rounded-full'
})

const remainingDiagnosisQuotaText = computed(() => {
  if (userStore.isPremium) {
    return '不限次'
  }
  const quota = Number(userStore.membership?.freeQuota || 0)
  const usedCount = Number(userStore.membership?.usedCount || 0)
  return `${Math.max(0, quota - usedCount)} 次`
})

// 功能菜单
const menuItems = [
  {
    id: 1,
    icon: '🌱',
    title: '我的植物',
    action: 'myPlants'
  }
]

// 加载诊断历史
onMounted(() => {
  loadDiagnoseHistory()
})

async function loadDiagnoseHistory() {
  if (!userStore.isAuthenticated || loadingHistory.value) {
    return
  }

  loadingHistory.value = true
  historyError.value = ''
  try {
    const result = await getDiagnosisHistory({
      page: 1,
      pageSize: 5
    })

    diagnoseHistory.value = (result?.items || []).map(item => ({
      _id: item.resultId || item.historyId || '',
      plantName: item.plantName || item.displayName || '植物',
      mainIssue: item?.summary?.displayName || '诊断记录',
      createdAt: item.createdAt,
      imageUrl: '',
      severity: item?.summary?.severity || 'medium'
    }))
  } catch (error) {
    console.error('加载诊断历史失败:', error)
    diagnoseHistory.value = []
    historyError.value = '暂时无法加载诊断记录，请检查网络后重试。'
  } finally {
    loadingHistory.value = false
  }
}

function handleMenuClick(item) {
  switch (item.action) {
    case 'myPlants':
      uni.switchTab({
        url: '/pages/index/index'
      })
      break
  }
}

function viewDiagnoseDetail(item) {
  if (!item?._id) {
    uni.showToast({ title: '这条诊断记录暂时无法打开，请稍后重试', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: `/subpackages/diagnosis/result?id=${item._id}`
  })
}

function formatTime(time) {
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }
  const now = new Date()
  const diff = now - date

  if (diff < 60000) {
    return '刚刚'
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  }
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
