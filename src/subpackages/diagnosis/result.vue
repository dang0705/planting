<template>
  <Layout title="诊断结果" left-action="back" background-class="bg-[#F8F6F0]">
    <view id="diagnosis-result-page" class="min-h-screen bg-[#F8F6F0] px-4 py-6">
      <view id="diagnosis-result-page-main-card" class="rounded-[12px] bg-white p-5 shadow-sm">
        <text class="mb-1 block text-lg font-bold text-gray-900">诊断结果</text>
        <text class="mb-4 block text-xs text-gray-500">查看本次诊断的结论和处理建议。</text>

        <view v-if="loading" id="diagnosis-result-page-loading" class="py-4">
          <text class="block text-sm text-gray-500">加载中...</text>
        </view>

        <view v-else-if="viewModel" id="diagnosis-result-page-result" class="space-y-3">
          <view id="diagnosis-result-page-plant">
            <text class="block text-xs text-gray-500">植物</text>
            <text class="block text-sm text-gray-900">{{ viewModel.plantName }}</text>
          </view>
          <view id="diagnosis-result-page-main-issue">
            <text class="block text-xs text-gray-500">诊断结论</text>
            <text class="block text-sm text-gray-900">{{ viewModel.mainIssue }}</text>
          </view>
          <view
            v-if="viewModel.outcomeItems.length > 1"
            id="diagnosis-result-page-outcome-list"
            class="space-y-2 rounded-[12px] bg-[#F7FAF5] p-4"
          >
            <text class="block text-xs text-gray-500">可能原因</text>
            <view class="space-y-2">
              <view
                v-for="item in viewModel.outcomeItems"
                :key="item.key"
                class="rounded-[10px] border border-gray-200 bg-white px-3 py-2"
              >
                <text class="block text-sm text-gray-900">{{ item.label }}</text>
              </view>
            </view>
          </view>
          <view v-if="viewModel.summary" id="diagnosis-result-page-summary">
            <text class="block text-xs text-gray-500">摘要</text>
            <text class="block whitespace-pre-line text-sm text-gray-700">
              {{ viewModel.summary }}
            </text>
          </view>
          <DiagnosisFeedbackCard
            :result-id="feedbackResultId"
            id-prefix="diagnosis-result-page-feedback"
          />
        </view>

        <view v-else-if="loadError" id="diagnosis-result-page-error" class="py-4 text-center">
          <text class="block text-sm text-gray-600">{{ loadError }}</text>
          <button
            id="diagnosis-result-page-retry"
            class="mt-3 rounded-full bg-[#EEF3EF] px-4 py-2 text-sm text-primary"
            @click="loadRemoteResult(routeId)"
          >
            重新加载
          </button>
        </view>

        <view v-else id="diagnosis-result-page-empty">
          <text class="block text-sm text-gray-600">暂无可展示的诊断记录。</text>
        </view>
      </view>
      <view
        v-if="!diagnosisAvailable"
        id="diagnosis-result-unavailable"
        class="mt-4 rounded-2xl bg-white p-6 text-center"
      >
        <text class="text-sm leading-6 text-[#667085]">当前端暂未开放 AI 植物诊断，敬请期待。</text>
      </view>
    </view>
    <FeatureUnavailableModal v-model="featureUnavailableVisible" :feature-key="openedFeatureKey" />
  </Layout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import DiagnosisFeedbackCard from './components/DiagnosisFeedbackCard.vue'
import { getDiagnosisResult } from './api/diagnosis.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { normalizeDiagnosisResult } from './utils/diagnose-flow.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isDiagnosisAvailable } from '@/utils/platform-capabilities.js'

const diagnoseStore = useDiagnoseStore()
const routeId = ref('')
const entrySource = ref('diagnose_tab')
const remoteResult = ref(null)
const loading = ref(false)
const loadError = ref('')
const diagnosisAvailable = computed(() => isDiagnosisAvailable(entrySource.value))
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()

onLoad(options => {
  routeId.value = String(options?.id || '')
  entrySource.value = normalizeDiagnosisEntrySource(options?.entrySource)
  if (routeId.value && diagnosisAvailable.value) {
    loadRemoteResult(routeId.value)
  }
  if (!diagnosisAvailable.value) {
    openFeatureUnavailable('diagnosis')
  }
})

function normalizeDiagnosisEntrySource(value) {
  const source = String(value || '').trim()
  return ['plant_history', 'diagnose_tab'].includes(source) ? source : 'diagnose_tab'
}

const localRecord = computed(() => {
  const list = diagnoseStore.history || []
  if (!list.length) {
    return null
  }
  if (!routeId.value) {
    return list[0]
  }
  return (
    list.find(item => {
      const diagnosis = item?.diagnosis || item
      return (
        String(item.id) === routeId.value ||
        String(item.diagnosisId || '') === routeId.value ||
        String(diagnosis?.diagnosisSessionId || '') === routeId.value ||
        String(diagnosis?.resultId || '') === routeId.value
      )
    }) || null
  )
})

const resolvedPlantName = computed(() => {
  const local = localRecord.value
  const localDiagnosis = local?.diagnosis || local
  return String(localDiagnosis?.plantName || remoteResult.value?.plantName || '植物').trim()
})

const normalizedRemoteResult = computed(() => {
  if (!remoteResult.value) {
    return null
  }
  return normalizeDiagnosisResult(remoteResult.value, {
    plantName: resolvedPlantName.value
  })
})

const normalizedLocalResult = computed(() => {
  const local = localRecord.value
  if (!local) {
    return null
  }
  return normalizeDiagnosisResult(local.diagnosis || local, {
    plantName: resolvedPlantName.value
  })
})

const viewModel = computed(() => {
  const diagnosis = normalizedRemoteResult.value || normalizedLocalResult.value
  if (!diagnosis) {
    return null
  }
  const outcomeItems = buildOutcomeDisplayItems(diagnosis)
  const leadingOutcomeDisplay = outcomeItems[0]?.label || ''
  return {
    plantName: diagnosis.plantName || '植物',
    mainIssue:
      leadingOutcomeDisplay ||
      diagnosis.mainIssueText ||
      diagnosis.finalResult?.displayNameCn ||
      diagnosis.finalResult?.displayName ||
      '待进一步确认',
    summary:
      diagnosis.summaryText ||
      diagnosis.explanation?.whatToCheckNext ||
      diagnosis.explanation?.whyItHappens ||
      diagnosis.finalResult?.summary ||
      '',
    outcomeItems
  }
})

const feedbackResultId = computed(() => {
  const diagnosis = normalizedRemoteResult.value || normalizedLocalResult.value
  return String(
    diagnosis?.resultId ||
      diagnosis?.diagnosisSessionId ||
      remoteResult.value?.resultId ||
      remoteResult.value?.diagnosisSessionId ||
      localRecord.value?.diagnosisSessionId ||
      localRecord.value?.diagnosis?.diagnosisSessionId ||
      routeId.value ||
      ''
  ).trim()
})

function normalizeOutcomeDisplayLabel(outcome = null) {
  if (typeof outcome === 'string') {
    return outcome.trim()
  }
  if (!outcome || typeof outcome !== 'object') {
    return ''
  }
  return String(
    outcome.displayNameCn ||
      outcome.displayName ||
      outcome.title ||
      outcome.problemKey ||
      outcome.outcomeKey ||
      ''
  ).trim()
}

function normalizeOutcomeDisplayKey(outcome = null, index = 0) {
  if (!outcome || typeof outcome !== 'object') {
    return String(normalizeOutcomeDisplayLabel(outcome) || `outcome_${index}`).trim()
  }
  return String(
    outcome.outcomeKey ||
      outcome.problemKey ||
      outcome.problemId ||
      normalizeOutcomeDisplayLabel(outcome) ||
      `outcome_${index}`
  ).trim()
}

function buildOutcomeDisplayItems(diagnosis = {}) {
  const visibleOutcomes =
    Array.isArray(diagnosis.visibleOutcomes) && diagnosis.visibleOutcomes.length
      ? diagnosis.visibleOutcomes
      : Array.isArray(diagnosis.finalResult?.visibleOutcomes) &&
          diagnosis.finalResult.visibleOutcomes.length
        ? diagnosis.finalResult.visibleOutcomes
        : []
  const seen = new Set()
  return visibleOutcomes
    .map((outcome, index) => {
      const label = normalizeOutcomeDisplayLabel(outcome)
      if (!label) {
        return null
      }
      const key = normalizeOutcomeDisplayKey(outcome, index)
      const dedupeKey = key || label
      if (seen.has(dedupeKey)) {
        return null
      }
      seen.add(dedupeKey)
      return {
        key: dedupeKey,
        label
      }
    })
    .filter(Boolean)
}

async function loadRemoteResult(id) {
  if (!id || loading.value) {
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    remoteResult.value = await getDiagnosisResult({ id })
  } catch (error) {
    remoteResult.value = null
    loadError.value = '暂时无法加载诊断记录，请检查网络后重试。'
  } finally {
    loading.value = false
  }
}
</script>
