<template>
  <view class="min-h-screen bg-[#F8F6F0]">
    <!-- 内容区域 -->
    <view class="pb-5">
      <!-- 植物头部信息 -->
      <view class="bg-white p-5 px-4 mb-3">
        <view class="relative w-full h-[240px] rounded-[20px] overflow-hidden mb-4">
          <image v-if="plant?.image" :src="plant.image" class="w-full h-full" mode="aspectFill" />
          <view
            v-else
            class="w-full h-full flex items-center justify-center"
            style="background: linear-gradient(135deg, #d8f3dc 0%, #b7e4c7 100%)"
          >
            <text class="text-[80px]">🪴</text>
          </view>
        </view>

        <view class="flex flex-col">
          <text class="text-2xl font-semibold text-gray-800 mb-1">{{ plant?.displayName }}</text>
          <text
            v-if="plant?.recognizedName && plant.recognizedName !== plant.displayName"
            class="text-[13px] text-gray-400 italic mb-3"
            >{{ plant.recognizedName }}</text
          >
          <view class="flex flex-wrap gap-3">
            <view class="flex items-center px-3 py-1.5 bg-gray-100 rounded-xl">
              <text class="text-sm mr-1">📍</text>
              <text class="text-[13px] text-gray-600">{{ plant?.location || '未设置' }}</text>
            </view>
            <view class="flex items-center px-3 py-1.5 bg-gray-100 rounded-xl">
              <text class="text-sm mr-1">🌱</text>
              <text class="text-[13px] text-gray-600">{{ getDaysAgo(plant?.createdAt) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 快速操作 -->
      <view class="flex gap-2 px-4 mb-3">
        <button
          class="flex-1 border border-gray-300 rounded-2xl p-3.5 px-2 flex flex-col items-center gap-1.5 border-none"
          style="background: linear-gradient(135deg, #2d7a4f 0%, #52b788 100%)"
          @click="startDiagnosis"
        >
          <text class="text-2xl">📷</text>
          <text class="text-xs text-white font-semibold">拍照诊断</text>
        </button>
        <button
          class="flex-1 bg-white border border-gray-300 rounded-2xl p-3.5 px-2 flex flex-col items-center gap-1.5"
          @click="doWatering"
        >
          <text class="text-2xl">💧</text>
          <text class="text-xs text-gray-600 font-semibold">浇水</text>
        </button>
        <button
          class="flex-1 bg-white border border-gray-300 rounded-2xl p-3.5 px-2 flex flex-col items-center gap-1.5"
          @click="editPlant"
        >
          <text class="text-2xl">✏️</text>
          <text class="text-xs text-gray-600 font-semibold">编辑信息</text>
        </button>
      </view>

      <!-- 浇水信息 -->
      <view v-if="plant?.watering || plant?.lastWatered || plant?.nextWater" class="bg-white p-4 mb-3">
        <text class="text-base font-semibold text-gray-800 block mb-4">💧 浇水记录</text>
        <view class="flex flex-col gap-3">
          <view
            class="flex items-center justify-between p-3 bg-[#F8F6F0] rounded-xl border-2 border-transparent"
            :class="{ '!border-[#F57C00] !bg-[#FFF3E0]': isWaterOverdue }"
          >
            <view class="flex items-center flex-1">
              <text class="text-2xl mr-3">💧</text>
              <view class="flex flex-col">
                <text class="text-sm font-semibold text-gray-800 mb-0.5">浇水</text>
                <text class="text-xs text-gray-400">{{ wateringText }}</text>
              </view>
            </view>
            <view class="flex flex-col items-end gap-1">
              <text v-if="plant?.lastWatered" class="text-[12px] text-gray-400">
                上次: {{ formatDate(plant.lastWatered) }}
              </text>
              <text v-if="plant?.nextWater" class="text-[13px] text-gray-600">
                下次: {{ formatNextTime(plant.nextWater) }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="plant?.sunning" class="bg-white p-4 mb-3">
        <text class="text-base font-semibold text-gray-800 block mb-4">☀️ 光照需求</text>
        <view class="p-3 bg-[#F8F6F0] rounded-xl">
          <text class="text-sm text-gray-600 leading-relaxed">{{ sunningText }}</text>
        </view>
      </view>

      <view v-if="plant?.fertilization" class="bg-white p-4 mb-3">
        <text class="text-base font-semibold text-gray-800 block mb-4">🧪 施肥建议</text>
        <view class="p-3 bg-[#F8F6F0] rounded-xl">
          <text class="text-sm text-gray-600 leading-relaxed">{{ fertilizationText }}</text>
        </view>
      </view>

      <view
        v-if="plant?.temperatureMin !== null || plant?.humidityMin !== null || plant?.ventilation"
        class="bg-white p-4 mb-3"
      >
        <text class="text-base font-semibold text-gray-800 block mb-4">🌡️ 环境建议</text>
        <view class="flex flex-col gap-2">
          <view v-if="temperatureText" class="p-3 bg-[#F8F6F0] rounded-xl">
            <text class="text-sm text-gray-600">{{ temperatureText }}</text>
          </view>
          <view v-if="humidityText" class="p-3 bg-[#F8F6F0] rounded-xl">
            <text class="text-sm text-gray-600">{{ humidityText }}</text>
          </view>
          <view v-if="ventilationText" class="p-3 bg-[#F8F6F0] rounded-xl">
            <text class="text-sm text-gray-600">{{ ventilationText }}</text>
          </view>
        </view>
      </view>

      <!-- 危险操作 -->
      <view class="px-4 mt-5">
        <button
          class="w-full bg-white border-2 border-[#F44336] rounded-2xl p-3.5 flex items-center justify-center gap-2"
          @click="confirmDelete"
        >
          <text class="text-lg">🗑️</text>
          <text class="text-sm text-[#F44336] font-semibold">删除植物</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'

const plantStore = usePlantStore()
const userStore = useUserStore()

const navbarHeight = ref(88)
const plantId = ref(null)

const plant = computed(() => {
  return plantStore.userPlants.find(p => p.id === plantId.value)
})

// 是否需要浇水（已过期）
const isWaterOverdue = computed(() => {
  if (!plant.value?.nextWater) return false
  return new Date(plant.value.nextWater) <= new Date()
})

const wateringText = computed(() => {
  const watering = plant.value?.watering
  if (!watering) return '按实际养护情况手动记录'
  const freqText = Array.isArray(watering.freq) && watering.freq.length
    ? `${watering.freq[0]}${watering.freq[1] ? `-${watering.freq[1]}` : ''}${watering.unit || '天'}`
    : ''
  return [watering.way, freqText].filter(Boolean).join(' · ')
})

const sunningText = computed(() => {
  const sunning = plant.value?.sunning
  if (!sunning) return ''
  const freqText = Array.isArray(sunning.freq) && sunning.freq.length
    ? `${sunning.freq[0]}${sunning.freq[1] ? `-${sunning.freq[1]}` : ''}${sunning.unit || ''}`
    : ''
  return [sunning.way, freqText, sunning.other].filter(Boolean).join(' · ')
})

const fertilizationText = computed(() => {
  const fertilization = plant.value?.fertilization
  if (!fertilization) return ''
  const freqText = Array.isArray(fertilization.freq) && fertilization.freq.length
    ? `${fertilization.freq[0]}${fertilization.freq[1] ? `-${fertilization.freq[1]}` : ''}${fertilization.unit || '天'}`
    : ''
  return [fertilization.type, freqText, fertilization.other].filter(Boolean).join(' · ')
})

const temperatureText = computed(() => {
  if (plant.value?.temperatureMin === null || plant.value?.temperatureMax === null) return ''
  return `建议温度 ${plant.value.temperatureMin}-${plant.value.temperatureMax}°C`
})

const humidityText = computed(() => {
  if (plant.value?.humidityMin === null || plant.value?.humidityMax === null) return ''
  return `建议湿度 ${plant.value.humidityMin}-${plant.value.humidityMax}%`
})

const ventilationText = computed(() => {
  const ventilation = plant.value?.ventilation
  if (!ventilation) return ''
  return [`通风 ${ventilation.level || ''}`, ventilation.sensitivity ? `敏感度 ${ventilation.sensitivity}` : '']
    .filter(Boolean)
    .join(' · ')
})

onLoad(options => {
  if (options.id) {
    plantId.value = parseInt(options.id)
  }
})

onMounted(() => {
  const systemInfo = uni.getSystemInfoSync()
  navbarHeight.value = (systemInfo.statusBarHeight || 0) + 44
})

function startDiagnosis() {
  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费诊断次数已用完，升级会员享受无限次诊断',
      confirmText: '升级会员',
      success: res => {
        if (res.confirm) {
          uni.switchTab({ url: '/pages/profile/profile' })
        }
      }
    })
    return
  }
  uni.navigateTo({ url: `/pages/diagnose/diagnose?plantId=${plantId.value}` })
}

async function doWatering() {
  const result = await plantStore.completeWatering(plantId.value)
  if (result.success) {
    uni.showToast({ title: '浇水完成', icon: 'success' })
  } else {
    uni.showToast({ title: result.message || '操作失败', icon: 'none' })
  }
}

function editPlant() {
  uni.showActionSheet({
    itemList: ['修改名称', '修改位置'],
    success: res => {
      if (res.tapIndex === 0) editNickName()
      else if (res.tapIndex === 1) editLocation()
    }
  })
}

function editNickName() {
  uni.showModal({
    title: '修改名称',
    editable: true,
    placeholderText: '请输入植物名称',
    content: plant.value?.displayName || '',
    success: async res => {
      if (res.confirm && res.content) {
        const result = await plantStore.updateUserPlant(plantId.value, {
          nickname: res.content
        })
        if (result.success) {
          uni.showToast({ title: '修改成功', icon: 'success' })
        } else {
          uni.showToast({ title: result.message || '修改失败', icon: 'none' })
        }
      }
    }
  })
}

function editLocation() {
  uni.showActionSheet({
    itemList: ['阳台', '客厅', '卧室', '书房', '办公室', '户外'],
    success: async res => {
      const locations = ['阳台', '客厅', '卧室', '书房', '办公室', '户外']
      const result = await plantStore.updateUserPlant(plantId.value, {
        location: locations[res.tapIndex]
      })
      if (result.success) {
        uni.showToast({ title: '修改成功', icon: 'success' })
      } else {
        uni.showToast({ title: result.message || '修改失败', icon: 'none' })
      }
    }
  })
}

function confirmDelete() {
  uni.showModal({
    title: '确认删除',
    content: '删除后将无法恢复，确定要删除这株植物吗？',
    confirmText: '删除',
    confirmColor: '#F44336',
    success: async res => {
      if (res.confirm) {
        console.log(plantId.value)
        const result = await plantStore.deleteUserPlant(plantId.value)
        if (result.success) {
          uni.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => uni.navigateBack(), 1500)
        } else {
          uni.showToast({ title: result.message || '删除失败', icon: 'none' })
        }
      }
    }
  })
}

function getDaysAgo(date) {
  if (!date) return '未知'
  const d = new Date(date)
  const days = Math.floor((new Date() - d) / (1000 * 60 * 60 * 24))
  if (days === 0) return '今天添加'
  return `添加 ${days} 天`
}

function formatNextTime(time) {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === -1) return '昨天'
  if (diffDays > 0) return `${diffDays}天后`
  return `已过${Math.abs(diffDays)}天`
}

function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 7) return `${diffDays}天前`

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
