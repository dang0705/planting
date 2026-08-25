/* oxlint-disable no-unused-vars */
import { onBeforeUnmount, onMounted, proxyRefs, watch } from 'vue'
import Layout from '@/Layout.vue'
import DiagnosisReviewTableSections from './DiagnosisReviewTableSections.vue'
import DiagnosisReviewDrawer from './DiagnosisReviewDrawer.vue'
import { createDiagnosisReviewState } from './state.js'
import { useDiagnosisReviewComputed } from './computed.js'
import { useDiagnosisReviewLazyImages } from './lazy-images.js'
import { useDiagnosisReviewListActions } from './list-actions.js'
import { useDiagnosisReviewDetailActions } from './detail-actions.js'
import * as displayBindings from './display.js'

export default {
  components: { Layout, DiagnosisReviewTableSections, DiagnosisReviewDrawer },
  setup() {
    const ctx = {
      ...createDiagnosisReviewState(),
      ...displayBindings
    }

    Object.assign(ctx, useDiagnosisReviewComputed(ctx))
    Object.assign(ctx, useDiagnosisReviewLazyImages(ctx))
    Object.assign(ctx, useDiagnosisReviewListActions(ctx))
    Object.assign(ctx, useDiagnosisReviewDetailActions(ctx))

    onMounted(() => {
      if (ctx.isH5Runtime) {
        ctx.bindPreviewLazyScanEvents()
        ctx.loadList()
      }
    })

    onBeforeUnmount(() => {
      ctx.unbindPreviewLazyScanEvents()
      ctx.clearImageObservers()
    })

    watch(ctx.selectedSessionId, () => {
      ctx.compareSessionIds.value = []
      ctx.compareSessionInput.value = ''
    })

    watch(
      ctx.compareSessionIds,
      sessionIds => {
        ctx.loadCompareSessions(sessionIds)
      },
      { deep: true }
    )

    const viewModel = {
      hunyuanVisionPricingNotice: ctx.hunyuanVisionPricingNotice,
      outcomeOptions: ctx.outcomeOptions,
      sourceOptions: ctx.sourceOptions,
      manualListState: ctx.manualListState,
      batchListState: ctx.batchListState,
      sessionListState: ctx.sessionListState,
      items: ctx.items,
      imageLoadingMap: ctx.imageLoadingMap,
      imagePreviewMap: ctx.imagePreviewMap,
      detailLoadingMap: ctx.detailLoadingMap,
      detailMap: ctx.detailMap,
      detailDrawerVisible: ctx.detailDrawerVisible,
      selectedSessionId: ctx.selectedSessionId,
      compareSessionIds: ctx.compareSessionIds,
      compareSessionInput: ctx.compareSessionInput,
      filters: ctx.filters,
      tableSectionRefs: ctx.tableSectionRefs,
      activeSectionStates: ctx.activeSectionStates,
      summary: ctx.summary,
      tableHeight: ctx.tableHeight,
      reviewSections: ctx.reviewSections,
      currentRow: ctx.currentRow,
      currentDetail: ctx.currentDetail,
      compareSessionOptions: ctx.compareSessionOptions,
      compareColumns: ctx.compareColumns,
      compareSessionNotice: ctx.compareSessionNotice,
      compareRows: ctx.compareRows,
      currentPreviewImages: ctx.currentPreviewImages,
      fallbackNotice: ctx.fallbackNotice,
      registerTableSectionRef: ctx.registerTableSectionRef,
      registerImageCellRef: ctx.registerImageCellRef,
      resolveRowIndex: ctx.resolveRowIndex,
      sectionTotalPages: ctx.sectionTotalPages,
      resolveRowPreviewImage: ctx.resolveRowPreviewImage,
      loadList: ctx.loadList,
      applyFilters: ctx.applyFilters,
      resetFilters: ctx.resetFilters,
      handlePageChange: ctx.handlePageChange,
      handleImageError: ctx.handleImageError,
      handleImageAction: ctx.handleImageAction,
      ensureDetail: ctx.ensureDetail,
      handleCompareSessionSelect: ctx.handleCompareSessionSelect,
      addCompareSessionId: ctx.addCompareSessionId,
      clearCompareSessions: ctx.clearCompareSessions,
      openDetail: ctx.openDetail,
      copySessionId: ctx.copySessionId,
      formatOutcomeLabel: ctx.formatOutcomeLabel,
      formatRouteText: ctx.formatRouteText,
      formatSourceLabel: ctx.formatSourceLabel,
      formatSourceEvidenceLabel: ctx.formatSourceEvidenceLabel,
      formatFeedbackVerdict: ctx.formatFeedbackVerdict,
      formatFeedbackNote: ctx.formatFeedbackNote,
      formatDecisionGovernance: ctx.formatDecisionGovernance,
      getActionAdviceGovernance: ctx.getActionAdviceGovernance,
      getGovernedAdvice: ctx.getGovernedAdvice,
      getRawStoredAdvice: ctx.getRawStoredAdvice,
      formatAdviceItems: ctx.formatAdviceItems,
      formatGovernedAdviceSource: ctx.formatGovernedAdviceSource,
      formatAdviceDisplayRecommendation: ctx.formatAdviceDisplayRecommendation,
      formatRawAdvicePolicy: ctx.formatRawAdvicePolicy,
      resolveCompareTitle: ctx.resolveCompareTitle,
      formatDetailPromptStats: ctx.formatDetailPromptStats,
      formatOutOfPoolCandidates: ctx.formatOutOfPoolCandidates,
      formatVisualRouteHints: ctx.formatVisualRouteHints,
      formatQuestionCountSummary: ctx.formatQuestionCountSummary,
      getEnvironmentCareCalculation: ctx.getEnvironmentCareCalculation,
      getEnvironmentCareCalculationSummaryRows: ctx.getEnvironmentCareCalculationSummaryRows,
      getEnvironmentCareCalculationRows: ctx.getEnvironmentCareCalculationRows,
      getRouteDecision: ctx.getRouteDecision,
      getRouteDecisionFieldRows: ctx.getRouteDecisionFieldRows,
      getRoutePathRows: ctx.getRoutePathRows,
      formatTime: ctx.formatTime,
      formatSymptomClassSummary: ctx.formatSymptomClassSummary,
      formatSymptomClassGuard: ctx.formatSymptomClassGuard,
      formatDetailLines: ctx.formatDetailLines,
      getCoreProcessFieldRows: ctx.getCoreProcessFieldRows,
      getVisualRawRecords: ctx.getVisualRawRecords,
      getQuestionRecords: ctx.getQuestionRecords,
      getAnswerRevisionEvents: ctx.getAnswerRevisionEvents,
      getFirstRoundQuestions: ctx.getFirstRoundQuestions,
      getVisualCandidateLabels: ctx.getVisualCandidateLabels,
      formatRawSymptoms: ctx.formatRawSymptoms,
      stringifyCompact: ctx.stringifyCompact,
      formatVisualSlot: ctx.formatVisualSlot,
      formatPackageTopic: ctx.formatPackageTopic,
      formatPackageSection: ctx.formatPackageSection,
      formatQuestionAnswer: ctx.formatQuestionAnswer,
      formatResolvedAnswerEffect: ctx.formatResolvedAnswerEffect,
      formatAnswerRevisionEventType: ctx.formatAnswerRevisionEventType,
      formatAnswerRevisionEvent: ctx.formatAnswerRevisionEvent,
      resolveHunyuanModel: ctx.resolveHunyuanModel,
      resolvePromptVersion: ctx.resolvePromptVersion,
      resolveFullPromptText: ctx.resolveFullPromptText,
      resolvePromptTokens: ctx.resolvePromptTokens,
      hasPromptTokenMetrics: ctx.hasPromptTokenMetrics,
      hasPromptCacheMetrics: ctx.hasPromptCacheMetrics,
      resolvePromptCacheBadgeClass: ctx.resolvePromptCacheBadgeClass,
      resolvePromptCacheStatus: ctx.resolvePromptCacheStatus,
      formatPromptCacheHitRatio: ctx.formatPromptCacheHitRatio,
      formatPromptTokenCost: ctx.formatPromptTokenCost,
      formatPromptSnippet: ctx.formatPromptSnippet,
      showMessage: ctx.showMessage
    }

    const viewContext = proxyRefs(viewModel)

    return {
      ...viewModel,
      viewContext
    }
  }
}
