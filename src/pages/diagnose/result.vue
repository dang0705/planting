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
          <view id="diagnosis-result-page-stage">
            <text class="block text-xs text-gray-500">当前阶段</text>
            <text class="block text-sm text-gray-900">{{ viewModel.stage }}</text>
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
        </view>

        <view v-else id="diagnosis-result-page-empty">
          <text class="block text-sm text-gray-600">暂无可展示的诊断记录。</text>
        </view>
      </view>
    </view>
  </Layout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import { getDiagnosisResult } from '@/api/plants-http.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { normalizeDiagnosisResult } from '@/utils/diagnose-flow.js'

const diagnoseStore = useDiagnoseStore()
const routeId = ref('')
const remoteResult = ref(null)
const loading = ref(false)

onLoad(options => {
  routeId.value = String(options?.id || '')
  if (routeId.value) {
    loadRemoteResult(routeId.value)
  }
})

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
    }) || list[0]
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
    stage: diagnosis.stage || 'unknown',
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
  loading.value = true
  try {
    remoteResult.value = await getDiagnosisResult({ id })
  } catch (error) {
    console.warn('加载远程诊断结果失败，回退本地记录:', error)
  } finally {
    loading.value = false
  }
}
</script>
