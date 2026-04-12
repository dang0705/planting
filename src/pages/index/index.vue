<template>
  <view class="min-h-screen bg-[#F8F6F0]">
    <!-- 自定义导航栏 -->
    <CustomNavbar title="植伴" />

    <!-- 内容区域 -->
    <view class="pb-[70px]" :style="{ paddingTop: userStore.navbarHeight + 'px' }">
      <!-- 今日养护提醒 -->
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

      <!-- 登录用户 -->
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
        <view v-else class="p-4">
          <uni-collapse @change="handleCollapseChange">
            <uni-collapse-item
              v-for="plant in plantStore.userPlants"
              :key="plant.id"
              :title="plant.displayName"
              :name="plant.id"
              :open="false"
              :border="false"
              show-animation
              class="mb-4"
              title-border="none"
            >
              <!-- 折叠面板标题插槽 -->
              <template v-slot:title>
                <view class="flex items-center justify-between w-full pr-4">
                  <view class="flex items-center flex-1">
                    <!-- 植物缩略图 -->
                    <view class="w-16 h-16 rounded-xl overflow-hidden mr-3 flex-shrink-0">
                      <image
                        v-if="plant.image"
                        :src="plant.image"
                        class="w-full h-full"
                        mode="aspectFill"
                      />
                      <view
                        v-else
                        class="w-full h-full flex items-center justify-center"
                        style="background: linear-gradient(135deg, #d8f3dc 0%, #b7e4c7 100%)"
                      >
                        <text class="text-3xl">🪴</text>
                      </view>
                    </view>

                    <!-- 植物基本信息 -->
                    <view class="flex-1">
                      <view class="flex items-center mb-1">
                        <text class="text-base font-semibold text-gray-800 mr-2">{{
                          plant.displayName
                        }}</text>
                        <view
                          :class="getHealthBadgeClass(plant.healthStatus)"
                          class="px-2 py-0.5 rounded-lg"
                        >
                          <text class="text-white text-[10px] font-semibold">{{
                            getHealthText(plant.healthStatus)
                          }}</text>
                        </view>
                      </view>
                      <text class="text-xs text-gray-400"
                        >{{ getDaysAgo(plant.plantDate) }} · {{ plant.location }}</text
                      >
                    </view>
                  </view>

                  <!-- 诊断按钮 -->
                  <view
                    class="ml-2 bg-primary px-3 py-1.5 rounded-lg flex items-center"
                    @click.stop="openDiagnose(plant)"
                  >
                    <text class="text-white text-xs font-semibold">📷 诊断</text>
                  </view>
                </view>
              </template>

              <!-- 折叠面板内容 -->
              <view class="px-3 py-2">
                <!-- 诊断历史 -->
                <view class="mb-3">
                  <text class="block text-sm font-semibold text-gray-800 mb-2">📋 诊断历史</text>

                  <!-- 加载中 -->
                  <view v-if="loadingHistory[plant.id]" class="text-center py-4">
                    <text class="text-xs text-gray-400">加载中...</text>
                  </view>

                  <!-- 历史记录列表 -->
                  <view v-else-if="plantDiagnoseHistory[plant.id]?.length > 0">
                    <view
                      v-for="record in plantDiagnoseHistory[plant.id]"
                      :key="record._id"
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
                  <view v-else class="bg-gray-50 rounded-xl p-3 text-center">
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
          class="w-full bg-primary text-white font-semibold py-3.5 rounded-2xl mb-3 flex items-center justify-center"
          open-type="getPhoneNumber"
          @getphonenumber="handleIndexPhoneLogin"
        >
          <text class="text-base">📱 微信手机号登录</text>
        </button>
        <!-- #endif -->

        <!-- #ifndef MP-WEIXIN -->
        <button
          class="w-full bg-gray-100 text-gray-500 font-semibold py-3.5 rounded-2xl mb-3 flex items-center justify-center"
          @click="handlePhoneLoginUnavailable"
        >
          <text class="text-base">📱 手机号登录接入中</text>
        </button>
        <!-- #endif -->

        <button
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
  </view>
</template>

<script setup>
import { onMounted, ref, reactive } from 'vue'
import CustomNavbar from '@/components/CustomNavbar'
import DiagnosePopup from '@/components/DiagnosePopup.vue'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { getCityNameByLocation } from '@/api/weather.js'
import { getDiagnosisHistory } from '@/api/plants-http.js'
import loading from '@/assets/icons/loading.svg'

const plantStore = usePlantStore()
const userStore = useUserStore()

const loaded = ref(false)
const diagnosePopupRef = ref(null)
const currentPlantId = ref('')
const currentPlantName = ref('')
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

  getUserLocation()

  // 登录状态下加载用户植物
  if (await userStore.ensureLogin()) {
    loadUserPlants()
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
      healthStatus:
        !item?.outcomeType
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

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

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

async function loadUserPlants() {
  if (loaded.value) return
  loaded.value = false

  try {
    await plantStore.getUserPlants()
  } catch (e) {
    console.error('加载植物列表失败:', e)
  } finally {
    loaded.value = true
    console.log(loaded, 'loaded')
  }
}

async function getUserLocation() {
  try {
    const res = await new Promise((resolve, reject) => {
      uni.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject
      })
    })

    // 根据经纬度获取真实城市名称
    const cityInfo = await getCityNameByLocation(res.latitude, res.longitude)

    userStore.setLocation({
      latitude: res.latitude,
      longitude: res.longitude,
      city: cityInfo.city || '当前位置',
      province: cityInfo.province || ''
    })
  } catch (error) {
    console.error('获取位置信息失败:', error)
    // 如果获取位置失败，使用默认城市或保持为空
    userStore.setLocation({
      latitude: null,
      longitude: null,
      city: '当前位置',
      province: ''
    })
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

function getDaysAgo(date) {
  const plantDate = new Date(date)
  const now = new Date()
  const days = Math.floor((now - plantDate) / (1000 * 60 * 60 * 24))
  return `${days}天`
}

function viewTip(tip) {
  uni.showToast({
    title: `${tip.title}功能开发中`,
    icon: 'none'
  })
}
</script>
