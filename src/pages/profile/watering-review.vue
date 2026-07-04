<template>
  <!-- #ifdef H5 -->
  <div class="desktop-admin-page watering-review-page">
    <header class="desktop-hero">
      <div>
        <div class="hero-kicker">Watering Algorithm Audit Console</div>
        <h1 class="hero-title">浇水算法审计台</h1>
        <p class="hero-copy">
          审计 buildWateringPlanner 在 10 植物 × 6 盆型 × 4 天气 × 3 间隔 = 720 组合下的输出。
          数据来自跑批脚本，H5 端 fetch 加载；逐案例查看入参、出参、算法指标与异常标记。
        </p>
      </div>
      <div class="hero-actions">
        <el-button class="desktop-secondary-button" @click="loadData">重新加载</el-button>
      </div>
    </header>

    <section class="desktop-summary-grid">
      <article class="summary-panel">
        <span class="summary-label">总案例数</span>
        <strong class="summary-value">{{ summary.total }}</strong>
      </article>
      <article class="summary-panel summary-panel-pass">
        <span class="summary-label">通过数</span>
        <strong class="summary-value summary-value-pass">{{ summary.pass }}</strong>
      </article>
      <article class="summary-panel summary-panel-danger">
        <span class="summary-label">异常数</span>
        <strong class="summary-value summary-value-danger">{{ summary.flagged }}</strong>
      </article>
      <article class="summary-panel summary-panel-dark">
        <span class="summary-label summary-label-dark">异常率</span>
        <strong class="summary-value summary-value-dark">{{ summary.rateText }}</strong>
      </article>
    </section>

    <el-alert
      class="audit-alert"
      :title="alertTitle"
      :type="alertType"
      :description="alertDesc"
      show-icon
      :closable="false"
    />

    <section class="desktop-toolbar watering-toolbar">
      <div class="toolbar-group">
        <label class="toolbar-label">植物</label>
        <el-segmented v-model="filters.plant" :options="plantOptions" />
      </div>
      <div class="toolbar-group">
        <label class="toolbar-label">盆型</label>
        <el-segmented v-model="filters.pot" :options="potOptions" />
      </div>
      <div class="toolbar-group">
        <label class="toolbar-label">天气</label>
        <el-segmented v-model="filters.weather" :options="weatherOptions" />
      </div>
      <div class="toolbar-group">
        <label class="toolbar-label">间隔</label>
        <el-segmented v-model="filters.interval" :options="intervalOptions" />
      </div>
      <div class="toolbar-group">
        <label class="toolbar-label">异常</label>
        <el-segmented v-model="filters.audit" :options="auditOptions" />
      </div>
      <div class="toolbar-group toolbar-group-search">
        <label class="toolbar-label">关键词</label>
        <el-input
          v-model="filters.keyword"
          placeholder="reasonCode / context / caseId"
          clearable
        />
      </div>
      <div class="toolbar-actions">
        <el-button class="desktop-secondary-button" @click="resetFilters">重置</el-button>
      </div>
    </section>

    <section class="desktop-table-shell">
      <div class="desktop-table-head">
        <div>
          <h2 class="section-title">审计案例列表</h2>
          <p class="section-copy">
            共 {{ filteredCases.length }} 条命中（总 {{ summary.total }}），当前第 {{ currentPage }} 页。
            左侧序号与右侧操作列固定，便于连续审计。
          </p>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="pagedCases"
        row-key="id"
        class="desktop-admin-table"
        :height="tableHeight"
        header-row-class-name="desktop-admin-table-header"
        empty-text="没有命中案例"
      >
        <el-table-column fixed="left" label="序号" width="68" :index="resolveRowIndex" type="index" />

        <el-table-column label="植物" width="96">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ row.plant.genusCn }}</strong>
              <span class="cell-meta cell-mono">{{ row.plant.genus }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="盆型" width="132">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ row.pot.label }}</strong>
              <span class="cell-meta">{{ row.pot.potVolumeMl }} ml</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="天气" width="92">
          <template #default="{ row }">{{ row.weatherScenario.label }}</template>
        </el-table-column>

        <el-table-column label="浇水间隔" width="110">
          <template #default="{ row }">{{ row.wateringInterval.label }}</template>
        </el-table-column>

        <el-table-column label="建议水量" min-width="170">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title cell-mono">{{ formatAmount(row.plannerResult) }}</strong>
              <span class="cell-meta">{{ row.plannerResult.amountBottleText }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="下次浇水日" width="118">
          <template #default="{ row }">
            <span class="cell-mono">{{ row.plannerResult.nextWaterDate || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Gate状态" width="150">
          <template #default="{ row }">
            <el-tag
              :type="contextTagType(row.plannerResult.wateringContext)"
              effect="plain"
              round
            >
              {{ row.plannerResult.wateringContext || '—' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="reasonCodes" min-width="220">
          <template #default="{ row }">
            <div class="term-list">
              <el-tag
                v-for="code in row.plannerResult.reasonCodes"
                :key="code"
                size="small"
                type="info"
                effect="plain"
              >
                {{ code }}
              </el-tag>
              <span v-if="!row.plannerResult.reasonCodes.length" class="cell-meta">无</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="置信度" width="92">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="row.plannerResult.confidenceLevel === 'low' ? 'warning' : 'info'">
              {{ row.plannerResult.confidenceLevel }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="根区湿度" width="120">
          <template #default="{ row }">
            <el-progress
              :percentage="moisturePct(row.plannerResult.rootZoneMoistureIndex)"
              :stroke-width="8"
              :show-text="false"
              :color="moistureColor(row.plannerResult.rootZoneMoistureIndex)"
            />
            <span class="cell-meta">{{ Number(row.plannerResult.rootZoneMoistureIndex ?? 0).toFixed(2) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="审计标记" width="100">
          <template #default="{ row }">
            <el-tag
              v-if="row.auditFlags.length"
              type="danger"
              size="small"
              effect="dark"
            >
              {{ row.auditFlags.length }} 项异常
            </el-tag>
            <el-tag v-else type="success" size="small" effect="plain">✓</el-tag>
          </template>
        </el-table-column>

        <el-table-column fixed="right" label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" class="desktop-primary-button" @click="openDetail(row)">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="desktop-pagination">
        <span class="pagination-copy">第 {{ currentPage }} / {{ totalPages }} 页 · 每页 {{ pageSize }} 条</span>
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="currentPage"
          :page-size="pageSize"
          :total="filteredCases.length"
          @current-change="handlePageChange"
        />
      </div>
    </section>

    <el-drawer
      v-model="detailVisible"
      size="92vw"
      :title="detailTitle"
      direction="rtl"
      destroy-on-close
    >
      <div v-if="detailCase" class="detail-body">
        <!-- 入参 -->
        <section class="detail-section">
          <h3 class="detail-section-title">入参 · 植物信息</h3>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">genus</span><span class="detail-val cell-mono">{{ detailCase.plant.genus }}</span></div>
            <div class="detail-item"><span class="detail-key">中文名</span><span class="detail-val">{{ detailCase.plant.genusCn }}</span></div>
            <div class="detail-item"><span class="detail-key">浇水方式</span><span class="detail-val">{{ detailCase.plant.wateringStrategy.way }}</span></div>
            <div class="detail-item"><span class="detail-key">freq</span><span class="detail-val cell-mono">{{ detailCase.plant.wateringStrategy.freq.join('-') }} {{ detailCase.plant.wateringStrategy.unit }}</span></div>
            <div class="detail-item"><span class="detail-key">targetMoistureMid</span><span class="detail-val cell-mono">{{ detailCase.plant.quantization.targetMoistureMid }}</span></div>
            <div class="detail-item"><span class="detail-key">dryTolerance</span><span class="detail-val">{{ detailCase.plant.quantization.dryTolerance }}</span></div>
          </div>

          <h3 class="detail-section-title">入参 · 盆型信息</h3>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">尺寸</span><span class="detail-val cell-mono">⌀{{ detailCase.pot.potProfile.potTopDiameterCm }}/{{ detailCase.pot.potProfile.potBottomDiameterCm }}×H{{ detailCase.pot.potProfile.potHeightCm }}cm</span></div>
            <div class="detail-item"><span class="detail-key">排水孔</span><span class="detail-val">{{ detailCase.pot.potProfile.hasDrainageHole === 'true' ? '有' : '无' }}</span></div>
            <div class="detail-item"><span class="detail-key">基质</span><span class="detail-val">{{ detailCase.pot.potProfile.substrateType }}</span></div>
            <div class="detail-item"><span class="detail-key">体积</span><span class="detail-val cell-mono">{{ detailCase.pot.potVolumeMl }} ml</span></div>
          </div>

          <h3 class="detail-section-title">入参 · 天气与浇水事件</h3>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">天气场景</span><span class="detail-val">{{ detailCase.weatherScenario.label }}</span></div>
            <div class="detail-item"><span class="detail-key">浇水间隔</span><span class="detail-val">{{ detailCase.wateringInterval.label }}</span></div>
            <div class="detail-item"><span class="detail-key">上次浇水日期</span><span class="detail-val cell-mono">{{ detailCase.wateringInterval.event.date }}</span></div>
            <div class="detail-item"><span class="detail-key">上次浇水量</span><span class="detail-val cell-mono">{{ detailCase.wateringInterval.event.amount }} / {{ detailCase.wateringInterval.event.amountMl }}ml</span></div>
          </div>
        </section>

        <!-- 出参 -->
        <section class="detail-section">
          <h3 class="detail-section-title">出参 · 浇水建议</h3>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">amountRangeMl</span><span class="detail-val cell-mono">{{ formatAmount(detailCase.plannerResult) }}</span></div>
            <div class="detail-item"><span class="detail-key">amountBottleText</span><span class="detail-val">{{ detailCase.plannerResult.amountBottleText }}</span></div>
            <div class="detail-item"><span class="detail-key">nextWaterDate</span><span class="detail-val cell-mono">{{ detailCase.plannerResult.nextWaterDate || '—' }}</span></div>
            <div class="detail-item"><span class="detail-key">wateringContext</span><span class="detail-val">{{ detailCase.plannerResult.wateringContext }}</span></div>
            <div class="detail-item"><span class="detail-key">action</span><span class="detail-val cell-mono">{{ detailCase.plannerResult.action }}</span></div>
            <div class="detail-item"><span class="detail-key">stopCondition</span><span class="detail-val">{{ detailCase.plannerResult.stopCondition || '—' }}</span></div>
          </div>

          <h4 class="detail-sub-title">reasonCodes</h4>
          <div class="term-list">
            <el-tag v-for="code in detailCase.plannerResult.reasonCodes" :key="code" size="small" type="info" effect="plain">{{ code }}</el-tag>
            <span v-if="!detailCase.plannerResult.reasonCodes.length" class="cell-meta">无</span>
          </div>

          <h4 class="detail-sub-title">userDoseEcho</h4>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">doseClass</span><span class="detail-val cell-mono">{{ detailCase.plannerResult.userDoseEcho?.doseClass || '—' }}</span></div>
            <div class="detail-item"><span class="detail-key">amountMl</span><span class="detail-val cell-mono">{{ detailCase.plannerResult.userDoseEcho?.amountMl ?? '—' }}</span></div>
          </div>
        </section>

        <!-- 算法指标 -->
        <section class="detail-section">
          <h3 class="detail-section-title">算法指标</h3>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">effectiveHydrationLoad</span><span class="detail-val cell-mono">{{ Number(detailCase.plannerResult.effectiveHydrationLoad ?? 0).toFixed(3) }}</span></div>
            <div class="detail-item"><span class="detail-key">wetPressureLoad</span><span class="detail-val cell-mono">{{ Number(detailCase.plannerResult.wetPressureLoad ?? 0).toFixed(3) }}</span></div>
            <div class="detail-item"><span class="detail-key">lastEffectiveRootWateredDaysAgo</span><span class="detail-val cell-mono">{{ detailCase.plannerResult.lastEffectiveRootWateredDaysAgo ?? 'null' }}</span></div>
          </div>
          <div class="detail-moisture">
            <span class="detail-key">rootZoneMoistureIndex · {{ Number(detailCase.plannerResult.rootZoneMoistureIndex ?? 0).toFixed(3) }}</span>
            <el-progress
              :percentage="moisturePct(detailCase.plannerResult.rootZoneMoistureIndex)"
              :color="moistureColor(detailCase.plannerResult.rootZoneMoistureIndex)"
              :stroke-width="12"
            />
          </div>
        </section>

        <!-- 审计标记 -->
        <section class="detail-section">
          <h3 class="detail-section-title">审计标记详情</h3>
          <div v-if="detailCase.auditFlags.length" class="audit-flag-list">
            <div v-for="(flag, idx) in detailCase.auditFlags" :key="idx" class="audit-flag-item">
              <el-tag type="danger" size="small" effect="dark">{{ flag.code }}</el-tag>
              <span class="audit-flag-detail">{{ flag.detail }}</span>
            </div>
          </div>
          <el-alert v-else type="success" title="无异常标记" :closable="false" show-icon />
        </section>
      </div>
    </el-drawer>
  </div>
  <!-- #endif -->

  <!-- #ifndef H5 -->
  <view class="mobile-admin-fallback">
    <view class="mobile-admin-card">
      <text class="mobile-admin-title">浇水算法审计台</text>
      <text class="mobile-admin-copy">
        该审计页已切到桌面端 H5 控制台，请在 Web 端打开以查看 720 组跑批案例的固定表头、筛选与详情抽屉。
      </text>
    </view>
  </view>
  <!-- #endif -->
</template>

<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
// #ifdef H5
import { ElMessage } from 'element-plus'
// #endif

const isH5Runtime = typeof window !== 'undefined'

const BATCH_URL = '/test/batch-results/watering-batch-results.json'

const loading = ref(false)
const rawCases = ref([])
const batchMeta = ref({ generatedAt: '', referenceDate: '', flagSummary: {} })

const filters = reactive({
  plant: 'all',
  pot: 'all',
  weather: 'all',
  interval: 'all',
  audit: 'all',
  keyword: ''
})

const currentPage = ref(1)
const pageSize = 20

const detailVisible = ref(false)
const detailCase = ref(null)

const plantOptions = computed(() => [
  { label: '全部', value: 'all' },
  ...rawCases.value.length
    ? [...new Set(rawCases.value.map(c => c.plant.genusCn))].map(name => ({ label: name, value: name }))
    : [
        { label: '荷花', value: '荷花' },
        { label: '肾蕨', value: '肾蕨' },
        { label: '竹芋', value: '竹芋' },
        { label: '龟背竹', value: '龟背竹' },
        { label: '镜面草', value: '镜面草' },
        { label: '龙血树', value: '龙血树' },
        { label: '金钱树', value: '金钱树' },
        { label: '十二卷', value: '十二卷' },
        { label: '金琥', value: '金琥' },
        { label: '生石花', value: '生石花' }
      ]
])

const potOptions = computed(() => [
  { label: '全部', value: 'all' },
  ...rawCases.value.length
    ? [...new Set(rawCases.value.map(c => c.pot.label))].map(label => ({ label, value: label }))
    : []
])

const weatherOptions = computed(() => [
  { label: '全部', value: 'all' },
  ...rawCases.value.length
    ? [...new Set(rawCases.value.map(c => c.weatherScenario.label))].map(label => ({ label, value: label }))
    : []
])

const intervalOptions = computed(() => [
  { label: '全部', value: 'all' },
  ...rawCases.value.length
    ? [...new Set(rawCases.value.map(c => c.wateringInterval.label))].map(label => ({ label, value: label }))
    : []
])

const auditOptions = [
  { label: '全部', value: 'all' },
  { label: '仅异常', value: 'flagged' },
  { label: '仅正常', value: 'pass' }
]

const summary = computed(() => {
  const total = rawCases.value.length
  const flagged = rawCases.value.filter(c => c.auditFlags && c.auditFlags.length).length
  const pass = total - flagged
  const rate = total ? (flagged / total) * 100 : 0
  return { total, pass, flagged, rateText: `${rate.toFixed(1)}%` }
})

const filteredCases = computed(() => {
  const kw = filters.keyword.trim().toLowerCase()
  return rawCases.value.filter(c => {
    if (filters.plant !== 'all' && c.plant.genusCn !== filters.plant) return false
    if (filters.pot !== 'all' && c.pot.label !== filters.pot) return false
    if (filters.weather !== 'all' && c.weatherScenario.label !== filters.weather) return false
    if (filters.interval !== 'all' && c.wateringInterval.label !== filters.interval) return false
    if (filters.audit === 'flagged' && !(c.auditFlags && c.auditFlags.length)) return false
    if (filters.audit === 'pass' && c.auditFlags && c.auditFlags.length) return false
    if (kw) {
      const hay = [
        c.id,
        c.plannerResult?.wateringContext,
        ...(c.plannerResult?.reasonCodes || [])
      ].join(' ').toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredCases.value.length / pageSize))
)

const pagedCases = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredCases.value.slice(start, start + pageSize)
})

const tableHeight = computed(() => 'calc(100vh - 420px)')

const alertType = computed(() => {
  const rate = summary.value.flagged / (summary.value.total || 1)
  if (rate >= 0.2) {return 'error'}
  if (rate >= 0.1) {return 'warning'}
  return 'success'
})

const alertTitle = computed(() => {
  const r = summary.value
  return `审计完成：${r.total} 案例，${r.flagged} 异常（${r.rateText}）`
})

const alertDesc = computed(() => {
  const fs = batchMeta.value.flagSummary
  if (!fs || !Object.keys(fs).length) return '所有案例均通过审计规则。'
  return '异常分布：' + Object.entries(fs).map(([k, v]) => `${k}×${v}`).join('，') + '。'
})

const detailTitle = computed(() =>
  detailCase.value ? `案例详情 · ${detailCase.value.id}` : '案例详情'
)

onMounted(() => {
  if (isH5Runtime) loadData()
})

async function loadData() {
  loading.value = true
  try {
    const res = await fetch(BATCH_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    rawCases.value = Array.isArray(data.cases) ? data.cases : []
    batchMeta.value = {
      generatedAt: data.generatedAt || '',
      referenceDate: data.referenceDate || '',
      flagSummary: data.flagSummary || {}
    }
    currentPage.value = 1
    showMessage(`已加载 ${rawCases.value.length} 条案例`, 'success')
  } catch (error) {
    showMessage(error?.message || '加载跑批数据失败，请先运行跑批脚本', 'error')
    rawCases.value = []
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.plant = 'all'
  filters.pot = 'all'
  filters.weather = 'all'
  filters.interval = 'all'
  filters.audit = 'all'
  filters.keyword = ''
  currentPage.value = 1
}

function handlePageChange(next) {
  currentPage.value = Number(next || 1)
}

function resolveRowIndex(index = 0) {
  return (currentPage.value - 1) * pageSize + Number(index || 0) + 1
}

function openDetail(row) {
  detailCase.value = row
  detailVisible.value = true
}

function formatAmount(result) {
  if (!result) return '—'
  const [lo, hi] = result.amountRangeMl || [0, 0]
  if (lo === 0 && hi === 0) return '0 ml'
  return `${lo}–${hi} ml`
}

function contextTagType(ctx) {
  if (ctx === 'likely_too_wet') return 'danger'
  if (ctx === 'likely_too_dry') return 'warning'
  if (ctx === 'keep_baseline_or_check_soil') return 'success'
  return 'info'
}

function moisturePct(val) {
  const n = Number(val ?? 0)
  if (isNaN(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n * 100)))
}

function moistureColor(val) {
  const n = Number(val ?? 0)
  if (n >= 0.75) return '#a56a43'
  if (n >= 0.45) return '#4a7c59'
  return '#b06b3f'
}

function showMessage(message, type = 'info') {
  // #ifdef H5
  ElMessage({ message, type })
  // #endif
  // #ifndef H5
  uni.showToast({ title: String(message || ''), icon: type === 'success' ? 'success' : 'none' })
  // #endif
}
</script>

<style scoped>
/* #ifdef H5 */
.desktop-admin-page {
  --desktop-sans-font: 'PingFang SC', 'Noto Sans SC', 'Helvetica Neue', Arial, sans-serif;
  --desktop-serif-font: 'STSong', 'Songti SC', 'Noto Serif SC', Georgia, serif;
  --desktop-mono-font: 'SFMono-Regular', 'Menlo', 'Monaco', 'Courier New', monospace;
  min-height: 100vh; padding: 28px; color: #1f3a33; font-family: var(--desktop-sans-font);
  background:
    radial-gradient(circle at top left, rgba(165,106,67,0.08), transparent 24%),
    linear-gradient(180deg, #f4efe6 0%, #f7f4ed 100%);
}
.desktop-hero, .desktop-toolbar, .desktop-table-shell, .audit-alert { max-width: 1520px; margin: 0 auto 18px; }
.desktop-hero {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;
  padding: 30px 32px 22px; border: 1px solid #d8c9b4;
  background: rgba(247,250,248,0.78); box-shadow: 0 18px 40px rgba(31,58,51,0.06);
}
.hero-kicker { font-size: 11px; letter-spacing: 0.34em; text-transform: uppercase; color: #a56a43; }
.hero-title, .section-title { margin: 10px 0 0; font-family: var(--desktop-serif-font); font-weight: 400; }
.hero-title { font-size: 42px; line-height: 1.04; }
.hero-copy, .section-copy { max-width: 820px; margin: 12px 0 0; line-height: 1.75; color: #597167; }
.hero-actions, .row-actions, .toolbar-actions { display: flex; gap: 10px; align-items: center; }
.desktop-summary-grid { max-width: 1520px; margin: 0 auto 18px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
.summary-panel { border: 1px solid #d8c9b4; background: rgba(255,251,244,0.92); padding: 18px 20px; }
.summary-panel-pass { border-color: #4a7c59; background: rgba(236,246,239,0.92); }
.summary-panel-danger { border-color: #b06b3f; background: rgba(250,238,230,0.92); }
.summary-panel-dark { background: #1f3a33; border-color: #1f3a33; }
.summary-label { display: block; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #8d745e; }
.summary-label-dark { color: rgba(255,255,255,0.68); }
.summary-value { display: block; margin-top: 8px; font-family: var(--desktop-serif-font); font-weight: 400; color: #1f3a33; font-size: 40px; }
.summary-value-pass { color: #2c5e3f; }
.summary-value-danger { color: #a04020; }
.summary-value-dark { color: #fff; }
.audit-alert { margin-bottom: 18px; }
.desktop-toolbar, .desktop-table-shell { border: 1px solid #d8c9b4; background: rgba(247,250,248,0.82); box-shadow: 0 18px 40px rgba(31,58,51,0.05); }
.watering-toolbar { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)) minmax(0,1.2fr) 160px; gap: 16px; align-items: end; padding: 22px 24px; }
.toolbar-group { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.toolbar-group-search { min-width: 0; }
.toolbar-label { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #8d745e; }
.desktop-table-shell { padding: 22px 24px 18px; }
.desktop-table-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
.section-title { font-size: 30px; }
:deep(.desktop-admin-table) {
  width: 100%;
  --el-table-header-bg-color: #efe5d6; --el-table-border-color: #dcccb8;
  --el-table-row-hover-bg-color: #f8f2e7; --el-table-text-color: #314940;
}
:deep(.desktop-admin-table .el-table__cell) { padding: 12px 0; }
:deep(.desktop-admin-table-header th) { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8d745e; }
.cell-stack { display: flex; flex-direction: column; gap: 4px; }
.cell-title { color: #1f3a33; font-weight: 600; line-height: 1.6; }
.cell-meta { color: #61756d; font-size: 12px; line-height: 1.6; }
.cell-copy { color: #40554d; font-size: 13px; line-height: 1.72; }
.cell-mono { font-family: var(--desktop-mono-font); font-size: 12px; word-break: break-all; }
.term-list { display: flex; flex-wrap: wrap; gap: 6px; }
.desktop-pagination { margin-top: 18px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.pagination-copy { color: #61756d; font-size: 13px; }
.desktop-primary-button, .desktop-secondary-button { border-radius: 0 !important; font-weight: 600; }
.desktop-primary-button {
  --el-button-bg-color: #1f3a33; --el-button-border-color: #1f3a33;
  --el-button-hover-bg-color: #2c4d44; --el-button-hover-border-color: #2c4d44;
  --el-button-active-bg-color: #183029; --el-button-active-border-color: #183029;
  --el-button-text-color: #fff;
}
.desktop-secondary-button {
  --el-button-bg-color: #fffaf2; --el-button-border-color: #d8c9b4; --el-button-text-color: #395247;
  --el-button-hover-bg-color: #f1e5d5; --el-button-hover-border-color: #c9b08c;
}
.detail-body { padding: 0 8px 24px; }
.detail-section { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e4dccd; }
.detail-section:last-child { border-bottom: none; }
.detail-section-title { margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #1f3a33; }
.detail-sub-title { margin: 16px 0 8px; font-size: 13px; font-weight: 600; color: #597167; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px 20px; }
.detail-item { display: flex; flex-direction: column; gap: 2px; }
.detail-key { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #8d745e; }
.detail-val { color: #1f3a33; font-size: 14px; line-height: 1.6; }
.detail-moisture { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.audit-flag-list { display: flex; flex-direction: column; gap: 10px; }
.audit-flag-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid #e8c9b8; background: rgba(250,238,230,0.6); }
.audit-flag-detail { font-size: 13px; color: #5a4030; line-height: 1.6; }
@media (max-width: 1280px) {
  .desktop-summary-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .watering-toolbar { grid-template-columns: 1fr 1fr; }
}
/* #endif */
/* #ifndef H5 */
.mobile-admin-fallback { min-height: 100vh; padding: 24px; background: #f4efe6; }
.mobile-admin-card { border-radius: 24px; border: 1px solid #d8c9b4; background: #fffaf2; padding: 24px 20px; }
.mobile-admin-title { display: block; color: #1f3a33; font-size: 22px; font-weight: 700; }
.mobile-admin-copy { display: block; margin-top: 12px; color: #61756d; line-height: 1.8; }
/* #endif */
</style>
