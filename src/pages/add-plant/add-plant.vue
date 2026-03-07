<template>
  <view class="min-h-screen bg-[#F8F6F0] pb-5">
    <StepIndicator :step="step" />

    <!-- 步骤 1: 选择植物 -->
    <view v-if="step === 1" class="px-4">
      <text class="block text-2xl font-semibold text-gray-800 mb-2">选择你的植物</text>
      <text class="block text-sm text-gray-400 mb-6">从常见植物中选择，或使用 AI 识别</text>

      <view class="mb-6">
        <text class="block text-base font-semibold text-gray-800 mb-4">🌿 常见植物</text>
        <view v-if="plantsLoading" class="flex justify-center py-8">
          <text class="text-sm text-gray-400">加载中...</text>
        </view>
        <view v-else class="w-full snap-x overflow-x-auto">
          <view class="flex gap-3 pb-2" style="width: max-content">
            <view
              v-for="(group, gi) in plantGroups"
              :key="gi"
              class="grid grid-cols-2 grid-rows-2 gap-2 w-[70vw] flex-shrink-0 snap-start"
            >
              <PlantCard
                v-for="p in group"
                :key="p.id"
                :plant="p"
                :selected="selectedPlant?.id === p.id"
                @select="selectedPlant = p"
              />
            </view>
          </view>
        </view>
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
        :class="{ 'opacity-50': !selectedPlant && !aiRecognizedName }"
        :disabled="!selectedPlant && !aiRecognizedName"
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
import { usePlantStore } from '@/store/plant.js'
import { uploadPlantImage, getImageUrl } from '@/api/storage.js'
import { identifyPlant } from '@/api/ai-stream.js'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { ONE_MEGA_BYTE } from '@/constants'
import StepIndicator from './components/StepIndicator.vue'
import PlantCard from './components/PlantCard.vue'
import PlantForm from './components/PlantForm.vue'
import LoginModal from '@/components/LoginModal.vue'
import AIStreamDialog from '@/components/AIStreamDialog.vue'

const userStore = useUserStore()
const plantStore = usePlantStore()
const { plants: defaultPlants, loading: plantsLoading, load: loadPlants } = useDefaultPlants()

// 将植物按每组4个分组（2列x2行）
const plantGroups = computed(() => {
  const groups = []
  for (let i = 0; i < defaultPlants.value.length; i += 4) {
    groups.push(defaultPlants.value.slice(i, i + 4))
  }
  return groups
})

const step = ref(1)
const selectedPlant = ref(null)
const aiRecognizedName = ref('') // AI识别的植物名称（未匹配到plants表时使用）
const submitting = ref(false)
const showLogin = ref(false)
const loginMsg = ref('添加植物需要先登录')
const showAIDialog = ref(false)
const aiDialogRef = ref(null)
const pendingImage = ref({ path: '', url: '' })

const formData = ref({
  image: '',
  nickname: '',
  location: '阳台',
  plantDate: new Date().toISOString().split('T')[0],
  notes: ''
})

// 监听选中的植物，自动填充名称和图片
watch(selectedPlant, (newPlant) => {
  if (newPlant) {
    // 如果昵称为空，使用植物名称作为默认昵称
    if (!formData.value.nickname.trim()) {
      formData.value.nickname = newPlant.name
    }
    // 如果图片为空，使用植物的图片URL
    if (!formData.value.image && newPlant.imageUrl) {
      formData.value.image = newPlant.imageUrl
    }
  }
}, { immediate: true })

// 监听AI识别的植物名称
watch(aiRecognizedName, (newName) => {
  if (newName && !selectedPlant.value) {
    // 如果是AI识别且未匹配到植物，且昵称为空，使用AI识别名称作为默认昵称
    if (!formData.value.nickname.trim()) {
      formData.value.nickname = newName
    }
  }
})

onMounted(async () => {
  if (!(await userStore.ensureLogin())) showLogin.value = true
  loadPlants()
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

    uni.showLoading({ title: 'AI识别中...', mask: true })
    await identifyPlant({
      messages: [{ Role: 'user', Contents: [{ Type: 'image_url', ImageUrl: { Url: url } }] }],
      openid: userStore.openid,
      onFinish: (result, text) => {
        uni.hideLoading()
        userStore.useAIQuota()
        showAIDialog.value = true
        setTimeout(() => {
          aiDialogRef.value?.setText(text)
          aiDialogRef.value?.finishStream(result)
        }, 100)
      },
      onError: () => {
        uni.hideLoading()
        uni.showToast({ title: '识别失败，请重试', icon: 'none' })
      }
    })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: '识别失败，请重试', icon: 'none' })
  }
}

function handleAIConfirm(result) {
  if (!result?.name || result.name === '未知植物') {
    uni.showToast({ title: '未能识别植物，请重试', icon: 'none' })
    return
  }

  // 在 defaultPlants 中查找匹配的植物
  const aiName = result.name.trim()
  const matched = defaultPlants.value.find(p => p.name === aiName)

  if (matched) {
    // 匹配成功，使用 plants 表中的记录
    selectedPlant.value = matched
    aiRecognizedName.value = ''
  } else {
    // 未匹配，存储 AI 识别的名称
    selectedPlant.value = null
    aiRecognizedName.value = aiName
  }

  formData.value.image = pendingImage.value.path
  showAIDialog.value = false
  uni.showToast({ title: `识别成功: ${aiName}`, icon: 'success' })
  setTimeout(() => (step.value = 2), 500)
}

function handleAIRetry() {
  if (!pendingImage.value.url) return
  uni.showLoading({ title: 'AI识别中...', mask: true })
  identifyPlant({
    messages: [
      { Role: 'user', Contents: [{ Type: 'image_url', ImageUrl: { Url: pendingImage.value.url } }] }
    ],
    openid: userStore.openid,
    onFinish: (result, text) => {
      uni.hideLoading()
      aiDialogRef.value?.setText(text)
      aiDialogRef.value?.finishStream(result)
    },
    onError: e => {
      uni.hideLoading()
      aiDialogRef.value?.setError(e)
    }
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
  if (!selectedPlant.value && !aiRecognizedName.value) {
    uni.showToast({ title: '请选择或识别植物', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    let photos = []
    if (formData.value.image) {
      // 检查图片是否是网络URL（来自植物默认图片）
      if (formData.value.image.startsWith('http://') || formData.value.image.startsWith('https://')) {
        // 如果是网络URL，并且有选中的植物，使用植物的fileId
        if (selectedPlant.value?.fileId) {
          photos = [selectedPlant.value.fileId]
          console.log('使用植物默认图片fileId:', selectedPlant.value.fileId)
        } else {
          // 没有fileId，忽略图片
          console.warn('植物默认图片没有fileId，忽略图片')
        }
      } else {
        // 本地图片，需要上传
        uni.showLoading({ title: '上传图片中...', mask: true })
        const r = await uploadPlantImage(formData.value.image, userStore.userId, '')
        photos = [r.fileId]
        uni.hideLoading()
      }
    }

    // 调用 saveUserPlant 云函数
    const res = await wx.cloud.callFunction({
      name: 'saveUserPlant',
      data: {
        plantId: selectedPlant.value?.id || null,
        aiRecognizedName: aiRecognizedName.value || null,
        nickName: formData.value.nickname || selectedPlant.value?.name || aiRecognizedName.value,
        location: formData.value.location,
        photos: photos.length ? photos : null
      }
    })

    if (res.result.code === 200) {
      // 刷新用户植物列表
      await plantStore.getUserPlants()
      uni.showToast({ title: '植物添加成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 1500)
    } else {
      uni.showToast({ title: res.result.message || '添加失败', icon: 'none' })
    }
  } catch (e) {
    console.error('保存失败:', e)
    uni.showToast({ title: '网络错误，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>
