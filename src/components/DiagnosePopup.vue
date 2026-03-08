<template>
  <uni-popup ref="popup" type="bottom" :safe-area="false" @change="handleChange">
    <view class="bg-white rounded-t-3xl" style="max-height: 85vh">
      <!-- 头部 -->
      <view class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <text class="text-lg font-semibold text-gray-900">AI 诊断</text>
        <view class="w-8 h-8 flex items-center justify-center" @click="close">
          <text class="text-gray-400 text-2xl">×</text>
        </view>
      </view>

      <!-- 内容区域 -->
      <scroll-view scroll-y class="px-4 py-4" style="max-height: 75vh">
        <!-- 未诊断状态 -->
        <view v-if="!result">
          <!-- 上传区域 -->
          <view class="mb-4">
            <text class="block text-base font-semibold text-gray-900 mb-2">📸 拍摄植物照片</text>
            <text class="block text-xs text-gray-500 mb-3">建议拍摄 2-3 张不同角度的照片</text>

            <!-- 图片预览 -->
            <view class="grid grid-cols-3 gap-2 mb-2">
              <view
                v-for="(img, index) in images"
                :key="index"
                class="relative aspect-square bg-gray-100 rounded-xl overflow-hidden"
              >
                <image :src="img" class="w-full h-full" mode="aspectFill" />
                <view
                  class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                  @click="removeImage(index)"
                >
                  <text class="text-white text-xs">×</text>
                </view>
              </view>

              <!-- 添加按钮 -->
              <view
                v-if="images.length < 5"
                class="aspect-square bg-gray-50 rounded-xl flex flex-col items-center justify-center border border-dashed border-gray-300"
                @click="chooseImage"
              >
                <text class="text-2xl text-gray-400 mb-0.5">+</text>
                <text class="text-[10px] text-gray-400">添加</text>
              </view>
            </view>

            <text class="block text-[10px] text-gray-400 text-center">{{ images.length }}/5 张</text>
          </view>

          <!-- 诊断模式 -->
          <view class="flex items-center justify-between mb-3 px-1">
            <text class="text-sm text-gray-600">诊断模式</text>
            <view class="flex items-center" @click="thinkingMode = !thinkingMode">
              <view
                class="w-9 h-5 rounded-full relative transition-colors"
                :class="thinkingMode ? 'bg-primary' : 'bg-gray-300'"
              >
                <view
                  class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  :class="thinkingMode ? 'left-[18px]' : 'left-0.5'"
                ></view>
              </view>
              <text class="ml-2 text-xs text-gray-600">{{ thinkingMode ? '深度思考' : '快速' }}</text>
            </view>
          </view>

          <!-- 诊断按钮 -->
          <button
            class="w-full bg-primary text-white font-semibold py-3 rounded-xl"
            :class="{ 'opacity-50': images.length === 0 }"
            :disabled="images.length === 0"
            @click="startDiagnose"
          >
            开始诊断
          </button>

          <!-- 提示 -->
          <view class="mt-3 bg-[#D8F3DC] rounded-xl p-3">
            <text class="block text-xs font-semibold text-primary mb-1">💡 拍摄技巧</text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 光线充足，避免逆光\n• 拍摄病变部位特写\n• 包含整体植株照片
            </text>
          </view>
        </view>

        <!-- 诊断结果 -->
        <view v-if="result">
          <!-- 植物信息 -->
          <view class="bg-gray-50 rounded-xl p-3 mb-3">
            <view class="flex items-center mb-2">
              <text class="text-2xl mr-2">🌿</text>
              <view class="flex-1">
                <text class="block text-base font-semibold text-gray-900">{{ result.plantName }}</text>
                <text class="block text-xs text-gray-500">{{ result.scientificName || '学名未知' }}</text>
              </view>
            </view>

            <!-- 健康状态 -->
            <view class="flex items-center justify-between p-2 bg-white rounded-lg">
              <text class="text-xs font-semibold text-gray-700">健康状态</text>
              <view :class="getHealthClass(result.healthStatus)">
                <text class="text-xs font-bold">{{ result.healthStatus }}</text>
              </view>
            </view>
          </view>

          <!-- 问题诊断 -->
          <view v-if="result.problem" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">🔍 问题诊断</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 mb-2">{{ result.problem }}</text>
              <view class="bg-[#FFF3E0] rounded-lg p-2">
                <text class="block text-[10px] font-semibold text-[#F4A261] mb-1">可能原因</text>
                <text class="block text-[10px] text-gray-700">{{ result.cause }}</text>
              </view>
            </view>
          </view>

          <!-- 解决方案 -->
          <view v-if="result.solution" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">💊 解决方案</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 leading-relaxed whitespace-pre-line">{{
                result.solution
              }}</text>
            </view>
          </view>

          <!-- 养护建议 -->
          <view v-if="result.careAdvice" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">🌱 养护建议</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 leading-relaxed whitespace-pre-line">{{
                result.careAdvice
              }}</text>
            </view>
          </view>

          <!-- 操作按钮 -->
          <view class="flex gap-2">
            <button
              class="flex-1 bg-white border border-primary text-primary font-semibold py-2.5 rounded-xl text-sm"
              @click="resetDiagnose"
            >
              重新诊断
            </button>
            <button class="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl text-sm" @click="close">
              完成
            </button>
          </view>
        </view>
      </scroll-view>
    </view>

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
  </uni-popup>
</template>

<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/store/user.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { uploadPlantImage, getImageUrl } from '@/api/storage.js'
import { streamDiagnosePlant, diagnosePlant } from '@/api/ai-stream.js'
import { ONE_MEGA_BYTE } from '../constants'
import AIStreamDialog from './AIStreamDialog.vue'

const props = defineProps({
  plantId: {
    type: [String, Number],
    default: ''
  },
  plantName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['success', 'close'])

const userStore = useUserStore()
const diagnoseStore = useDiagnoseStore()

const popup = ref(null)
const images = ref([])
const result = ref(null)
const showAIDialog = ref(false)
const aiStreamDialogRef = ref(null)
const pendingImageUrl = ref('')
const thinkingMode = ref(false)

function open() {
  popup.value?.open()
}

function close() {
  popup.value?.close()
}

function handleChange(e) {
  if (!e.show) {
    emit('close')
  }
}

function chooseImage() {
  uni.chooseImage({
    count: 5 - images.value.length,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: res => {
      const validImages = []
      let oversizedCount = 0

      for (const imagePath of res.tempFilePaths) {
        wx.getFileSystemManager().stat({
          path: imagePath,
          success: statRes => {
            const fileSize = statRes.stats.size
            if (fileSize > 5 * ONE_MEGA_BYTE) {
              oversizedCount++
            } else {
              validImages.push(imagePath)
            }
          },
          fail: () => {
            validImages.push(imagePath)
          }
        })
      }

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
      }, 500)
    }
  })
}

function removeImage(index) {
  images.value.splice(index, 1)
}

async function startDiagnose() {
  if (images.value.length === 0) {
    uni.showToast({ title: '请先添加照片', icon: 'none' })
    return
  }

  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费诊断次数已用完，升级会员享受无限次诊断',
      confirmText: '升级会员',
      success: res => {
        if (res.confirm) {
          close()
          uni.switchTab({ url: '/pages/profile/profile' })
        }
      }
    })
    return
  }

  try {
    uni.showLoading({ title: '上传图片中...', mask: true })
    const uploadResult = await uploadPlantImage(images.value[0], userStore.userId || 'anonymous', 'diagnose')
    const imageUrl = await getImageUrl(uploadResult.fileId, 7200)
    uni.hideLoading()

    pendingImageUrl.value = imageUrl
    showAIDialog.value = true
    await new Promise(resolve => setTimeout(resolve, 100))
    aiStreamDialogRef.value?.startStream()

    const diagnoseRequest = {
      image: imageUrl,
      plantId: props.plantId,
      plantName: props.plantName,
      description: `共上传 ${images.value.length} 张照片`,
      openid: userStore.openid,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: (diagnosisResult, fullText) => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
        userStore.useAIQuota()
      },
      onError: error => {
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
    uni.showToast({ title: '诊断失败，请重试', icon: 'none' })
  }
}

function handleAIDialogClose() {
  showAIDialog.value = false
}

function handleAIDialogConfirm(diagnosisResult) {
  if (diagnosisResult) {
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

    diagnoseStore.addToHistory({
      images: images.value,
      diagnosis: result.value
    })

    emit('success', result.value)
    uni.showToast({ title: '诊断完成', icon: 'success' })
  }
  showAIDialog.value = false
}

function handleAIRetry() {
  if (pendingImageUrl.value) {
    aiStreamDialogRef.value?.startStream()

    const callbackOpts = {
      image: pendingImageUrl.value,
      plantId: props.plantId,
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

function getHealthStatusText(status) {
  const statusMap = {
    healthy: '健康',
    warning: '轻微问题',
    sick: '需要治疗'
  }
  return statusMap[status] || '待诊断'
}

function resetDiagnose() {
  images.value = []
  result.value = null
}

function getHealthClass(status) {
  const classes = {
    健康: 'bg-green-100 text-green-700 px-2 py-0.5 rounded-full',
    轻微问题: 'bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full',
    需要治疗: 'bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full',
    严重问题: 'bg-red-100 text-red-700 px-2 py-0.5 rounded-full'
  }
  return classes[status] || classes['健康']
}

defineExpose({
  open,
  close
})
</script>

<style scoped>
.whitespace-pre-line {
  white-space: pre-line;
}
</style>