<template>
  <Layout title="池外视觉审核" left-action="back" background-class="bg-[#f4efe6]">
    <!-- #ifdef H5 -->
    <view class="px-7 py-6 text-[#1f3a33]">
      <view class="mb-4 flex items-end justify-between border border-[#d8c9b4] bg-white/80 p-6">
        <view>
          <text class="block text-xs uppercase tracking-[0.28em] text-[#a56a43]"
            >Visual Audit Console</text
          >
          <text class="mt-2 block text-4xl font-semibold">池外视觉证据管理</text>
          <text class="mt-2 block max-w-4xl text-sm leading-6 text-[#597167]">
            审核 out_of_pool_symptom_candidates 与 proxy 映射，桌面端保留筛选、表格与治理操作。
          </text>
        </view>
        <view class="flex gap-2">
          <el-button @click="loadProxyMappings">刷新映射</el-button>
          <el-button type="primary" @click="loadList">刷新候选</el-button>
        </view>
      </view>

      <view class="mb-4 grid grid-cols-4 gap-3">
        <view
          v-for="card in summaryCards"
          :key="card.label"
          class="border border-[#d8c9b4] bg-white/80 p-4"
        >
          <text class="block text-xs text-[#8d745e]">{{ card.label }}</text>
          <text class="mt-1 block text-3xl font-semibold">{{ card.value }}</text>
        </view>
      </view>

      <view
        class="mb-4 grid grid-cols-[260px_1fr_auto] items-end gap-3 border border-[#d8c9b4] bg-white/80 p-4"
      >
        <view>
          <text class="mb-1 block text-xs text-[#8d745e]">审核状态</text>
          <el-segmented v-model="filters.status" :options="statusOptions" @change="applyFilters" />
        </view>
        <view>
          <text class="mb-1 block text-xs text-[#8d745e]">关键词</text>
          <el-input
            v-model="filters.keyword"
            placeholder="描述 / hint / session"
            clearable
            @keyup.enter="applyFilters"
          />
        </view>
        <view class="flex gap-2">
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" @click="applyFilters">应用</el-button>
        </view>
      </view>

      <view class="mb-4 border border-[#d8c9b4] bg-white/80 p-4">
        <view class="mb-3 flex items-center justify-between">
          <view>
            <text class="block text-2xl font-semibold">Proxy 映射管理</text>
            <text class="text-sm text-[#597167]">
              映射 {{ proxySummary.total }} 条，启用 {{ proxySummary.enabledCount }} 条，已审计
              {{ proxySummary.auditedCount }} 条。
            </text>
          </view>
          <el-button @click="resetProxyForm">清空表单</el-button>
        </view>
        <view class="mb-3 grid grid-cols-[1.2fr_1.2fr_140px_120px_120px] gap-2">
          <el-input v-model="proxyForm.mappingId" placeholder="mappingId" clearable />
          <el-input
            v-model="proxyForm.targetSymptomKey"
            placeholder="target symptom key"
            clearable
          />
          <el-select v-model="proxyForm.reviewStatus"
            ><el-option label="待审核" value="pending" /><el-option
              label="已审计"
              value="audited" /><el-option label="已拒绝" value="rejected"
          /></el-select>
          <el-input-number v-model="proxyForm.priority" :min="0" :max="999" />
          <el-switch v-model="proxyForm.enabled" active-text="启用" inactive-text="停用" />
        </view>
        <view class="mb-3 grid grid-cols-2 gap-2">
          <el-input
            v-model="proxyForm.matchTermsText"
            type="textarea"
            :rows="2"
            placeholder="匹配词，每行或逗号分隔"
          />
          <el-input
            v-model="proxyForm.rationale"
            type="textarea"
            :rows="2"
            placeholder="rationale"
          />
        </view>
        <view class="mb-3 flex justify-end">
          <el-button type="primary" :loading="proxySubmitting" @click="submitProxyMapping"
            >保存映射</el-button
          >
        </view>
        <el-table
          v-loading="proxyLoading"
          :data="proxyMappings"
          row-key="mappingId"
          border
          height="220"
        >
          <el-table-column prop="mappingId" label="映射" min-width="220" />
          <el-table-column prop="targetSymptomKey" label="target" min-width="180" />
          <el-table-column label="匹配词" min-width="260"
            ><template #default="{ row }">{{
              (row.matchTerms || []).join(', ')
            }}</template></el-table-column
          >
          <el-table-column prop="reviewStatus" label="状态" width="110" />
          <el-table-column fixed="right" label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" @click="editProxyMapping(row)">编辑</el-button>
              <el-button size="small" :disabled="!row.enabled" @click="disableProxyMapping(row)"
                >停用</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </view>

      <view class="border border-[#d8c9b4] bg-white/80 p-4">
        <text class="mb-3 block text-2xl font-semibold">候选类型列表</text>
        <el-table
          v-loading="loading"
          :data="items"
          row-key="rowKey"
          border
          height="calc(100vh - 640px)"
        >
          <el-table-column fixed type="index" label="#" width="60" :index="resolveRowIndex" />
          <el-table-column label="池外描述" min-width="280">
            <template #default="{ row }">
              <div class="flex flex-col gap-1">
                <strong>{{ row.groupCanonicalText || row.rawVisualNameCn || '未命名候选' }}</strong>
                <span class="text-xs text-gray-500">{{
                  row.rawVisualNameEn || 'no english label'
                }}</span>
                <span class="text-xs text-gray-600">{{ row.reason || '未提供原因' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="closestSymptomKeyHint" label="hint" min-width="180" />
          <el-table-column prop="reviewStatus" label="状态" width="110" />
          <el-table-column prop="sessionId" label="Session" min-width="240" />
          <el-table-column fixed="right" label="操作" width="250">
            <template #default="{ row }">
              <el-button
                size="small"
                :disabled="submittingKey === row.rowKey"
                @click="submitReview(row, 'approved')"
                >通过</el-button
              >
              <el-button
                size="small"
                :disabled="submittingKey === row.rowKey"
                @click="submitReview(row, 'ignored')"
                >忽略</el-button
              >
              <el-button size="small" @click="seedProxyFormFromCandidate(row)">建映射</el-button>
            </template>
          </el-table-column>
        </el-table>
        <view class="mt-3 flex items-center justify-between">
          <text class="text-sm text-gray-500">第 {{ page }} / {{ totalPages }} 页</text>
          <el-pagination
            background
            layout="prev, pager, next"
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            @current-change="handlePageChange"
          />
        </view>
      </view>
    </view>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <view class="p-6"
      ><view class="rounded-3xl border border-[#d8c9b4] bg-white p-5"
        ><text class="block text-xl font-bold">池外视觉证据管理</text
        ><text class="mt-2 block leading-7 text-[#61756d]">请在 Web 端打开审核台。</text></view
      ></view
    >
    <!-- #endif -->
  </Layout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import Layout from '@/Layout.vue'
import {
  requestOutOfPoolProxyMappingDisable,
  requestOutOfPoolProxyMappingList,
  requestOutOfPoolProxyMappingUpsert,
  requestOutOfPoolReviewAction,
  requestOutOfPoolReviewList
} from '@/http-functions/diagnose/out-of-pool-review.js'

const isH5Runtime = typeof window !== 'undefined'
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已忽略', value: 'ignored' }
]
const loading = ref(false)
const proxyLoading = ref(false)
const items = ref([])
const proxyMappings = ref([])
const summary = ref({ total: 0, pendingCount: 0, approvedCount: 0, ignoredCount: 0 })
const proxySummary = ref({ total: 0, enabledCount: 0, auditedCount: 0 })
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const submittingKey = ref('')
const proxySubmitting = ref(false)
const filters = ref({ status: 'all', keyword: '' })
const proxyForm = ref(createProxyForm())
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const summaryCards = computed(() => [
  { label: '待处理', value: summary.value.pendingCount },
  { label: '已通过', value: summary.value.approvedCount },
  { label: '已忽略', value: summary.value.ignoredCount },
  { label: '总类型', value: summary.value.total }
])

onMounted(() => {
  if (isH5Runtime) {
    loadList()
    loadProxyMappings()
  }
})
function createProxyForm() {
  return {
    mappingId: '',
    sourceGroupId: '',
    targetSymptomKey: '',
    matchTermsText: '',
    rationale: '',
    reviewStatus: 'pending',
    priority: 100,
    enabled: true
  }
}
function buildItemKey(item) {
  return item?.groupId || `${item.visualNormalizedImageResultId}_${item.candidateIndex}`
}
function normalizeMatchTermsText(value = '') {
  return Array.from(
    new Set(
      String(value)
        .split(/[\n,，]/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  )
}
async function loadList() {
  loading.value = true
  try {
    const data = await requestOutOfPoolReviewList({
      page: page.value,
      pageSize: pageSize.value,
      status: filters.value.status,
      keyword: filters.value.keyword
    })
    items.value = (data?.items || []).map(item => ({ ...item, rowKey: buildItemKey(item) }))
    total.value = Number(data?.total || 0)
    summary.value = {
      total: Number(data?.summary?.total || 0),
      pendingCount: Number(data?.summary?.pendingCount || 0),
      approvedCount: Number(data?.summary?.approvedCount || 0),
      ignoredCount: Number(data?.summary?.ignoredCount || 0)
    }
  } catch (error) {
    uni.showToast({ title: error?.message || '读取池外候选失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
async function loadProxyMappings() {
  proxyLoading.value = true
  try {
    const data = await requestOutOfPoolProxyMappingList({
      page: 1,
      pageSize: 100,
      reviewStatus: 'all',
      enabled: 'all'
    })
    proxyMappings.value = data?.items || []
    proxySummary.value = {
      total: Number(data?.summary?.total || 0),
      enabledCount: Number(data?.summary?.enabledCount || 0),
      auditedCount: Number(data?.summary?.auditedCount || 0)
    }
  } finally {
    proxyLoading.value = false
  }
}
function applyFilters() {
  page.value = 1
  loadList()
}
function resetFilters() {
  filters.value = { status: 'all', keyword: '' }
  applyFilters()
}
function handlePageChange(nextPage) {
  page.value = Number(nextPage || 1)
  loadList()
}
function resolveRowIndex(index = 0) {
  return (page.value - 1) * pageSize.value + Number(index || 0) + 1
}
async function submitReview(item, reviewAction) {
  submittingKey.value = item.rowKey
  try {
    await requestOutOfPoolReviewAction({
      groupId: item.groupId || '',
      visualNormalizedImageResultId: item.visualNormalizedImageResultId,
      candidateIndex: item.candidateIndex,
      reviewAction
    })
    await loadList()
  } finally {
    submittingKey.value = ''
  }
}
function resetProxyForm() {
  proxyForm.value = createProxyForm()
}
function editProxyMapping(item) {
  proxyForm.value = {
    ...createProxyForm(),
    ...item,
    matchTermsText: (item.matchTerms || []).join('\n')
  }
}
function seedProxyFormFromCandidate(item) {
  const terms = [...(item.aliases || []), item.rawVisualNameCn, item.rawVisualNameEn].filter(
    Boolean
  )
  proxyForm.value = {
    ...createProxyForm(),
    sourceGroupId: item.groupId || '',
    targetSymptomKey: item.closestSymptomKeyHint || '',
    matchTermsText: terms.join('\n'),
    rationale: item.reason || ''
  }
}
async function submitProxyMapping() {
  const matchTerms = normalizeMatchTermsText(proxyForm.value.matchTermsText)
  if (!proxyForm.value.targetSymptomKey || !matchTerms.length) {
    return
  }
  proxySubmitting.value = true
  try {
    await requestOutOfPoolProxyMappingUpsert({ ...proxyForm.value, matchTerms })
    resetProxyForm()
    await loadProxyMappings()
  } finally {
    proxySubmitting.value = false
  }
}
async function disableProxyMapping(item) {
  if (!item?.mappingId) {
    return
  }
  await requestOutOfPoolProxyMappingDisable({ mappingId: item.mappingId })
  await loadProxyMappings()
}
</script>
