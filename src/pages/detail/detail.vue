<template>
  <view class="min-h-screen bg-gray-50">
    <!-- 场地图片 -->
    <view class="w-full h-48 bg-gray-200">
      <image
        class="w-full h-full"
        :src="venue.image"
        mode="aspectFill"
      ></image>
    </view>

    <!-- 内容区域 -->
    <view class="p-4">
      <!-- 场地名称 -->
      <text class="block text-2xl font-bold text-gray-900 mb-4">
        {{ venue.name }}
      </text>

      <!-- 推荐理由 -->
      <view class="bg-blue-50 rounded-xl p-4 mb-4">
        <text class="block text-sm font-semibold text-blue-900 mb-2">
          ⭐ 为什么推荐你来
        </text>
        <view class="space-y-1">
          <text
            v-for="(reason, index) in venue.reasons"
            :key="index"
            class="block text-sm text-blue-800"
          >
            • {{ reason }}
          </text>
        </view>
      </view>

      <!-- 基础信息 -->
      <view class="bg-white rounded-xl p-4 mb-4 shadow-sm">
        <text class="block text-base font-semibold text-gray-900 mb-3">
          📍 基础信息
        </text>
        <view class="space-y-2">
          <view class="flex items-center">
            <text class="text-sm text-gray-600 w-24">距离</text>
            <text class="text-sm text-gray-900 font-medium">{{ venue.distance }}</text>
          </view>
          <view class="flex items-center">
            <text class="text-sm text-gray-600 w-24">营业时间</text>
            <text class="text-sm text-gray-900 font-medium">{{ venue.hours }}</text>
          </view>
          <view class="flex items-center">
            <text class="text-sm text-gray-600 w-24">建议停留</text>
            <text class="text-sm text-gray-900 font-medium">{{ venue.duration }}</text>
          </view>
          <view class="flex items-center">
            <text class="text-sm text-gray-600 w-24">适合年龄</text>
            <text class="text-sm text-gray-900 font-medium">{{ venue.ageRange }}</text>
          </view>
        </view>
      </view>

      <!-- 注意事项 -->
      <view v-if="venue.tips && venue.tips.length > 0" class="bg-orange-50 rounded-xl p-4 mb-4">
        <text class="block text-sm font-semibold text-orange-900 mb-2">
          ⚠️ 注意事项
        </text>
        <view class="space-y-1">
          <text
            v-for="(tip, index) in venue.tips"
            :key="index"
            class="block text-sm text-orange-800"
          >
            • {{ tip }}
          </text>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex gap-3">
      <button
        class="flex-1 bg-white border-2 border-blue-500 text-blue-500 font-semibold py-3 rounded-lg"
        @click="handleCollect"
      >
        {{ isCollected ? '已收藏' : '收藏' }}
      </button>
      <button
        class="flex-1 bg-blue-500 text-white font-semibold py-3 rounded-lg"
        @click="handleNavigate"
      >
        导航
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const venue = ref({})
const isCollected = ref(false)

onLoad((options) => {
  // 从路由参数获取场地ID
  const venueId = options.id
  loadVenueDetail(venueId)
})

function loadVenueDetail(id) {
  // TODO: 后续从数据库加载
  // 目前使用硬编码数据
  const mockData = {
    '1': {
      id: '1',
      name: '西溪湿地公园',
      image: '/static/logo.png',
      distance: '2.3km',
      hours: '09:00-17:00',
      duration: '2-3小时',
      ageRange: '3-12岁',
      reasons: [
        '天气晴朗，适合户外活动',
        '人流较少，体验更好',
        '适合3-8岁孩子探索自然'
      ],
      tips: [
        '建议带防晒用品',
        '园区较大，建议穿舒适的鞋子',
        '可以带些零食和水'
      ]
    },
    '2': {
      id: '2',
      name: '杭州儿童博物馆',
      image: '/static/logo.png',
      distance: '3.5km',
      hours: '09:00-16:30',
      duration: '1.5-2小时',
      ageRange: '4-12岁',
      reasons: [
        '室内场馆，不受天气影响',
        '互动展品多，寓教于乐',
        '适合6-10岁孩子学习探索'
      ],
      tips: [
        '需提前预约',
        '周末人较多，建议工作日前往',
        '部分展品需要家长陪同'
      ]
    },
    '3': {
      id: '3',
      name: '宝石山登山步道',
      image: '/static/logo.png',
      distance: '1.8km',
      hours: '全天开放',
      duration: '1-2小时',
      ageRange: '5-12岁',
      reasons: [
        '距离近，适合短途出行',
        '运动量适中，锻炼身体',
        '山顶可俯瞰西湖美景'
      ],
      tips: [
        '注意安全，看好孩子',
        '建议穿运动鞋',
        '带足够的水'
      ]
    }
  }

  venue.value = mockData[id] || mockData['1']
}

function handleCollect() {
  isCollected.value = !isCollected.value
  uni.showToast({
    title: isCollected.value ? '已收藏' : '已取消收藏',
    icon: 'success'
  })
}

function handleNavigate() {
  uni.showToast({
    title: '打开地图导航',
    icon: 'success'
  })
  // TODO: 后续接入地图导航
}
</script>

<style scoped>
/* 使用 Tailwind CSS */
</style>
