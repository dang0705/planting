<template>
  <uni-popup ref="popup" type="bottom" :safe-area="false" @change="handleChange">
    <view class="bg-white rounded-t-3xl" style="max-height: 85vh">
      <view class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <text class="text-lg font-semibold text-gray-900">AI 诊断</text>
        <view class="w-8 h-8 flex items-center justify-center" @click="close">
          <text class="text-gray-400 text-2xl">×</text>
        </view>
      </view>

      <scroll-view scroll-y class="px-4 py-4" style="max-height: 75vh">
        <view v-if="!result">
          <view class="mb-4">
            <text class="block text-base font-semibold text-gray-900 mb-2">拍摄植物照片</text>
            <text class="block text-xs text-gray-500 mb-3">建议拍摄 2-3 张不同角度的照片</text>

            <view class="grid grid-cols-3 gap-2 mb-2">
              <view
                v-for="(img, index) in imageFiles"
                :key="img.id"
                class="relative aspect-square bg-gray-100 rounded-xl overflow-hidden"
              >
                <image :src="img.previewUrl" class="w-full h-full" mode="aspectFill" />
                <view
                  v-if="img.loading"
                  class="absolute inset-0 bg-white/75 flex flex-col items-center justify-center"
                >
                  <view class="upload-spinner mb-2" />
                  <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text>
                </view>
                <view
                  v-else-if="img.status === 'error'"
                  class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                >
                  <text class="block text-[10px] text-white leading-tight">{{ img.error || '上传失败' }}</text>
                </view>
                <view
                  class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                  @click="removeImage(index)"
                >
                  <text class="text-white text-xs">×</text>
                </view>
              </view>

              <view
                v-if="imageFiles.length < 5"
                class="aspect-square bg-gray-50 rounded-xl flex flex-col items-center justify-center border border-dashed border-gray-300"
                @click="chooseImage"
              >
                <text class="text-2xl text-gray-400 mb-0.5">+</text>
                <text class="text-[10px] text-gray-400">添加</text>
              </view>
            </view>

            <text class="block text-[10px] text-gray-400 text-center">{{ imageFiles.length }}/5 张</text>
            <text v-if="hasPendingUploads" class="block text-[10px] text-[#2D6A4F] text-center mt-1">
              图片上传中，全部处理完成后可开始诊断
            </text>
            <text v-else-if="hasUploadErrors" class="block text-[10px] text-red-500 text-center mt-1">
              存在上传失败的图片，请删除后重新添加
            </text>
          </view>

          <view v-if="primarySlotAssignments.length" class="mb-4 bg-[#F8F6F0] rounded-xl p-3">
            <view class="flex items-start justify-between gap-3 mb-2">
              <view>
                <text class="block text-xs font-semibold text-gray-900">图片槽位</text>
                <text class="block text-[10px] text-gray-500 mt-1">
                  槽位提示会作为视觉输入强提示，用于多图融合与器官优先级判断。
                </text>
              </view>
            </view>

            <view
              v-for="assignment in primarySlotAssignments"
              :key="assignment.item.id"
              class="flex items-center gap-3 py-2 border-b border-white/80 last:border-b-0"
            >
                <image :src="assignment.item.previewUrl" class="w-11 h-11 rounded-lg bg-white" mode="aspectFill" />
              <view class="flex-1 min-w-0">
                <text class="block text-xs font-medium text-gray-800">
                  {{ getSlotDisplayLabel(assignment.item, assignment.index) }}
                </text>
                <text class="block text-[10px] text-gray-500 mt-1">
                  {{ getSlotMetaText(assignment.item) }}
                </text>
              </view>
              <button
                class="px-3 py-1.5 rounded-full bg-white border border-[#D8F3DC] text-[#2D6A4F] text-[11px]"
                @click="openSlotPicker('primary', assignment.index)"
              >
                {{ getOrganOptionLabel(assignment.item.inputSlotType, '选择槽位') }}
              </button>
            </view>
          </view>

          <button
            class="w-full bg-primary text-white font-semibold py-3 rounded-xl"
            :class="{ 'opacity-50': !canStartDiagnose() }"
            :disabled="!canStartDiagnose()"
            @click="startDiagnose"
          >
            开始诊断
          </button>

          <view class="mt-3 bg-[#D8F3DC] rounded-xl p-3">
            <text class="block text-xs font-semibold text-primary mb-1">拍摄建议</text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 光线充足，避免逆光
            </text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 优先保留叶片特写、茎部或根颈近照、整株图
            </text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 若已知部位，请为每张图选择对应槽位
            </text>
          </view>
        </view>

        <view v-if="result">
          <view class="bg-gray-50 rounded-xl p-3 mb-3">
            <view class="flex items-center mb-2">
              <text class="text-2xl mr-2">🌿</text>
              <view class="flex-1">
                <text class="block text-base font-semibold text-gray-900">{{ result.plantName }}</text>
                <text class="block text-xs text-gray-500">{{ result.scientificName || '学名未知' }}</text>
              </view>
            </view>

            <view class="flex items-center justify-between p-2 bg-white rounded-lg">
              <text class="text-xs font-semibold text-gray-700">健康状态</text>
              <view :class="getHealthClass(result.healthStatusText)">
                <text class="text-xs font-bold">{{ result.healthStatusText }}</text>
              </view>
            </view>
          </view>

          <view v-if="result.observedSymptoms?.length" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">观察到的症状</text>
            <view class="bg-gray-50 rounded-xl p-3 flex flex-wrap gap-2">
              <view
                v-for="item in result.observedSymptoms"
                :key="item.symptomKey"
                class="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px]"
              >
                {{ item.symptomCn || item.symptomKey }}
              </view>
            </view>
          </view>

          <view v-if="result.mainIssueText || result.summaryText" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">当前结论</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 mb-2">{{ result.mainIssueText }}</text>
              <text class="block text-xs text-gray-600 leading-relaxed whitespace-pre-line">{{
                result.summaryText
              }}</text>
            </view>
          </view>

          <view v-if="result.followUpRequired" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">继续问诊</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-[10px] text-gray-500 mb-3">
                答题与补图是两条正式路径，需要分开提交。
              </text>
              <view
                v-for="item in result.followUps"
                :key="item.questionId"
                class="mb-3 last:mb-0"
              >
                <text class="block text-xs font-semibold text-gray-800 mb-1">{{ item.text }}</text>
                <text class="block text-[10px] text-gray-500 mb-2">{{ item.helpText }}</text>
                <view class="flex flex-wrap gap-2">
                  <button
                    v-for="option in item.options"
                    :key="option.optionId"
                    class="flex-1 min-w-[88px] py-2 rounded-xl text-xs"
                    :class="
                      followUpAnswers[item.questionId] === option.optionId
                        ? 'bg-primary text-white'
                        : 'bg-white border border-gray-200 text-gray-700'
                    "
                    @click="setFollowUpAnswer(item.questionId, option.optionId)"
                  >
                    {{ option.text }}
                  </button>
                </view>
              </view>
              <text
                v-if="followUpSlotAssignments.length || hasPendingFollowUpUploads || hasFollowUpUploadErrors"
                class="block text-[10px] text-[#8B7355] mt-3"
              >
                当前有待处理补图，请先完成补图提交或清空补图后再提交问诊答案。
              </text>
              <button
                class="w-full mt-2 bg-primary text-white py-2.5 rounded-xl text-sm"
                :class="{ 'opacity-50': isSubmittingAnyFollowUp || !canSubmitFollowUps() }"
                :disabled="isSubmittingAnyFollowUp || !canSubmitFollowUps()"
                @click="submitFollowUps"
              >
                {{ isSubmittingFollowUpAnswer ? '重新诊断中...' : '提交问诊并重新诊断' }}
              </button>
            </view>
          </view>

          <view v-if="result.followUpRequired" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">补充图片</text>
            <view class="bg-[#F8F6F0] rounded-xl p-3 border border-[#D8F3DC]">
              <text class="block text-[10px] text-gray-500 mb-2">
                当前阶段最多补图 1 次。若补图，将生成新的视觉调用批次并重建视觉证据。
              </text>

              <view v-if="followUpCaptureSuggestions.length" class="mb-3">
                <text class="block text-[11px] font-semibold text-gray-800 mb-1">建议优先补拍</text>
                <view
                  v-for="item in followUpCaptureSuggestions"
                  :key="item"
                  class="mb-1 last:mb-0 px-2.5 py-2 rounded-lg bg-white text-[11px] text-gray-700"
                >
                  {{ item }}
                </view>
              </view>

              <view v-if="canShowFollowUpUploader">
                <view class="grid grid-cols-3 gap-2 mb-2">
                  <view
                    v-for="(img, index) in followUpImageFiles"
                    :key="img.id"
                    class="relative aspect-square bg-white rounded-xl overflow-hidden"
                  >
                    <image :src="img.previewUrl" class="w-full h-full" mode="aspectFill" />
                    <view
                      v-if="img.loading"
                      class="absolute inset-0 bg-white/75 flex flex-col items-center justify-center"
                    >
                      <view class="upload-spinner mb-2" />
                      <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text>
                    </view>
                    <view
                      v-else-if="img.status === 'error'"
                      class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                    >
                      <text class="block text-[10px] text-white leading-tight">{{ img.error || '上传失败' }}</text>
                    </view>
                    <view
                      class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                      @click="removeFollowUpImage(index)"
                    >
                      <text class="text-white text-xs">×</text>
                    </view>
                  </view>

                  <view
                    v-if="followUpImageFiles.length < 3"
                    class="aspect-square bg-white rounded-xl flex flex-col items-center justify-center border border-dashed border-[#B7DCC5]"
                    @click="chooseFollowUpImage"
                  >
                    <text class="text-2xl text-[#8FB69B] mb-0.5">+</text>
                    <text class="text-[10px] text-[#8FB69B]">补图</text>
                  </view>
                </view>

                <text class="block text-[10px] text-gray-400 text-center">{{ followUpImageFiles.length }}/3 张</text>
                <text v-if="hasPendingFollowUpUploads" class="block text-[10px] text-[#2D6A4F] text-center mt-1">
                  补图上传中，处理完成后可提交
                </text>
                <text v-else-if="hasFollowUpUploadErrors" class="block text-[10px] text-red-500 text-center mt-1">
                  存在上传失败的补图，请删除后重新添加
                </text>

                <view v-if="followUpSlotAssignments.length" class="mt-3 bg-white rounded-xl p-3">
                  <view class="flex items-center justify-between gap-3 mb-2">
                    <view>
                      <text class="block text-xs font-semibold text-gray-900">补图槽位</text>
                      <text class="block text-[10px] text-gray-500 mt-1">请为补图选择最接近的器官槽位。</text>
                    </view>
                    <text class="text-[10px] text-[#8B7355]" @click="resetFollowUpUploads">清空补图</text>
                  </view>

                  <view
                    v-for="assignment in followUpSlotAssignments"
                    :key="assignment.item.id"
                    class="flex items-center gap-3 py-2 border-b border-[#F4F1E8] last:border-b-0"
                  >
                    <image
                      :src="assignment.item.previewUrl"
                      class="w-11 h-11 rounded-lg bg-[#F8F6F0]"
                      mode="aspectFill"
                    />
                    <view class="flex-1 min-w-0">
                      <text class="block text-xs font-medium text-gray-800">
                        {{ getSlotDisplayLabel(assignment.item, assignment.index) }}
                      </text>
                      <text class="block text-[10px] text-gray-500 mt-1">
                        {{ getSlotMetaText(assignment.item) }}
                      </text>
                    </view>
                    <button
                      class="px-3 py-1.5 rounded-full bg-[#F8F6F0] border border-[#D8F3DC] text-[#2D6A4F] text-[11px]"
                      @click="openSlotPicker('followup', assignment.index)"
                    >
                      {{ getOrganOptionLabel(assignment.item.inputSlotType, '选择槽位') }}
                    </button>
                  </view>
                </view>

                <button
                  class="w-full mt-3 bg-[#2D6A4F] text-white py-2.5 rounded-xl text-sm"
                  :class="{ 'opacity-50': isSubmittingAnyFollowUp || !canSubmitFollowUpImages() }"
                  :disabled="isSubmittingAnyFollowUp || !canSubmitFollowUpImages()"
                  @click="submitFollowUpImages"
                >
                  {{ isSubmittingFollowUpImage ? '补图诊断中...' : '提交补图并重新诊断' }}
                </button>
              </view>

              <view v-else class="px-3 py-2.5 rounded-xl bg-white">
                <text class="block text-[11px] text-gray-600">
                  {{ followUpUploadBlockedReason }}
                </text>
              </view>
            </view>
          </view>

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
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { useCloudImageUploader } from '@/composables/useCloudImageUploader'
import { useDiagnoseMutation } from '@/vue-query/diagnose/mutations/useDiagnoseMutation.js'
import { useDiagnoseFollowUpMutation } from '@/vue-query/diagnose/mutations/useDiagnoseFollowUpMutation.js'
import {
  normalizeDiagnosisResult,
  createFollowUpAnswerMap,
  isFollowUpAnswerComplete,
  buildFollowUpPayload,
  getHealthClass
} from '@/utils/diagnose-flow.js'
import AIStreamDialog from './AIStreamDialog.vue'

const PRIMARY_SLOT_SEQUENCE = ['leaf', 'stem', 'root_crown', 'whole_plant', 'other']
const FOLLOW_UP_SLOT_SEQUENCE = ['whole_plant', 'leaf', 'stem', 'root_crown', 'other']
const ORGAN_SLOT_OPTIONS = [
  { value: 'leaf', label: '叶片图' },
  { value: 'stem', label: '茎部图' },
  { value: 'root', label: '根部图' },
  { value: 'root_crown', label: '根 / 根颈图' },
  { value: 'whole_plant', label: '全株图' },
  { value: 'flower', label: '花部图' },
  { value: 'fruit', label: '果部图' },
  { value: 'other', label: '其他局部图' },
  { value: 'unknown', label: '未指定' }
]

const ORGAN_SLOT_LABEL_MAP = ORGAN_SLOT_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

const props = defineProps({
  plantId: {
    type: [String, Number],
    default: ''
  },
  plantName: {
    type: String,
    default: ''
  },
  observedSymptoms: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['success', 'close'])

const userStore = useUserStore()
const diagnoseStore = useDiagnoseStore()

const popup = ref(null)
const result = ref(null)
const showAIDialog = ref(false)
const aiStreamDialogRef = ref(null)
const pendingDiagnosePayload = ref(null)
const casePreviewImages = ref([])
const followUpAnswers = ref({})
const submittingFollowUpMode = ref('')

const diagnoseMutation = useDiagnoseMutation()
const followUpMutation = useDiagnoseFollowUpMutation()

const uploader = useCloudImageUploader({
  count: 5,
  size: 5,
  suffix: ['jpg', 'jpeg', 'png', 'webp'],
  compressionRate: 80
})
const followUpUploader = useCloudImageUploader({
  count: 3,
  size: 5,
  suffix: ['jpg', 'jpeg', 'png', 'webp'],
  compressionRate: 80
})

const imageFiles = uploader.files
const hasPendingUploads = uploader.hasPendingUploads
const hasUploadErrors = uploader.hasUploadErrors
const followUpImageFiles = followUpUploader.files
const hasPendingFollowUpUploads = followUpUploader.hasPendingUploads
const hasFollowUpUploadErrors = followUpUploader.hasUploadErrors

const primarySlotAssignments = computed(() =>
  imageFiles.value
    .map((item, index) => ({ item, index }))
    .filter(entry => entry?.item && entry.item.status !== 'error')
)
const followUpSlotAssignments = computed(() =>
  followUpImageFiles.value
    .map((item, index) => ({ item, index }))
    .filter(entry => entry?.item && entry.item.status !== 'error')
)
const primaryStructuredImages = computed(() => buildStructuredImageInputs(imageFiles.value))
const followUpStructuredImages = computed(() => buildStructuredImageInputs(followUpImageFiles.value))
const followUpCaptureSuggestions = computed(() =>
  Array.isArray(result.value?.visualAggregateSummary?.suggestedFollowupCapture)
    ? result.value.visualAggregateSummary.suggestedFollowupCapture
    : []
)
const hasUsedFollowUpRetake = computed(() => detectUsedFollowUpRetake(result.value))
const canShowFollowUpUploader = computed(
  () => Boolean(result.value?.followUpRequired && result.value?.uiHints?.canUploadMoreImages)
)
const followUpUploadBlockedReason = computed(() => {
  if (!result.value?.followUpRequired) {
    return '当前轮没有开放补图。'
  }

  if (hasUsedFollowUpRetake.value) {
    return '本次会话的补图机会已使用，请继续答题或重新开始新的诊断。'
  }

  return '当前轮次没有开放补图入口，请优先回答问题。'
})
const isSubmittingAnyFollowUp = computed(() => Boolean(submittingFollowUpMode.value))
const isSubmittingFollowUpAnswer = computed(() => submittingFollowUpMode.value === 'answers')
const isSubmittingFollowUpImage = computed(() => submittingFollowUpMode.value === 'images')

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

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function getOrganOptionLabel(value = '', fallback = '未指定') {
  return ORGAN_SLOT_LABEL_MAP[String(value || '').trim()] || fallback
}

function normalizeSlotType(slotType = '', fallback = 'unknown') {
  const normalized = String(slotType || '').trim()
  return ORGAN_SLOT_LABEL_MAP[normalized] ? normalized : fallback
}

function buildSlotMetadata(slotType = 'unknown', index = 0) {
  const normalizedSlotType = normalizeSlotType(slotType, 'unknown')
  const label = getOrganOptionLabel(normalizedSlotType, '图片')

  return {
    inputSlotType: normalizedSlotType,
    inputSlotLabel: `图${index + 1} ${label}`,
    userDeclaredOrganType: normalizedSlotType === 'unknown' ? '' : normalizedSlotType,
    userDeclaredOrganConfidence: normalizedSlotType === 'unknown' ? null : 0.95
  }
}

function inferFollowUpSlotTypeFromSuggestion(suggestion = '', fallback = 'whole_plant') {
  const normalized = String(suggestion || '').trim()
  if (!normalized) return fallback
  if (normalized.includes('根颈')) return 'root_crown'
  if (normalized.includes('根')) return 'root'
  if (normalized.includes('茎')) return 'stem'
  if (normalized.includes('全株') || normalized.includes('整株')) return 'whole_plant'
  if (normalized.includes('花')) return 'flower'
  if (normalized.includes('果')) return 'fruit'
  if (normalized.includes('叶')) return 'leaf'
  return fallback
}

function resolveDefaultSlotType(mode = 'primary', index = 0) {
  if (mode === 'followup') {
    const suggested = followUpCaptureSuggestions.value[index] || followUpCaptureSuggestions.value[0] || ''
    const fallback = FOLLOW_UP_SLOT_SEQUENCE[index] || FOLLOW_UP_SLOT_SEQUENCE[FOLLOW_UP_SLOT_SEQUENCE.length - 1]
    return inferFollowUpSlotTypeFromSuggestion(suggested, fallback)
  }

  return PRIMARY_SLOT_SEQUENCE[index] || PRIMARY_SLOT_SEQUENCE[PRIMARY_SLOT_SEQUENCE.length - 1]
}

function applySlotMetadata(mode = 'primary', index = 0, slotType = 'unknown') {
  const nextPatch = buildSlotMetadata(slotType, index)

  if (mode === 'followup') {
    followUpUploader.updateAt(index, nextPatch)
    return
  }

  uploader.updateAt(index, nextPatch)
}

async function openSlotPicker(mode = 'primary', index = 0) {
  try {
    const res = await new Promise((resolve, reject) => {
      uni.showActionSheet({
        itemList: ORGAN_SLOT_OPTIONS.map(item => item.label),
        success: resolve,
        fail: reject
      })
    })
    const option = ORGAN_SLOT_OPTIONS[Number(res?.tapIndex ?? -1)]
    if (!option) return
    applySlotMetadata(mode, index, option.value)
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (message.includes('cancel')) {
      return
    }
    console.warn('选择器官槽位失败:', error)
  }
}

function getSlotMetaText(item = {}) {
  const slotType = normalizeSlotType(item?.inputSlotType || item?.userDeclaredOrganType || '', 'unknown')
  if (slotType === 'unknown') {
    return '尚未指定器官槽位，默认将按通用图像处理。'
  }
  return `当前按 ${getOrganOptionLabel(slotType)} 进入视觉强提示。`
}

function getSlotDisplayLabel(item = {}, index = 0) {
  const slotType = normalizeSlotType(item?.inputSlotType || item?.userDeclaredOrganType || '', 'unknown')
  return buildSlotMetadata(slotType, index).inputSlotLabel
}

function buildStructuredImageInputs(files = []) {
  return (Array.isArray(files) ? files : [])
    .filter(item => item?.status === 'success')
    .map((item, index) => {
      const imageRef = String(item?.uploaded?.tempUrl || item?.uploaded?.url || '').trim()
      if (!imageRef) {
        return null
      }

      const slotType = normalizeSlotType(item?.inputSlotType || item?.userDeclaredOrganType || '', 'unknown')
      const metadata = buildSlotMetadata(slotType, index)
      const declaredConfidence =
        item?.userDeclaredOrganConfidence === null ||
        item?.userDeclaredOrganConfidence === undefined ||
        item?.userDeclaredOrganConfidence === ''
          ? metadata.userDeclaredOrganConfidence
          : Number(item.userDeclaredOrganConfidence)

      return {
        imageRef,
        inputSlotType: slotType,
        orderIndex: index,
        inputSlotOrder: index,
        inputSlotLabel: metadata.inputSlotLabel,
        userDeclaredOrganType: String(
          item?.userDeclaredOrganType || metadata.userDeclaredOrganType || ''
        ).trim(),
        userDeclaredOrganConfidence:
          declaredConfidence === null || declaredConfidence === undefined || Number.isNaN(declaredConfidence)
            ? null
            : Number(declaredConfidence),
        ...(item?.uploaded?.fileId ? { fileId: item.uploaded.fileId } : {})
      }
    })
    .filter(Boolean)
}

function getPreviewImagesFromFiles(files = []) {
  return uniqueStrings(
    (Array.isArray(files) ? files : []).map(item => item?.previewUrl)
  )
}

function getCasePreviewImages({ includeFollowUp = false } = {}) {
  const baseImages = casePreviewImages.value.length
    ? casePreviewImages.value
    : getPreviewImagesFromFiles(imageFiles.value)

  if (!includeFollowUp) {
    return uniqueStrings(baseImages)
  }

  return uniqueStrings([...baseImages, ...getPreviewImagesFromFiles(followUpImageFiles.value)])
}

function detectUsedFollowUpRetake(currentResult = null) {
  const trace = currentResult?.visualBatchTrace
  if (!trace || typeof trace !== 'object') {
    return false
  }

  const currentBatchId = String(trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || '').trim()
  const originBatchId = String(trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || '').trim()
  const supersedeApplied = Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) === 1

  return supersedeApplied || Boolean(currentBatchId && originBatchId && currentBatchId !== originBatchId)
}

async function chooseImage() {
  try {
    const startIndex = imageFiles.value.length
    const entries = await uploader.chooseAndUpload({
      plantId: props.plantId,
      maxAge: 7200
    })

    entries.forEach((_, offset) => {
      applySlotMetadata('primary', startIndex + offset, resolveDefaultSlotType('primary', startIndex + offset))
    })
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (message.includes('cancel')) {
      return
    }

    console.error('选择图片失败:', error)
    uni.showToast({
      title: '选择图片失败，请重试',
      icon: 'none'
    })
  }
}

async function chooseFollowUpImage() {
  try {
    const startIndex = followUpImageFiles.value.length
    const entries = await followUpUploader.chooseAndUpload({
      plantId: props.plantId,
      maxAge: 7200
    })

    entries.forEach((_, offset) => {
      applySlotMetadata(
        'followup',
        startIndex + offset,
        resolveDefaultSlotType('followup', startIndex + offset)
      )
    })
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (message.includes('cancel')) {
      return
    }

    console.error('选择补图失败:', error)
    uni.showToast({
      title: '选择补图失败，请重试',
      icon: 'none'
    })
  }
}

function removeImage(index) {
  uploader.removeAt(index)
}

function removeFollowUpImage(index) {
  followUpUploader.removeAt(index)
}

async function resetFollowUpUploads() {
  await followUpUploader.reset()
}

async function startDiagnose() {
  const hasObservedSymptoms = Array.isArray(props.observedSymptoms) && props.observedSymptoms.length > 0
  const structuredImages = primaryStructuredImages.value
  const uploadedImageUrls = structuredImages.map(item => item.imageRef)

  if (imageFiles.value.length === 0 && !hasObservedSymptoms) {
    uni.showToast({ title: '请先添加照片', icon: 'none' })
    return
  }

  if (hasPendingUploads.value) {
    uni.showToast({ title: '请等待图片上传完成', icon: 'none' })
    return
  }

  if (uploadedImageUrls.length === 0 && !hasObservedSymptoms) {
    uni.showToast({ title: '请至少保留 1 张上传成功的图片', icon: 'none' })
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
    const imageUrls = hasObservedSymptoms ? [] : uploadedImageUrls

    const diagnosePayload = {
      image: imageUrls[0] || '',
      images: hasObservedSymptoms ? [] : structuredImages,
      imageIds: imageUrls,
      plantId: props.plantId,
      plantName: props.plantName,
      observedSymptoms: hasObservedSymptoms ? props.observedSymptoms : [],
      description: `共上传 ${imageUrls.length} 张照片`
    }

    pendingDiagnosePayload.value = diagnosePayload
    showAIDialog.value = true
    await new Promise(resolve => setTimeout(resolve, 100))
    aiStreamDialogRef.value?.startStream()

    await diagnoseMutation.mutateAsync({
      ...diagnosePayload,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: diagnosisResult => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
        userStore.useAIQuota()
      },
      onError: error => {
        aiStreamDialogRef.value?.setError(error)
      }
    })
  } catch (error) {
    console.error('诊断失败:', error)
    uni.hideLoading()
    uni.showToast({ title: error?.message || '诊断失败，请重试', icon: 'none' })
  }
}

function handleAIDialogClose() {
  showAIDialog.value = false
}

function handleAIDialogConfirm(diagnosisResult) {
  if (diagnosisResult) {
    const previewImages = getCasePreviewImages({ includeFollowUp: false })
    casePreviewImages.value = previewImages
    result.value = normalizeDiagnosisResult(diagnosisResult, {
      images: previewImages,
      plantName: props.plantName || '植物'
    })
    followUpAnswers.value = createFollowUpAnswerMap(result.value.followUps)

    diagnoseStore.addToHistory({
      images: previewImages,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })

    emit('success', result.value)
    uni.showToast({ title: result.value.followUpRequired ? '需要继续问诊' : '诊断完成', icon: 'success' })
  }
  showAIDialog.value = false
}

function handleAIRetry() {
  if (pendingDiagnosePayload.value) {
    aiStreamDialogRef.value?.startStream()

    const callbackOpts = {
      ...pendingDiagnosePayload.value,
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

function setFollowUpAnswer(questionId, answerValue) {
  followUpAnswers.value = {
    ...followUpAnswers.value,
    [questionId]: answerValue
  }
}

function canStartDiagnose() {
  const hasObservedSymptoms = Array.isArray(props.observedSymptoms) && props.observedSymptoms.length > 0

  if (!hasObservedSymptoms && primaryStructuredImages.value.length === 0) {
    return false
  }

  return !hasPendingUploads.value
}

function canSubmitFollowUps() {
  if (followUpSlotAssignments.value.length > 0 || hasPendingFollowUpUploads.value || hasFollowUpUploadErrors.value) {
    return false
  }

  return isFollowUpAnswerComplete(result.value?.followUps || [], followUpAnswers.value)
}

function canSubmitFollowUpImages() {
  if (!canShowFollowUpUploader.value) {
    return false
  }

  if (hasUsedFollowUpRetake.value) {
    return false
  }

  if (hasPendingFollowUpUploads.value || hasFollowUpUploadErrors.value) {
    return false
  }

  return followUpStructuredImages.value.length > 0
}

async function submitFollowUps() {
  if (!result.value || !canSubmitFollowUps()) {
    return
  }

  submittingFollowUpMode.value = 'answers'
  try {
    const payload = buildFollowUpPayload(result.value, followUpAnswers.value)
    const rerunResult = await followUpMutation.mutateAsync({
      diagnosisSessionId: payload.diagnosisSessionId,
      roundId: payload.roundId,
      answers: payload.answers
    })

    const previewImages = getCasePreviewImages({ includeFollowUp: false })
    casePreviewImages.value = previewImages
    result.value = normalizeDiagnosisResult(rerunResult, {
      images: previewImages,
      plantName: props.plantName || result.value.plantName || '植物'
    })
    followUpAnswers.value = createFollowUpAnswerMap(result.value.followUps)

    diagnoseStore.addToHistory({
      images: previewImages,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })
    emit('success', result.value)

    uni.showToast({
      title: result.value.followUpRequired ? '问诊已更新' : '诊断已收敛',
      icon: 'success'
    })
  } catch (error) {
    console.error('提交问诊失败:', error)
    uni.showToast({ title: error.message || '问诊失败，请重试', icon: 'none' })
  } finally {
    submittingFollowUpMode.value = ''
  }
}

async function submitFollowUpImages() {
  if (!result.value || !canSubmitFollowUpImages()) {
    return
  }

  submittingFollowUpMode.value = 'images'
  try {
    const structuredImages = followUpStructuredImages.value
    const imageIds = structuredImages.map(item => item.imageRef).filter(Boolean)
    const rerunResult = await followUpMutation.mutateAsync({
      diagnosisSessionId: result.value.diagnosisSessionId,
      roundId: result.value.roundId,
      image: imageIds[0] || '',
      images: structuredImages,
      imageIds,
      latestVisualCallBatchId: result.value.latestVisualCallBatchId,
      visualBatchTrace: result.value.visualBatchTrace
    })

    const nextPreviewImages = getCasePreviewImages({ includeFollowUp: true })
    casePreviewImages.value = nextPreviewImages
    result.value = normalizeDiagnosisResult(rerunResult, {
      images: nextPreviewImages,
      plantName: props.plantName || result.value.plantName || '植物'
    })
    followUpAnswers.value = createFollowUpAnswerMap(result.value.followUps)

    diagnoseStore.addToHistory({
      images: nextPreviewImages,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })
    emit('success', result.value)
    await followUpUploader.reset()

    uni.showToast({
      title: result.value.followUpRequired ? '补图已更新' : '补图诊断已完成',
      icon: 'success'
    })
  } catch (error) {
    console.error('提交补图失败:', error)
    uni.showToast({ title: error.message || '补图失败，请重试', icon: 'none' })
  } finally {
    submittingFollowUpMode.value = ''
  }
}

async function resetDiagnose() {
  await Promise.all([uploader.reset(), followUpUploader.reset()])
  result.value = null
  pendingDiagnosePayload.value = null
  casePreviewImages.value = []
  followUpAnswers.value = {}
  submittingFollowUpMode.value = ''
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

.upload-spinner {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 2px solid rgba(45, 106, 79, 0.2);
  border-top-color: #2d6a4f;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
