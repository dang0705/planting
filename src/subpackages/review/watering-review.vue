<template>
  <Layout
    title="浇水算法审计"
    left-action="back"
    background-class="bg-[#f4efe6]"
    content-class="min-h-screen"
  >
    <!-- #ifdef H5 -->
    <view class="px-7 py-6 text-[#1f3a33]">
      <view
        class="mb-4 flex items-end justify-between gap-4 border border-[#d8c9b4] bg-white/80 p-6"
      >
        <view>
          <text class="block text-xs uppercase tracking-[0.28em] text-[#a56a43]">
            Watering Algorithm Audit Console
          </text>
          <text class="mt-2 block text-4xl font-semibold">浇水算法审计台</text>
          <text class="mt-2 block max-w-4xl text-sm leading-6 text-[#597167]">
            审计跑批结果中的建议水量、下次浇水日、Gate 状态和异常标记，保留桌面端高密度表格。
          </text>
        </view>
        <el-button @click="loadData">重新加载</el-button>
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
        class="mb-4 grid grid-cols-[repeat(5,minmax(0,1fr))_1.3fr_auto] items-end gap-3 border border-[#d8c9b4] bg-white/80 p-4"
      >
        <view v-for="filter in segmentedFilters" :key="filter.key" class="min-w-0">
          <text class="mb-1 block text-xs text-[#8d745e]">{{ filter.label }}</text>
          <el-segmented v-model="filters[filter.key]" :options="filter.options" />
        </view>
        <view>
          <text class="mb-1 block text-xs text-[#8d745e]">关键词</text>
          <el-input
            v-model="filters.keyword"
            placeholder="caseId / reasonCode / context"
            clearable
          />
        </view>
        <el-button @click="resetFilters">重置</el-button>
      </view>

      <view class="border border-[#d8c9b4] bg-white/80 p-4">
        <view class="mb-3 flex items-end justify-between">
          <view>
            <text class="block text-2xl font-semibold">审计案例列表</text>
            <text class="text-sm text-[#597167]">
              命中 {{ filteredCases.length }} / {{ rawCases.length }} 条，第 {{ currentPage }} 页。
            </text>
          </view>
        </view>
        <el-table
          v-loading="loading"
          :data="pagedCases"
          row-key="id"
          height="calc(100vh - 430px)"
          border
          empty-text="没有命中案例"
        >
          <el-table-column fixed type="index" label="#" width="60" :index="resolveRowIndex" />
          <el-table-column label="植物" width="120">
            <template #default="{ row }">
              <div class="flex flex-col">
                <strong>{{ row.plant?.genusCn }}</strong>
                <span class="font-mono text-xs text-gray-500">{{ row.plant?.genus }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="pot.label" label="盆型" width="130" />
          <el-table-column prop="weatherScenario.label" label="天气" width="110" />
          <el-table-column prop="wateringInterval.label" label="间隔" width="110" />
          <el-table-column label="建议水量" min-width="170">
            <template #default="{ row }">{{ formatAmount(row.plannerResult) }}</template>
          </el-table-column>
          <el-table-column prop="plannerResult.nextWaterDate" label="下次浇水" width="120" />
          <el-table-column prop="plannerResult.wateringContext" label="Gate" width="190" />
          <el-table-column label="reasonCodes" min-width="260">
            <template #default="{ row }">{{
              (row.plannerResult?.reasonCodes || []).join(', ') || '无'
            }}</template>
          </el-table-column>
          <el-table-column fixed="right" label="异常" width="90">
            <template #default="{ row }">
              <el-tag :type="row.auditFlags?.length ? 'danger' : 'success'">
                {{ row.auditFlags?.length ? `${row.auditFlags.length} 项` : '通过' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <view class="mt-3 flex items-center justify-between">
          <text class="text-sm text-gray-500">每页 {{ pageSize }} 条</text>
          <el-pagination
            background
            layout="prev, pager, next"
            :current-page="currentPage"
            :page-size="pageSize"
            :total="filteredCases.length"
            @current-change="currentPage = $event"
          />
        </view>
      </view>
    </view>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <view class="p-6">
      <view class="rounded-3xl border border-[#d8c9b4] bg-white p-5">
        <text class="block text-xl font-bold text-[#1f3a33]">浇水算法审计台</text>
        <text class="mt-2 block leading-7 text-[#61756d]">请在 Web 端打开以查看跑批审计表格。</text>
      </view>
    </view>
    <!-- #endif -->
  </Layout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import Layout from '@/Layout.vue'

const BATCH_URL = '/test/batch-results/watering-batch-results.json'
const isH5Runtime = typeof window !== 'undefined'
const loading = ref(false)
const rawCases = ref([])
const currentPage = ref(1)
const pageSize = 20
const filters = reactive({
  plant: 'all',
  pot: 'all',
  weather: 'all',
  interval: 'all',
  audit: 'all',
  keyword: ''
})

const optionFrom = (items, resolver) => [
  { label: '全部', value: 'all' },
  ...Array.from(new Set(items.map(resolver).filter(Boolean))).map(value => ({
    label: value,
    value
  }))
]
const plantOptions = computed(() => optionFrom(rawCases.value, row => row.plant?.genusCn))
const potOptions = computed(() => optionFrom(rawCases.value, row => row.pot?.label))
const weatherOptions = computed(() => optionFrom(rawCases.value, row => row.weatherScenario?.label))
const intervalOptions = computed(() =>
  optionFrom(rawCases.value, row => row.wateringInterval?.label)
)
const auditOptions = [
  { label: '全部', value: 'all' },
  { label: '仅异常', value: 'flagged' },
  { label: '仅正常', value: 'pass' }
]
const segmentedFilters = computed(() => [
  { key: 'plant', label: '植物', options: plantOptions.value },
  { key: 'pot', label: '盆型', options: potOptions.value },
  { key: 'weather', label: '天气', options: weatherOptions.value },
  { key: 'interval', label: '间隔', options: intervalOptions.value },
  { key: 'audit', label: '异常', options: auditOptions }
])
const summary = computed(() => {
  const total = rawCases.value.length
  const flagged = rawCases.value.filter(row => row.auditFlags?.length).length
  return {
    total,
    pass: total - flagged,
    flagged,
    rate: total ? `${((flagged / total) * 100).toFixed(1)}%` : '0.0%'
  }
})
const summaryCards = computed(() => [
  { label: '总案例数', value: summary.value.total },
  { label: '通过数', value: summary.value.pass },
  { label: '异常数', value: summary.value.flagged },
  { label: '异常率', value: summary.value.rate }
])
const filteredCases = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return rawCases.value.filter(row => {
    if (filters.plant !== 'all' && row.plant?.genusCn !== filters.plant) {
      return false
    }
    if (filters.pot !== 'all' && row.pot?.label !== filters.pot) {
      return false
    }
    if (filters.weather !== 'all' && row.weatherScenario?.label !== filters.weather) {
      return false
    }
    if (filters.interval !== 'all' && row.wateringInterval?.label !== filters.interval) {
      return false
    }
    if (filters.audit === 'flagged' && !row.auditFlags?.length) {
      return false
    }
    if (filters.audit === 'pass' && row.auditFlags?.length) {
      return false
    }
    if (!keyword) {
      return true
    }
    return [row.id, row.plannerResult?.wateringContext, ...(row.plannerResult?.reasonCodes || [])]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
})
const pagedCases = computed(() =>
  filteredCases.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize)
)

onMounted(() => {
  if (isH5Runtime) {
    loadData()
  }
})

async function loadData() {
  loading.value = true
  try {
    const response = await fetch(BATCH_URL)
    const data = response.ok ? await response.json() : {}
    rawCases.value = Array.isArray(data.cases) ? data.cases : []
    currentPage.value = 1
  } catch (error) {
    rawCases.value = []
    uni.showToast({ title: error?.message || '加载跑批数据失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
function resetFilters() {
  Object.assign(filters, {
    plant: 'all',
    pot: 'all',
    weather: 'all',
    interval: 'all',
    audit: 'all',
    keyword: ''
  })
  currentPage.value = 1
}
function resolveRowIndex(index = 0) {
  return (currentPage.value - 1) * pageSize + Number(index || 0) + 1
}
function formatAmount(result = {}) {
  const [lo, hi] = result.amountRangeMl || [0, 0]
  return lo || hi ? `${lo}-${hi} ml` : '0 ml'
}
</script>
