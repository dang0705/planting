<template>
  <uni-popup ref="popup" type="bottom" :safe-area="false" @change="handleChange">
    <view class="bg-white rounded-t-3xl flex flex-col overflow-hidden" :style="popupContainerStyle">
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
      <scroll-view scroll-y class="flex-1 min-h-0 px-4 py-4" :style="popupScrollStyle">
        <!-- ===== 规则诊断：症状选择 ===== -->
        <view v-if="diagnoseMode === 'rule' && !ruleResult">
          <view v-if="ruleStep === 'symptoms'">
            <!-- 图片上传区域 -->
            <view v-if="!showSymptomEditor" class="mb-4">
              <text class="block text-sm font-semibold text-gray-900 mb-2"
                >📸 拍摄植物照片（可选）</text
              >
              <text class="block text-sm text-gray-500 mb-3"
                >AI 将自动识别症状，帮您快速开始诊断</text
              >

              <view v-if="ruleImages.length === 0" class="flex gap-2">
                <view
                  class="flex-1 aspect-square bg-gray-50 rounded-xl flex flex-col items-center justify-center border border-dashed border-gray-300"
                  @click="chooseRuleImage"
                >
                  <text class="text-2xl text-gray-400 mb-1">📷</text>
                  <text class="text-sm text-gray-400">拍照识别</text>
                </view>
                <view
                  class="flex-1 aspect-square bg-gray-50 rounded-xl flex flex-col items-center justify-center border border-dashed border-gray-300"
                  @click="skipImageIdentify"
                >
                  <text class="text-2xl text-gray-400 mb-1">✋</text>
                  <text class="text-sm text-gray-400">手动选择</text>
                </view>
              </view>

              <view v-else class="relative">
                <image
                  :src="ruleImages[0]"
                  class="w-full aspect-square rounded-xl"
                  mode="aspectFill"
                />
                <view
                  class="absolute top-2 right-2 bg-red-500 rounded-full w-6 h-6 flex items-center justify-center"
                  @click="removeRuleImage"
                >
                  <text class="text-white text-sm">×</text>
                </view>
                <button
                  class="w-full bg-primary text-white font-semibold py-3 rounded-xl mt-2"
                  :disabled="identifyingSymptoms"
                  @click="uploadAndIdentifySymptoms"
                >
                  {{ identifyingSymptoms ? 'AI 识别中...' : '开始 AI 识别' }}
                </button>
              </view>
            </view>

            <!-- 症状选择区域 -->
            <view v-if="showSymptomEditor">
              <view class="flex items-center justify-between mb-3">
                <text class="block text-sm text-gray-500">{{
                  hasIdentifiedSymptoms
                    ? 'AI 已识别以下症状，可删除并补充自定义症状'
                    : '请补充您观察到的症状，系统仅保留最终识别到的症状'
                }}</text>
                <text
                  v-if="hasIdentifiedSymptoms"
                  class="text-sm text-primary"
                  @click="resetSymptomSelection"
                  >重新识别</text
                >
              </view>
              <view v-if="loadingSymptoms" class="flex justify-center py-8">
                <text class="text-gray-400 text-sm">加载中...</text>
              </view>
              <view v-else class="space-y-3">
                <view v-if="selectedSymptomTags.length" class="bg-[#F7FAF8] rounded-xl p-3">
                  <view class="flex items-center justify-between mb-2">
                    <text class="text-sm font-semibold text-gray-600">
                      已选症状（{{ selectedSymptomTags.length }}/{{ symptomLimit }}）
                    </text>
                    <text class="text-sm text-gray-400">仅提交这些症状</text>
                  </view>
                  <view class="flex flex-wrap gap-2">
                    <view
                      v-for="tag in selectedSymptomTags"
                      :key="tag.id"
                      class="flex items-center bg-white border border-gray-200 rounded-full px-3 py-1.5"
                    >
                      <text class="text-sm text-gray-800">{{ tag.label }}</text>
                      <text
                        class="text-sm font-semibold ml-1.5"
                        :class="tag.source === 'ai' ? 'text-primary' : 'text-amber-600'"
                      >
                        {{ tag.source === 'ai' ? 'AI' : '自定义' }}
                      </text>
                      <text
                        v-if="tag.originalText"
                        class="text-sm text-gray-400 ml-1 truncate"
                        style="max-width: 120rpx"
                      >
                        {{ tag.originalText }}
                      </text>
                      <text class="text-sm text-gray-400 ml-2" @click="removeSymptom(tag.id)"
                        >×</text
                      >
                    </view>
                  </view>
                </view>

                <view class="bg-white border border-gray-200 rounded-xl p-3">
                  <view class="flex items-center justify-between mb-2">
                    <text class="text-sm font-semibold text-gray-700">新增自定义症状</text>
                    <text class="text-sm text-gray-400">
                      {{
                        userStore.isPremium
                          ? '最多 5 个，总输入 20 字内'
                          : '免费用户仅 1 个，5 字内'
                      }}
                    </text>
                  </view>

                  <text
                    v-if="!userStore.isPremium"
                    class="block text-sm font-semibold text-primary mb-2"
                  >
                    付费权益：可选择更多症状类别并获得 AI 症状映射
                  </text>

                  <view class="flex gap-2 mb-2">
                    <picker
                      class="flex-1"
                      :disabled="!userStore.isPremium"
                      :range="availableCustomCategories"
                      range-key="label"
                      :value="
                        Math.max(
                          0,
                          availableCustomCategories.findIndex(
                            item => item.id === customSymptomCategoryId
                          )
                        )
                      "
                      @change="handleCustomCategoryChange"
                    >
                      <view
                        class="h-10 rounded-xl border px-3 flex items-center"
                        :class="
                          !userStore.isPremium
                            ? 'border-primary bg-[#F2FBF5]'
                            : 'border-gray-200 bg-gray-50'
                        "
                      >
                        <text
                          class="text-sm"
                          :class="
                            !userStore.isPremium ? 'font-semibold text-primary' : 'text-gray-700'
                          "
                        >
                          {{
                            (
                              availableCustomCategories.find(
                                item => item.id === customSymptomCategoryId
                              ) ||
                              availableCustomCategories[0] || { label: '叶片问题' }
                            ).label
                          }}
                        </text>
                      </view>
                    </picker>
                    <input
                      v-model.trim="customSymptomText"
                      class="flex-[2] h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm"
                      :maxlength="customSymptomTextLimit"
                      :placeholder="
                        userStore.isPremium ? '输入20字内自然语言症状' : '输入5字内叶片症状'
                      "
                    />
                  </view>

                  <view
                    v-if="customSymptomCandidates.length"
                    class="bg-white rounded-xl mb-2 border border-gray-200 overflow-hidden shadow-sm"
                  >
                    <view
                      v-for="candidate in customSymptomCandidates"
                      :key="candidate.id"
                      class="px-3 py-3 border-b border-gray-100 last:border-b-0"
                      :class="activeCustomCandidateId === candidate.id ? 'bg-[#F2FBF5]' : 'bg-white'"
                      @click="activeCustomCandidateId = candidate.id"
                    >
                      <view class="flex items-center justify-between gap-2">
                        <text class="text-sm text-gray-800">{{ candidate.label }}</text>
                        <text
                          class="text-sm"
                          :class="
                            activeCustomCandidateId === candidate.id
                              ? 'text-primary font-semibold'
                              : 'text-gray-400'
                          "
                        >
                          {{ activeCustomCandidateId === candidate.id ? '已选中' : '可选' }}
                        </text>
                      </view>
                    </view>
                  </view>

                  <button
                    class="w-full bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm"
                    :disabled="
                      matchingCustomSymptom ||
                      selectedSymptoms.length >= symptomLimit ||
                      !activeCustomCandidateId
                    "
                    @click="addCustomSymptom"
                  >
                    {{
                      matchingCustomSymptom
                        ? '识别中...'
                        : selectedSymptoms.length >= symptomLimit
                          ? `已达上限（${symptomLimit}）`
                          : !activeCustomCandidateId
                            ? '先选择候选症状'
                            : '添加症状'
                    }}
                  </button>
                </view>
              </view>
              <button
                class="w-full bg-primary text-white font-semibold py-3 rounded-xl mt-2"
                :class="{ 'opacity-40': selectedSymptoms.length === 0 }"
                :disabled="selectedSymptoms.length === 0 || ruleDiagnosing"
                @click="submitSymptoms"
              >
                {{
                  ruleDiagnosing ? '分析中...' : `开始诊断（已选 ${selectedSymptoms.length} 个）`
                }}
              </button>
            </view>
          </view>

          <!-- 规则诊断：追问 -->
          <view v-if="ruleStep === 'question' && currentQuestion">
            <!-- 当前候选预览 -->
            <view v-if="candidates.length" class="bg-[#F0FBF4] rounded-xl p-3 mb-4">
              <text class="block text-sm text-gray-500 mb-2">初步判断</text>
              <view class="flex flex-wrap gap-2">
                <view
                  v-for="c in candidates"
                  :key="c.id"
                  class="flex items-center bg-white rounded-full px-2.5 py-1 shadow-sm gap-1"
                >
                  <text class="text-sm text-gray-700">{{ c.name }}</text>
                  <text class="text-sm px-1.5 py-0.5 rounded-full" :class="confidenceBadge(c.confidence)">
                    {{ c.likelihood || confidenceLabel(c.confidence) }}
                  </text>
                </view>
              </view>
            </view>

            <view class="bg-gray-50 rounded-xl p-4 mb-3">
              <text class="block text-sm font-semibold text-gray-900 mb-3">{{
                currentQuestion.question
              }}</text>
              <view class="space-y-2">
                <view
                  v-for="opt in currentQuestion.options"
                  :key="opt.value"
                  class="flex items-center p-2.5 rounded-xl border transition-all"
                  :class="
                    answeredConditions[currentQuestion.id] === opt.value
                      ? 'border-primary bg-white'
                      : 'border-transparent bg-white'
                  "
                  @click="answerQuestion(currentQuestion.id, opt.value)"
                >
                  <view
                    class="w-4 h-4 rounded-full border-2 mr-2.5 flex items-center justify-center flex-shrink-0"
                    :class="
                      answeredConditions[currentQuestion.id] === opt.value
                        ? 'border-primary bg-primary'
                        : 'border-gray-300'
                    "
                  >
                    <view
                      v-if="answeredConditions[currentQuestion.id] === opt.value"
                      class="w-1.5 h-1.5 bg-white rounded-full"
                    />
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

          <view class="bg-gray-50 rounded-xl p-3 mb-3">
            <text class="block text-sm text-gray-600 leading-relaxed">{{ ruleResult.summary }}</text>
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
                  class="w-5 h-5 rounded-full flex items-center justify-center mr-2 text-sm font-bold text-white"
                  :class="idx === 0 ? 'bg-primary' : 'bg-gray-300'"
                  >{{ idx + 1 }}</view
                >
                <text class="text-sm font-bold text-gray-900">{{ c.name }}</text>
              </view>
              <text
                class="text-sm px-1.5 py-0.5 rounded-full"
                :class="confidenceBadge(c.confidence)"
              >
                {{ c.likelihood || confidenceLabel(c.confidence) }}
              </text>
            </view>
            <view v-if="c.solutions?.length" class="mb-1.5">
              <text class="block text-sm font-semibold text-gray-400 mb-1">处理建议</text>
              <view v-for="s in c.solutions" :key="s" class="flex items-start mb-0.5">
                <text class="text-primary mr-1 text-sm">•</text>
                <text class="text-sm text-gray-700">{{ s }}</text>
              </view>
            </view>
            <view v-if="c.prevention?.length" class="bg-white rounded-lg p-2">
              <text class="block text-sm font-semibold text-gray-400 mb-1">预防措施</text>
              <view v-for="p in c.prevention" :key="p" class="flex items-start mb-0.5">
                <text class="text-green-500 mr-1 text-sm">✓</text>
                <text class="text-sm text-gray-600">{{ p }}</text>
              </view>
            </view>
          </view>

          <view v-if="!ruleResult.candidates?.length" class="text-center py-4">
            <text class="text-3xl block mb-2">🌿</text>
            <text class="block text-sm font-semibold text-gray-900 mb-1">未发现明显问题</text>
            <text class="block text-sm text-gray-500">植物整体状态良好，继续保持日常养护。</text>
          </view>

          <view class="flex gap-2 mt-2">
            <button
              class="flex-1 bg-gray-100 text-gray-600 font-medium py-2.5 rounded-xl text-sm"
              @click="resetRuleDiagnose"
            >
              重新诊断
            </button>
            <button
              class="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl text-sm"
              @click="close"
            >
              完成
            </button>
          </view>
        </view>

        <!-- ===== AI 图像诊断 ===== -->
        <view v-if="diagnoseMode === 'ai' && !ruleResult">
          <!-- 未诊断状态 -->
          <view v-if="!aiResult">
            <!-- 上传区域 -->
            <view class="mb-4">
              <text class="block text-base font-semibold text-gray-900 mb-2">📸 拍摄植物照片</text>
              <text class="block text-sm text-gray-500 mb-3">建议拍摄 2-3 张不同角度的照片</text>

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
                    <text class="text-white text-sm">×</text>
                  </view>
                </view>

                <!-- 添加按钮 -->
                <view
                  v-if="images.length < 5"
                  class="aspect-square bg-gray-50 rounded-xl flex flex-col items-center justify-center border border-dashed border-gray-300"
                  @click="chooseImage"
                >
                  <text class="text-2xl text-gray-400 mb-0.5">+</text>
                  <text class="text-sm text-gray-400">添加</text>
                </view>
              </view>

              <text class="block text-sm text-gray-400 text-center"
                >{{ images.length }}/5 张</text
              >
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
                <text class="ml-2 text-sm text-gray-600">{{
                  thinkingMode ? '深度思考' : '快速'
                }}</text>
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
              <text class="block text-sm font-semibold text-primary mb-1">💡 拍摄技巧</text>
              <text class="block text-sm text-gray-700 leading-relaxed">
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
                  <text class="block text-base font-semibold text-gray-900">{{
                    aiResult.plantName
                  }}</text>
                  <text class="block text-sm text-gray-500">{{
                    aiResult.scientificName || '学名未知'
                  }}</text>
                </view>
              </view>

              <!-- 健康状态 -->
              <view class="flex items-center justify-between p-2 bg-white rounded-lg">
                <text class="text-sm font-semibold text-gray-700">健康状态</text>
                <view :class="getHealthClass(aiResult.healthStatus)">
                  <text class="text-sm font-bold">{{ aiResult.healthStatus }}</text>
                </view>
              </view>
            </view>

            <!-- 问题诊断 -->
            <view v-if="aiResult.problem" class="mb-3">
              <text class="block text-sm font-semibold text-gray-900 mb-2">🔍 问题诊断</text>
              <view class="bg-gray-50 rounded-xl p-3">
                <text class="block text-sm text-gray-800 mb-2">{{ aiResult.problem }}</text>
                <view class="bg-[#FFF3E0] rounded-lg p-2">
                  <text class="block text-sm font-semibold text-[#F4A261] mb-1">可能原因</text>
                  <text class="block text-sm text-gray-700">{{ aiResult.cause }}</text>
                </view>
              </view>
            </view>

            <!-- 解决方案 -->
            <view v-if="aiResult.solution" class="mb-3">
              <text class="block text-sm font-semibold text-gray-900 mb-2">💊 解决方案</text>
              <view class="bg-gray-50 rounded-xl p-3">
                <text class="block text-sm text-gray-800 leading-relaxed whitespace-pre-line">{{
                  aiResult.solution
                }}</text>
              </view>
            </view>

            <!-- 养护建议 -->
            <view v-if="aiResult.careAdvice" class="mb-3">
              <text class="block text-sm font-semibold text-gray-900 mb-2">🌱 养护建议</text>
              <view class="bg-gray-50 rounded-xl p-3">
                <text class="block text-sm text-gray-800 leading-relaxed whitespace-pre-line">{{
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
              <button
                class="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl text-sm"
                @click="close"
              >
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
import { ref, computed, watch } from 'vue'
import { useUserStore } from '@/store/user.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { uploadPlantImage, getImageUrl } from '@/api/storage.js'
import { streamDiagnosePlant, diagnosePlant } from '@/api/ai-stream.js'
import {
  getSymptomCategories,
  runRuleDiagnose,
  identifySymptoms,
  matchCustomSymptom
} from '@/api/rule-diagnose.js'
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
const navigationBarHeight = (() => {
  const { statusBarHeight = 0 } = uni.getSystemInfoSync()
  return statusBarHeight + 44
})()
const popupContainerStyle = `height: calc(100vh - ${navigationBarHeight}px)`
const popupScrollStyle = 'height: 100%'

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
const ruleStep = ref('symptoms') // 'symptoms' | 'question'
const loadingSymptoms = ref(false)
const symptomCategories = ref([])
const selectedSymptoms = ref([])
const symptomSources = ref({})
const candidates = ref([])
const currentQuestion = ref(null)
const answeredConditions = ref({})
const questionRound = ref(0)
const ruleDiagnosing = ref(false)
const ruleResult = ref(null)

// 规则诊断图片识别状态
const ruleImages = ref([])
const identifyingSymptoms = ref(false)
const showManualSymptoms = ref(false)
const customSymptomCategoryId = ref('leaves')
const customSymptomText = ref('')
const matchingCustomSymptom = ref(false)
const customSymptomCandidates = ref([])
const activeCustomCandidateId = ref('')
let customSymptomDebounceTimer = null
let customSymptomQueryToken = 0

const symptomLimit = computed(() => (userStore.isPremium ? 5 : 1))
const customSymptomTextLimit = computed(() => (userStore.isPremium ? 20 : 5))
const availableCustomCategories = computed(() => {
  if (userStore.isPremium) return symptomCategories.value
  return symptomCategories.value.filter(item => item.id === 'leaves')
})
const selectedSymptomTags = computed(() => {
  return selectedSymptoms.value
    .map(id => ({
      id,
      label: symptomSources.value[id]?.label || id,
      source: symptomSources.value[id]?.source || 'ai',
      categoryId: symptomSources.value[id]?.categoryId || '',
      originalText: symptomSources.value[id]?.originalText || '',
      matchScore: Number(symptomSources.value[id]?.matchScore ?? 0)
    }))
    .sort((a, b) => {
      if (a.source === 'ai' && b.source === 'ai') return b.matchScore - a.matchScore
      if (a.source === 'ai') return -1
      if (b.source === 'ai') return 1
      return 0
    })
})
const showSymptomEditor = computed(() => {
  return (
    hasIdentifiedSymptoms.value || showManualSymptoms.value || selectedSymptoms.value.length > 0
  )
})

// 计算属性：是否已识别症状
const hasIdentifiedSymptoms = computed(() => {
  return selectedSymptoms.value.some(id => symptomSources.value[id]?.source === 'ai')
})

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

async function ensureRuleDiagnoseLogin() {
  const loggedIn = await userStore.ensureLogin()
  if (!loggedIn) {
    uni.showToast({ title: '请先完成微信登录', icon: 'none' })
    return false
  }
  return true
}

function setSymptomSource(symptomId, meta) {
  symptomSources.value = {
    ...symptomSources.value,
    [symptomId]: {
      ...symptomSources.value[symptomId],
      ...meta
    }
  }
}

function removeSymptom(symptomId) {
  selectedSymptoms.value = selectedSymptoms.value.filter(id => id !== symptomId)
  const nextSources = { ...symptomSources.value }
  delete nextSources[symptomId]
  symptomSources.value = nextSources
}

function handleCustomCategoryChange(event) {
  const nextIndex = Number(event?.detail?.value || 0)
  customSymptomCategoryId.value = availableCustomCategories.value[nextIndex]?.id || 'leaves'
}

function resetCustomSymptomCandidates() {
  customSymptomCandidates.value = []
  activeCustomCandidateId.value = ''
}

async function queryCustomSymptomCandidates() {
  const text = String(customSymptomText.value || '').trim()
  const categoryId = userStore.isPremium ? String(customSymptomCategoryId.value || '') : 'leaves'

  if (!text || text.length < 1) {
    resetCustomSymptomCandidates()
    return
  }

  const currentToken = ++customSymptomQueryToken
  matchingCustomSymptom.value = true
  try {
    const result = await matchCustomSymptom({
      categoryId,
      text,
      allowAI: userStore.isPremium
    })
    if (currentToken !== customSymptomQueryToken) return

    const nextCandidates = (Array.isArray(result?.candidates) ? result.candidates : [])
      .filter(item => item?.id && !selectedSymptoms.value.includes(item.id))
      .slice(0, 3)
    customSymptomCandidates.value = nextCandidates
    activeCustomCandidateId.value = nextCandidates[0]?.id || ''
  } catch (error) {
    if (currentToken !== customSymptomQueryToken) return
    resetCustomSymptomCandidates()
  } finally {
    if (currentToken === customSymptomQueryToken) {
      matchingCustomSymptom.value = false
    }
  }
}

function addSymptomTag(symptom, meta) {
  if (!symptom?.id) return false
  if (selectedSymptoms.value.includes(symptom.id)) {
    setSymptomSource(symptom.id, meta)
    return true
  }
  if (selectedSymptoms.value.length >= symptomLimit.value) {
    uni.showToast({
      title: userStore.isPremium
        ? `最多添加 ${symptomLimit.value} 个症状`
        : '免费用户暂最多 1 个症状',
      icon: 'none'
    })
    return false
  }
  selectedSymptoms.value = [...selectedSymptoms.value, symptom.id]
  setSymptomSource(symptom.id, meta)
  return true
}

function buildSymptomMatchMap() {
  return selectedSymptoms.value.reduce((result, symptomId) => {
    result[symptomId] = Number(symptomSources.value[symptomId]?.matchScore ?? 1)
    return result
  }, {})
}

async function submitSymptoms() {
  if (selectedSymptoms.value.length === 0) return
  if (!(await ensureRuleDiagnoseLogin())) return
  ruleDiagnosing.value = true
  try {
    console.log('[RuleDiagnose] submitSymptoms, symptoms:', selectedSymptoms.value)
    const data = await runRuleDiagnose(selectedSymptoms.value, {}, 0, buildSymptomMatchMap())
    console.log('[RuleDiagnose] response:', JSON.stringify(data))
    candidates.value = data.candidates || []
    questionRound.value = 0

    if (data.done || !data.nextQuestion) {
      console.log('[RuleDiagnose] -> result (done or no nextQuestion)')
      showRuleResult(data.result, data.candidates)
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
  if (!(await ensureRuleDiagnoseLogin())) return
  ruleDiagnosing.value = true
  try {
    const data = await runRuleDiagnose(
      selectedSymptoms.value,
      answeredConditions.value,
      questionRound.value + 1,
      buildSymptomMatchMap()
    )
    candidates.value = data.candidates || []
    questionRound.value += 1

    if (data.done || !data.nextQuestion) {
      showRuleResult(data.result, data.candidates)
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
  if (!(await ensureRuleDiagnoseLogin())) return
  ruleDiagnosing.value = true
  try {
    const data = await runRuleDiagnose(
      selectedSymptoms.value,
      answeredConditions.value,
      4,
      buildSymptomMatchMap()
    )
    showRuleResult(data.result, data.candidates)
  } catch (e) {
    uni.showToast({ title: e.message || '分析失败', icon: 'none' })
  } finally {
    ruleDiagnosing.value = false
  }
}

function showRuleResult(result, fallbackCandidates = []) {
  if (result) {
    ruleResult.value = result
    console.log('[RuleDiagnose] final result:', JSON.stringify(result))
    return
  }

  const topCandidate = fallbackCandidates?.[0]
  ruleResult.value = {
    candidates: fallbackCandidates || [],
    mainIssue: topCandidate?.name || '未发现明显问题',
    summary: topCandidate
      ? `当前最可能的问题是「${topCandidate.name}」，建议优先参考下方处理建议。`
      : '未发现明显病害，植物整体状态良好。'
  }
  console.log('[RuleDiagnose] fallback result:', JSON.stringify(ruleResult.value))
}

function resetRuleDiagnose() {
  ruleStep.value = 'symptoms'
  selectedSymptoms.value = []
  symptomSources.value = {}
  candidates.value = []
  currentQuestion.value = null
  answeredConditions.value = {}
  questionRound.value = 0
  ruleResult.value = null
  ruleImages.value = []
  showManualSymptoms.value = false
  customSymptomCategoryId.value = 'leaves'
  customSymptomText.value = ''
  resetCustomSymptomCandidates()
}

// 规则诊断图片相关函数
function chooseRuleImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: res => {
      const imagePath = res.tempFilePaths[0]
      wx.getFileSystemManager().stat({
        path: imagePath,
        success: statRes => {
          const fileSize = statRes.stats.size
          if (fileSize > 10 * ONE_MEGA_BYTE) {
            uni.showToast({ title: '图片大小不能超过 10MB', icon: 'none' })
          } else {
            ruleImages.value = [imagePath]
          }
        },
        fail: () => {
          ruleImages.value = [imagePath]
        }
      })
    }
  })
}

function removeRuleImage() {
  ruleImages.value = []
}

function skipImageIdentify() {
  showManualSymptoms.value = true
  loadSymptomsIfNeeded()
}

function resetSymptomSelection() {
  ruleImages.value = []
  selectedSymptoms.value = []
  symptomSources.value = {}
  showManualSymptoms.value = false
  customSymptomCategoryId.value = 'leaves'
  customSymptomText.value = ''
  resetCustomSymptomCandidates()
}

async function addCustomSymptom() {
  if (!(await ensureRuleDiagnoseLogin())) return

  const text = String(customSymptomText.value || '').trim()
  const categoryId = userStore.isPremium ? String(customSymptomCategoryId.value || '') : 'leaves'

  if (!text) {
    uni.showToast({ title: '请输入症状描述', icon: 'none' })
    return
  }

  if (text.length > customSymptomTextLimit.value) {
    uni.showToast({
      title: `最多输入 ${customSymptomTextLimit.value} 个字`,
      icon: 'none'
    })
    return
  }

  if (selectedSymptoms.value.length >= symptomLimit.value) {
    uni.showToast({
      title: userStore.isPremium
        ? `最多添加 ${symptomLimit.value} 个症状`
        : '免费用户暂最多 1 个症状',
      icon: 'none'
    })
    return
  }

  const matched = customSymptomCandidates.value.find(item => item.id === activeCustomCandidateId.value)

  if (!matched) {
    uni.showToast({
      title: userStore.isPremium
        ? '请先从候选列表中选择症状'
        : '请重新输入更明确的叶片症状',
      icon: 'none',
      duration: 2500
    })
    return
  }

  const added = addSymptomTag(matched, {
    source: 'custom',
    categoryId,
    label: matched.label,
    originalText: text,
    matchScore: Number(matched.score ?? 1)
  })
  if (!added) return

  showManualSymptoms.value = true
  customSymptomText.value = ''
  resetCustomSymptomCandidates()
  uni.showToast({
    title: `已添加：${matched.label}`,
    icon: 'success'
  })
}

async function uploadAndIdentifySymptoms() {
  if (ruleImages.value.length === 0) return
  if (!(await ensureRuleDiagnoseLogin())) return

  identifyingSymptoms.value = true
  try {
    uni.showLoading({ title: '上传图片中...', mask: true })
    const uploadResult = await uploadPlantImage(
      ruleImages.value[0],
      userStore.userId || 'anonymous',
      'diagnose'
    )
    const imageUrl = await getImageUrl(uploadResult.fileId, 7200)
    uni.hideLoading()

    uni.showLoading({ title: 'AI 识别中...', mask: true })
    const identifyResult = await identifySymptoms(imageUrl)
    uni.hideLoading()

    const identifiedSymptomIds = identifyResult.symptoms || []
    const identifiedSymptomTags = identifyResult.symptomTags || []

    console.log('[RuleDiagnose] AI identified symptoms:', identifiedSymptomIds)

    if (identifiedSymptomIds.length === 0) {
      uni.showModal({
        title: '提示',
        content: 'AI 未识别到明显症状，请手动选择',
        showCancel: false,
        success: () => {
          showManualSymptoms.value = true
          loadSymptomsIfNeeded()
        }
      })
    } else {
      const nextIds = identifiedSymptomIds.slice(0, symptomLimit.value)
      selectedSymptoms.value = nextIds
      symptomSources.value = nextIds.reduce((result, symptomId) => {
        const meta = identifiedSymptomTags.find(item => item.id === symptomId)
        result[symptomId] = {
          source: 'ai',
          label: meta?.label || symptomId,
          categoryId: meta?.categoryId || '',
          matchScore: Number(meta?.matchScore ?? 1)
        }
        return result
      }, {})

      const topSymptomTag = [...identifiedSymptomTags]
        .sort((a, b) => Number(b?.matchScore ?? 0) - Number(a?.matchScore ?? 0))[0]
      if (topSymptomTag?.categoryId) {
        customSymptomCategoryId.value = topSymptomTag.categoryId
      }

      if (identifiedSymptomIds.length > symptomLimit.value) {
        uni.showToast({
          title: `已保留前 ${symptomLimit.value} 个症状`,
          icon: 'none'
        })
      } else {
        uni.showToast({ title: `识别到 ${nextIds.length} 个症状`, icon: 'success' })
      }
    }
  } catch (error) {
    console.error('[RuleDiagnose] identify symptoms error:', error)
    uni.hideLoading()
    uni.showModal({
      title: '识别失败',
      content: error.message || '症状识别失败，请手动选择',
      showCancel: false,
      success: () => {
        showManualSymptoms.value = true
        loadSymptomsIfNeeded()
      }
    })
  } finally {
    identifyingSymptoms.value = false
  }
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
    resetCustomSymptomCandidates()
    emit('close')
  }
}

watch(
  () => [customSymptomText.value, customSymptomCategoryId.value, userStore.isPremium],
  () => {
    if (customSymptomDebounceTimer) {
      clearTimeout(customSymptomDebounceTimer)
    }
    const text = String(customSymptomText.value || '').trim()
    if (!text || text.length < 1) {
      matchingCustomSymptom.value = false
      resetCustomSymptomCandidates()
      return
    }
    customSymptomDebounceTimer = setTimeout(() => {
      queryCustomSymptomCandidates()
    }, 280)
  }
)

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
    const uploadResult = await uploadPlantImage(
      images.value[0],
      userStore.userId || 'anonymous',
      'diagnose'
    )
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
      careAdvice: `• 主要问题：${diagnosisResult.mainIssue}\n• 建议定期检查植物健康状况`,
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
