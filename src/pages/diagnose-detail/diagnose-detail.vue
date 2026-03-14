<template>
  <view class="min-h-screen bg-[#F8F6F0]">
    <!-- 加载中 -->
    <view v-if="loading" class="flex justify-center py-20">
      <text class="text-gray-400">加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="detail" class="pb-20">
      <!-- 植物信息卡片 -->
      <view class="bg-white p-4 mb-3">
        <view class="flex items-center mb-4">
          <image
            v-if="detail.plantImage"
            :src="detail.plantImage"
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
            <text class="block text-lg font-semibold text-gray-900 mb-1">
              {{ detail.plantName || '未知植物' }}
            </text>
            <text class="text-sm text-gray-500">{{ formatTime(detail.createdAt) }}</text>
          </view>
        </view>

        <!-- 诊断图片 -->
        <view v-if="detail.imageUrl" class="relative w-full h-[240px] rounded-2xl overflow-hidden mb-4">
          <image :src="detail.imageUrl" class="w-full h-full" mode="aspectFill" />
        </view>
      </view>

      <!-- 健康状态 -->
      <view class="bg-white p-4 mb-3">
        <text class="block text-base font-semibold text-gray-900 mb-4">🏥 健康状态</text>

        <view class="flex items-center justify-between mb-4">
          <view class="flex items-center">
            <text class="text-sm text-gray-600 mr-3">健康分数</text>
            <view
              class="px-3 py-1 rounded-full"
              :class="getHealthBadgeClass(detail.healthStatus)"
            >
              <text class="text-sm font-semibold">{{ getHealthText(detail.healthStatus) }}</text>
            </view>
          </view>
          <text class="text-3xl font-bold" :class="getScoreTextClass(detail.healthScore)">
            {{ detail.healthScore || 0 }}
          </text>
        </view>

        <view class="h-3 bg-gray-200 rounded-full overflow-hidden">
          <view
            class="h-full rounded-full"
            :class="getScoreBarClass(detail.healthScore)"
            :style="{ width: `${detail.healthScore || 0}%` }"
          ></view>
        </view>
      </view>

      <!-- 主要问题 -->
      <view v-if="detail.mainIssue" class="bg-white p-4 mb-3">
        <text class="block text-base font-semibold text-gray-900 mb-3">🔍 主要问题</text>
        <text class="block text-sm text-gray-700 leading-relaxed">{{ detail.mainIssue }}</text>
      </view>

      <!-- 症状描述 -->
      <view v-if="detail.symptoms" class="bg-white p-4 mb-3">
        <text class="block text-base font-semibold text-gray-900 mb-3">📋 症状描述</text>
        <text class="block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{{ detail.symptoms }}</text>
      </view>

      <!-- 治疗方案 -->
      <view v-if="detail.treatment" class="bg-white p-4 mb-3">
        <text class="block text-base font-semibold text-gray-900 mb-3">💊 治疗方案</text>
        <text class="block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{{ detail.treatment }}</text>
      </view>

      <!-- 预防建议 -->
      <view v-if="detail.prevention" class="bg-white p-4 mb-3">
        <text class="block text-base font-semibold text-gray-900 mb-3">🛡️ 预防建议</text>
        <text class="block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{{ detail.prevention }}</text>
      </view>

      <!-- 用户备注 -->
      <view v-if="detail.description" class="bg-white p-4 mb-3">
        <text class="block text-base font-semibold text-gray-900 mb-3">📝 备注</text>
        <text class="block text-sm text-gray-600 leading-relaxed">{{ detail.description }}</text>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="flex flex-col items-center justify-center py-20">
      <text class="text-6xl mb-4">😕</text>
      <text class="text-base text-gray-600">诊断记录不存在</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const detail = ref(null)
const loading = ref(false)
const recordId = ref('')

onLoad(options => {
  if (options.id) {
    recordId.value = options.id
  }
})

onMounted(() => {
  if (recordId.value) {
    loadDetail()
  }
})

async function loadDetail() {
  loading.value = true
  try {
    const result = await wx.cloud.callFunction({
      name: 'getDiagnoseHistory',
      data: {
        action: 'getDetail',
        data: {
          id: recordId.value
        }
      }
    })

    if (result.result.code === 200) {
      detail.value = result.result.data
    } else {
      uni.showToast({
        title: result.result.message || '加载失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('加载诊断详情失败:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  } finally {
    loading.value = false
  }
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
    healthy: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    sick: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700'
  }
  return map[status] || 'bg-gray-100 text-gray-700'
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.whitespace-pre-wrap {
  white-space: pre-wrap;
}
</style>