<template>
  <uni-popup ref="popup" type="bottom" :safe-area="false" @change="handleChange">
    <view class="bg-white rounded-t-3xl" style="max-height: 90vh">
      <!-- 头部 -->
      <view class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <text class="text-lg font-semibold text-gray-900">植物诊断</text>
        <view class="w-8 h-8 flex items-center justify-center" @click="close">
          <text class="text-gray-400 text-2xl">×</text>
        </view>
      </view>

      <!-- 模式 Tab -->
      <view v-if="!ruleResult" class="flex px-4 pt-3 gap-2">
        <view
          class="flex-1 py-2 rounded-xl text-center text-sm font-medium transition-all"
          :class="diagnoseMode === 'rule' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'"
          @click="switchMode('rule')"
        >
          🔍 症状诊断
        </view>
        <view
          class="flex-1 py-2 rounded-xl text-center text-sm font-medium transition-all"
          :class="diagnoseMode === 'ai' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'"
          @click="switchMode('ai')"
        >
          🤖 AI 图像
        </view>
      </view>

      <!-- 内容区域 -->
      <scroll-view scroll-y class="px-4 py-4" style="max-height: 75vh">

        <!-- ===== 规则诊断：症状选择 ===== -->
        <view v-if="diagnoseMode === 'rule' && !ruleResult">
          <view v-if="ruleStep === 'symptoms'">
            <text class="block text-xs text-gray-500 mb-3">选择您观察到的症状（可多选）</text>
            <view v-if="loadingSymptoms" class="flex justify-center py-8">
              <text class="text-gray-400 text-sm">加载中...</text>
            </view>
            <view v-else>
              <view
                v-for="cat in symptomCategories"
                :key="cat.id"
                class="mb-4"
              >
                <text class="block text-xs font-semibold text-gray-500 mb-2">{{ cat.label }}</text>
                <view class="flex flex-wrap gap-2">
                  <view
                    v-for="sym in cat.symptoms"
                    :key="sym.id"
                    class="px-3 py-1.5 rounded-full text-xs border transition-all"
                    :class="selectedSymptoms.includes(sym.id)
                      ? 'bg-primary border-primary text-white'
                      : 'bg-gray-50 border-gray-200 text-gray-600'"
                    @click="toggleSymptom(sym.id)"
                  >
                    {{ sym.label }}
                  </view>
                </view>
              </view>
            </view>
            <button
              class="w-full bg-primary text-white font-semibold py-3 rounded-xl mt-2"
              :class="{ 'opacity-40': selectedSymptoms.length === 0 }"
              :disabled="selectedSymptoms.length === 0 || ruleDiagnosing"
              @click="submitSymptoms"
            >
              {{ ruleDiagnosing ? '分析中...' : `开始诊断（已选 ${selectedSymptoms.length} 个）` }}
            </button>
          </view>

          <!-- 规则诊断：追问 -->
          <view v-if="ruleStep === 'question' && currentQuestion">
            <!-- 当前候选预览 -->
            <view v-if="candidates.length" class="bg-[#F0FBF4] rounded-xl p-3 mb-4">
              <text class="block text-xs text-gray-500 mb-2">初步判断</text>
              <view class="flex flex-wrap gap-2">
                <view
                  v-for="c in candidates"
                  :key="c.id"
                  class="flex items-center bg-white rounded-full px-2.5 py-1 shadow-sm"
                >
                  <text class="text-xs text-gray-700 mr-1">{{ c.name }}</text>
                  <text class="text-xs font-bold" :class="confidenceColor(c.confidence)">{{ c.score }}%</text>
                </view>
              </view>
            </view>

            <view class="bg-gray-50 rounded-xl p-4 mb-3">
              <text class="block text-sm font-semibold text-gray-900 mb-3">{{ currentQuestion.question }}</text>
              <view class="space-y-2">
                <view
                  v-for="opt in currentQuestion.options"
                  :key="opt.value"
                  class="flex items-center p-2.5 rounded-xl border transition-all"
                  :class="answeredConditions[currentQuestion.id] === opt.value
                    ? 'border-primary bg-white'
                    : 'border-transparent bg-white'"
                  @click="answerQuestion(currentQuestion.id, opt.value)"
                >
                  <view
                    class="w-4 h-4 rounded-full border-2 mr-2.5 flex items-center justify-center flex-shrink-0"
                    :class="answeredConditions[currentQuestion.id] === opt.value
                      ? 'border-primary bg-primary'
                      : 'border-gray-300'"
                  >
                    <view v-if="answeredConditions[currentQuestion.id] === opt.value" class="w-1.5 h-1.5 bg-white rounded-full" />
                  </view>
                  <text class="text-sm text-gray-700">{{ opt.label }}</text>
                </view>
              </view>
            </view>

            <view class="flex gap-2">
              <button
                class="flex-1 bg-gray-100 text-gray-500 font-medium py-2.5 rounded-xl text-sm"
                @click="skipQuestion"
              >
                跳过
              </button>
              <button
                class="flex-2 bg-primary text-white font-semibold py-2.5 rounded-xl text-sm"
                style="flex: 2"
                :class="{ 'opacity-40': !answeredConditions[currentQuestion.id] }"
                :disabled="!answeredConditions[currentQuestion.id] || ruleDiagnosing"
                @click="submitAnswer"
              >
                {{ ruleDiagnosing ? '分析中...' : '确认' }}
              </button>
            </view>
          </view>
        </view>

        <!-- ===== 规则诊断：结果 ===== -->
        <view v-if="ruleResult">
          <view class="flex items-center mb-3">
            <view class="mr-2 p-1" @click="resetRuleDiagnose">
              <text class="text-gray-400 text-base">←</text>
            </view>
            <text class="text-base font-semibold text-gray-900">诊断结果</text>
          </view>

          <!-- 健康评分 -->
          <view class="bg-gray-50 rounded-xl p-3 mb-3">
            <view class="flex items-center justify-between mb-2">
              <text class="text-xs font-semibold text-gray-600">健康评分</text>
              <view class="px-2 py-0.5 rounded-full text-xs font-bold" :class="healthStatusClass(ruleResult.healthStatus)">
                {{ healthStatusText(ruleResult.healthStatus) }}
              </view>
            </view>
            <view class="flex items-end gap-1 mb-2">
              <text class="text-3xl font-bold text-primary">{{ ruleResult.healthScore }}</text>
              <text class="text-gray-400 text-xs mb-1">/ 100</text>
            </view>
            <view class="w-full bg-gray-200 rounded-full h-1.5">
              <view
                class="h-1.5 rounded-full"
                :class="healthBarClass(ruleResult.healthStatus)"
                :style="{ width: ruleResult.healthScore + '%' }"
              />
            </view>
            <text class="block text-xs text-gray-600 mt-2 leading-relaxed">{{ ruleResult.summary }}</text>
          </view>

          <!-- 候选诊断 -->
          <view
            v-for="(c, idx) in ruleResult.candidates"
            :key="c.id"
            class="bg-gray-50 rounded-xl p-3 mb-2"
          >
            <view class="flex items-center justify-between mb-2">
              <view class="flex items-center">
                <view
                  class="w-5 h-5 rounded-full flex items-center justify-center mr-2 text-xs font-bold text-white"
                  :class="idx === 0 ? 'bg-primary' : 'bg-gray-300'"
                >{{ idx + 1 }}</view>
                <text class="text-sm font-bold text-gray-900">{{ c.name }}</text>
              </view>
              <view class="flex items-center gap-1">
                <text class="text-sm font-bold text-primary">{{ c.score }}%</text>
                <text class="text-[10px] px-1.5 py-0.5 rounded-full" :class="confidenceBadge(c.confidence)">
                  {{ confidenceLabel(c.confidence) }}
                </text>
              </view>
            </view>
            <view v-if="c.solutions?.length" class="mb-1.5">
              <text class="block text-[10px] font-semibold text-gray-400 mb-1">处理建议</text>
              <view v-for="s in c.solutions" :key="s" class="flex items-start mb-0.5">
                <text class="text-primary mr-1 text-xs">•</text>
                <text class="text-xs text-gray-700">{{ s }}</text>
              </view>
            </view>
            <view v-if="c.prevention?.length" class="bg-white rounded-lg p-2">
              <text class="block text-[10px] font-semibold text-gray-400 mb-1">预防措施</text>
              <view v-for="p in c.prevention" :key="p" class="flex items-start mb-0.5">
                <text class="text-green-500 mr-1 text-xs">✓</text>
                <text class="text-[10px] text-gray-600">{{ p }}</text>
              </view>
            </view>
          </view>

          <view v-if="!ruleResult.candidates?.length" class="text-center py-4">
            <text class="text-3xl block mb-2">🌿</text>
            <text class="block text-sm font-semibold text-gray-900 mb-1">未发现明显问题</text>
            <text class="block text-xs text-gray-500">植物整体状态良好，继续保持日常养护。</text>
          </view>

          <view class="flex gap-2 mt-2">
            <button class="flex-1 bg-gray-100 text-gray-600 font-medium py-2.5 rounded-xl text-sm" @click="resetRuleDiagnose">重新诊断</button>
            <button class="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl text-sm" @click="close">完成</button>
          </view>
        </view>

        <!-- ===== AI 图像诊断 ===== -->
        <view v-if="diagnoseMode === 'ai' && !ruleResult">
          <!-- 未诊断状态 -->
          <view v-if="!aiResult">
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
        <view v-if="aiResult">
          <!-- 植物信息 -->
          <view class="bg-gray-50 rounded-xl p-3 mb-3">
            <view class="flex items-center mb-2">
              <text class="text-2xl mr-2">🌿</text>
              <view class="flex-1">
                <text class="block text-base font-semibold text-gray-900">{{ aiResult.plantName }}</text>
                <text class="block text-xs text-gray-500">{{ aiResult.scientificName || '学名未知' }}</text>
              </view>
            </view>

            <!-- 健康状态 -->
            <view class="flex items-center justify-between p-2 bg-white rounded-lg">
              <text class="text-xs font-semibold text-gray-700">健康状态</text>
              <view :class="getHealthClass(aiResult.healthStatus)">
                <text class="text-xs font-bold">{{ aiResult.healthStatus }}</text>
              </view>
            </view>
          </view>

          <!-- 问题诊断 -->
          <view v-if="aiResult.problem" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">🔍 问题诊断</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 mb-2">{{ aiResult.problem }}</text>
              <view class="bg-[#FFF3E0] rounded-lg p-2">
                <text class="block text-[10px] font-semibold text-[#F4A261] mb-1">可能原因</text>
                <text class="block text-[10px] text-gray-700">{{ aiResult.cause }}</text>
              </view>
            </view>
          </view>

          <!-- 解决方案 -->
          <view v-if="aiResult.solution" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">💊 解决方案</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 leading-relaxed whitespace-pre-line">{{
                aiResult.solution
              }}</text>
            </view>
          </view>

          <!-- 养护建议 -->
          <view v-if="aiResult.careAdvice" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">🌱 养护建议</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 leading-relaxed whitespace-pre-line">{{
                aiResult.careAdvice
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
import { getSymptomCategories, runRuleDiagnose } from '@/api/rule-diagnose.js'
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

// AI 诊断状态
const images = ref([])
const aiResult = ref(null)
const showAIDialog = ref(false)
const aiStreamDialogRef = ref(null)
const pendingImageUrl = ref('')
const thinkingMode = ref(false)

// 模式切换
const diagnoseMode = ref('rule')

// 规则诊断状态
const ruleStep = ref('symptoms')       // 'symptoms' | 'question'
const loadingSymptoms = ref(false)
const symptomCategories = ref([])
const selectedSymptoms = ref([])
const candidates = ref([])
const currentQuestion = ref(null)
const answeredConditions = ref({})
const questionRound = ref(0)
const ruleDiagnosing = ref(false)
const ruleResult = ref(null)

// 症状列表延迟加载（弹窗打开时）
async function loadSymptomsIfNeeded() {
  if (symptomCategories.value.length > 0) return

  loadingSymptoms.value = true
  try {
    symptomCategories.value = await getSymptomCategories()
    console.log('[DiagnosePopup] symptomCategories loaded:', symptomCategories.value.length)
  } catch (e) {
    console.error('[DiagnosePopup] load symptoms failed:', e)
    uni.showToast({ title: '加载症状列表失败', icon: 'none' })
  } finally {
    loadingSymptoms.value = false
  }
}

function switchMode(mode) {
  diagnoseMode.value = mode
}

function toggleSymptom(id) {
  const idx = selectedSymptoms.value.indexOf(id)
  if (idx === -1) selectedSymptoms.value.push(id)
  else selectedSymptoms.value.splice(idx, 1)
}

async function submitSymptoms() {
  if (selectedSymptoms.value.length === 0) return
  ruleDiagnosing.value = true
  try {
    console.log('[RuleDiagnose] submitSymptoms, symptoms:', selectedSymptoms.value)
    const data = await runRuleDiagnose(selectedSymptoms.value, {}, 0)
    console.log('[RuleDiagnose] response:', JSON.stringify(data))
    candidates.value = data.candidates || []
    questionRound.value = 0

    if (data.done || !data.nextQuestion) {
      console.log('[RuleDiagnose] -> result (done or no nextQuestion)')
      showRuleResult(data)
    } else {
      console.log('[RuleDiagnose] -> question:', data.nextQuestion.id)
      currentQuestion.value = data.nextQuestion
      ruleStep.value = 'question'
    }
  } catch (e) {
    console.error('[RuleDiagnose] submitSymptoms error:', e)
    uni.showToast({ title: e.message || '诊断失败', icon: 'none' })
  } finally {
    ruleDiagnosing.value = false
  }
}

function answerQuestion(questionId, value) {
  answeredConditions.value = { ...answeredConditions.value, [questionId]: value }
}

async function submitAnswer() {
  if (!currentQuestion.value || !answeredConditions.value[currentQuestion.value.id]) return
  ruleDiagnosing.value = true
  try {
    const data = await runRuleDiagnose(selectedSymptoms.value, answeredConditions.value, questionRound.value + 1)
    candidates.value = data.candidates || []
    questionRound.value += 1

    if (data.done || !data.nextQuestion) {
      showRuleResult(data)
    } else {
      currentQuestion.value = data.nextQuestion
    }
  } catch (e) {
    uni.showToast({ title: e.message || '分析失败', icon: 'none' })
  } finally {
    ruleDiagnosing.value = false
  }
}

async function skipQuestion() {
  ruleDiagnosing.value = true
  try {
    const data = await runRuleDiagnose(selectedSymptoms.value, answeredConditions.value, 4)
    showRuleResult(data)
  } catch (e) {
    uni.showToast({ title: e.message || '分析失败', icon: 'none' })
  } finally {
    ruleDiagnosing.value = false
  }
}

function showRuleResult(data) {
  const topCandidate = data.candidates?.[0]
  let healthScore = 80
  let healthStatus = 'healthy'
  if (topCandidate) {
    if (topCandidate.score >= 70) { healthScore = 30; healthStatus = 'sick' }
    else if (topCandidate.score >= 40) { healthScore = 60; healthStatus = 'warning' }
    else { healthScore = 80; healthStatus = 'healthy' }
  }
  ruleResult.value = {
    candidates: data.candidates || [],
    healthScore,
    healthStatus,
    summary: topCandidate
      ? `初步判断为「${topCandidate.name}」，匹配度 ${topCandidate.score}%`
      : '未发现明显病害，植物整体状态良好'
  }
}

function resetRuleDiagnose() {
  ruleStep.value = 'symptoms'
  selectedSymptoms.value = []
  candidates.value = []
  currentQuestion.value = null
  answeredConditions.value = {}
  questionRound.value = 0
  ruleResult.value = null
}

function confidenceColor(confidence) {
  if (confidence === 'high') return 'text-red-500'
  if (confidence === 'medium') return 'text-yellow-500'
  return 'text-green-500'
}

function confidenceBadge(confidence) {
  if (confidence === 'high') return 'bg-red-100 text-red-600'
  if (confidence === 'medium') return 'bg-yellow-100 text-yellow-600'
  return 'bg-green-100 text-green-600'
}

function confidenceLabel(confidence) {
  if (confidence === 'high') return '高度匹配'
  if (confidence === 'medium') return '中度匹配'
  return '低度匹配'
}

function healthStatusClass(status) {
  if (status === 'sick') return 'bg-red-100 text-red-600'
  if (status === 'warning') return 'bg-yellow-100 text-yellow-600'
  return 'bg-green-100 text-green-600'
}

function healthStatusText(status) {
  if (status === 'sick') return '需要治疗'
  if (status === 'warning') return '轻微问题'
  return '状态良好'
}

function healthBarClass(status) {
  if (status === 'sick') return 'bg-red-400'
  if (status === 'warning') return 'bg-yellow-400'
  return 'bg-green-400'
}

function open() {
  popup.value?.open()
}

function close() {
  popup.value?.close()
}

function handleChange(e) {
  if (e.show) {
    loadSymptomsIfNeeded()
  } else {
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
    aiResult.value = {
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
      diagnosis: aiResult.value
    })

    emit('success', aiResult.value)
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
  aiResult.value = null
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