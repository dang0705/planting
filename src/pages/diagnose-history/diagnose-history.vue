<template>
  <view class="min-h-screen bg-[#F8F6F0]">
    <!-- 标题 -->
    <view class="bg-white px-4 py-4 mb-3">
      <text class="text-xl font-bold text-gray-900">诊断历史</text>
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && list.length === 0" class="flex flex-col items-center justify-center py-20">
      <text class="text-6xl mb-4">🔍</text>
      <text class="text-base text-gray-600 mb-2">还没有诊断记录</text>
      <text class="text-sm text-gray-400">快去给植物拍照诊断吧</text>
    </view>

    <!-- 列表 -->
    <view v-else class="px-4 pb-20">
      <view
        v-for="item in list"
        :key="item._id"
        class="bg-white rounded-2xl p-4 mb-3 shadow-sm"
        @click="viewDetail(item._id)"
      >
        <view class="flex">
          <!-- 图片 -->
          <view class="relative w-20 h-20 rounded-xl overflow-hidden mr-3 flex-shrink-0">
            <image
              v-if="item.imageUrl"
              :src="item.imageUrl"
              class="w-full h-full"
              mode="aspectFill"
            />
            <view
              v-else
              class="w-full h-full flex items-center justify-center bg-gray-100"
            >
              <text class="text-3xl">🪴</text>
            </view>

            <!-- 健康状态标签 -->
            <view
              class="absolute bottom-1 right-1 px-2 py-0.5 rounded-full text-xs"
              :class="getHealthBadgeClass(item.healthStatus)"
            >
              <text class="text-xs font-semibold">{{ getHealthText(item.healthStatus) }}</text>
            </view>
          </view>

          <!-- 内容 -->
          <view class="flex-1 min-w-0">
            <view class="flex items-center justify-between mb-1">
              <text class="text-base font-semibold text-gray-900">{{ item.plantName || '未知植物' }}</text>
              <text class="text-xs text-gray-400">{{ formatTime(item.createdAt) }}</text>
            </view>

            <text class="block text-sm text-gray-600 mb-2 line-clamp-2">
              {{ item.mainIssue || '诊断中...' }}
            </text>

            <!-- 健康分数 -->
            <view class="flex items-center">
              <text class="text-xs text-gray-500 mr-2">健康分数</text>
              <view class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[100px]">
                <view
                  class="h-full rounded-full"
                  :class="getScoreBarClass(item.healthScore)"
                  :style="{ width: `${item.healthScore || 0}%` }"
                ></view>
              </view>
              <text class="text-xs font-semibold ml-2" :class="getScoreTextClass(item.healthScore)">
                {{ item.healthScore || 0 }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="hasMore" class="flex justify-center py-4">
        <button
          class="bg-white px-6 py-2 rounded-full text-sm text-gray-600"
          @click="loadMore"
          :disabled="loading"
        >
          {{ loading ? '加载中...' : '加载更多' }}
        </button>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && list.length === 0" class="flex justify-center py-20">
      <text class="text-gray-400">加载中...</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/store/user.js'

const userStore = useUserStore()

const list = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const hasMore = ref(false)

onMounted(() => {
  loadList()
})

async function loadList() {
  if (loading.value) return

  loading.value = true
  try {
    const result = await wx.cloud.callFunction({
      name: 'getDiagnoseHistory',
      data: {
        action: 'getList',
        data: {
          page: page.value,
          pageSize: pageSize.value
        }
      }
    })

    if (result.result.code === 200) {
      const data = result.result.data
      if (page.value === 1) {
        list.value = data.list
      } else {
        list.value = [...list.value, ...data.list]
      }
      hasMore.value = data.hasMore
    } else {
      uni.showToast({
        title: result.result.message || '加载失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('加载诊断历史失败:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  } finally {
    loading.value = false
  }
}

function loadMore() {
  page.value++
  loadList()
}

function viewDetail(id) {
  uni.navigateTo({
    url: `/pages/diagnose-detail/diagnose-detail?id=${id}`
  })
}

function getHealthText(status) {
  const map = {
    healthy: '健康',
    warning: '预警',
    sick: '生病',
    critical: '严重'
  }
  return map[status] || '未知'
}

function getHealthBadgeClass(status) {
  const map = {
    healthy: 'bg-green-500 text-white',
    warning: 'bg-yellow-500 text-white',
    sick: 'bg-orange-500 text-white',
    critical: 'bg-red-500 text-white'
  }
  return map[status] || 'bg-gray-500 text-white'
}

function getScoreBarClass(score) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function getScoreTextClass(score) {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-600'
}

function formatTime(time) {
  const date = new Date(time)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

  return `${date.getMonth() + 1}月${date.getDate()}日`
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>