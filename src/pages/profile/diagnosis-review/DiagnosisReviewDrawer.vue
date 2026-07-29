<template>
  <!-- #ifdef H5 -->
  <el-drawer
    v-model="detailDrawerVisible"
    size="92vw"
    class="desktop-detail-drawer"
    :with-header="false"
    destroy-on-close
  >
    <template v-if="currentRow">
      <div class="drawer-shell">
        <header class="drawer-head">
          <div>
            <div class="hero-kicker">会话复盘</div>
            <h3 class="drawer-title">{{ currentRow.displayName }}</h3>
            <p class="drawer-copy">{{ currentRow.diagnosisSessionId }}</p>
          </div>
          <div class="drawer-head-actions">
            <el-button class="desktop-secondary-button" @click="handleImageAction(currentRow)"
              >图片</el-button
            >
          </div>
        </header>
        <section class="drawer-summary-grid">
          <article class="drawer-summary-card">
            <span class="summary-label">诊断结论</span>
            <strong class="summary-value-small">{{
              formatOutcomeLabel(currentRow.outcomeType)
            }}</strong>
          </article>
          <article class="drawer-summary-card">
            <span class="summary-label">决策方向</span>
            <strong class="summary-value-small">{{
              formatRouteText(currentRow.routePrimaryAction)
            }}</strong>
          </article>
          <article class="drawer-summary-card">
            <span class="summary-label">终止原因</span>
            <strong class="summary-value-small">{{ currentRow.stopReason || '未记录' }}</strong>
          </article>
          <article class="drawer-summary-card">
            <span class="summary-label">证据</span>
            <strong class="summary-value-small">
              {{ currentRow.observedEvidenceCount }} / {{ currentRow.derivedEvidenceCount }}</strong
            >
          </article>
          <article class="drawer-summary-card">
            <span class="summary-label">来源</span>
            <strong class="summary-value-small">{{
              formatSourceLabel(currentRow.reviewSourceType)
            }}</strong>
          </article>
          <article class="drawer-summary-card">
            <span class="summary-label">回访</span>
            <strong class="summary-value-small">
              {{ currentRow.feedbackSummary?.feedbackCount || 0 }}</strong
            >
          </article>
          <article class="drawer-summary-card">
            <span class="summary-label">症状分类</span>
            <strong class="summary-value-small">{{
              formatSymptomClassSummary(currentRow.symptomClass)
            }}</strong>
          </article>
        </section>
        <div v-if="detailLoadingMap[currentRow.diagnosisSessionId]" class="drawer-loading">
          <el-skeleton :rows="6" animated />
        </div>
        <DiagnosisReviewDetailSections v-else-if="currentDetail" :view="view" />
      </div>
    </template>
  </el-drawer>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view />
  <!-- #endif -->
</template>

<script>
import { exposeViewProp } from '@/utils/component-view-proxy.js'
import DiagnosisReviewDetailSections from './DiagnosisReviewDetailSections.vue'

export default {
  components: { DiagnosisReviewDetailSections },
  props: {
    view: { type: Object, required: true }
  },
  setup(props) {
    return exposeViewProp(props)
  }
}
</script>
