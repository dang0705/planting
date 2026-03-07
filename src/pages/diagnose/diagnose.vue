<template>
  <view class="min-h-screen bg-[#F8F6F0]">
    <!-- 诊断状态 -->
    <view v-if="!result" class="px-4 py-8">
      <!-- 上传区域 -->
      <view class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-xl font-bold text-gray-900 mb-2">📸 拍摄植物照片</text>
        <text class="block text-sm text-gray-600 mb-6"
          >建议拍摄 2-3 张不同角度的照片，包含叶片、茎干等细节</text
        >

        <!-- 图片预览 -->
        <view class="grid grid-cols-3 gap-3 mb-4">
          <view
            v-for="(img, index) in images"
            :key="index"
            class="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden"
          >
            <image :src="img" class="w-full h-full" mode="aspectFill" />
            <view
              class="absolute top-1 right-1 bg-red-500 rounded-full w-6 h-6 flex items-center justify-center"
              @click="removeImage(index)"
            >
              <text class="text-white text-xs">×</text>
            </view>
          </view>

          <!-- 添加按钮 -->
          <view
            v-if="images.length < 5"
            class="aspect-square bg-gray-100 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300"
            @click="chooseImage"
          >
            <text class="text-3xl text-gray-400 mb-1">+</text>
            <text class="text-xs text-gray-500">添加照片</text>
          </view>
        </view>

        <text class="block text-xs text-gray-500 text-center"
          >已添加 {{ images.length }}/5 张照片</text
        >
      </view>

      <!-- 诊断模式切换 + 诊断按钮 -->
      <view class="flex items-center justify-between mb-4">
        <view class="flex items-center" @click="thinkingMode = !thinkingMode">
          <view
            class="w-10 h-6 rounded-full relative transition-colors"
            :class="thinkingMode ? 'bg-primary' : 'bg-gray-300'"
          >
            <view
              class="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
              :class="thinkingMode ? 'left-[18px]' : 'left-0.5'"
            ></view>
          </view>
          <text class="ml-2 text-sm text-gray-600">{{
            thinkingMode ? '深度思考' : '快速诊断'
          }}</text>
        </view>
      </view>

      <button
        class="w-full bg-primary text-white font-semibold py-4 rounded-2xl shadow-lg"
        :class="{ 'opacity-50': images.length === 0 }"
        :disabled="images.length === 0"
        @click="startDiagnose"
      >
        开始诊断
      </button>

      <!-- 提示信息 -->
      <view class="mt-6 bg-[#D8F3DC] rounded-2xl p-4">
        <text class="block text-sm font-semibold text-primary mb-2">💡 拍摄技巧</text>
        <text class="block text-xs text-gray-700 leading-relaxed">
          • 确保光线充足，避免逆光\n • 拍摄病变部位的特写\n • 包含整体植株照片\n • 避免模糊和抖动
        </text>
      </view>
    </view>

    <!-- 诊断结果 -->
    <view v-if="result" class="px-4 py-6">
      <!-- 植物信息 -->
      <view class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <view class="flex items-center mb-4">
          <text class="text-3xl mr-3">🌿</text>
          <view class="flex-1">
            <text class="block text-xl font-bold text-gray-900">{{ result.plantName }}</text>
            <text class="block text-sm text-gray-600">{{
              result.scientificName || '学名未知'
            }}</text>
          </view>
        </view>

        <!-- 健康状态 -->
        <view class="flex items-center justify-between p-4 bg-[#D8F3DC] rounded-2xl">
          <text class="text-sm font-semibold text-gray-900">健康状态</text>
          <view :class="getHealthClass(result.healthStatus)">
            <text class="text-sm font-bold">{{ result.healthStatus }}</text>
          </view>
        </view>
      </view>

      <!-- 问题诊断 -->
      <view v-if="result.problem" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-3">🔍 问题诊断</text>
        <text class="block text-base text-gray-800 mb-3">{{ result.problem }}</text>

        <view class="bg-[#FFF3E0] rounded-2xl p-4">
          <text class="block text-sm font-semibold text-[#F4A261] mb-2">可能原因</text>
          <text class="block text-sm text-gray-700">{{ result.cause }}</text>
        </view>
      </view>

      <!-- 解决方案 -->
      <view v-if="result.solution" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-3">💊 解决方案</text>
        <text class="block text-base text-gray-800 leading-relaxed whitespace-pre-line">{{
          result.solution
        }}</text>
      </view>

      <!-- 养护建议 -->
      <view v-if="result.careAdvice" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-3">🌱 养护建议</text>
        <text class="block text-base text-gray-800 leading-relaxed whitespace-pre-line">{{
          result.careAdvice
        }}</text>
      </view>

      <!-- 操作按钮 -->
      <view class="flex gap-3 mb-20">
        <button
          class="flex-1 bg-white border-2 border-primary text-primary font-semibold py-3 rounded-2xl"
          @click="resetDiagnose"
        >
          重新诊断
        </button>
        <button
          class="flex-1 bg-primary text-white font-semibold py-3 rounded-2xl"
          @click="saveToCalendar"
        >
          加入日历
        </button>
      </view>
    </view>
  </view>

  <!-- 登录弹窗 -->
  <LoginModal
    :show="showLoginModal"
    message="使用 AI 诊断功能需要先登录"
    @close="showLoginModal = false"
    @success="handleLoginSuccess"
  />

  <!-- AI 流式诊断弹窗 -->
  <AIStreamDialog
    ref="aiStreamDialogRef"
    :visible="showAIDialog"
    title="AI 智能诊断"
    icon="🩺"
    loading-text="正在诊断植物健康..."
    confirm-text="查看诊断结果"
    @close="handleAIDialogClose"
    @confirm="handleAIDialogConfirm"
    @retry="handleAIRetry"
  />
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { uploadPlantImage, getImageUrl } from '@/api/storage.js'
import { streamDiagnosePlant, diagnosePlant } from '@/api/ai-stream.js'
import { ONE_MEGA_BYTE } from '../../constants'
import LoginModal from '@/components/LoginModal.vue'
import AIStreamDialog from '@/components/AIStreamDialog.vue'

const userStore = useUserStore()
const diagnoseStore = useDiagnoseStore()

const images = ref([])
const diagnosing = ref(false)
const diagnosingText = ref('正在识别植物种类...')
const result = ref(null)
const showLoginModal = ref(false)
const showAIDialog = ref(false)
const aiStreamDialogRef = ref(null)
const pendingImageUrl = ref('')
const thinkingMode = ref(false)
const plantId = ref('')

// 获取页面参数
onLoad((options) => {
  if (options.plantId) {
    plantId.value = options.plantId
    console.log('接收到植物ID:', plantId.value)
  }
})

function chooseImage() {
  uni.chooseImage({
    count: 5 - images.value.length,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: res => {
      // 检查每张图片的大小
      const validImages = []
      let oversizedCount = 0

      for (const imagePath of res.tempFilePaths) {
        wx.getFileSystemManager().stat({
          path: imagePath,
          success: statRes => {
            const fileSize = statRes.stats.size
            const fileSizeMB = (fileSize / ONE_MEGA_BYTE).toFixed(2)

            // 5MB 限制
            if (fileSize > 5 * ONE_MEGA_BYTE) {
              oversizedCount++
              console.warn(`图片过大 (${fileSizeMB}MB)，已跳过`)
            } else {
              validImages.push(imagePath)
            }
          },
          fail: () => {
            // 如果无法获取大小，仍然允许添加
            validImages.push(imagePath)
          }
        })
      }

      // 延迟处理，确保所有文件大小检查完成
      setTimeout(() => {
        if (validImages.length > 0) {
          images.value.push(...validImages)
        }

        if (oversizedCount > 0) {
          uni.showToast({
            title: `已跳过 ${oversizedCount} 张超过 5MB 的图片`,
            icon: 'none'
          })
        }

        if (validImages.length === 0 && oversizedCount > 0) {
          uni.showToast({
            title: '请选择 5MB 以下的图片',
            icon: 'none'
          })
        }
      }, 500)
    }
  })
}

function removeImage(index) {
  images.value.splice(index, 1)
}

async function startDiagnose() {
  if (images.value.length === 0) {
    uni.showToast({
      title: '请先添加照片',
      icon: 'none'
    })
    return
  }

  // 检查登录状态
  const isLoggedIn = await userStore.ensureLogin()
  if (!isLoggedIn) {
    showLoginModal.value = true
    return
  }

  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费诊断次数已用完，升级会员享受无限次诊断',
      confirmText: '升级会员',
      success: res => {
        if (res.confirm) {
          uni.switchTab({
            url: '/pages/profile/profile'
          })
        }
      }
    })
    return
  }

  try {
    // 1. 先上传图片到云存储
    uni.showLoading({ title: '上传图片中...', mask: true })
    const uploadResult = await uploadPlantImage(
      images.value[0],
      userStore.userId || 'anonymous',
      'diagnose'
    )

    // 2. 获取临时公网访问 URL（设置较长的有效期，确保 AI 诊断过程中不会过期）
    const imageUrl = await getImageUrl(uploadResult.fileId, 7200)
    uni.hideLoading()
    console.log('图片已上传，公网 URL:', imageUrl)

    // 保存待诊断的图片URL
    pendingImageUrl.value = imageUrl

    // 3. 显示对话框并开始诊断
    showAIDialog.value = true
    await new Promise(resolve => setTimeout(resolve, 100))
    aiStreamDialogRef.value?.startStream()

    const diagnoseRequest = {
      image: imageUrl,
      plantId: plantId.value,
      description: `共上传 ${images.value.length} 张照片`,
      openid: userStore.openid,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: (diagnosisResult, fullText) => {
        console.log('诊断完成:', diagnosisResult)
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
        userStore.useAIQuota()
      },
      onError: error => {
        console.error('诊断失败:', error)
        aiStreamDialogRef.value?.setError(error)
      }
    }

    if (thinkingMode.value) {
      await streamDiagnosePlant(diagnoseRequest)
    } else {
      await diagnosePlant(diagnoseRequest)
    }
  } catch (error) {
    console.error('诊断失败:', error)
    uni.hideLoading()
    uni.showToast({
      title: '诊断失败，请重试',
      icon: 'none'
    })
  }
}

// AI 对话框关闭
function handleAIDialogClose() {
  showAIDialog.value = false
}

// AI 对话框确认（使用诊断结果）
function handleAIDialogConfirm(diagnosisResult) {
  if (diagnosisResult) {
    // 转换诊断结果
    result.value = {
      plantName: '植物',
      scientificName: '待识别',
      healthStatus: getHealthStatusText(diagnosisResult.healthStatus),
      problem: diagnosisResult.mainIssue,
      cause: diagnosisResult.summary,
      solution: `根据诊断结果，建议：\n${diagnosisResult.summary}`,
      careAdvice: `• 健康评分：${diagnosisResult.healthScore}分\n• 主要问题：${diagnosisResult.mainIssue}\n• 建议定期检查植物健康状况`,
      healthScore: diagnosisResult.healthScore,
      images: images.value
    }

    // 保存到历史记录
    diagnoseStore.addToHistory({
      images: images.value,
      diagnosis: result.value
    })

    uni.showToast({
      title: '诊断完成',
      icon: 'success'
    })
  }

  showAIDialog.value = false
}

// AI 重试
function handleAIRetry() {
  if (pendingImageUrl.value) {
    aiStreamDialogRef.value?.startStream()

    const callbackOpts = {
      image: pendingImageUrl.value,
      plantId: plantId.value,
      description: `共上传 ${images.value.length} 张照片`,
      openid: userStore.openid,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: (diagnosisResult, fullText) => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
      },
      onError: error => {
        aiStreamDialogRef.value?.setError(error)
      }
    }

    if (thinkingMode.value) {
      streamDiagnosePlant(callbackOpts)
    } else {
      diagnosePlant(callbackOpts)
    }
  }
}

// 获取健康状态文本
function getHealthStatusText(status) {
  const statusMap = {
    healthy: '健康',
    warning: '轻微问题',
    sick: '需要治疗'
  }
  return statusMap[status] || '待诊断'
}

function handleLoginSuccess() {
  // 登录成功后自动开始诊断
  startDiagnose()
}

function resetDiagnose() {
  images.value = []
  result.value = null
  diagnosing.value = false
}

function saveToCalendar() {
  uni.showToast({
    title: '已加入种植日历',
    icon: 'success'
  })

  setTimeout(() => {
    uni.switchTab({
      url: '/pages/calendar/calendar'
    })
  }, 1500)
}

function getHealthClass(status) {
  const classes = {
    健康: 'bg-green-100 text-green-700 px-3 py-1 rounded-full',
    轻微问题: 'bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full',
    需要治疗: 'bg-orange-100 text-orange-700 px-3 py-1 rounded-full',
    严重问题: 'bg-red-100 text-red-700 px-3 py-1 rounded-full'
  }
  return classes[status] || classes['健康']
}
</script>

<style scoped>
/* 使用 Tailwind CSS */
</style>
