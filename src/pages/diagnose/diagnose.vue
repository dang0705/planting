<template>
  <view class="min-h-screen bg-[#F8F6F0]">

    <!-- ===== 模式选择首页 ===== -->
    <view v-if="step === 'home'" class="px-4 py-8">
      <text class="block text-2xl font-bold text-gray-900 mb-1">植物诊断</text>
      <text class="block text-sm text-gray-500 mb-6">选择诊断方式</text>

      <!-- 规则诊断入口 -->
      <view
        class="bg-white rounded-3xl p-6 mb-4 shadow-sm border-2 border-primary"
        @click="startRuleDiagnose"
      >
        <view class="flex items-center mb-3">
          <text class="text-3xl mr-3">🔍</text>
          <view>
            <text class="block text-lg font-bold text-gray-900">症状诊断</text>
            <text class="block text-xs text-primary font-medium">推荐 · 无需消耗次数</text>
          </view>
        </view>
        <text class="block text-sm text-gray-600 leading-relaxed">
          根据植物症状逐步分析，通过规则引擎精准定位问题，适合描述具体症状的情况。
        </text>
      </view>

      <!-- AI 诊断入口 -->
      <view
        class="bg-white rounded-3xl p-6 mb-4 shadow-sm"
        @click="step = 'ai'"
      >
        <view class="flex items-center mb-3">
          <text class="text-3xl mr-3">🤖</text>
          <view>
            <text class="block text-lg font-bold text-gray-900">AI 图像诊断</text>
            <text class="block text-xs text-gray-400 font-medium">消耗 1 次诊断次数</text>
          </view>
        </view>
        <text class="block text-sm text-gray-600 leading-relaxed">
          上传植物照片，AI 自动识别并诊断健康问题，适合不确定症状的情况。
        </text>
      </view>
    </view>

    <!-- ===== 规则诊断：症状选择 ===== -->
    <view v-if="step === 'symptoms'" class="px-4 py-6">
      <view class="flex items-center mb-4">
        <view class="mr-3 p-2" @click="step = 'home'">
          <text class="text-gray-500 text-lg">←</text>
        </view>
        <view>
          <text class="block text-xl font-bold text-gray-900">选择症状</text>
          <text class="block text-xs text-gray-500">可多选，选完后点击开始诊断</text>
        </view>
      </view>

      <!-- 症状分类 -->
      <view v-if="loadingSymptoms" class="flex justify-center py-12">
        <text class="text-gray-400">加载中...</text>
      </view>
      <view v-else>
        <view
          v-for="cat in symptomCategories"
          :key="cat.id"
          class="bg-white rounded-2xl p-4 mb-3 shadow-sm"
        >
          <text class="block text-sm font-semibold text-gray-700 mb-3">{{ cat.label }}</text>
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

      <!-- 已选数量 + 开始按钮 -->
      <view class="sticky bottom-4 mt-4">
        <button
          class="w-full bg-primary text-white font-semibold py-4 rounded-2xl shadow-lg"
          :class="{ 'opacity-40': selectedSymptoms.length === 0 }"
          :disabled="selectedSymptoms.length === 0 || diagnosing"
          @click="submitSymptoms"
        >
          {{ diagnosing ? '分析中...' : `开始诊断（已选 ${selectedSymptoms.length} 个症状）` }}
        </button>
      </view>
    </view>

    <!-- ===== 规则诊断：追问 ===== -->
    <view v-if="step === 'question'" class="px-4 py-6">
      <view class="flex items-center mb-6">
        <view class="mr-3 p-2" @click="skipQuestion">
          <text class="text-gray-500 text-lg">←</text>
        </view>
        <view class="flex-1">
          <text class="block text-xl font-bold text-gray-900">补充信息</text>
          <text class="block text-xs text-gray-500">第 {{ questionRound + 1 }} 轮追问，帮助精准诊断</text>
        </view>
        <text class="text-xs text-gray-400" @click="finishWithCurrentCandidates">跳过</text>
      </view>

      <!-- 当前候选（预览） -->
      <view v-if="candidates.length" class="bg-[#F0FBF4] rounded-2xl p-4 mb-5">
        <text class="block text-xs text-gray-500 mb-2">当前初步判断</text>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="c in candidates"
            :key="c.id"
            class="flex items-center bg-white rounded-full px-3 py-1 shadow-sm gap-1"
          >
            <text class="text-xs text-gray-700">{{ c.name }}</text>
            <text class="text-xs px-2 py-0.5 rounded-full" :class="confidenceBadge(c.confidence)">
              {{ c.likelihood || confidenceLabel(c.confidence) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 问题 -->
      <view v-if="currentQuestion" class="bg-white rounded-3xl p-6 shadow-sm">
        <text class="block text-base font-semibold text-gray-900 mb-4">
          {{ currentQuestion.question }}
        </text>
        <view class="space-y-2">
          <view
            v-for="opt in currentQuestion.options"
            :key="opt.value"
            class="flex items-center p-3 rounded-2xl border transition-all"
            :class="answeredConditions[currentQuestion.id] === opt.value
              ? 'border-primary bg-[#F0FBF4]'
              : 'border-gray-100 bg-gray-50'"
            @click="answerQuestion(currentQuestion.id, opt.value)"
          >
            <view
              class="w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center flex-shrink-0"
              :class="answeredConditions[currentQuestion.id] === opt.value
                ? 'border-primary bg-primary'
                : 'border-gray-300'"
            >
              <view
                v-if="answeredConditions[currentQuestion.id] === opt.value"
                class="w-2 h-2 bg-white rounded-full"
              />
            </view>
            <text class="text-sm text-gray-700">{{ opt.label }}</text>
          </view>
        </view>
      </view>

      <button
        class="w-full bg-primary text-white font-semibold py-4 rounded-2xl shadow-lg mt-5"
        :class="{ 'opacity-40': !answeredConditions[currentQuestion?.id] }"
        :disabled="!answeredConditions[currentQuestion?.id] || diagnosing"
        @click="submitAnswer"
      >
        {{ diagnosing ? '分析中...' : '确认并继续' }}
      </button>
    </view>

    <!-- ===== 规则诊断：结果 ===== -->
    <view v-if="step === 'rule-result'" class="px-4 py-6">
      <view class="flex items-center mb-4">
        <view class="mr-3 p-2" @click="resetRuleDiagnose">
          <text class="text-gray-500 text-lg">←</text>
        </view>
        <text class="text-xl font-bold text-gray-900">诊断结果</text>
      </view>

      <view class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-sm text-gray-600 leading-relaxed">{{ ruleResult.summary }}</text>
      </view>

      <!-- 候选诊断 -->
      <view
        v-for="(c, idx) in ruleResult.candidates"
        :key="c.id"
        class="bg-white rounded-3xl p-5 mb-3 shadow-sm"
      >
        <view class="flex items-center justify-between mb-3">
          <view class="flex items-center">
            <view
              class="w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-bold text-white"
              :class="idx === 0 ? 'bg-primary' : 'bg-gray-300'"
            >
              {{ idx + 1 }}
            </view>
            <text class="text-base font-bold text-gray-900">{{ c.name }}</text>
          </view>
          <text class="text-xs px-2 py-0.5 rounded-full" :class="confidenceBadge(c.confidence)">
            {{ c.likelihood || confidenceLabel(c.confidence) }}
          </text>
        </view>

        <!-- 解决方案 -->
        <view v-if="c.solutions?.length" class="mb-2">
          <text class="block text-xs font-semibold text-gray-500 mb-1">处理建议</text>
          <view v-for="s in c.solutions" :key="s" class="flex items-start mb-1">
            <text class="text-primary mr-1.5 mt-0.5">•</text>
            <text class="text-sm text-gray-700">{{ s }}</text>
          </view>
        </view>

        <!-- 预防 -->
        <view v-if="c.prevention?.length" class="bg-[#F8F6F0] rounded-xl p-3">
          <text class="block text-xs font-semibold text-gray-500 mb-1">预防措施</text>
          <view v-for="p in c.prevention" :key="p" class="flex items-start mb-1">
            <text class="text-green-500 mr-1.5 mt-0.5">✓</text>
            <text class="text-xs text-gray-600">{{ p }}</text>
          </view>
        </view>
      </view>

      <!-- 无结果 -->
      <view v-if="!ruleResult.candidates?.length" class="bg-white rounded-3xl p-6 mb-4 shadow-sm text-center">
        <text class="text-4xl block mb-3">🌿</text>
        <text class="block text-base font-semibold text-gray-900 mb-1">未发现明显问题</text>
        <text class="block text-sm text-gray-500">根据您描述的症状，植物整体状态良好。</text>
      </view>

      <view class="flex gap-3 mb-20">
        <button
          class="flex-1 bg-white border-2 border-primary text-primary font-semibold py-3 rounded-2xl"
          @click="resetRuleDiagnose"
        >
          重新诊断
        </button>
        <button
          class="flex-1 bg-primary text-white font-semibold py-3 rounded-2xl"
          @click="step = 'ai'"
        >
          AI 深度诊断
        </button>
      </view>
    </view>

    <!-- ===== AI 诊断 ===== -->
    <view v-if="step === 'ai'" class="px-4 py-8">
      <view class="flex items-center mb-4">
        <view class="mr-3 p-2" @click="step = 'home'">
          <text class="text-gray-500 text-lg">←</text>
        </view>
        <text class="text-xl font-bold text-gray-900">AI 图像诊断</text>
      </view>

      <view class="bg-white rounded-3xl p-6 mb-4 shadow-sm">
        <text class="block text-sm text-gray-600 mb-4">建议拍摄 2-3 张不同角度的照片，包含叶片、茎干等细节</text>
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
          <view
            v-if="images.length < 5"
            class="aspect-square bg-gray-100 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300"
            @click="chooseImage"
          >
            <text class="text-3xl text-gray-400 mb-1">+</text>
            <text class="text-xs text-gray-500">添加照片</text>
          </view>
        </view>
        <text class="block text-xs text-gray-500 text-center">已添加 {{ images.length }}/5 张照片</text>
      </view>

      <view class="flex items-center justify-between mb-4">
        <view class="flex items-center" @click="thinkingMode = !thinkingMode">
          <view
            class="w-10 h-6 rounded-full relative transition-colors"
            :class="thinkingMode ? 'bg-primary' : 'bg-gray-300'"
          >
            <view
              class="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
              :class="thinkingMode ? 'left-[18px]' : 'left-0.5'"
            />
          </view>
          <text class="ml-2 text-sm text-gray-600">{{ thinkingMode ? '深度思考' : '快速诊断' }}</text>
        </view>
      </view>

      <button
        class="w-full bg-primary text-white font-semibold py-4 rounded-2xl shadow-lg"
        :class="{ 'opacity-50': images.length === 0 }"
        :disabled="images.length === 0"
        @click="startAIDiagnose"
      >
        开始 AI 诊断
      </button>

      <view class="mt-4 bg-[#D8F3DC] rounded-2xl p-4">
        <text class="block text-sm font-semibold text-primary mb-2">💡 拍摄技巧</text>
        <text class="block text-xs text-gray-700 leading-relaxed">
          • 确保光线充足，避免逆光\n • 拍摄病变部位的特写\n • 包含整体植株照片
        </text>
      </view>
    </view>

  </view>

  <!-- 登录弹窗 -->
  <LoginModal
    :show="showLoginModal"
    message="使用诊断功能需要先登录"
    @close="showLoginModal = false"
    @success="handleLoginSuccess"
  />

  <!-- AI 流式诊��弹窗 -->
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
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { uploadPlantImage, getImageUrl } from '@/api/storage.js'
import { streamDiagnosePlant, diagnosePlant } from '@/api/ai-stream.js'
import { getSymptomCategories, runRuleDiagnose } from '@/api/rule-diagnose.js'
import { ONE_MEGA_BYTE } from '../../constants'
import LoginModal from '@/components/LoginModal.vue'
import AIStreamDialog from '@/components/AIStreamDialog.vue'

const userStore = useUserStore()
const diagnoseStore = useDiagnoseStore()

// ---- 通用 ----
const step = ref('home') // home | symptoms | question | rule-result | ai
const showLoginModal = ref(false)
const plantId = ref('')

// ---- 规则诊断 ----
const loadingSymptoms = ref(false)
const symptomCategories = ref([])
const selectedSymptoms = ref([])
const diagnosing = ref(false)
const candidates = ref([])
const answeredConditions = ref({})
const currentQuestion = ref(null)
const questionRound = ref(0)
const ruleResult = ref({})

// ---- AI 诊断 ----
const images = ref([])
const thinkingMode = ref(false)
const showAIDialog = ref(false)
const aiStreamDialogRef = ref(null)
const pendingImageUrl = ref('')

onLoad((options) => {
  if (options?.plantId) plantId.value = options.plantId
})

// ===================== 规则诊断 =====================

async function startRuleDiagnose() {
  const isLoggedIn = await userStore.ensureLogin()
  if (!isLoggedIn) { showLoginModal.value = true; return }

  step.value = 'symptoms'
  if (symptomCategories.value.length === 0) {
    loadingSymptoms.value = true
    try {
      symptomCategories.value = await getSymptomCategories()
    } catch (e) {
      uni.showToast({ title: '加载症状失败，请重试', icon: 'none' })
    } finally {
      loadingSymptoms.value = false
    }
  }
}

function toggleSymptom(id) {
  const idx = selectedSymptoms.value.indexOf(id)
  if (idx === -1) selectedSymptoms.value.push(id)
  else selectedSymptoms.value.splice(idx, 1)
}

async function submitSymptoms() {
  if (selectedSymptoms.value.length === 0) return
  diagnosing.value = true
  try {
    console.log('[RuleDiagnose] submitSymptoms called, symptoms:', selectedSymptoms.value)
    const data = await runRuleDiagnose(selectedSymptoms.value, {}, 0)
    console.log('[RuleDiagnose] runRuleDiagnose response:', JSON.stringify(data))
    console.log('[RuleDiagnose] done:', data.done, '| nextQuestion:', JSON.stringify(data.nextQuestion))
    console.log('[RuleDiagnose] candidates:', JSON.stringify(data.candidates))
    candidates.value = data.candidates || []
    questionRound.value = 0

    if (data.done || !data.nextQuestion) {
      console.log('[RuleDiagnose] -> going to result (done or no nextQuestion)')
      showRuleResult(data.result)
    } else {
      console.log('[RuleDiagnose] -> going to question step, question:', data.nextQuestion.id)
      currentQuestion.value = data.nextQuestion
      step.value = 'question'
    }
  } catch (e) {
    console.error('[RuleDiagnose] submitSymptoms error:', e)
    uni.showToast({ title: e.message || '诊断失败', icon: 'none' })
  } finally {
    diagnosing.value = false
  }
}

function answerQuestion(questionId, value) {
  answeredConditions.value = { ...answeredConditions.value, [questionId]: value }
}

async function submitAnswer() {
  if (!currentQuestion.value || !answeredConditions.value[currentQuestion.value.id]) return
  diagnosing.value = true
  try {
    const data = await runRuleDiagnose(
      selectedSymptoms.value,
      answeredConditions.value,
      questionRound.value + 1
    )
    candidates.value = data.candidates || []
    questionRound.value += 1

    if (data.done || !data.nextQuestion) {
      showRuleResult(data.result)
    } else {
      currentQuestion.value = data.nextQuestion
    }
  } catch (e) {
    uni.showToast({ title: e.message || '分析失败', icon: 'none' })
  } finally {
    diagnosing.value = false
  }
}

function skipQuestion() {
  finishWithCurrentCandidates()
}

async function finishWithCurrentCandidates() {
  diagnosing.value = true
  try {
    // 强制 round >= 4 触发 done
    const data = await runRuleDiagnose(selectedSymptoms.value, answeredConditions.value, 4)
    showRuleResult(data.result)
  } catch (e) {
    // fallback：用当前 candidates 构造结果
    showRuleResult(null)
  } finally {
    diagnosing.value = false
  }
}

function showRuleResult(result) {
  if (result) {
    ruleResult.value = result
  } else {
    // 本地构造兜底结果
    const top = candidates.value[0]
    ruleResult.value = {
      mainIssue: top?.name || '未发现明显问题',
      candidates: candidates.value,
      summary: top
        ? `当前最可能的问题是「${top.name}」，建议：${top.solutions?.[0] || '请参考处理建议'}`
        : '根据您描述的症状，植物整体状态良好。'
    }
  }
  console.log('[RuleDiagnose/page] final result:', JSON.stringify(ruleResult.value))
  step.value = 'rule-result'
}

function resetRuleDiagnose() {
  selectedSymptoms.value = []
  answeredConditions.value = {}
  candidates.value = []
  currentQuestion.value = null
  questionRound.value = 0
  ruleResult.value = {}
  step.value = 'home'
}

// ===================== AI 诊断 =====================

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
            if (statRes.stats.size > 5 * ONE_MEGA_BYTE) oversizedCount++
            else validImages.push(imagePath)
          },
          fail: () => validImages.push(imagePath)
        })
      }
      setTimeout(() => {
        if (validImages.length) images.value.push(...validImages)
        if (oversizedCount) uni.showToast({ title: `已跳过 ${oversizedCount} 张超过 5MB 的图片`, icon: 'none' })
      }, 500)
    }
  })
}

function removeImage(index) {
  images.value.splice(index, 1)
}

async function startAIDiagnose() {
  if (images.value.length === 0) return
  const isLoggedIn = await userStore.ensureLogin()
  if (!isLoggedIn) { showLoginModal.value = true; return }

  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费诊断次数已用完，升级会员享受无限次诊断',
      confirmText: '升级会员',
      success: res => { if (res.confirm) uni.switchTab({ url: '/pages/profile/profile' }) }
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

    const opts = {
      image: imageUrl,
      plantId: plantId.value,
      description: `共上传 ${images.value.length} 张照片`,
      openid: userStore.openid,
      onText: (_, fullText) => aiStreamDialogRef.value?.setText(fullText),
      onFinish: (diagnosisResult) => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
        userStore.useAIQuota()
      },
      onError: error => aiStreamDialogRef.value?.setError(error)
    }
    if (thinkingMode.value) await streamDiagnosePlant(opts)
    else await diagnosePlant(opts)
  } catch (error) {
    uni.hideLoading()
    uni.showToast({ title: '诊断失败，请重试', icon: 'none' })
  }
}

function handleAIDialogClose() { showAIDialog.value = false }

function handleAIDialogConfirm(diagnosisResult) {
  if (diagnosisResult) {
    diagnoseStore.addToHistory({ images: images.value, diagnosis: diagnosisResult })
    uni.showToast({ title: '诊断完成', icon: 'success' })
  }
  showAIDialog.value = false
}

function handleAIRetry() {
  if (!pendingImageUrl.value) return
  aiStreamDialogRef.value?.startStream()
  const opts = {
    image: pendingImageUrl.value,
    plantId: plantId.value,
    description: `共上传 ${images.value.length} 张照片`,
    openid: userStore.openid,
    onText: (_, fullText) => aiStreamDialogRef.value?.setText(fullText),
    onFinish: diagnosisResult => aiStreamDialogRef.value?.finishStream(diagnosisResult),
    onError: error => aiStreamDialogRef.value?.setError(error)
  }
  if (thinkingMode.value) streamDiagnosePlant(opts)
  else diagnosePlant(opts)
}

function handleLoginSuccess() { startRuleDiagnose() }

// ===================== 工具函数 =====================

function confidenceBadge(c) {
  return c === 'high'
    ? 'bg-red-50 text-red-500'
    : c === 'medium'
    ? 'bg-yellow-50 text-yellow-600'
    : 'bg-gray-100 text-gray-400'
}

function confidenceLabel(c) {
  return c === 'high' ? '最可能' : c === 'medium' ? '较可能' : '有可能'
}
</script>

<style scoped>
.space-y-2 > * + * { margin-top: 8px; }
</style>
