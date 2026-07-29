import { ref } from 'vue'
import { LLM_PRICING_NOTICE } from '@/constants/llm-pricing.js'

export const hunyuanVisionPricingNotice = LLM_PRICING_NOTICE

export const outcomeOptions = [
  { label: '全部', value: 'all' },
  { label: '有问题', value: 'problematic' },
  { label: '未见明确问题', value: 'non_problematic' },
  { label: '不确定', value: 'uncertain' }
]

export const sourceOptions = [
  { label: '手动 + 批跑', value: 'all' },
  { label: '真人手动', value: 'manual' },
  { label: '脚本批跑', value: 'batch' },
  { label: '未归一历史', value: 'session' }
]

export function createListState() {
  return {
    loading: false,
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    summary: {
      total: 0,
      finalizedCount: 0,
      pendingCount: 0,
      problematicCount: 0,
      nonProblematicCount: 0,
      uncertainCount: 0,
      otherOutcomeCount: 0,
      manualCount: 0,
      batchCount: 0,
      sessionCount: 0
    },
    fallbackMode: 'formal_review'
  }
}

export function createDiagnosisReviewState() {
  const manualListState = ref(createListState())
  const batchListState = ref(createListState())
  const sessionListState = ref(createListState())
  const items = ref([])
  const imageLoadingMap = ref({})
  const imagePreviewMap = ref({})
  const detailLoadingMap = ref({})
  const detailMap = ref({})
  const detailDrawerVisible = ref(false)
  const selectedSessionId = ref('')
  const compareSessionIds = ref([])
  const compareSessionInput = ref('')
  const filters = ref({ outcomeType: 'all', sourceType: 'all', keyword: '' })
  const isH5Runtime = typeof window !== 'undefined'
  const imageIntersectionRootMargin = '240px 0px'
  const imageIntersectionThreshold = 0.01
  const imagePrefetchBatchSize = 2
  const tableSectionRefs = ref({})
  const imageCellNodes = new Map()
  const imageIntersectionObservers = new Map()
  const imageIntersectionAttempted = new Set()
  const imageErrorRetryAttempted = new Set()

  return {
    hunyuanVisionPricingNotice,
    outcomeOptions,
    sourceOptions,
    manualListState,
    batchListState,
    sessionListState,
    items,
    imageLoadingMap,
    imagePreviewMap,
    detailLoadingMap,
    detailMap,
    detailDrawerVisible,
    selectedSessionId,
    compareSessionIds,
    compareSessionInput,
    filters,
    isH5Runtime,
    imageIntersectionRootMargin,
    imageIntersectionThreshold,
    imagePrefetchBatchSize,
    tableSectionRefs,
    imageCellNodes,
    imageIntersectionObservers,
    imageIntersectionAttempted,
    imageErrorRetryAttempted
  }
}
