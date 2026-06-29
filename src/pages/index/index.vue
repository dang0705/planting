<template>
  <view id="index-page" class="min-h-screen">
    <CustomNavbar title="植伴" />

    <view class="pb-[70px]" :style="{ paddingTop: userStore.navbarHeight + 'px' }">
      <view
        v-if="plantStore.plantsNeedWater.length > 0"
        class="m-4 p-3 px-4 rounded-2xl"
        style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)"
      >
        <view class="flex items-center">
          <text class="text-lg mr-2">🔔</text>
          <text class="text-sm font-semibold text-[#F57C00]">
            今日需要浇水 {{ plantStore.plantsNeedWater.length }} 株植物
          </text>
        </view>
      </view>

      <template v-if="userStore.isAuthenticated">
        <image :src="loading" class="size-20 fixed position-center" v-if="!loaded" />
        <!--          空状态-->
        <view v-else-if="!plantStore.hasPlants">
          <text class="text-6xl mb-4">🌱</text>
          <text class="text-lg font-semibold text-gray-800 mb-2">还没有添加植物</text>
          <text class="text-sm text-gray-400 text-center mb-8 leading-relaxed">
            记录你的每一株植物，让 AI 帮你更好地照顾它们
          </text>
          <button
            class="flex items-center px-8 py-3.5 rounded-3xl text-white text-base font-semibold border-none"
            style="background: linear-gradient(135deg, #2d7a4f 0%, #52b788 100%)"
            @click="addPlant"
          >
            <text class="text-xl mr-2">+</text>
            <text>添加第一株植物</text>
          </button>
        </view>
        <!-- 植物卡片列表 -->
        <view v-else id="index-plant-list" class="p-4">
          <uni-collapse @change="handleCollapseChange">
            <uni-collapse-item
              v-for="plant in plantStore.userPlants"
              :key="plant.id"
              :title="plant.displayName"
              :name="plant.id"
              :open="false"
              :border="false"
              :show-arrow="false"
              show-animation
              class="mb-4"
              title-border="none"
            >
              <!-- 折叠面板标题插槽 -->
              <template v-slot:title>
                <PlantCard
                  :plant="plant"
                  :reminder-summary="getReminderSummary(plant)"
                  @diagnose="openDiagnose"
                  @history="openPlantHistory"
                  @detail="viewPlantDetail"
                  @reminder="openReminder"
                />
              </template>

              <!-- 折叠面板内容 -->
              <view class="px-3 py-2">
                <!-- 诊断历史 -->
                <view :id="`index-diagnose-history-section-${plant.id}`" class="mb-3">
                  <text class="block text-sm font-semibold text-gray-800 mb-2">📋 诊断历史</text>

                  <!-- 加载中 -->
                  <view
                    v-if="loadingHistory[plant.id]"
                    :id="`index-diagnose-history-loading-${plant.id}`"
                    class="text-center py-4"
                  >
                    <text class="text-xs text-gray-400">加载中...</text>
                  </view>

                  <!-- 历史记录列表 -->
                  <view
                    v-else-if="plantDiagnoseHistory[plant.id]?.length > 0"
                    :id="`index-diagnose-history-list-${plant.id}`"
                  >
                    <view
                      v-for="record in plantDiagnoseHistory[plant.id]"
                      :key="record._id"
                      :id="`index-diagnose-record-${record._id}`"
                      class="bg-gray-50 rounded-xl p-2.5 mb-2"
                      @click="viewDiagnoseDetail(record._id)"
                    >
                      <view class="flex items-start">
                        <view class="flex-1">
                          <text class="block text-xs font-semibold text-gray-800 mb-1">
                            {{ record.mainIssue || '诊断记录' }}
                          </text>
                          <view class="flex items-center">
                            <view
                              class="px-2 py-0.5 rounded-full mr-2"
                              :class="getHealthBadgeClass(record.healthStatus)"
                            >
                              <text class="text-white text-[10px] font-semibold">
                                {{ getHealthText(record.healthStatus) }}
                              </text>
                            </view>
                            <text class="text-[10px] text-gray-400">
                              {{ formatTime(record.createdAt) }}
                            </text>
                          </view>
                        </view>
                        <text class="text-gray-400 ml-2">›</text>
                      </view>
                    </view>
                  </view>

                  <!-- 空状态 -->
                  <view
                    v-else
                    :id="`index-diagnose-history-empty-${plant.id}`"
                    class="bg-gray-50 rounded-xl p-3 text-center"
                  >
                    <text class="text-xs text-gray-400">暂无诊断记录</text>
                  </view>
                </view>

                <!-- 养护提醒 -->
                <view
                  v-if="needsCareToday(plant.id)"
                  class="inline-flex px-3 py-1.5 bg-[#FFF3E0] rounded-xl mb-3"
                >
                  <text class="text-xs text-[#F57C00] font-semibold">💧 今日需要养护</text>
                </view>

                <!-- 查看详情按钮 -->
                <view
                  class="mt-2 py-2.5 text-center bg-primary rounded-xl"
                  @click="viewPlantDetail(plant)"
                >
                  <text class="text-sm text-white font-semibold">查看详情</text>
                </view>
              </view>
            </uni-collapse-item>
          </uni-collapse>

          <!-- 添加按钮 -->
          <view
            class="bg-white border-2 border-dashed border-primary rounded-[20px] flex flex-col items-center justify-center mt-4"
            @click="addPlant"
          >
            <uni-icons type="plusempty" />
            <text class="text-sm text-primary font-semibold">添加新植物</text>
          </view>
        </view>
      </template>
      <view v-else class="mx-4 mt-6 bg-white rounded-[24px] p-5 shadow-sm">
        <text class="block text-lg font-semibold text-gray-800 mb-2">登录后开始记录植物</text>
        <text class="block text-sm text-gray-500 mb-5">
          登录后可使用植物识别、AI 诊断、养护记录和历史同步能力。
        </text>

        <!-- #ifdef MP-WEIXIN -->
        <button
          id="index-phone-login-button"
          class="w-full bg-primary text-white font-semibold py-3.5 rounded-2xl mb-3 flex items-center justify-center"
          open-type="getPhoneNumber"
          @getphonenumber="handleIndexPhoneLogin"
        >
          <text class="text-base">📱 微信手机号登录</text>
        </button>
        <!-- #endif -->

        <!-- #ifndef MP-WEIXIN -->
        <button
          id="index-phone-login-unavailable-button"
          class="w-full bg-gray-100 text-gray-500 font-semibold py-3.5 rounded-2xl mb-3 flex items-center justify-center"
          @click="handlePhoneLoginUnavailable"
        >
          <text class="text-base">📱 手机号登录接入中</text>
        </button>
        <!-- #endif -->

        <button
          id="index-quick-login-button"
          class="w-full bg-[#EEF3EF] text-[#2D7A4F] font-semibold py-3.5 rounded-2xl flex items-center justify-center"
          @click="userLogin"
        >
          <text class="text-base">⚡ 快速登录</text>
        </button>
      </view>

      <!-- 养护知识 -->
      <view v-if="plantStore.hasPlants" class="px-4 pb-4">
        <text class="block text-base font-semibold text-gray-800 mb-3">💡 养护知识</text>
        <view class="grid grid-cols-4 gap-3">
          <view
            v-for="tip in careTips"
            :key="tip.id"
            class="bg-white rounded-2xl p-4 px-2 flex flex-col items-center shadow-sm"
            @click="viewTip(tip)"
          >
            <text class="text-[28px] mb-2">{{ tip.icon }}</text>
            <text class="text-[11px] text-gray-600 text-center">{{ tip.title }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 诊断弹窗 -->
    <DiagnosePopup
      ref="diagnosePopupRef"
      :plant-id="currentPlantId"
      :plant-name="currentPlantName"
      @success="handleDiagnoseSuccess"
      @close="handleDiagnosePopupClose"
    />

    <!-- 浇水提醒弹框 -->
    <WateringReminderSheet
      ref="wateringReminderRef"
      :plant="currentReminderPlant"
      @close="() => (currentReminderPlant = null)"
    />
  </view>
</template>

<script setup>
import { onMounted, ref, reactive } from 'vue'
import CustomNavbar from '@/components/CustomNavbar'
import DiagnosePopup from '@/components/DiagnosePopup.vue'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { getDiagnosisHistory } from '@/api/plants-http.js'
import loading from '@/assets/icons/loading.svg'
import { usePlantingStore } from '@/store/planting.js'
import PlantCard from './components/PlantCard.vue'
import WateringReminderSheet from './components/WateringReminderSheet.vue'

const plantStore = usePlantStore()
const userStore = useUserStore()
const plantingStore = usePlantingStore()

const loaded = ref(false)
const diagnosePopupRef = ref(null)
const wateringReminderRef = ref(null)
const currentPlantId = ref('')
const currentPlantName = ref('')
const currentReminderPlant = ref(null)
const plantDiagnoseHistory = reactive({})
const loadingHistory = reactive({})

const careTips = ref([
  { id: 1, icon: '💧', title: '浇水技巧' },
  { id: 2, icon: '☀️', title: '光照需求' },
  { id: 3, icon: '🌡️', title: '温度控制' },
  { id: 4, icon: '🪴', title: '施肥方法' }
])

onMounted(async () => {
  const systemInfo = uni.getSystemInfoSync()
  userStore.setNavbarHeight((systemInfo.statusBarHeight || 0) + 44)

  // 登录状态下加载用户植物
  if (await userStore.ensureLogin()) {
    loadUserPlants(true)
  }
})

// 监听折叠面板展开，加载诊断历史
function handleCollapseChange(e) {
  // e 是展开的面板 name 数组
  if (e && e.length > 0) {
    const plantId = e[e.length - 1] // 获取最新展开的面板
    if (!plantDiagnoseHistory[plantId] && !loadingHistory[plantId]) {
      loadPlantDiagnoseHistory(plantId)
    }
  }
}

async function loadPlantDiagnoseHistory(plantId) {
  loadingHistory[plantId] = true
  try {
    const result = await getDiagnosisHistory({
      plantId,
      page: 1,
      pageSize: 3
    })

    plantDiagnoseHistory[plantId] = (result?.items || []).map(item => ({
      _id: item.resultId || item.historyId || '',
      mainIssue: item?.summary?.displayName || '诊断记录',
      healthStatus: !item?.outcomeType
        ? 'unknown'
        : item?.outcomeType === 'non_problematic'
          ? 'healthy'
          : item?.outcomeType === 'uncertain'
            ? 'unknown'
            : item?.summary?.severity === 'high'
              ? 'danger'
              : 'warning',
      createdAt: item.createdAt
    }))
  } catch (error) {
    console.error('加载诊断历史失败:', error)
  } finally {
    loadingHistory[plantId] = false
  }
}

function openDiagnose(plant) {
  currentPlantId.value = plant.id
  currentPlantName.value = plant.canonicalName || plant.displayName || '未知植物'
  diagnosePopupRef.value?.open()
}

function openPlantHistory(plant) {
  if (!plantDiagnoseHistory[plant.id] && !loadingHistory[plant.id]) {
    loadPlantDiagnoseHistory(plant.id)
  }
}

function handleDiagnoseSuccess(result) {
  // 诊断成功后刷新该植物的诊断历史
  if (currentPlantId.value) {
    loadPlantDiagnoseHistory(currentPlantId.value)
  }
}

function handleDiagnosePopupClose() {
  currentPlantId.value = ''
  currentPlantName.value = ''
}

function viewDiagnoseDetail(recordId) {
  uni.navigateTo({
    url: `/pages/diagnose/diagnose?id=${recordId}`
  })
}

function formatTime(time) {
  const date = new Date(time)
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
  if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)}天前`
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`
}

async function userLogin() {
  await userStore.wechatLogin()
  loadUserPlants()
}

async function handleIndexPhoneLogin(e) {
  const phonePayload = {
    code: e?.detail?.code || '',
    cloudId: e?.detail?.cloudID || e?.detail?.cloudId || ''
  }

  if (!phonePayload.code && !phonePayload.cloudId) {
    console.log('首页手机号授权未返回有效桥接参数:', e?.detail)
    return
  }

  try {
    await userStore.phoneLogin(phonePayload)
    await loadUserPlants()
    uni.showToast({
      title: '登录成功',
      icon: 'success'
    })
  } catch (error) {
    console.error('首页手机号登录失败:', error)
    uni.showToast({
      title: error.message || '登录失败',
      icon: 'none'
    })
  }
}

function handlePhoneLoginUnavailable() {
  uni.showToast({
    title: '当前平台手机号登录接入中',
    icon: 'none'
  })
}

async function loadUserPlants(force = false) {
  if (loaded.value && !force) {
    return
  }
  loaded.value = false

  try {
    await plantStore.getUserPlants()
  } catch (e) {
    console.error('加载植物列表失败:', e)
  } finally {
    loaded.value = true
  }
}

function addPlant() {
  uni.navigateTo({
    url: '/pages/add-plant/add-plant'
  })
}

function viewPlantDetail(plant) {
  plantStore.setCurrentPlant(plant)
  uni.navigateTo({
    url: `/pages/plant-detail/plant-detail?id=${plant.id}`
  })
}

function getReminderSummary(plant) {
  return {
    water: plantingStore.getPlantReminderState(plant.id, 'water'),
    fertilize: plantingStore.getPlantReminderState(plant.id, 'fertilize')
  }
}

function openReminder({ plant, type }) {
  if (type === 'water') {
    // 水滴 icon：打开浇水提醒底部弹框，不再直接跳转日历页
    currentReminderPlant.value = plant
    wateringReminderRef.value?.open()
    return
  }
  // 其他提醒类型仍走日历页
  plantingStore.setReminderFocus({
    plantId: plant.id,
    plantName: plant.displayName || plant.canonicalName || '当前植物',
    type
  })
  uni.switchTab({
    url: '/pages/calendar/calendar'
  })
}

function needsCareToday(plantId) {
  return plantStore.plantsNeedWater.some(p => p.id === plantId)
}

function getHealthBadgeClass(status) {
  const statusClass = {
    healthy: 'bg-green-500/90',
    warning: 'bg-orange-500/90',
    danger: 'bg-red-500/90',
    sick: 'bg-red-500/90',
    unknown: 'bg-gray-400/90'
  }
  return statusClass[status] || statusClass.unknown
}

function getHealthText(status) {
  const textMap = {
    healthy: '健康',
    warning: '注意',
    danger: '异常',
    sick: '异常',
    unknown: '待确认'
  }
  return textMap[status] || '待确认'
}

function viewTip(tip) {
  uni.showToast({
    title: `${tip.title}功能开发中`,
    icon: 'none'
  })
}
</script>
