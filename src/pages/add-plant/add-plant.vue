<template>
  <view class="min-h-screen bg-[#F8F6F0] pb-5">
    <StepIndicator :step="step" />

    <!-- 步骤 1: 选择植物 -->
    <view v-if="step === 1" class="px-4">
      <text class="block text-2xl font-semibold text-gray-800 mb-2">选择你的植物</text>
      <text class="block text-sm text-gray-400 mb-6">从常见植物中选择，或使用 AI 识别</text>

      <!-- 搜索框 -->
      <view class="mb-4">
        <view class="relative">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索植物名称..."
            class="w-full bg-white rounded-2xl px-4 py-3 pr-10 text-sm border-2 border-gray-100 focus:border-primary"
            @input="handleSearch"
            @confirm="handleSearchConfirm"
          />
          <view class="absolute right-3 top-1/2 -translate-y-1/2">
            <text v-if="!searchKeyword" class="text-gray-400">🔍</text>
            <text v-else class="text-gray-400" @click="clearSearch">✕</text>
          </view>
        </view>
        <text
          v-if="searchKeyword && !initialPlantsLoading && defaultPlants.length === 0"
          class="block text-xs text-gray-400 mt-2 text-center"
        >
          未找到匹配的植物
        </text>
      </view>

      <view class="mb-6">
        <text class="block text-base font-semibold text-gray-800 mb-4">🌿 常见植物</text>
        <view v-if="initialPlantsLoading" class="flex justify-center py-8">
          <text class="text-sm text-gray-400">加载中...</text>
        </view>
        <scroll-view
          v-else
          class="w-full"
          scroll-x
          enhanced
          show-scrollbar="false"
          lower-threshold="120"
          @scrolltolower="handlePlantScrollToLower"
        >
          <view class="flex gap-2 pb-2">
            <view
              v-for="(group, gi) in plantGroups"
              :key="group.key || gi"
              :class="[
                'gap-2 flex-shrink-0 snap-start',
                group.length < 3 ? 'grid grid-cols-1 auto-cols-fr' : 'grid grid-cols-2 grid-rows-2'
              ]"
            >
              <PlantCard
                v-for="p in group.items"
                :key="p.id"
                :plant="p"
                :selected="selectedPlant?.id === p.id"
                @select="handlePlantSelect(p)"
              />
            </view>
            <view class="w-16 flex-shrink-0 flex items-center justify-center">
              <text v-if="plantsLoadingMore" class="text-xs text-gray-400">加载中...</text>
              <text v-else-if="hasMorePlants" class="text-xs text-gray-300">更多</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- AI 识别 -->
      <view
        class="mb-6 rounded-2xl p-4 flex items-center justify-between"
        style="background: linear-gradient(135deg, #2d7a4f 0%, #52b788 100%)"
        @click="useAIIdentify"
      >
        <view class="flex items-center">
          <text class="text-[32px] mr-3">🔍</text>
          <view>
            <text class="block text-base font-semibold text-white mb-1">AI 智能识别</text>
            <text class="block text-xs text-white/80">拍照识别植物种类</text>
          </view>
        </view>
        <view class="bg-white/20 px-3 py-1.5 rounded-xl">
          <text class="text-xs text-white font-semibold">消耗 1 次</text>
        </view>
      </view>

      <button
        class="w-full text-white border-none py-4 rounded-2xl text-base font-semibold"
        style="background: linear-gradient(135deg, #2d7a4f 0%, #52b788 100%)"
        :class="{ 'opacity-50': !selectedPlant && !recognizedName }"
        :disabled="!selectedPlant && !recognizedName"
        @click="step = 2"
      >
        下一步
      </button>
    </view>

    <!-- 步骤 2: 填写信息 -->
    <view v-else class="px-4">
      <text class="block text-2xl font-semibold text-gray-800 mb-2">完善植物信息</text>
      <text class="block text-sm text-gray-400 mb-6">记录更多信息，方便后续养护</text>

      <PlantForm v-model="formData" class="mb-6" @upload-photo="uploadPhoto" />

      <view class="flex gap-3">
        <button
          class="flex-1 bg-white border-2 border-primary text-primary py-4 rounded-2xl text-base font-semibold"
          :disabled="submitting"
          @click="step = 1"
        >
          上一步
        </button>
        <button
          class="flex-[2] text-white border-none py-4 rounded-2xl text-base font-semibold"
          style="background: linear-gradient(135deg, #2d7a4f 0%, #52b788 100%)"
          :class="{ 'opacity-50': submitting }"
          :disabled="submitting"
          @click="submitForm"
        >
          {{ submitting ? '保存中...' : '完成' }}
        </button>
      </view>
    </view>

    <AIStreamDialog
      ref="aiDialogRef"
      :visible="showAIDialog"
      title="AI 智能识别"
      icon="🔍"
      loading-text="正在识别植物..."
      confirm-text="使用识别结果"
      @close="showAIDialog = false"
      @confirm="handleAIConfirm"
      @retry="handleAIRetry"
    />

    <LoginModal
      :show="showLogin"
      :message="loginMsg"
      @close="handleLoginClose"
      @success="handleLoginSuccess"
    />
  </view>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useUserStore } from '@/store/user.js'
import { usePlantStore } from '@/store/plants.js'
import { uploadPlantImage, getImageUrl } from '@/api/storage.js'
import { createUserPlant, identifyPlantByImage } from '@/api/plants-http.js'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { ONE_MEGA_BYTE } from '@/constants'
import StepIndicator from './components/StepIndicator.vue'
import PlantCard from './components/PlantCard.vue'
import PlantForm from './components/PlantForm.vue'
import LoginModal from '@/components/LoginModal.vue'
import AIStreamDialog from '@/components/AIStreamDialog.vue'

const userStore = useUserStore()
const plantStore = usePlantStore()
console.log('add-plant')
const {
  plants: defaultPlants,
  loading: plantsLoading,
  initialLoading: initialPlantsLoading,
  loadingMore: plantsLoadingMore,
  load: loadPlants,
  loadNextPage,
  hasMore: hasMorePlants
} = useDefaultPlants()
// 将植物按每组4个分组（2列x2行）
const plantGroups = computed(() => {
  const groups = []
  for (let i = 0; i < defaultPlants.value.length; i += 4) {
    const items = defaultPlants.value.slice(i, i + 4)
    groups.push({
      key: items.map(item => item.id).join('-'),
      length: items.length,
      items
    })
  }
  return groups
})

const step = ref(1)
const selectedPlant = ref(null)
const recognizedName = ref('') // AI识别的植物名称（未匹配到 plant_catalog 时使用）
const identifyContext = ref(null)
const submitting = ref(false)
const showLogin = ref(false)
const loginMsg = ref('添加植物需要先登录')
const showAIDialog = ref(false)
const aiDialogRef = ref(null)
const pendingImage = ref({ path: '', url: '' })
const searchKeyword = ref('')
let searchTimer = null

const formData = ref({
  image: '',
  nickname: '',
  location: '阳台',
  plantDate: new Date().toISOString().split('T')[0],
  notes: ''
})

// 监听选中的植物，自动填充名称和图片
watch(
  selectedPlant,
  newPlant => {
    if (newPlant) {
      // 如果昵称为空，使用植物名称作为默认昵称
      if (!formData.value.nickname.trim()) {
        formData.value.nickname = newPlant.canonicalName
      }
      // 如果图片为空，使用植物的图片URL
      if (!formData.value.image && newPlant.imageUrl) {
        formData.value.image = newPlant.imageUrl
      }
    }
  },
  { immediate: true }
)

// 监听AI识别的植物名称
watch(recognizedName, newName => {
  if (newName && !selectedPlant.value) {
    // 如果是AI识别且未匹配到植物，且昵称为空，使用AI识别名称作为默认昵称
    if (!formData.value.nickname.trim()) {
      formData.value.nickname = newName
    }
  }
})

onMounted(async () => {
  if (!(await userStore.ensureLogin())) showLogin.value = true
  await loadPlants()
})

function handleLoginSuccess() {
  showLogin.value = false
  if (loginMsg.value.includes('AI')) useAIIdentify()
}

function handleLoginClose() {
  /*  showLogin.value = false
  uni.showModal({
    title: '提示',
    content: '添加植物需要登录，是否返回？',
    confirmText: '返回',
    cancelText: '去登录',
    success: r => r.confirm ? uni.navigateBack() : (showLogin.value = true)
  })*/
}

// 搜索处理（防抖）
function handleSearch(e) {
  const keyword = e.detail.value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadPlants(keyword)
  }, 500)
}

// 搜索确认
function handleSearchConfirm() {
  if (searchTimer) clearTimeout(searchTimer)
  loadPlants(searchKeyword.value)
}

// 清除搜索
function clearSearch() {
  searchKeyword.value = ''
  loadPlants()
}

function handlePlantScrollToLower() {
  console.log('[PlantScroll] loading marker reached', {
    hasMore: hasMorePlants.value,
    loading: plantsLoading.value,
    initialLoading: initialPlantsLoading.value,
    loadingMore: plantsLoadingMore.value
  })
  if (hasMorePlants.value && !plantsLoadingMore.value) {
    console.log('[PlantScroll] trigger loadNextPage')
    loadNextPage()
  }
}

function normalizeIdentifyPlantCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null

  const normalizedId = String(candidate.id || '').trim()
  const plantIdentityId = String(candidate.plantIdentityId || '').trim()
  const legacyPlantId = String(candidate.legacyPlantId || '').trim()
  const canonicalName = String(candidate.canonicalName || candidate.name || '').trim()
  const internetName = String(candidate.internetName || '').trim()

  const matchedDefaultPlant =
    defaultPlants.value.find(item => {
      const sameIdentity = plantIdentityId && item.plantIdentityId === plantIdentityId
      const sameLegacy = legacyPlantId && item.legacyPlantId === legacyPlantId
      const sameId = normalizedId && item.id === normalizedId
      const sameName = canonicalName && item.canonicalName === canonicalName
      return sameIdentity || sameLegacy || sameId || sameName
    }) || null

  if (matchedDefaultPlant) {
    return matchedDefaultPlant
  }

  if (!canonicalName) return null

  return {
    id: normalizedId || legacyPlantId || plantIdentityId || canonicalName,
    plantId: normalizedId || legacyPlantId || plantIdentityId || '',
    plantIdentityId,
    legacyPlantId,
    canonicalName,
    internetName
  }
}

function buildIdentifyContext(result, overrides = {}) {
  return {
    sessionId: String(result?.sessionId || '').trim(),
    visualCallBatchId: String(result?.visualCallBatchId || '').trim(),
    recognizedName: String(result?.recognizedName || result?.name || '').trim(),
    recognitionConfidence: Number(result?.confidence || 0),
    recognitionType: String(result?.type || 'plant').trim() || 'plant',
    taxonomyMatchStatus: String(result?.taxonomyMatchStatus || '').trim(),
    identityResolutionStatus: String(result?.identityResolutionStatus || '').trim(),
    routePrimaryAction: String(result?.routePrimaryAction || '').trim(),
    selectionMode: overrides.selectionMode || 'recognized_name',
    selectedPlant: overrides.selectedPlant || null
  }
}

function applyIdentifySelection({ plant = null, fallbackName = '', context }) {
  formData.value.image = pendingImage.value.path
  selectedPlant.value = plant
  recognizedName.value = plant ? '' : fallbackName
  identifyContext.value = context
  showAIDialog.value = false
  setTimeout(() => (step.value = 2), 400)
}

function handlePlantSelect(plant) {
  identifyContext.value = null
  selectedPlant.value = plant
  recognizedName.value = ''
}

async function useAIIdentify() {
  if (!(await userStore.ensureLogin())) {
    loginMsg.value = '使用 AI 识别功能需要先登录'
    showLogin.value = true
    return
  }
  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费识别次数已用完，升级会员享受无限次识别',
      confirmText: '升级会员',
      success: r => r.confirm && uni.switchTab({ url: '/pages/profile/profile' })
    })
    return
  }
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: res => {
      formData.value.image = res.tempFilePaths[0]
      doIdentify(res.tempFilePaths[0])
    }
  })
}

async function doIdentify(path) {
  try {
    uni.showLoading({ title: '上传图片中...', mask: true })
    const { fileId } = await uploadPlantImage(path, userStore.userId || 'anon', 'identify')
    const url = await getImageUrl(fileId, 7200)
    pendingImage.value = { path, url }

    uni.showLoading({ title: 'AI 识别中...', mask: true })
    const response = await identifyPlantByImageWithRetry(url)
    uni.hideLoading()

    if (response?.code !== 200) {
      throw new Error(response?.message || '识别失败')
    }

    const result = {
      name: response.data?.name || '未知植物',
      recognizedName: response.data?.name || '未知植物',
      confidence: response.data?.confidence || 0,
      type: response.data?.type || 'plant',
      sessionId: response.data?.sessionId || '',
      visualCallBatchId: response.data?.visualCallBatchId || '',
      taxonomyMatchStatus: response.data?.taxonomyMatchStatus || '',
      identityResolutionStatus: response.data?.identityResolutionStatus || '',
      routePrimaryAction: response.data?.routePrimaryAction || '',
      matchedPlant: response.data?.matchedPlant || null,
      candidates: response.data?.candidates || []
    }
    const text = `识别结果：${result.name}
置信度：${((result.confidence || 0) * 100).toFixed(1)}%`
    userStore.useAIQuota()

    showAIDialog.value = true
    setTimeout(() => {
      aiDialogRef.value?.setText(text)
      aiDialogRef.value?.finishStream(result)
    }, 100)
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e?.message || '识别失败，请重试', icon: 'none' })
  }
}

function isRetryableRequestError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network error') ||
    message.includes('request:fail') ||
    message.includes('fail timeout')
  )
}

async function identifyPlantByImageWithRetry(imageUrl, attempts = 2) {
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await identifyPlantByImage(imageUrl)
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isRetryableRequestError(error)) {
        break
      }
    }
  }

  const message = String(lastError?.message || lastError || '')
  if (/timeout|timed out|fail timeout/i.test(message)) {
    throw new Error('识别超时，请重试')
  }

  throw lastError instanceof Error ? lastError : new Error('识别失败，请重试')
}

function handleAIConfirm(result) {
  if (!result?.name || result.name === '未知植物') {
    uni.showToast({ title: '未能识别植物，请重试', icon: 'none' })
    return
  }

  const matched = normalizeIdentifyPlantCandidate(result.matchedPlant)

  if (matched) {
    applyIdentifySelection({
      plant: matched,
      context: buildIdentifyContext(result, {
        selectionMode: 'matched',
        selectedPlant: matched
      })
    })
    console.log('[AI确认] 使用匹配的植物数据:', matched.canonicalName)
    uni.showToast({ title: `识别成功: ${matched.canonicalName}`, icon: 'success' })
    return
  }

  const candidatePlants = (result.candidates || [])
    .map(candidate => normalizeIdentifyPlantCandidate(candidate))
    .filter(Boolean)

  if (candidatePlants.length > 0) {
    const limitedCandidates = candidatePlants.slice(0, 5)
    const optionLabels = limitedCandidates.map(candidate => {
      const internetName = String(candidate.internetName || '').trim()
      return internetName && internetName !== candidate.canonicalName
        ? `${candidate.canonicalName} / ${internetName}`
        : candidate.canonicalName
    })

    uni.showActionSheet({
      itemList: [...optionLabels, `使用识别名称：${result.name.trim()}`],
      success: action => {
        if (action.tapIndex < limitedCandidates.length) {
          const chosenPlant = limitedCandidates[action.tapIndex]
          applyIdentifySelection({
            plant: chosenPlant,
            context: buildIdentifyContext(result, {
              selectionMode: 'candidate',
              selectedPlant: chosenPlant
            })
          })
          uni.showToast({ title: `已选择: ${chosenPlant.canonicalName}`, icon: 'success' })
        } else {
          applyIdentifySelection({
            plant: null,
            fallbackName: result.name.trim(),
            context: buildIdentifyContext(result, {
              selectionMode: 'recognized_name',
              selectedPlant: null
            })
          })
          uni.showToast({ title: `识别成功: ${result.name.trim()}`, icon: 'success' })
        }
      },
      fail: () => {
        showAIDialog.value = false
      }
    })
    return
  }

  applyIdentifySelection({
    plant: null,
    fallbackName: result.name.trim(),
    context: buildIdentifyContext(result, {
      selectionMode: 'recognized_name',
      selectedPlant: null
    })
  })
  console.log('[AI确认] 使用AI识别名称:', result.name.trim())
  uni.showToast({ title: `识别成功: ${result.name.trim()}`, icon: 'success' })
}

function handleAIRetry() {
  if (!pendingImage.value.url) return
  uni.showLoading({ title: 'AI 识别中...', mask: true })
  identifyPlantByImageWithRetry(pendingImage.value.url)
    .then(response => {
      uni.hideLoading()
      if (response?.code !== 200) {
        throw new Error(response?.message || '识别失败')
      }
      const result = {
        name: response.data?.name || '未知植物',
        recognizedName: response.data?.name || '未知植物',
        confidence: response.data?.confidence || 0,
        type: response.data?.type || 'plant',
        sessionId: response.data?.sessionId || '',
        visualCallBatchId: response.data?.visualCallBatchId || '',
        taxonomyMatchStatus: response.data?.taxonomyMatchStatus || '',
        identityResolutionStatus: response.data?.identityResolutionStatus || '',
        routePrimaryAction: response.data?.routePrimaryAction || '',
        matchedPlant: response.data?.matchedPlant || null,
        candidates: response.data?.candidates || []
      }
      const text = `识别结果：${result.name}
置信度：${((result.confidence || 0) * 100).toFixed(1)}%`
      aiDialogRef.value?.setText(text)
      aiDialogRef.value?.finishStream(result)
    })
    .catch(error => {
      uni.hideLoading()
      aiDialogRef.value?.setError(error)
    })
}

function uploadPhoto() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: res => {
      const path = res.tempFilePaths[0]
      wx.getFileSystemManager().stat({
        path,
        success: s => {
          if (s.stats.size > 5 * ONE_MEGA_BYTE) {
            uni.showToast({ title: '图片过大，请选择 5MB 以下', icon: 'none' })
            return
          }
          formData.value.image = path
        },
        fail: () => (formData.value.image = path)
      })
    }
  })
}

async function submitForm() {
  if (!(await userStore.ensureLogin())) {
    loginMsg.value = '添加植物需要先登录'
    showLogin.value = true
    return
  }

  // 必须有选中的植物或AI识别的名称
  if (!selectedPlant.value && !recognizedName.value) {
    uni.showToast({ title: '请选择或识别植物', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const selectedCatalogPlant = selectedPlant.value || identifyContext.value?.selectedPlant || null
    const payloadPlantIdentityId = String(
      selectedCatalogPlant?.plantIdentityId || ''
    ).trim()
    const payloadLegacyPlantId = String(
      selectedCatalogPlant?.legacyPlantId || ''
    ).trim()
    const payloadPlantId = String(
      selectedCatalogPlant?.id || payloadLegacyPlantId || payloadPlantIdentityId || ''
    ).trim()
    const payloadRecognizedName = String(
      identifyContext.value?.recognizedName || recognizedName.value || ''
    ).trim()
    const payloadSourceType = identifyContext.value ? 'baidu' : payloadPlantId ? 'catalog' : 'baidu'
    const payloadRecognitionType = identifyContext.value?.recognitionType || null
    const payloadRecognitionConfidence = Number.isFinite(identifyContext.value?.recognitionConfidence)
      ? identifyContext.value.recognitionConfidence
      : null
    const payloadIdentityResolutionStatus = payloadPlantIdentityId
      ? 'matched'
      : identifyContext.value?.identityResolutionStatus || 'unresolved'
    const payloadVisualCallBatchId = String(
      identifyContext.value?.visualCallBatchId || ''
    ).trim()

    let photos = []
    if (formData.value.image) {
      // 检查图片是否是网络URL（来自植物默认图片）
      if (
        formData.value.image.startsWith('http://') ||
        formData.value.image.startsWith('https://')
      ) {
        // 如果是网络URL，并且有选中的植物，使用目录植物的 imageFileId
        if (selectedPlant.value?.imageFileId) {
          photos = [selectedPlant.value.imageFileId]
          console.log('使用植物默认图片imageFileId:', selectedPlant.value.imageFileId)
        } else {
          // 没有 imageFileId，忽略图片
          console.warn('植物默认图片没有 imageFileId，忽略图片')
        }
      } else {
        // 本地图片，需要上传
        uni.showLoading({ title: '上传图片中...', mask: true })
        const r = await uploadPlantImage(formData.value.image, userStore.userId, '')
        photos = [r.fileId]
        uni.hideLoading()
      }
    }

    // 调用 plant-user-http HTTP 云函数
    const res = await createUserPlant({
      plantId: payloadPlantId || null,
      plantIdentityId: payloadPlantIdentityId || null,
      legacyPlantId: payloadLegacyPlantId || null,
      recognizedName: payloadRecognizedName || null,
      nickname:
        formData.value.nickname || selectedCatalogPlant?.canonicalName || payloadRecognizedName,
      location: formData.value.location,
      photos: photos.length ? photos : null,
      sourceType: payloadSourceType,
      recognitionType: payloadRecognitionType,
      recognitionConfidence: payloadRecognitionConfidence,
      identityResolutionStatus: payloadIdentityResolutionStatus,
      visualCallBatchId: payloadVisualCallBatchId || null
    })

    if (res?.code === 200) {
      await plantStore.getUserPlants()
      uni.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 1500)
    } else {
      uni.showToast({ title: res?.message || '保存失败', icon: 'none' })
    }
  } catch (e) {
    console.error('保存失败:', e)
    uni.showToast({ title: '网络错误，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>
