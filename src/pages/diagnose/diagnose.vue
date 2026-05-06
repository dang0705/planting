<template>
  <view class="min-h-screen bg-[#F8F6F0] px-4 py-6">
    <view class="bg-white rounded-3xl p-5 shadow-sm">
      <text class="block text-lg font-bold text-gray-900 mb-1">诊断结果承接页</text>
      <text class="block text-xs text-gray-500 mb-4">
        主诊断流程已收敛到首页弹窗 DiagnosePopup，本页仅展示只读结果。
      </text>

      <view v-if="loading" class="py-4">
        <text class="block text-sm text-gray-500">加载中...</text>
      </view>

      <view v-else-if="viewModel" class="space-y-3">
        <view>
          <text class="block text-xs text-gray-500">植物</text>
          <text class="block text-sm text-gray-900">{{ viewModel.plantName }}</text>
        </view>
        <view>
          <text class="block text-xs text-gray-500">当前阶段</text>
          <text class="block text-sm text-gray-900">{{ viewModel.stage }}</text>
        </view>
        <view>
          <text class="block text-xs text-gray-500">主结论</text>
          <text class="block text-sm text-gray-900">
            {{ viewModel.mainIssue }}
          </text>
        </view>
        <view v-if="viewModel.summary">
          <text class="block text-xs text-gray-500">摘要</text>
          <text class="block text-sm text-gray-700 whitespace-pre-line">
            {{ viewModel.summary }}
          </text>
        </view>
      </view>

      <view v-else>
        <text class="block text-sm text-gray-600">暂无可展示的诊断记录。</text>
      </view>
    </view>

    <button class="w-full mt-4 bg-primary text-white font-semibold py-3 rounded-2xl" @click="goHome">
      返回首页继续诊断
    </button>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { getDiagnosisResult } from '@/api/plants-http.js'

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
  if (!list.length) return null
  if (!routeId.value) return list[0]
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

const viewModel = computed(() => {
  if (remoteResult.value) {
    const local = localRecord.value
    const localDiagnosis = local?.diagnosis || local
    return {
      plantName: localDiagnosis?.plantName || '植物',
      stage: remoteResult.value?.stage || 'final',
      mainIssue: remoteResult.value?.finalResult?.displayName || '待进一步确认',
      summary:
        remoteResult.value?.finalResult?.summary ||
        remoteResult.value?.explanation?.whatToCheckNext ||
        remoteResult.value?.explanation?.whyItHappens ||
        ''
    }
  }

  const local = localRecord.value
  if (!local) return null

  const diagnosis = local.diagnosis || local
  return {
    plantName: diagnosis?.plantName || '植物',
    stage: diagnosis?.stage || 'unknown',
    mainIssue: diagnosis?.mainIssueText || diagnosis?.finalResult?.displayName || '待进一步确认',
    summary: diagnosis?.summaryText || diagnosis?.finalResult?.summary || ''
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
