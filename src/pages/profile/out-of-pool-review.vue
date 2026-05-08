<template>
  <!-- #ifdef H5 -->
  <div class="desktop-admin-page out-of-pool-admin-page">
    <header class="desktop-hero">
      <div>
        <div class="hero-kicker">Visual Audit Console</div>
        <h1 class="hero-title">池外视觉证据管理</h1>
        <p class="hero-copy">
          管理 `visual_normalized_image_results` 中的 `out_of_pool_symptom_candidates`。
          它们是扩池线索，不是正式视觉证据，审核目标是把噪声和可保留候选分开。
        </p>
      </div>
      <div class="hero-actions">
        <el-button class="desktop-secondary-button" @click="loadList">刷新列表</el-button>
      </div>
    </header>

    <section class="desktop-summary-grid">
      <article class="summary-panel">
        <span class="summary-label">待处理</span>
        <strong class="summary-value">{{ summary.pendingCount }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">已通过</span>
        <strong class="summary-value">{{ summary.approvedCount }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">已忽略</span>
        <strong class="summary-value">{{ summary.ignoredCount }}</strong>
      </article>
      <article class="summary-panel summary-panel-dark">
          <span class="summary-label summary-label-dark">总类型</span>
          <strong class="summary-value summary-value-dark">{{ summary.total }}</strong>
      </article>
    </section>

    <section class="desktop-toolbar">
      <div class="toolbar-group">
        <label class="toolbar-label">审核状态</label>
        <el-segmented v-model="filters.status" :options="statusOptions" @change="applyFilters" />
      </div>
      <div class="toolbar-group toolbar-group-search">
        <label class="toolbar-label">关键词</label>
        <el-input
          v-model="filters.keyword"
          placeholder="原始描述 / hint / session"
          clearable
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="toolbar-actions">
        <el-button class="desktop-secondary-button" @click="resetFilters">重置</el-button>
        <el-button class="desktop-primary-button" @click="applyFilters">应用</el-button>
      </div>
    </section>

    <section class="desktop-table-shell proxy-mapping-shell">
      <div class="desktop-table-head proxy-mapping-head">
        <div>
          <h2 class="section-title">Proxy 映射管理</h2>
          <p class="section-copy">
            管理池外对象到池内 closest symptom 的治理数据。只有 enabled 且 audited 的映射会被诊断 runtime 读取。
          </p>
          <p class="section-copy proxy-summary-copy">
            映射 {{ proxySummary.total }} 条，启用 {{ proxySummary.enabledCount }} 条，已审计 {{ proxySummary.auditedCount }} 条。
          </p>
        </div>
        <el-button class="desktop-secondary-button" @click="loadProxyMappings">刷新映射</el-button>
      </div>

      <div class="proxy-mapping-editor">
        <div class="proxy-editor-grid">
          <el-input
            v-model="proxyForm.mappingId"
            placeholder="mappingId 留空则自动生成"
            clearable
          />
          <el-input
            v-model="proxyForm.targetSymptomKey"
            placeholder="target symptom key，例如 yellow_speckling"
            clearable
          />
          <el-select v-model="proxyForm.reviewStatus" placeholder="审核状态">
            <el-option label="待审核" value="pending" />
            <el-option label="已审计" value="audited" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
          <el-input-number v-model="proxyForm.priority" :min="0" :max="999" controls-position="right" />
          <el-switch
            v-model="proxyForm.enabled"
            active-text="启用"
            inactive-text="停用"
          />
        </div>
        <el-input
          v-model="proxyForm.matchTermsText"
          type="textarea"
          :rows="2"
          placeholder="匹配词，每行或逗号分隔。不要在代码里 hardcode，这里是后台治理数据。"
        />
        <el-input
          v-model="proxyForm.rationale"
          type="textarea"
          :rows="2"
          placeholder="rationale：说明为什么该池外对象可代理到这个 closest symptom"
        />
        <div class="proxy-editor-actions">
          <el-button class="desktop-secondary-button" @click="resetProxyForm">清空</el-button>
          <el-button
            class="desktop-primary-button"
            :loading="proxySubmitting"
            @click="submitProxyMapping"
          >
            保存映射
          </el-button>
        </div>
      </div>

      <el-table
        v-loading="proxyLoading"
        :data="proxyMappings"
        row-key="mappingId"
        class="desktop-admin-table proxy-mapping-table"
        header-row-class-name="desktop-admin-table-header"
        empty-text="当前没有 proxy 映射"
      >
        <el-table-column label="映射" min-width="260">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title cell-mono">{{ row.mappingId }}</strong>
              <span class="cell-meta cell-mono">target: {{ row.targetSymptomKey }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="匹配词" min-width="260">
          <template #default="{ row }">
            <div class="term-list">
              <el-tag
                v-for="term in row.matchTerms"
                :key="term"
                size="small"
                effect="plain"
              >
                {{ term }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="170">
          <template #default="{ row }">
            <div class="cell-stack">
              <el-tag :type="row.reviewStatus === 'audited' ? 'success' : row.reviewStatus === 'rejected' ? 'danger' : 'warning'" effect="plain">
                {{ proxyStatusTextMap[row.reviewStatus] || row.reviewStatus }}
              </el-tag>
              <span class="cell-meta">{{ row.enabled ? 'enabled' : 'disabled' }} · P{{ row.priority }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="cell-copy">{{ row.rationale || '未填写 rationale' }}</span>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" class="desktop-secondary-button" @click="editProxyMapping(row)">
                编辑
              </el-button>
              <el-button
                size="small"
                class="desktop-secondary-button"
                :disabled="!row.enabled"
                @click="disableProxyMapping(row)"
              >
                停用
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="desktop-table-shell">
      <div class="desktop-table-head">
        <div>
          <h2 class="section-title">候选类型列表</h2>
          <p class="section-copy">
            当前第 {{ page }} 页，共 {{ total }} 类；覆盖 {{ summary.occurrenceTotal }} 条原始池外候选。操作列固定，方便连续审核。
          </p>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="items"
        row-key="rowKey"
        class="desktop-admin-table"
        :height="tableHeight"
        header-row-class-name="desktop-admin-table-header"
        empty-text="当前没有池外候选"
      >
        <el-table-column fixed="left" label="序号" width="92" :index="resolveRowIndex" type="index" />

        <el-table-column fixed="left" label="图片" width="148">
          <template #default="{ row }">
            <div class="image-cell">
              <el-image
                v-if="row.previewImageRef"
                :src="row.previewImageRef"
                :preview-src-list="[row.previewImageRef]"
                preview-teleported
                fit="cover"
                class="row-image"
              />
              <button
                v-else
                class="row-image-fallback"
                type="button"
                @click="previewImage(row)"
              >
                <span>
                  {{
                    row.imageState === 'missing'
                      ? '历史未留图'
                      : row.hasReplayImage
                        ? imageLoadingMap[row.rowKey]
                          ? '取图中'
                          : '加载图片'
                        : '无图'
                  }}
                </span>
              </button>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="池外描述" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ row.groupCanonicalText || row.rawVisualNameCn || '未命名候选' }}</strong>
              <span class="cell-meta">{{ row.rawVisualNameEn || 'no english label' }}</span>
              <span class="cell-copy">{{ row.reason || '未提供原因' }}</span>
              <span class="cell-meta">aliases: {{ resolveAliasPreview(row) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="聚合信息" min-width="220">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title cell-mono">{{ row.closestSymptomKeyHint || '无 hint' }}</strong>
              <span class="cell-meta">{{ row.occurrenceCount || 1 }} 条原始候选 · candidate #{{ row.candidateIndex }}</span>
              <span v-if="row.possibleDuplicateGroupId" class="cell-meta cell-mono">
                possible duplicate {{ row.possibleDuplicateScore }}
              </span>
              <span v-if="row.proxyMappingId" class="cell-meta cell-mono">
                mapping {{ row.proxyMappingStatus }} -> {{ row.proxyTargetSymptomKey }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="150">
          <template #default="{ row }">
            <div class="cell-stack">
              <el-tag
                :type="row.reviewStatus === 'approved' ? 'success' : row.reviewStatus === 'ignored' ? 'info' : 'warning'"
                effect="plain"
                round
              >
                {{ reviewStatusTextMap[row.reviewStatus] || '待处理' }}
              </el-tag>
              <span class="cell-meta">{{ formatTime(row.reviewedAt) || '未审核' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Session" min-width="250">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title cell-mono">{{ row.sessionId }}</strong>
              <span class="cell-meta cell-mono">{{ row.visualCallBatchId }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="跑批来源" min-width="310" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ resolveBatchRunTime(row) || '无跑批时间' }}</strong>
              <span class="cell-meta">{{ resolveBatchSourceLabel(row) }}</span>
              <span class="cell-copy cell-mono">{{ resolveBatchSourcePath(row) || '无本地跑批文件记录' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column fixed="right" label="操作" width="300">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button
                size="small"
                class="desktop-secondary-button"
                :disabled="row.reviewStatus === 'approved' || submittingKey === row.rowKey"
                @click="submitReview(row, 'approved')"
              >
                通过
              </el-button>
              <el-button
                size="small"
                class="desktop-secondary-button"
                :disabled="row.reviewStatus === 'ignored' || submittingKey === row.rowKey"
                @click="submitReview(row, 'ignored')"
              >
                忽略
              </el-button>
              <el-button
                size="small"
                class="desktop-primary-button"
                @click="previewImage(row)"
              >
                看图
              </el-button>
              <el-button
                size="small"
                class="desktop-secondary-button"
                :disabled="row.hasAuditedProxyMapping"
                @click="seedProxyFormFromCandidate(row)"
              >
                {{ row.hasAuditedProxyMapping ? '已映射' : '建映射' }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="desktop-pagination">
        <span class="pagination-copy">第 {{ page }} / {{ totalPages }} 页</span>
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          @current-change="handlePageChange"
        />
      </div>
    </section>
  </div>
  <!-- #endif -->

  <!-- #ifndef H5 -->
  <view class="mobile-admin-fallback">
    <view class="mobile-admin-card">
      <text class="mobile-admin-title">池外视觉证据管理</text>
      <text class="mobile-admin-copy">
        该审核页已切到桌面端 H5 审计台，请在 Web 端打开以使用固定表头、固定操作列和批量审核能力。
      </text>
    </view>
  </view>
  <!-- #endif -->
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import {
  requestOutOfPoolProxyMappingDisable,
  requestOutOfPoolProxyMappingList,
  requestOutOfPoolProxyMappingUpsert,
  requestOutOfPoolReviewAction,
  requestOutOfPoolReviewImage,
  requestOutOfPoolReviewList
} from '@/http-functions/diagnose/out-of-pool-review.js'
// #ifdef H5
import { ElMessage } from 'element-plus'
// #endif

const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已忽略', value: 'ignored' }
]

const reviewStatusTextMap = {
  pending: '待处理',
  approved: '已通过',
  ignored: '已忽略'
}

const proxyStatusTextMap = {
  pending: '待审核',
  audited: '已审计',
  rejected: '已拒绝'
}

const loading = ref(false)
const proxyLoading = ref(false)
const items = ref([])
const proxyMappings = ref([])
const summary = ref({
  total: 0,
  pendingCount: 0,
  approvedCount: 0,
  ignoredCount: 0,
  occurrenceTotal: 0
})
const proxySummary = ref({
  total: 0,
  enabledCount: 0,
  disabledCount: 0,
  auditedCount: 0,
  pendingCount: 0,
  rejectedCount: 0
})
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const hasMore = ref(false)
const submittingKey = ref('')
const proxySubmitting = ref(false)
const imageLoadingMap = ref({})
const filters = ref({
  status: 'all',
  keyword: ''
})
const proxyForm = ref({
  mappingId: '',
  sourceGroupId: '',
  targetSymptomKey: '',
  matchTermsText: '',
  rationale: '',
  reviewStatus: 'pending',
  priority: 100,
  enabled: true
})
const isH5Runtime = typeof window !== 'undefined'

const totalPages = computed(() => {
  if (!total.value) {return 1}
  return Math.max(1, Math.ceil(total.value / pageSize.value))
})

const tableHeight = computed(() => 'calc(100vh - 336px)')

function resolveRowIndex(index = 0) {
  const currentPage = Math.max(1, Number(page.value || 1))
  const currentPageSize = Math.max(1, Number(pageSize.value || 20))
  return (currentPage - 1) * currentPageSize + Number(index || 0) + 1
}

onMounted(() => {
  if (isH5Runtime) {
    loadList()
    loadProxyMappings()
  }
})

function buildItemKey(item) {
  if (item?.groupId) {return item.groupId}
  return `${item.visualNormalizedImageResultId}_${item.candidateIndex}`
}

function normalizeMatchTermsText(value = '') {
  return Array.from(
    new Set(
      String(value || '')
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

    items.value = (Array.isArray(data?.items) ? data.items : []).map(item => ({
      ...item,
      rowKey: buildItemKey(item)
    }))
    autoLoadPreviewImages(items.value)
    total.value = Number(data?.total || 0)
    hasMore.value = Boolean(data?.hasMore)
    summary.value = {
      total: Number(data?.summary?.total || 0),
      pendingCount: Number(data?.summary?.pendingCount || 0),
      approvedCount: Number(data?.summary?.approvedCount || 0),
      ignoredCount: Number(data?.summary?.ignoredCount || 0),
      occurrenceTotal: Number(data?.summary?.occurrenceTotal || 0)
    }
  } catch (error) {
    showMessage(error?.message || '读取池外候选失败', 'error')
  } finally {
    loading.value = false
  }
}

async function autoLoadPreviewImages(rows = []) {
  const targets = (Array.isArray(rows) ? rows : []).filter(item =>
    item?.hasReplayImage && !item?.previewImageRef
  )

  for (const item of targets) {
    await ensurePreviewImage(item, { silent: true })
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
    proxyMappings.value = Array.isArray(data?.items) ? data.items : []
    proxySummary.value = {
      total: Number(data?.summary?.total || 0),
      enabledCount: Number(data?.summary?.enabledCount || 0),
      disabledCount: Number(data?.summary?.disabledCount || 0),
      auditedCount: Number(data?.summary?.auditedCount || 0),
      pendingCount: Number(data?.summary?.pendingCount || 0),
      rejectedCount: Number(data?.summary?.rejectedCount || 0)
    }
  } catch (error) {
    showMessage(error?.message || '读取 proxy 映射失败', 'error')
  } finally {
    proxyLoading.value = false
  }
}

async function ensurePreviewImage(item, { silent = false } = {}) {
  const itemKey = item?.rowKey || buildItemKey(item)
  if (!item?.hasReplayImage) {
    return ''
  }

  const currentItem = items.value.find(current => current.rowKey === itemKey) || item
  if (currentItem?.previewImageRef) {
    return currentItem.previewImageRef
  }

  if (imageLoadingMap.value[itemKey]) {
    return ''
  }

  imageLoadingMap.value = {
    ...imageLoadingMap.value,
    [itemKey]: true
  }

  try {
    const data = await requestOutOfPoolReviewImage({
      visualNormalizedImageResultId: item.visualNormalizedImageResultId,
      candidateIndex: item.candidateIndex
    })
    const previewImageRef = String(data?.previewImageRef || '').trim()
    if (previewImageRef) {
      items.value = items.value.map(current =>
        current.rowKey === itemKey
          ? {
              ...current,
              previewImageRef
            }
          : current
      )
    }
    return previewImageRef
  } catch (error) {
    if (!silent) {
      showMessage(error?.message || '读取图片失败', 'error')
    }
    return ''
  } finally {
    const nextLoadingMap = { ...imageLoadingMap.value }
    delete nextLoadingMap[itemKey]
    imageLoadingMap.value = nextLoadingMap
  }
}

function applyFilters() {
  page.value = 1
  loadList()
}

function resetFilters() {
  filters.value = {
    status: 'all',
    keyword: ''
  }
  page.value = 1
  loadList()
}

function handlePageChange(nextPage) {
  page.value = Number(nextPage || 1)
  loadList()
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

    items.value = items.value.map(current =>
      current.rowKey === item.rowKey
        ? {
            ...current,
            reviewStatus: reviewAction,
            reviewedAt: new Date().toISOString()
          }
        : current
    )

    if (item.reviewStatus === 'pending' && summary.value.pendingCount > 0) {
      summary.value.pendingCount -= 1
    }
    if (reviewAction === 'approved') {
      summary.value.approvedCount += 1
    } else {
      summary.value.ignoredCount += 1
    }

    showMessage(reviewAction === 'approved' ? '已通过' : '已忽略', 'success')
  } catch (error) {
    showMessage(error?.message || '提交审核失败', 'error')
  } finally {
    submittingKey.value = ''
  }
}

function resetProxyForm() {
  proxyForm.value = {
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

function editProxyMapping(item) {
  proxyForm.value = {
    mappingId: item.mappingId || '',
    sourceGroupId: item.sourceGroupId || '',
    targetSymptomKey: item.targetSymptomKey || '',
    matchTermsText: Array.isArray(item.matchTerms) ? item.matchTerms.join('\n') : '',
    rationale: item.rationale || '',
    reviewStatus: item.reviewStatus || 'pending',
    priority: Number(item.priority || 0),
    enabled: Boolean(item.enabled)
  }
}

function seedProxyFormFromCandidate(item) {
  const terms = [
    ...(Array.isArray(item.aliases) ? item.aliases : []),
    item.rawVisualNameCn,
    item.rawVisualNameEn
  ].filter(Boolean)
  proxyForm.value = {
    mappingId: '',
    sourceGroupId: item.groupId || '',
    targetSymptomKey: item.closestSymptomKeyHint || '',
    matchTermsText: terms.join('\n'),
    rationale: item.reason
      ? `From out-of-pool candidate: ${item.reason}`
      : 'From out-of-pool candidate review.',
    reviewStatus: 'pending',
    priority: 100,
    enabled: true
  }
  showMessage('已带入候选描述，请补充 target symptom 并审计后保存', 'success')
}

function resolveAliasPreview(item = {}) {
  const aliases = Array.isArray(item.aliases) ? item.aliases : []
  if (!aliases.length) {return '无聚合别名'}
  return aliases.slice(0, 4).join(' / ')
}

async function submitProxyMapping() {
  const matchTerms = normalizeMatchTermsText(proxyForm.value.matchTermsText)
  const targetSymptomKey = String(proxyForm.value.targetSymptomKey || '').trim()
  if (!targetSymptomKey || !matchTerms.length) {
    showMessage('target symptom 和匹配词不能为空', 'warning')
    return
  }

  proxySubmitting.value = true
  try {
    await requestOutOfPoolProxyMappingUpsert({
      mappingId: proxyForm.value.mappingId,
      sourceGroupId: proxyForm.value.sourceGroupId,
      targetSymptomKey,
      matchTerms,
      rationale: proxyForm.value.rationale,
      reviewStatus: proxyForm.value.reviewStatus,
      priority: proxyForm.value.priority,
      enabled: proxyForm.value.enabled
    })
    showMessage('proxy 映射已保存', 'success')
    resetProxyForm()
    await loadProxyMappings()
  } catch (error) {
    showMessage(error?.message || '保存 proxy 映射失败', 'error')
  } finally {
    proxySubmitting.value = false
  }
}

async function disableProxyMapping(item) {
  if (!item?.mappingId) {return}
  proxySubmitting.value = true
  try {
    await requestOutOfPoolProxyMappingDisable({
      mappingId: item.mappingId
    })
    showMessage('proxy 映射已停用', 'success')
    await loadProxyMappings()
  } catch (error) {
    showMessage(error?.message || '停用 proxy 映射失败', 'error')
  } finally {
    proxySubmitting.value = false
  }
}

async function previewImage(item) {
  const previewImageRef = String(item?.previewImageRef || '').trim() || (await ensurePreviewImage(item))
  if (!previewImageRef) {
    showMessage('当前候选没有可回放图片', 'warning')
  }
}

function resolveBatchRunTime(item = {}) {
  return formatTime(item.batchGeneratedAt) || formatTime(item.createdAt)
}

function resolveBatchSourceLabel(item = {}) {
  return (
    item.batchSampleFileName ||
    item.batchSampleLabel ||
    item.batchSource ||
    '非本地跑批导入'
  )
}

function resolveBatchSourcePath(item = {}) {
  return item.batchSampleAbsolutePath || item.batchAnswerPathSignature || ''
}

function formatTime(value) {
  if (!value) {return ''}
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {return ''}
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function showMessage(message, type = 'info') {
  // #ifdef H5
  ElMessage({
    message,
    type
  })
  // #endif
  // #ifndef H5
  uni.showToast({
    title: String(message || ''),
    icon: type === 'success' ? 'success' : 'none'
  })
  // #endif
}
</script>

<style scoped>
/* #ifdef H5 */
.desktop-admin-page {
  --desktop-sans-font: 'PingFang SC', 'Noto Sans SC', 'Helvetica Neue', Arial, sans-serif;
  --desktop-serif-font: 'STSong', 'Songti SC', 'Noto Serif SC', Georgia, serif;
  --desktop-mono-font: 'SFMono-Regular', 'Menlo', 'Monaco', 'Courier New', monospace;
  min-height: 100vh;
  padding: 28px;
  background:
    radial-gradient(circle at top left, rgba(165, 106, 67, 0.08), transparent 24%),
    linear-gradient(180deg, #f4efe6 0%, #f7f4ed 100%);
  color: #1f3a33;
  font-family: var(--desktop-sans-font);
}

.desktop-hero,
.desktop-toolbar,
.desktop-table-shell {
  max-width: 1520px;
  margin: 0 auto 18px;
}

.desktop-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 30px 32px 22px;
  border: 1px solid #d8c9b4;
  background: rgba(247, 250, 248, 0.78);
  box-shadow: 0 18px 40px rgba(31, 58, 51, 0.06);
}

.hero-kicker {
  font-size: 11px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: #a56a43;
}

.hero-title,
.section-title {
  margin: 10px 0 0;
  font-family: var(--desktop-serif-font);
  font-weight: 400;
}

.hero-title {
  font-size: 42px;
  line-height: 1.04;
}

.hero-copy,
.section-copy {
  max-width: 780px;
  margin: 12px 0 0;
  line-height: 1.75;
  color: #597167;
}

.desktop-summary-grid {
  max-width: 1520px;
  margin: 0 auto 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.summary-panel {
  border: 1px solid #d8c9b4;
  background: rgba(255, 251, 244, 0.92);
  padding: 18px 20px;
}

.summary-panel-dark {
  background: #1f3a33;
  border-color: #1f3a33;
}

.summary-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #8d745e;
}

.summary-label-dark {
  color: rgba(255, 255, 255, 0.68);
}

.summary-value {
  display: block;
  margin-top: 8px;
  font-family: var(--desktop-serif-font);
  font-weight: 400;
  color: #1f3a33;
  font-size: 40px;
}

.summary-value-dark {
  color: #fff;
}

.desktop-toolbar,
.desktop-table-shell {
  border: 1px solid #d8c9b4;
  background: rgba(247, 250, 248, 0.82);
  box-shadow: 0 18px 40px rgba(31, 58, 51, 0.05);
}

.desktop-toolbar {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 220px;
  gap: 16px;
  align-items: end;
  padding: 22px 24px;
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-group-search {
  min-width: 0;
}

.toolbar-label {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #8d745e;
}

.toolbar-actions,
.row-actions,
.hero-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.desktop-table-shell {
  padding: 22px 24px 18px;
}

.desktop-table-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
}

.section-title {
  font-size: 30px;
}

:deep(.desktop-admin-table) {
  width: 100%;
  --el-table-header-bg-color: #efe5d6;
  --el-table-border-color: #dcccb8;
  --el-table-row-hover-bg-color: #f8f2e7;
  --el-table-text-color: #314940;
}

:deep(.desktop-admin-table .el-table__cell) {
  padding: 14px 0;
}

:deep(.desktop-admin-table-header th) {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8d745e;
}

.image-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row-image,
.row-image-fallback {
  width: 108px;
  height: 90px;
  border: 1px solid #d8c9b4;
  background: #ebe1d3;
}

.row-image-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  color: #6d6256;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-title {
  color: #1f3a33;
  font-weight: 600;
  line-height: 1.6;
}

.cell-meta {
  color: #61756d;
  font-size: 12px;
  line-height: 1.6;
}

.cell-copy {
  color: #40554d;
  font-size: 13px;
  line-height: 1.72;
}

.cell-mono {
  font-family: var(--desktop-mono-font);
  font-size: 12px;
  word-break: break-all;
}

.desktop-pagination {
  margin-top: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.pagination-copy {
  color: #61756d;
  font-size: 13px;
}

.desktop-primary-button,
.desktop-secondary-button {
  border-radius: 0 !important;
  font-weight: 600;
}

.desktop-primary-button {
  --el-button-bg-color: #1f3a33;
  --el-button-border-color: #1f3a33;
  --el-button-hover-bg-color: #2c4d44;
  --el-button-hover-border-color: #2c4d44;
  --el-button-active-bg-color: #183029;
  --el-button-active-border-color: #183029;
  --el-button-text-color: #fff;
}

.desktop-secondary-button {
  --el-button-bg-color: #fffaf2;
  --el-button-border-color: #d8c9b4;
  --el-button-text-color: #395247;
  --el-button-hover-bg-color: #f1e5d5;
  --el-button-hover-border-color: #c9b08c;
}
/* #endif */

/* #ifndef H5 */
.mobile-admin-fallback {
  min-height: 100vh;
  padding: 24px;
  background: #f4efe6;
}

.mobile-admin-card {
  border-radius: 24px;
  border: 1px solid #d8c9b4;
  background: #fffaf2;
  padding: 24px 20px;
}

.mobile-admin-title {
  display: block;
  color: #1f3a33;
  font-size: 22px;
  font-weight: 700;
}

.mobile-admin-copy {
  display: block;
  margin-top: 12px;
  color: #61756d;
  line-height: 1.8;
}
/* #endif */

/* #ifdef H5 */
@media (max-width: 1280px) {
  .desktop-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .desktop-toolbar {
    grid-template-columns: 1fr;
  }
}
/* #endif */
.proxy-mapping-shell {
  padding: 22px;
}

.proxy-mapping-head {
  margin-bottom: 16px;
}

.proxy-summary-copy {
  margin-top: 6px;
  font-size: 13px;
}

.proxy-mapping-editor {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid #dfd2bf;
  background: rgba(255, 251, 244, 0.72);
}

.proxy-editor-grid {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 160px 120px 120px;
  gap: 10px;
  align-items: center;
}

.proxy-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.proxy-mapping-table {
  margin-top: 10px;
}

.term-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 1180px) {
  .proxy-editor-grid {
    grid-template-columns: 1fr 1fr;
  }
}

</style>
