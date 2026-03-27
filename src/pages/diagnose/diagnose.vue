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
          <view :class="getHealthClass(result.healthStatusText)">
            <text class="text-sm font-bold">{{ result.healthStatusText }}</text>
          </view>
        </view>
      </view>

      <!-- 观察到的症状 -->
      <view v-if="result.observedSymptoms?.length" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-3">👀 观察到的症状</text>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="item in result.observedSymptoms"
            :key="item.symptomKey"
            class="px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs"
          >
            {{ item.symptomCn || item.symptomKey }}
          </view>
        </view>
      </view>

      <!-- 诊断排序 -->
      <view v-if="result.rankings?.length" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <view class="flex items-center justify-between mb-3">
          <text class="block text-lg font-bold text-gray-900">🔍 诊断排序</text>
          <text class="text-xs text-gray-500">可信度 {{ result.reliabilityText }}%</text>
        </view>
        <view class="flex flex-col gap-3">
          <view
            v-for="item in result.rankings.slice(0, 3)"
            :key="item.problemKey"
            class="rounded-2xl border border-gray-100 p-4"
            :class="item.rankNo === 1 ? 'bg-[#FFF7E8]' : 'bg-gray-50'"
          >
            <view class="flex items-center justify-between mb-2">
              <text class="text-sm font-semibold text-gray-900">Top {{ item.rankNo }} · {{ item.problemCn }}</text>
              <text class="text-xs text-gray-500">{{ item.problemType || 'unknown' }}</text>
            </view>
            <text class="block text-xs text-gray-600">
              score={{ item.weightedScore }} / host={{ item.hostCompatibility }} / symptom={{ item.symptomSupportScore }}
            </text>
          </view>
        </view>
      </view>

      <!-- 当前结论 -->
      <view class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-3">🧠 当前结论</text>
        <text class="block text-base text-gray-800 mb-3">{{ result.mainIssueText }}</text>
        <view v-if="result.summaryText" class="bg-[#FFF3E0] rounded-2xl p-4">
          <text class="block text-sm text-gray-700">{{ result.summaryText }}</text>
        </view>
      </view>

      <!-- 问诊 -->
      <view v-if="result.followUpRequired" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-2">🩺 继续问诊</text>
        <text class="block text-sm text-gray-600 mb-4">
          当前证据还不够稳，需要补充 {{ result.followUps.length }} 个症状判断后再重新诊断。
        </text>

        <view class="flex flex-col gap-3">
          <view
            v-for="item in result.followUps"
            :key="item.symptomKey"
            class="rounded-2xl border border-gray-100 p-4"
          >
            <text class="block text-sm font-semibold text-gray-900 mb-2">{{ item.questionText }}</text>
            <text class="block text-xs text-gray-500 mb-3">{{ item.rationale }}</text>
            <view class="flex gap-3">
              <button
                class="flex-1 py-2 rounded-xl text-sm"
                :class="followUpAnswers[item.symptomKey] === 'yes' ? 'bg-primary text-white' : 'bg-green-50 text-green-700'"
                @click="setFollowUpAnswer(item.symptomKey, 'yes')"
              >
                是
              </button>
              <button
                class="flex-1 py-2 rounded-xl text-sm"
                :class="followUpAnswers[item.symptomKey] === 'no' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'"
                @click="setFollowUpAnswer(item.symptomKey, 'no')"
              >
                否
              </button>
            </view>
          </view>
        </view>

        <button
          class="w-full mt-4 bg-primary text-white font-semibold py-3 rounded-2xl"
          :class="{ 'opacity-50': submittingFollowUp || !canSubmitFollowUps() }"
          :disabled="submittingFollowUp || !canSubmitFollowUps()"
          @click="submitFollowUps"
        >
          {{ submittingFollowUp ? '重新诊断中...' : '提交问诊并重新诊断' }}
        </button>
      </view>

      <!-- 处理建议 -->
      <view v-if="result.treatmentText || result.preventionText" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-3">🌱 处理建议</text>
        <view v-if="result.treatmentText" class="mb-3">
          <text class="block text-sm font-semibold text-gray-700 mb-1">处理</text>
          <text class="block text-sm text-gray-800 leading-relaxed whitespace-pre-line">{{ result.treatmentText }}</text>
        </view>
        <view v-if="result.preventionText">
          <text class="block text-sm font-semibold text-gray-700 mb-1">预防</text>
          <text class="block text-sm text-gray-800 leading-relaxed whitespace-pre-line">{{ result.preventionText }}</text>
        </view>
      </view>

      <!-- 诱因链 -->
      <view v-if="result.problemCausality?.length" class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-lg font-bold text-gray-900 mb-3">🔗 诱因链</text>
        <view class="flex flex-col gap-2">
          <view
            v-for="(item, index) in result.problemCausality.slice(0, 5)"
            :key="`${item.causeProblemKey}-${item.effectProblemKey}-${index}`"
            class="bg-gray-50 rounded-2xl p-3"
          >
            <text class="block text-sm text-gray-700">{{ formatCausalityItem(item) }}</text>
          </view>
        </view>
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
            :disabled="result.followUpRequired"
            :class="{ 'opacity-50': result.followUpRequired }"
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
import { convertImageToDataUrl } from '@/api/ai-stream.js'
import { useDiagnoseMutation } from '@/vue-query/diagnose/mutations/useDiagnoseMutation.js'
import { useDiagnoseFollowUpMutation } from '@/vue-query/diagnose/mutations/useDiagnoseFollowUpMutation.js'
import {
  normalizeDiagnosisResult,
  createFollowUpAnswerMap,
  isFollowUpAnswerComplete,
  buildFollowUpPayload,
  getHealthClass,
  formatCausalityItem
} from '@/utils/diagnose-flow.js'
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
const plantId = ref('')
const followUpAnswers = ref({})
const submittingFollowUp = ref(false)
const diagnoseMutation = useDiagnoseMutation()
const followUpMutation = useDiagnoseFollowUpMutation()

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
    uni.showLoading({ title: '处理图片中...', mask: true })
    const imageUrl = await convertImageToDataUrl(images.value[0])
    uni.hideLoading()
    console.log('图片已转为诊断 data url')

    pendingImageUrl.value = imageUrl

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
      onFinish: diagnosisResult => {
        console.log('诊断完成:', diagnosisResult)
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
        userStore.useAIQuota()
      },
      onError: error => {
        console.error('诊断失败:', error)
        aiStreamDialogRef.value?.setError(error)
      }
    }

    await diagnoseMutation.mutateAsync(diagnoseRequest)
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
    result.value = normalizeDiagnosisResult(diagnosisResult, {
      images: images.value,
      plantName: '植物'
    })
    followUpAnswers.value = createFollowUpAnswerMap(result.value.followUps)

    // 保存到历史记录
    diagnoseStore.addToHistory({
      images: images.value,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisId || ''
    })

    uni.showToast({
      title: result.value.followUpRequired ? '需要继续问诊' : '诊断完成',
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
      onFinish: diagnosisResult => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
      },
      onError: error => {
        aiStreamDialogRef.value?.setError(error)
      }
    }

    diagnoseMutation.mutateAsync(callbackOpts)
  }
}

function setFollowUpAnswer(symptomKey, answerValue) {
  followUpAnswers.value = {
    ...followUpAnswers.value,
    [symptomKey]: answerValue
  }
}

function canSubmitFollowUps() {
  return isFollowUpAnswerComplete(result.value?.followUps || [], followUpAnswers.value)
}

function handleLoginSuccess() {
  // 登录成功后自动开始诊断
  startDiagnose()
}

async function submitFollowUps() {
  if (!result.value || !canSubmitFollowUps()) {
    return
  }

  submittingFollowUp.value = true
  try {
    const payload = buildFollowUpPayload(result.value, followUpAnswers.value)
    const rerunResult = await followUpMutation.mutateAsync({
      plantId: plantId.value,
      diagnosisId: payload.diagnosisId,
      observedSymptoms: payload.observedSymptoms,
      followUpAnswers: payload.followUpAnswers
    })

    result.value = normalizeDiagnosisResult(rerunResult.diagnosis, {
      images: images.value,
      plantName: result.value.plantName || '植物'
    })
    followUpAnswers.value = createFollowUpAnswerMap(result.value.followUps)

    diagnoseStore.addToHistory({
      images: images.value,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisId || ''
    })

    uni.showToast({
      title: result.value.followUpRequired ? '问诊已更新' : '诊断已收敛',
      icon: 'success'
    })
  } catch (error) {
    console.error('提交问诊失败:', error)
    uni.showToast({
      title: error.message || '问诊失败，请重试',
      icon: 'none'
    })
  } finally {
    submittingFollowUp.value = false
  }
}

function resetDiagnose() {
  images.value = []
  result.value = null
  diagnosing.value = false
  followUpAnswers.value = {}
}

function saveToCalendar() {
  if (result.value?.followUpRequired) {
    uni.showToast({
      title: '请先完成问诊',
      icon: 'none'
    })
    return
  }

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
</script>

<style scoped>
/* 使用 Tailwind CSS */
</style>

