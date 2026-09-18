<template>
  <!-- #ifdef H5 -->
  <section
    v-for="section in reviewSections"
    :key="section.key"
    ref="node => registerTableSectionRef(section.key, node)"
    class="desktop-table-shell"
  >
    <div class="desktop-table-head">
      <div>
        <h2 class="section-title">{{ section.title }}</h2>
        <p class="section-copy">
          当前第 {{ section.state.page }} 页，共
          {{ section.state.total }} 条。点击“展开”查看过程详情。
        </p>
      </div>
    </div>
    <el-table
      v-loading="section.state.loading"
      :data="section.state.items"
      row-key="diagnosisSessionId"
      class="desktop-admin-table"
      :height="tableHeight"
      header-row-class-name="desktop-admin-table-header"
      empty-text="当前没有诊断记录"
    >
      <el-table-column
        fixed="left"
        label="序号"
        width="92"
        :index="index => resolveRowIndex(section.key, index)"
        type="index"
      />
      <el-table-column fixed="left" label="图片" width="144">
        <template #default="{ row }">
          <div
            :ref="node => registerImageCellRef(node, section.key, row?.diagnosisSessionId)"
            class="image-cell"
          >
            <el-image
              v-if="resolveRowPreviewImage(row)"
              :src="resolveRowPreviewImage(row)"
              :preview-src-list="
                imagePreviewMap[row.diagnosisSessionId] || [resolveRowPreviewImage(row)]
              "
              :initial-index="0"
              preview-teleported
              fit="cover"
              class="row-image"
              @error="handleImageError(row)"
            />
            <button v-else class="row-image-fallback" type="button" @click="handleImageAction(row)">
              <span>
                {{
                  imageLoadingMap[row.diagnosisSessionId]
                    ? '取图中'
                    : row.imageState === 'missing'
                      ? '尝试加载'
                      : '加载图片'
                }}</span
              >
            </button>
            <span class="row-image-meta">共 {{ row.imageCount }} 张</span>
          </div></template
        ></el-table-column
      >
      <el-table-column label="结果" min-width="240" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title">{{ row.displayName }}</strong>
            <span class="cell-meta">{{ formatOutcomeLabel(row.outcomeType) }}</span>
            <span class="cell-copy">{{ row.summary || '未生成摘要' }}</span>
          </div></template
        ></el-table-column
      >
      <el-table-column label="过程摘要" min-width="220">
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title">{{ formatRouteText(row.routePrimaryAction) }}</strong>
            <span class="cell-meta">停止原因: {{ row.stopReason || '未记录' }}</span>
            <span class="cell-meta">
              问题 {{ row.questionCountSummary.totalItems }} / 已答
              {{ row.questionCountSummary.answeredItems }}</span
            >
          </div></template
        ></el-table-column
      >
      <el-table-column label="症状模式" min-width="190">
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title">{{ formatSymptomClassSummary(row.symptomClass) }}</strong>
            <span class="cell-meta">门控: {{ formatSymptomClassGuard(row.symptomClass) }}</span>
            <span class="cell-copy">当前证据: {{ row.observedEvidenceCount }}</span>
          </div></template
        ></el-table-column
      >
      <el-table-column label="来源" width="150">
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title">{{ formatSourceLabel(row.reviewSourceType) }}</strong>
            <span class="cell-meta">
              {{
                row.reviewSourceType === 'batch'
                  ? row.batchReviewMeta?.sampleLabel || '脚本批跑'
                  : formatSourceEvidenceLabel(row.reviewSourceEvidence)
              }}</span
            >
          </div></template
        ></el-table-column
      >
      <el-table-column label="AI Prompt / Token" min-width="250">
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title">
              {{ resolveHunyuanModel(row) }} | {{ resolvePromptVersion(row) }}</strong
            >
            <span v-if="hasPromptTokenMetrics(row)" class="cell-meta">
              prompt {{ resolvePromptTokens(row).prompt }} / completion
              {{ resolvePromptTokens(row).completion }} / total
              {{ resolvePromptTokens(row).total }}</span
            >
            <span v-else class="cell-meta">列表已精简，展开查看 token</span>
            <span v-if="hasPromptTokenMetrics(row)" class="cell-meta">
              估算 {{ formatPromptTokenCost(row) }}</span
            >
            <span v-if="hasPromptCacheMetrics(row)" class="cell-meta prompt-cache-line">
              Prompt cache
              <span :class="resolvePromptCacheBadgeClass(row)">
                {{ resolvePromptCacheStatus(row).statusLabelCn }}</span
              >
              hit {{ resolvePromptCacheStatus(row).promptCacheHitTokens }} / miss
              {{ resolvePromptCacheStatus(row).promptCacheMissTokens }} /
              {{ formatPromptCacheHitRatio(row) }}</span
            >
            <span v-else class="cell-meta prompt-cache-line">Prompt cache 展开查看</span>
            <span class="cell-copy">{{
              formatPromptSnippet(row.llmPromptText || row.llmPromptPreview || '')
            }}</span>
          </div></template
        ></el-table-column
      >
      <el-table-column label="证据 / 方向" min-width="190">
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title">
              obs {{ row.observedEvidenceCount }} / derived {{ row.derivedEvidenceCount }}</strong
            >
            <span class="cell-meta">诊断维度 {{ row.diagnosisDirectionCount }}</span>
            <span class="cell-copy">{{
              row.diagnosisDirectionLabels.join(' / ') || '未识别诊断维度'
            }}</span>
          </div></template
        ></el-table-column
      >
      <el-table-column label="回访 / 反馈" min-width="220">
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title">
              {{ row.feedbackSummary?.feedbackCount || 0 }} 条反馈</strong
            >
            <span class="cell-meta"> {{ formatFeedbackVerdict(row.feedbackSummary) }}</span>
            <span class="cell-copy"> {{ formatFeedbackNote(row.feedbackSummary) }}</span>
          </div></template
        ></el-table-column
      >
      <el-table-column label="Session" min-width="250">
        <template #default="{ row }">
          <div class="cell-stack">
            <strong class="cell-title cell-mono">{{ row.diagnosisSessionId }}</strong>
            <span class="cell-meta cell-mono">{{ row.latestVisualCallBatchId || '无 batch' }}</span>
            <span class="cell-meta">{{ formatTime(row.createdAt) }}</span>
          </div></template
        ></el-table-column
      >
      <el-table-column fixed="right" label="操作" width="220">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button size="small" class="desktop-secondary-button" @click="openDetail(row)">
              展开</el-button
            >
            <el-button
              size="small"
              class="desktop-secondary-button"
              @click="handleImageAction(row)"
            >
              看图</el-button
            >
            <el-button size="small" class="desktop-primary-button" @click="copySessionId(row)">
              复制ID</el-button
            >
          </div></template
        ></el-table-column
      ></el-table
    >
    <div class="desktop-pagination">
      <span class="pagination-copy"
        >第 {{ section.state.page }} / {{ sectionTotalPages(section.key) }} 页</span
      >
      <el-pagination
        background
        layout="prev, pager, next"
        :current-page="section.state.page"
        :page-size="section.state.pageSize"
        :total="section.state.total"
        @current-change="nextPage => handlePageChange(section.key, nextPage)"
      />
    </div>
  </section>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view />
  <!-- #endif -->
</template>

<script>
import { exposeViewProp } from '@/utils/component-view-proxy.js'

export default {
  props: {
    view: { type: Object, required: true }
  },
  setup(props) {
    return exposeViewProp(props)
  }
}
</script>
