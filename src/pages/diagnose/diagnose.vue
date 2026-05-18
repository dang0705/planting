<template>
  <view id="diagnosis-result-page" class="min-h-screen bg-[#F8F6F0] px-4 py-6">
    <view id="diagnosis-result-page-main-card" class="bg-white rounded-3xl p-5 shadow-sm">
      <text class="block text-lg font-bold text-gray-900 mb-1">诊断结果承接页</text>
      <text class="block text-xs text-gray-500 mb-4">
        主诊断流程已收敛到首页弹窗 DiagnosePopup，本页仅展示只读结果。
      </text>

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
          <text class="block text-sm text-gray-900">
            {{ viewModel.mainIssue }}
          </text>
        </view>
        <view
          v-if="viewModel.outcomeItems.length"
          id="diagnosis-result-page-outcome-list"
          class="rounded-2xl bg-[#F7FAF5] p-4 space-y-2"
        >
          <text class="block text-xs text-gray-500">诊断结论</text>
          <view class="space-y-2">
            <view
              v-for="item in viewModel.outcomeItems"
              :key="item.key"
              class="rounded-xl bg-white px-3 py-2 border border-gray-200"
            >
              <text class="block text-sm text-gray-900">{{ item.label }}</text>
            </view>
          </view>
        </view>
        <view v-if="viewModel.summary" id="diagnosis-result-page-summary">
          <text class="block text-xs text-gray-500">摘要</text>
          <text class="block text-sm text-gray-700 whitespace-pre-line">
            {{ viewModel.summary }}
          </text>
        </view>
      </view>

      <view v-else id="diagnosis-result-page-empty">
        <text class="block text-sm text-gray-600">暂无可展示的诊断记录。</text>
      </view>
    </view>

    <button id="diagnosis-result-page-home-button" class="w-full mt-4 bg-primary text-white font-semibold py-3 rounded-2xl" @click="goHome">
      返回首页继续诊断
    </button>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { getDiagnosisResult } from '@/api/plants-http.js'
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
  if (!list.length) {return null}
  if (!routeId.value) {return list[0]}
  return (
    list.find(item => {
      const diagnosis = item?.diagnosis || item
      return (
        String(item.id) === routeId.value ||
        String(item.diagnosisId || '') === routeId.value ||
        String(diagnosis?.diagnosisSessionId || '') === routeId.value ||
        String(diagnosis?.resultId || '') === routeId.value
      )
    }) ||
    list[0]
  )
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
  const primaryOutcome = diagnosis.primaryOutcome || diagnosis.finalResult?.primaryOutcome || null
  const primaryKey = normalizeOutcomeDisplayKey(primaryOutcome)
  const visibleOutcomes = Array.isArray(diagnosis.visibleOutcomes) && diagnosis.visibleOutcomes.length
    ? diagnosis.visibleOutcomes
    : Array.isArray(diagnosis.finalResult?.visibleOutcomes) && diagnosis.finalResult.visibleOutcomes.length
      ? diagnosis.finalResult.visibleOutcomes
      : [
          primaryOutcome,
          ...(
            Array.isArray(diagnosis.secondaryOutcomes)
              ? diagnosis.secondaryOutcomes
              : Array.isArray(diagnosis.finalResult?.secondaryOutcomes)
                ? diagnosis.finalResult.secondaryOutcomes
                : []
          )
        ]

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
        label,
        isPrimary: key && key === primaryKey
      }
    })
    .filter(Boolean)
}

const resolvedPlantName = computed(() => {
  const local = localRecord.value
  const localDiagnosis = local?.diagnosis || local
  return String(
    localDiagnosis?.plantName ||
      remoteResult.value?.plantName ||
      '植物'
  ).trim()
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
  const primaryOutcomeDisplay =
    outcomeItems.find(item => item.isPrimary)?.label ||
    normalizeOutcomeDisplayLabel(diagnosis.primaryOutcome || diagnosis.finalResult?.primaryOutcome)

  return {
    plantName: diagnosis.plantName || '植物',
    stage: diagnosis.stage || 'unknown',
    mainIssue:
      primaryOutcomeDisplay ||
      outcomeItems[0]?.label ||
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

function goHome() {
  uni.switchTab({
    url: '/pages/index/index'
  })
}
</script>

<style scoped>
.whitespace-pre-line {
  white-space: pre-line;
}
</style>
