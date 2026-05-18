<template>
  <!-- #ifdef H5 -->
  <div class="desktop-admin-page diagnosis-admin-page">
    <header class="desktop-hero">
      <div>
        <div class="hero-kicker">Diagnosis Audit Console</div>
        <h1 class="hero-title">诊断记录管理</h1>
        <p class="hero-copy">
          这里按 session 审查每一次诊断。手动表只看真人小程序诊断，批跑表只看脚本回放记录，
          展开后继续看 `coreProcess` 和图片。
        </p>
      </div>
      <div class="hero-actions">
        <el-button class="desktop-secondary-button" @click="loadList">刷新列表</el-button>
      </div>
    </header>

    <el-alert
      v-if="fallbackNotice"
      :title="fallbackNotice.title"
      :description="fallbackNotice.message"
      type="warning"
      :closable="false"
      class="desktop-alert"
      show-icon
    />

    <el-alert
      :title="hunyuanVisionPricingNotice.title"
      :description="hunyuanVisionPricingNotice.message"
      type="info"
      :closable="false"
      class="desktop-alert"
      show-icon
    />

    <section class="desktop-summary-grid">
      <article class="summary-panel">
        <span class="summary-label">总诊断</span>
        <strong class="summary-value">{{ summary.total }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">真人手动</span>
        <strong class="summary-value">{{ summary.manualCount }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">脚本批跑</span>
        <strong class="summary-value">{{ summary.batchCount }}</strong>
      </article>
      <article v-if="filters.sourceType === 'legacy'" class="summary-panel">
        <span class="summary-label">未归一历史</span>
        <strong class="summary-value">{{ summary.legacyCount }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">已闭环</span>
        <strong class="summary-value">{{ summary.finalizedCount }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">待归一</span>
        <strong class="summary-value">{{ summary.pendingCount }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">有问题</span>
        <strong class="summary-value">{{ summary.problematicCount }}</strong>
      </article>
      <article class="summary-panel">
        <span class="summary-label">未见明确问题</span>
        <strong class="summary-value">{{ summary.nonProblematicCount }}</strong>
      </article>
      <article class="summary-panel summary-panel-dark">
        <span class="summary-label summary-label-dark">不确定</span>
        <strong class="summary-value summary-value-dark">{{ summary.uncertainCount }}</strong>
      </article>
    </section>

    <section class="desktop-toolbar">
      <div class="toolbar-group">
        <label class="toolbar-label">结果类型</label>
        <el-segmented
          v-model="filters.outcomeType"
          :options="outcomeOptions"
          @change="applyFilters"
        />
      </div>
      <div class="toolbar-group">
        <label class="toolbar-label">来源</label>
        <el-segmented
          v-model="filters.sourceType"
          :options="sourceOptions"
          @change="applyFilters"
        />
      </div>
      <div class="toolbar-group toolbar-group-search">
        <label class="toolbar-label">关键词</label>
        <el-input
          v-model="filters.keyword"
          placeholder="session / batch / problem / summary"
          clearable
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="toolbar-actions">
        <el-button class="desktop-secondary-button" @click="resetFilters">重置</el-button>
        <el-button class="desktop-primary-button" @click="applyFilters">应用</el-button>
      </div>
    </section>

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
              <button
                v-else
                class="row-image-fallback"
                type="button"
                @click="handleImageAction(row)"
              >
                <span>
                  {{
                    imageLoadingMap[row.diagnosisSessionId]
                      ? '取图中'
                      : row.imageState === 'missing'
                        ? '尝试加载'
                        : '加载图片'
                  }}
                </span>
              </button>
              <span class="row-image-meta">共 {{ row.imageCount }} 张</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="结果" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ row.displayName }}</strong>
              <span class="cell-meta">{{ formatOutcomeLabel(row.outcomeType) }}</span>
              <span class="cell-copy">{{ row.summary || '未生成摘要' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="过程摘要" min-width="220">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ formatRouteText(row.routePrimaryAction) }}</strong>
              <span class="cell-meta">停止原因: {{ row.stopReason || '未记录' }}</span>
              <span class="cell-meta">
                问题 {{ row.questionCountSummary.totalItems }} / 已答
                {{ row.questionCountSummary.answeredItems }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="症状模式" min-width="190">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ formatSymptomClassSummary(row.symptomClass) }}</strong>
              <span class="cell-meta">门控: {{ formatSymptomClassGuard(row.symptomClass) }}</span>
              <span class="cell-copy">当前证据: {{ row.observedEvidenceCount }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="来源" width="150">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">{{ formatSourceLabel(row.reviewSourceType) }}</strong>
              <span class="cell-meta">
                {{
                  row.reviewSourceType === 'batch'
                    ? row.batchReviewMeta?.sampleLabel || '脚本批跑'
                    : formatSourceEvidenceLabel(row.reviewSourceEvidence)
                }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="AI Prompt / Token" min-width="250">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">
                {{ resolveHunyuanModel(row) }} | {{ resolvePromptVersion(row) }}
              </strong>
              <span v-if="hasPromptTokenMetrics(row)" class="cell-meta">
                prompt {{ resolvePromptTokens(row).prompt }} / completion
                {{ resolvePromptTokens(row).completion }} / total
                {{ resolvePromptTokens(row).total }}
              </span>
              <span v-else class="cell-meta">列表已精简，展开查看 token</span>
              <span v-if="hasPromptTokenMetrics(row)" class="cell-meta">
                估算 {{ formatPromptTokenCost(row) }}
              </span>
              <span v-if="hasPromptCacheMetrics(row)" class="cell-meta prompt-cache-line">
                Prompt cache
                <span :class="resolvePromptCacheBadgeClass(row)">
                  {{ resolvePromptCacheStatus(row).statusLabelCn }}
                </span>
                hit {{ resolvePromptCacheStatus(row).promptCacheHitTokens }} /
                miss {{ resolvePromptCacheStatus(row).promptCacheMissTokens }} /
                {{ formatPromptCacheHitRatio(row) }}
              </span>
              <span v-else class="cell-meta prompt-cache-line">Prompt cache 展开查看</span>
              <span class="cell-copy">{{
                formatPromptSnippet(row.llmPromptText || row.llmPromptPreview || '')
              }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="证据 / 方向" min-width="190">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">
                obs {{ row.observedEvidenceCount }} / derived {{ row.derivedEvidenceCount }}
              </strong>
              <span class="cell-meta">诊断维度 {{ row.diagnosisDirectionCount }}</span>
              <span class="cell-copy">{{
                row.diagnosisDirectionLabels.join(' / ') || '未识别诊断维度'
              }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="回访 / 反馈" min-width="220">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title">
                {{ row.feedbackSummary?.feedbackCount || 0 }} 条反馈
              </strong>
              <span class="cell-meta">
                {{ formatFeedbackVerdict(row.feedbackSummary) }}
              </span>
              <span class="cell-copy">
                {{ formatFeedbackNote(row.feedbackSummary) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Session" min-width="250">
          <template #default="{ row }">
            <div class="cell-stack">
              <strong class="cell-title cell-mono">{{ row.diagnosisSessionId }}</strong>
              <span class="cell-meta cell-mono">{{
                row.latestVisualCallBatchId || '无 batch'
              }}</span>
              <span class="cell-meta">{{ formatTime(row.createdAt) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column fixed="right" label="操作" width="220">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" class="desktop-secondary-button" @click="openDetail(row)">
                展开
              </el-button>
              <el-button
                size="small"
                class="desktop-secondary-button"
                @click="handleImageAction(row)"
              >
                看图
              </el-button>
              <el-button size="small" class="desktop-primary-button" @click="copySessionId(row)">
                复制ID
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

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
                {{ currentRow.observedEvidenceCount }} / {{ currentRow.derivedEvidenceCount }}
              </strong>
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
                {{ currentRow.feedbackSummary?.feedbackCount || 0 }}
              </strong>
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

          <template v-else-if="currentDetail">
            <section class="drawer-panel">
              <h4 class="drawer-panel-title">来源与回放</h4>
              <div class="drawer-detail-grid">
                <article class="drawer-detail-card">
                  <h5 class="drawer-detail-title">来源信息</h5>
                  <p class="drawer-detail-copy">
                    来源: {{ formatSourceLabel(currentRow.reviewSourceType) }}
                  </p>
                  <p class="drawer-detail-copy">
                    样本标签:
                    {{
                      currentDetail?.batchReviewMeta?.sampleLabel ||
                      currentRow.batchReviewMeta?.sampleLabel ||
                      '无'
                    }}
                  </p>
                  <p class="drawer-detail-copy">
                    样本文件:
                    {{
                      currentDetail?.batchReviewMeta?.sampleFileName ||
                      currentRow.batchReviewMeta?.sampleFileName ||
                      '无'
                    }}
                  </p>
                  <p class="drawer-detail-copy">
                    答题链路:
                    {{
                      currentDetail?.batchReviewMeta?.answerPathSignature ||
                      currentRow.batchReviewMeta?.answerPathSignature ||
                      '无'
                    }}
                  </p>
                </article>
              </div>
            </section>

            <section class="drawer-panel compare-panel">
              <div class="compare-head">
                <div>
                  <h4 class="drawer-panel-title">横向比较</h4>
                  <p class="drawer-detail-copy">
                    当前 session 固定在第一列，最多再选择 2 个不同 sessionId 进行核心数据对照。
                  </p>
                </div>
                <el-button class="desktop-secondary-button" @click="clearCompareSessions">
                  清空对比
                </el-button>
              </div>
              <div class="compare-controls">
                <el-select
                  v-model="compareSessionIds"
                  multiple
                  filterable
                  :multiple-limit="2"
                  placeholder="从当前列表选择 session"
                  class="compare-select"
                  @change="handleCompareSessionSelect"
                >
                  <el-option
                    v-for="option in compareSessionOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-input
                  v-model="compareSessionInput"
                  clearable
                  placeholder="粘贴 sessionId，回车添加"
                  class="compare-input"
                  @keyup.enter="addCompareSessionId"
                />
                <el-button class="desktop-primary-button" @click="addCompareSessionId">
                  添加
                </el-button>
              </div>
              <p v-if="compareSessionNotice" class="drawer-detail-copy">
                {{ compareSessionNotice }}
              </p>
              <div class="compare-table-shell">
                <div class="compare-row compare-row-head">
                  <div class="compare-label">字段</div>
                  <div
                    v-for="column in compareColumns"
                    :key="column.sessionId"
                    class="compare-cell compare-session-head"
                  >
                    <strong>{{ column.roleLabel }}：{{ resolveCompareTitle(column) }}</strong>
                    <span class="cell-meta cell-mono">{{ column.sessionId }}</span>
                    <span v-if="detailLoadingMap[column.sessionId]" class="cell-meta">
                      加载中...
                    </span>
                  </div>
                </div>
                <div
                  v-for="row in compareRows"
                  :key="row.key"
                  class="compare-row"
                >
                  <div class="compare-label">
                    <strong>{{ row.label }}</strong>
                    <span>{{ row.key }}</span>
                  </div>
                  <div
                    v-for="column in compareColumns"
                    :key="`${row.key}_${column.sessionId}`"
                    class="compare-cell"
                  >
                    {{ row.resolve(column.detail, column.sessionId, column.row) }}
                  </div>
                </div>
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">图片</h4>
              <div class="drawer-image-grid">
                <el-image
                  v-for="(image, index) in currentPreviewImages"
                  :key="`${currentRow.diagnosisSessionId}_${index}`"
                  :src="image"
                  :preview-src-list="currentPreviewImages"
                  :initial-index="index"
                  preview-teleported
                  fit="cover"
                  class="drawer-image"
                />
                <div v-if="!currentPreviewImages.length" class="drawer-empty-box">
                  当前无可回放图片
                </div>
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">核心过程</h4>
              <div class="process-field-list">
                <article
                  v-for="field in getCoreProcessFieldRows(currentDetail)"
                  :key="field.key"
                  class="process-field-row"
                >
                  <div>
                    <strong class="process-field-title">{{ field.label }}</strong>
                    <span class="process-field-key">{{ field.key }}</span>
                  </div>
                  <p class="process-field-meaning">{{ field.meaning }}</p>
                  <p class="process-field-value">{{ field.value }}</p>
                </article>
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">诊断链路</h4>
              <div v-if="getRouteDecision(currentDetail)" class="route-path-shell">
                <div class="drawer-detail-grid">
                  <article
                    v-for="field in getRouteDecisionFieldRows(currentDetail)"
                    :key="field.key"
                    class="drawer-detail-card"
                  >
                    <h5 class="drawer-detail-title">{{ field.label }}</h5>
                    <p class="drawer-detail-copy cell-mono">{{ field.value }}</p>
                  </article>
                </div>
                <div class="route-path-list">
                  <article
                    v-for="row in getRoutePathRows(currentDetail)"
                    :key="row.key"
                    class="process-field-row"
                  >
                    <div>
                      <strong class="process-field-title">{{ row.title }}</strong>
                      <span class="process-field-key">{{ row.key }}</span>
                    </div>
                    <p class="process-field-meaning">{{ row.meta }}</p>
                    <p class="process-field-value">{{ row.value }}</p>
                  </article>
                </div>
                <pre class="raw-json-preview">{{ stringifyCompact(getRouteDecision(currentDetail)) }}</pre>
              </div>
              <div v-else class="drawer-empty-box">
                当前详情未返回诊断决策信息
              </div>
            </section>

            <section v-if="getActionAdviceGovernance(currentDetail)" class="drawer-panel">
              <h4 class="drawer-panel-title">行动建议治理</h4>
              <div class="drawer-detail-grid">
                <article class="drawer-detail-card">
                  <h5 class="drawer-detail-title">正式建议（Governed Advice）</h5>
                  <p class="drawer-detail-copy">
                    来源:
                    {{ formatGovernedAdviceSource(getGovernedAdvice(currentDetail)?.source) }}
                  </p>
                  <p class="drawer-detail-copy">
                    展示策略:
                    {{
                      formatAdviceDisplayRecommendation(
                        getActionAdviceGovernance(currentDetail)?.displayRecommendation
                      )
                    }}
                  </p>
                  <p class="drawer-detail-copy">
                    处理建议:
                    {{ formatAdviceItems(getGovernedAdvice(currentDetail)?.nextSteps).join('；') || '无' }}
                  </p>
                  <p class="drawer-detail-copy">
                    暂时不要:
                    {{ formatAdviceItems(getGovernedAdvice(currentDetail)?.whatToAvoid).join('；') || '无' }}
                  </p>
                  <p class="drawer-detail-copy">
                    解释:
                    {{
                      getGovernedAdvice(currentDetail)?.explanation?.whyItHappens ||
                      getGovernedAdvice(currentDetail)?.explanation?.whatToCheckNext ||
                      '无'
                    }}
                  </p>
                </article>

                <article class="drawer-detail-card">
                  <h5 class="drawer-detail-title">原始建议审计（Raw Snapshot / Session）</h5>
                  <p class="drawer-detail-copy">
                    口径:
                    {{ formatRawAdvicePolicy(getRawStoredAdvice(currentDetail)?.displayPolicy) }}
                  </p>
                  <p class="drawer-detail-copy">
                    原始 treatment:
                    {{ getRawStoredAdvice(currentDetail)?.treatment || '无' }}
                  </p>
                  <p class="drawer-detail-copy">
                    原始 prevention:
                    {{ getRawStoredAdvice(currentDetail)?.prevention || '无' }}
                  </p>
                  <p class="drawer-detail-copy">
                    原始 nextSteps:
                    {{ formatAdviceItems(getRawStoredAdvice(currentDetail)?.nextSteps).join('；') || '无' }}
                  </p>
                  <p class="drawer-detail-copy">
                    原始 whatToAvoid:
                    {{ formatAdviceItems(getRawStoredAdvice(currentDetail)?.whatToAvoid).join('；') || '无' }}
                  </p>
                  <pre class="raw-json-preview">{{
                    stringifyCompact(getRawStoredAdvice(currentDetail))
                  }}</pre>
                </article>
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">AI 原始视觉返回</h4>
              <div
                v-for="record in getVisualRawRecords(currentDetail)"
                :key="record.visualRawImageRecordId"
                class="raw-ai-card"
              >
                <div class="raw-ai-head">
                  <strong class="drawer-detail-title">
                    {{ formatVisualSlot(record) }}
                  </strong>
                  <span class="cell-meta">
                    {{ record.sourceModelName || 'unknown_model' }} /
                    {{ record.promptVersion || 'unknown_prompt' }}
                  </span>
                </div>
                <p class="drawer-detail-copy">
                  模型原始 symptom_candidates:
                  {{ formatRawSymptoms(record?.modelParsedResult?.symptom_candidates) }}
                </p>
                <p class="drawer-detail-copy">
                  标准化入池 topk:
                  {{ formatRawSymptoms(record?.normalizedTopkSymptoms) }}
                </p>
                <p class="drawer-detail-copy">
                  Prompt / Token:
                  {{ formatPromptSnippet(resolveFullPromptText(record)) }}
                  | prompt {{ resolvePromptTokens(record).prompt }} /
                  completion {{ resolvePromptTokens(record).completion }} /
                  total {{ resolvePromptTokens(record).total }}
                  | 估算 {{ formatPromptTokenCost(record) }}
                </p>
                <p class="drawer-detail-copy">
                  Prompt 缓存状态:
                  <span :class="resolvePromptCacheBadgeClass(record?.llmPromptAudit)">
                    {{ resolvePromptCacheStatus(record?.llmPromptAudit).statusLabelCn }}
                  </span>
                  hit {{ resolvePromptCacheStatus(record?.llmPromptAudit).promptCacheHitTokens }} /
                  miss {{ resolvePromptCacheStatus(record?.llmPromptAudit).promptCacheMissTokens }} /
                  create {{
                    resolvePromptCacheStatus(record?.llmPromptAudit).promptCacheCreationInputTokens
                  }} /
                  output {{ resolvePromptCacheStatus(record?.llmPromptAudit).outputTokens }} /
                  ratio {{ formatPromptCacheHitRatio(record?.llmPromptAudit) }}
                </p>
                <p class="drawer-detail-copy">完整 Prompt:</p>
                <pre class="raw-json-preview">{{ resolveFullPromptText(record) || '无 prompt' }}</pre>
                <p class="drawer-detail-copy">AI 原始文本返回:</p>
                <pre class="raw-json-preview">{{ record?.rawTextOutput || '无原始文本' }}</pre>
                <p class="drawer-detail-copy">AI 原始结构化返回:</p>
                <pre class="raw-json-preview">{{
                  stringifyCompact(record?.modelParsedResult || record?.rawStructuredOutput)
                }}</pre>
              </div>
              <div v-if="!getVisualRawRecords(currentDetail).length" class="drawer-empty-box">
                当前详情未返回 AI 原始视觉值
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">首轮提问记录</h4>
              <div
                v-for="question in getFirstRoundQuestions(currentDetail)"
                :key="question.id || question.questionKey"
                class="question-history-row"
              >
                <strong class="question-history-title">
                  {{ question.questionOrder }}. {{ question.questionText || question.questionKey }}
                </strong>
                <p class="drawer-detail-copy">
                  目标症状: {{ question.targetSymptomKey || '无' }}； 维度:
                  {{ formatTargetDimension(question.targetDimension) }}； 作用域:
                  {{ formatRoutingScope(question.routingScope) }}
                </p>
                <p class="drawer-detail-copy">回答: {{ formatQuestionAnswer(question) }}</p>
                <p v-if="formatResolvedAnswerEffect(question)" class="drawer-detail-copy">
                  运行时生效影响: {{ formatResolvedAnswerEffect(question) }}
                </p>
              </div>
              <div v-if="!getFirstRoundQuestions(currentDetail).length" class="drawer-empty-box">
                当前详情未记录首轮提问
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">全部追问流水</h4>
              <div
                v-for="question in getFollowUpRecords(currentDetail)"
                :key="`all_${question.id || question.questionKey}`"
                class="question-history-row"
              >
                <strong class="question-history-title">
                  第 {{ question.roundIndex }} 轮 / {{ question.questionOrder }}.
                  {{ question.questionText || question.questionKey }}
                </strong>
                <p class="drawer-detail-copy">
                  {{ question.questionKey }} -> {{ formatQuestionAnswer(question) }}
                </p>
                <p v-if="formatResolvedAnswerEffect(question)" class="drawer-detail-copy">
                  运行时生效影响: {{ formatResolvedAnswerEffect(question) }}
                </p>
              </div>
              <div v-if="!getFollowUpRecords(currentDetail).length" class="drawer-empty-box">
                当前详情未记录追问流水
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">答案改写记录</h4>
              <div
                v-for="event in getAnswerRevisionEvents(currentDetail)"
                :key="event.eventId || event.id"
                class="question-history-row"
              >
                <strong class="question-history-title">
                  第 {{ event.questionRoundIndex || event.dirtyRoundIndex || '-' }} 轮 /
                  {{ formatAnswerRevisionEventType(event.eventType) }}
                </strong>
                <p class="drawer-detail-copy">
                  {{ event.questionText || event.questionKey }}
                </p>
                <p class="drawer-detail-copy">
                  {{ formatAnswerRevisionEvent(event) }}
                </p>
              </div>
              <div v-if="!getAnswerRevisionEvents(currentDetail).length" class="drawer-empty-box">
                当前详情未记录答案改写
              </div>
            </section>

            <section class="drawer-panel">
              <h4 class="drawer-panel-title">回访 / 反馈</h4>
              <div class="drawer-detail-grid">
                <article class="drawer-detail-card">
                  <h5 class="drawer-detail-title">最新反馈</h5>
                  <p class="drawer-detail-copy">
                    条数:
                    {{ currentDetail?.feedbackSummary?.feedbackCount || 0 }}
                  </p>
                  <p class="drawer-detail-copy">
                    评价:
                    {{ formatFeedbackVerdict(currentDetail?.feedbackSummary) }}
                  </p>
                  <p class="drawer-detail-copy">
                    时间:
                    {{
                      currentDetail?.feedbackSummary?.latestFeedback?.createdAt
                        ? formatTime(currentDetail.feedbackSummary.latestFeedback.createdAt)
                        : '无'
                    }}
                  </p>
                  <p class="drawer-detail-copy">
                    备注:
                    {{ formatFeedbackNote(currentDetail?.feedbackSummary, '无备注') }}
                  </p>
                </article>
              </div>
            </section>
          </template>
        </div>
      </template>
    </el-drawer>
  </div>
  <!-- #endif -->

  <!-- #ifndef H5 -->
  <view class="mobile-admin-fallback">
    <view class="mobile-admin-card">
      <text class="mobile-admin-title">诊断记录管理</text>
      <text class="mobile-admin-copy">
        该管理页已切到桌面端 H5 审计台，请在 Web 端打开以使用固定表头、固定操作列和过程详情面板。
      </text>
    </view>
  </view>
  <!-- #endif -->
</template>

<script setup>
import { computed, ref, onMounted, watch, onBeforeUnmount } from 'vue'
import {
  requestDiagnosisReviewDetail,
  requestDiagnosisReviewImages,
  requestDiagnosisReviewList
} from '@/http-functions/diagnose/diagnosis-review.js'
import {
  LLM_PRICING_NOTICE,
  calculateLlmTokenCost,
  formatCnyTokenCost
} from '@/constants/llm-pricing.js'
// #ifdef H5
import { ElMessage } from 'element-plus'
// #endif

const hunyuanVisionPricingNotice = LLM_PRICING_NOTICE

const outcomeOptions = [
  { label: '全部', value: 'all' },
  { label: '有问题', value: 'problematic' },
  { label: '未见明确问题', value: 'non_problematic' },
  { label: '不确定', value: 'uncertain' }
]
const sourceOptions = [
  { label: '手动 + 批跑', value: 'all' },
  { label: '真人手动', value: 'manual' },
  { label: '脚本批跑', value: 'batch' },
  { label: '未归一历史', value: 'legacy' }
]

function createListState() {
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
      legacyCount: 0
    },
    fallbackMode: 'formal_review'
  }
}

const manualListState = ref(createListState())
const batchListState = ref(createListState())
const legacyListState = ref(createListState())
const items = ref([])
const imageLoadingMap = ref({})
const imagePreviewMap = ref({})
const detailLoadingMap = ref({})
const detailMap = ref({})
const detailDrawerVisible = ref(false)
const selectedSessionId = ref('')
const compareSessionIds = ref([])
const compareSessionInput = ref('')
const filters = ref({
  outcomeType: 'all',
  sourceType: 'all',
  keyword: ''
})
const isH5Runtime = typeof window !== 'undefined'
const imageIntersectionRootMargin = '240px 0px'
const imageIntersectionThreshold = 0.01
const imagePrefetchBatchSize = 2
const tableSectionRefs = ref({})
const imageCellNodes = new Map()
const imageIntersectionObservers = new Map()
const imageIntersectionAttempted = new Set()
const imageErrorRetryAttempted = new Set()

const activeSectionStates = computed(() => reviewSections.value.map(section => section.state))

const summary = computed(() =>
  activeSectionStates.value.reduce(
    (accumulator, currentState) => ({
      total: accumulator.total + Number(currentState.summary.total || 0),
      manualCount: accumulator.manualCount + Number(currentState.summary.manualCount || 0),
      batchCount: accumulator.batchCount + Number(currentState.summary.batchCount || 0),
      legacyCount: accumulator.legacyCount + Number(currentState.summary.legacyCount || 0),
      finalizedCount: accumulator.finalizedCount + Number(currentState.summary.finalizedCount || 0),
      pendingCount: accumulator.pendingCount + Number(currentState.summary.pendingCount || 0),
      problematicCount:
        accumulator.problematicCount + Number(currentState.summary.problematicCount || 0),
      nonProblematicCount:
        accumulator.nonProblematicCount + Number(currentState.summary.nonProblematicCount || 0),
      uncertainCount: accumulator.uncertainCount + Number(currentState.summary.uncertainCount || 0),
      otherOutcomeCount:
        accumulator.otherOutcomeCount + Number(currentState.summary.otherOutcomeCount || 0)
    }),
    {
      total: 0,
      manualCount: 0,
      batchCount: 0,
      legacyCount: 0,
      finalizedCount: 0,
      pendingCount: 0,
      problematicCount: 0,
      nonProblematicCount: 0,
      uncertainCount: 0,
      otherOutcomeCount: 0
    }
  )
)

const tableHeight = computed(() => 'calc(100vh - 350px)')

function normalizeSectionKey(value = '') {
  const normalized = String(value || '').trim()
  if (normalized === 'batch' || normalized === 'legacy') {return normalized}
  return 'manual'
}

function resolveReviewRowBySessionId(sessionId = '') {
  const safeSessionId = String(sessionId || '').trim()
  if (!safeSessionId) {return null}
  return (
    items.value.find(item => item.diagnosisSessionId === safeSessionId) ||
    manualListState.value.items.find(item => item.diagnosisSessionId === safeSessionId) ||
    batchListState.value.items.find(item => item.diagnosisSessionId === safeSessionId) ||
    legacyListState.value.items.find(item => item.diagnosisSessionId === safeSessionId) ||
    null
  )
}

function clearImageObservers() {
  for (const timer of autoLoadPreviewTimers.values()) {
    clearTimeout(timer)
  }
  autoLoadPreviewTimers.clear()
  for (const observer of imageIntersectionObservers.values()) {
    observer.disconnect()
  }
  imageIntersectionObservers.clear()
  imageCellNodes.clear()
  imageIntersectionAttempted.clear()
  imageErrorRetryAttempted.clear()
}

function resolveImageCellObserver(sectionKey = '') {
  const normalizedSection = normalizeSectionKey(sectionKey)
  if (!isH5Runtime || typeof IntersectionObserver === 'undefined') {
    return null
  }

  const cached = imageIntersectionObservers.get(normalizedSection)
  if (cached) {
    return cached
  }

  const root = null

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const node = entry.target
        if (!entry.isIntersecting) {
          continue
        }

        observer.unobserve(node)

        const sessionId = String(node?.dataset?.diagnosisSessionId || '').trim()
        if (!sessionId) {
          continue
        }

        if (imageIntersectionAttempted.has(sessionId)) {
          continue
        }
        imageIntersectionAttempted.add(sessionId)

        const row = resolveReviewRowBySessionId(sessionId)
        if (!row) {
          continue
        }

        if (Array.isArray(imagePreviewMap.value[sessionId]) &&
          imagePreviewMap.value[sessionId].length > 0) {
          continue
        }

        if (imageLoadingMap.value[sessionId]) {
          continue
        }

        ensurePreviewImages(row, { silent: true })
      }
    },
    {
      root,
      rootMargin: imageIntersectionRootMargin,
      threshold: imageIntersectionThreshold
    }
  )

  imageIntersectionObservers.set(normalizedSection, observer)
  return observer
}

function registerTableSectionRef(sectionKey, node) {
  const normalizedSection = normalizeSectionKey(sectionKey)
  tableSectionRefs.value = {
    ...tableSectionRefs.value,
    [normalizedSection]: node
  }

  const existing = imageIntersectionObservers.get(normalizedSection)
  if (existing) {
    existing.disconnect()
    imageIntersectionObservers.delete(normalizedSection)
  }

  const observer = resolveImageCellObserver(normalizedSection)
  if (!observer) {
    return
  }

  for (const entry of imageCellNodes.values()) {
    if (entry.sectionKey === normalizedSection && entry.node) {
      observer.observe(entry.node)
    }
  }
}

function registerImageCellRef(node, sectionKey, sessionId = '') {
  const normalizedSection = normalizeSectionKey(sectionKey)
  const safeSessionId = String(sessionId || '').trim()
  const key = `${normalizedSection}::${safeSessionId}`

  if (!safeSessionId) {
    return
  }

  const prev = imageCellNodes.get(key)
  if (!node) {
    if (prev?.node) {
      const prevObserver = imageIntersectionObservers.get(prev.sectionKey)
      if (prevObserver) {
        prevObserver.unobserve(prev.node)
      }
      imageCellNodes.delete(key)
    }
    return
  }

  const observer = resolveImageCellObserver(normalizedSection)
  if (prev?.node && prev.node !== node) {
    const prevObserver = imageIntersectionObservers.get(prev.sectionKey)
    if (prevObserver) {
      prevObserver.unobserve(prev.node)
    }
  }

  if (node?.dataset) {
    node.dataset.diagnosisSessionId = safeSessionId
    node.dataset.sectionKey = normalizedSection
  }

  imageCellNodes.set(key, {
    sectionKey: normalizedSection,
    sessionId: safeSessionId,
    node
  })

  if (observer && !imageIntersectionAttempted.has(safeSessionId)) {
    observer.observe(node)
  }
}

function stateForSource(sourceType = '') {
  if (sourceType === 'batch') {return batchListState.value}
  if (sourceType === 'legacy') {return legacyListState.value}
  return manualListState.value
}

function sortItemsByCreatedAt(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime()
    const rightTime = new Date(right?.createdAt || 0).getTime()
    return rightTime - leftTime
  })
}

function syncCombinedItems() {
  items.value = sortItemsByCreatedAt([
    ...manualListState.value.items,
    ...batchListState.value.items,
    ...legacyListState.value.items
  ])
}

function resolveRowIndex(sourceType = 'manual', index = 0) {
  const currentState = stateForSource(sourceType)
  const currentPage = Math.max(1, Number(currentState.page || 1))
  const currentPageSize = Math.max(1, Number(currentState.pageSize || 20))
  return (currentPage - 1) * currentPageSize + Number(index || 0) + 1
}

function sectionTotalPages(sourceType = 'manual') {
  const currentState = stateForSource(sourceType)
  if (!currentState.total) {return 1}
  return Math.max(1, Math.ceil(currentState.total / currentState.pageSize))
}

function resolveRowPreviewImage(row = null) {
  const sessionId = String(row?.diagnosisSessionId || '').trim()
  const mapPreview = sessionId ? imagePreviewMap.value?.[sessionId]?.[0] : ''
  return String(mapPreview || '').trim()
}

const reviewSections = computed(() => {
  const sections = []
  if (filters.value.sourceType !== 'batch') {
    sections.push({
      key: 'manual',
      title: '真人手动诊断记录',
      state: manualListState.value
    })
  }
  if (filters.value.sourceType !== 'manual') {
    sections.push({
      key: 'batch',
      title: '脚本批跑诊断记录',
      state: batchListState.value
    })
  }
  if (filters.value.sourceType === 'legacy') {
    sections.push({
      key: 'legacy',
      title: '未归一历史记录',
      state: legacyListState.value
    })
  }
  return sections
})

const currentRow = computed(() => {
  const sessionId = selectedSessionId.value
  return items.value.find(item => item.diagnosisSessionId === sessionId) || null
})

const currentDetail = computed(() => {
  const sessionId = selectedSessionId.value
  return detailMap.value[sessionId] || null
})

const compareSessionOptions = computed(() =>
  items.value
    .filter(item => {
      const sessionId = String(item?.diagnosisSessionId || '').trim()
      return sessionId && sessionId !== selectedSessionId.value
    })
    .map(item => ({
      label: `${item.diagnosisSessionId} | ${item.displayName || '诊断记录'} | ${formatOutcomeLabel(item.outcomeType)}`,
      value: item.diagnosisSessionId
    }))
)

const compareColumns = computed(() => {
  const currentSessionId = String(selectedSessionId.value || '').trim()
  const comparisonIds = normalizeCompareSessionIds(compareSessionIds.value)
  const sessionIds = [currentSessionId, ...comparisonIds].filter(Boolean)

  return sessionIds.map((sessionId, index) => ({
    sessionId,
    roleLabel: index === 0 ? '当前' : `对比${index}`,
    detail: detailMap.value[sessionId] || null,
    row: items.value.find(item => item.diagnosisSessionId === sessionId) || null
  }))
})

const compareSessionNotice = computed(() => {
  if (!selectedSessionId.value) {
    return ''
  }
  if (!compareSessionIds.value.length) {
    return '尚未选择对比 session；可从当前列表选择，也可粘贴任意 sessionId 添加。'
  }
  return `正在对比 ${compareSessionIds.value.length} 个 session。`
})

const compareRows = computed(() => [
  {
    key: 'result.outcome',
    label: '结果类型',
    resolve: detail => formatOutcomeLabel(detail?.outcomeType || '')
  },
  {
    key: 'result.final',
    label: '最终结论',
    resolve: detail => String(detail?.displayName || detail?.finalResult?.displayName || '无').trim()
  },
  {
    key: 'result.summary',
    label: '摘要',
    resolve: detail => String(detail?.summary || detail?.finalResult?.summary || '无').trim()
  },
  {
    key: 'decision.route_stop',
    label: '决策 / 停止',
    resolve: detail =>
      [
        detail?.routePrimaryAction || detail?.coreProcess?.followUp?.routePrimaryAction || '未返回',
        detail?.stopReason || detail?.coreProcess?.decision?.stopReason || '未返回',
        getRouteDecision(detail)?.decisionCause?.decisionCauseKey || ''
      ].filter(Boolean).join(' / ')
  },
  {
    key: 'visual.prompt_token',
    label: 'Prompt / Token',
    resolve: detail => formatDetailPromptStats(detail)
  },
  {
    key: 'visual.raw_candidates',
    label: '模型正式候选',
    resolve: detail => formatRawSymptoms(resolveFirstParsedVisualResult(detail)?.symptom_candidates)
  },
  {
    key: 'visual.out_of_pool',
    label: '池外候选',
    resolve: detail => formatOutOfPoolCandidates(detail)
  },
  {
    key: 'visual.aggregate',
    label: '聚合视觉候选',
    resolve: detail => formatDetailLines(getVisualCandidateLabels(detail), '无')
  },
  {
    key: 'visual.route_hints',
    label: '视觉链路提示',
    resolve: detail => formatVisualRouteHints(detail)
  },
  {
    key: 'evidence.observed',
    label: '正式证据',
    resolve: detail => formatDetailLines(getObservedEvidenceLabels(detail), '无')
  },
  {
    key: 'evidence.directions',
    label: '诊断方向',
    resolve: detail => formatDetailLines(getDiagnosisDirectionLabels(detail), '无')
  },
  {
    key: 'symptom_class',
    label: '症状模式',
    resolve: detail => formatSymptomClassSummary(detail?.symptomClass)
  },
  {
    key: 'follow_up.questions',
    label: '追问计数',
    resolve: detail => formatQuestionCountSummary(detail)
  },
  {
    key: 'decision.governance',
    label: '输出资格',
    resolve: detail => formatDecisionGovernance(detail)
  },
  {
    key: 'source',
    label: '来源',
    resolve: detail => formatSourceLabel(detail?.reviewSourceType || '')
  }
])

const currentPreviewImages = computed(() => {
  const sessionId = selectedSessionId.value
  const previewImages = Array.isArray(imagePreviewMap.value[sessionId])
    ? imagePreviewMap.value[sessionId]
    : []
  if (previewImages.length) {
    return previewImages
  }
  const row = currentRow.value
  return row?.previewImageRef ? [row.previewImageRef] : []
})

const fallbackNotice = computed(() => {
  const activeModes = reviewSections.value
    .map(section => ({
      key: section.key,
      mode: String(section.state.fallbackMode || 'formal_review')
    }))
    .filter(item => item.mode !== 'formal_review')

  if (!activeModes.length) {
    return null
  }

  const modes = new Set(activeModes.map(item => item.mode))

  if (modes.has('local_audit_cache')) {
    return {
      title: 'DEV LOCAL CACHE',
      message:
        '当前页面正在使用本地诊断审计缓存，只用于 H5 开发态联调。正式环境仍以 `/diagnosis/review/*` 返回为准。'
    }
  }

  if (modes.has('legacy_history')) {
    return {
      title: 'LEGACY HISTORY FALLBACK',
      message:
        '当前列表已临时回退到既有 history 链路。该模式仅用于开发态兜底，返回字段会比正式审计链更少。'
    }
  }

  if (modes.has('legacy_result')) {
    return {
      title: 'LEGACY RESULT FALLBACK',
      message:
        '当前详情已临时回退到既有 result 链路。该模式仅用于开发态兜底，正式管理页仍以 review 合同为准。'
    }
  }

  return {
    title: 'FALLBACK MODE',
    message: `当前运行在兼容模式：${activeModes.map(item => `${item.key}:${item.mode}`).join(' / ')}`
  }
})

onMounted(() => {
  if (isH5Runtime) {
    bindPreviewLazyScanEvents()
    loadList()
  }
})

onBeforeUnmount(() => {
  unbindPreviewLazyScanEvents()
  clearImageObservers()
})

watch(selectedSessionId, () => {
  compareSessionIds.value = []
  compareSessionInput.value = ''
})

watch(
  compareSessionIds,
  sessionIds => {
    loadCompareSessions(sessionIds)
  },
  { deep: true }
)

function updateListState(sourceType, data = {}) {
  const currentState = stateForSource(sourceType)
  currentState.items = Array.isArray(data?.items) ? data.items : []
  currentState.fallbackMode = String(data?.fallbackMode || 'formal_review')
  currentState.total = Number(data?.total || 0)
  currentState.hasMore = Boolean(data?.hasMore)
  currentState.summary = {
    total: Number(data?.summary?.total || 0),
    finalizedCount: Number(data?.summary?.finalizedCount || 0),
    pendingCount: Number(data?.summary?.pendingCount || 0),
    problematicCount: Number(data?.summary?.problematicCount || 0),
    nonProblematicCount: Number(data?.summary?.nonProblematicCount || 0),
    uncertainCount: Number(data?.summary?.uncertainCount || 0),
    otherOutcomeCount: Number(data?.summary?.otherOutcomeCount || 0),
    manualCount: Number(data?.summary?.manualCount || 0),
    batchCount: Number(data?.summary?.batchCount || 0),
    legacyCount: Number(data?.summary?.legacyCount || 0)
  }
  scheduleAutoLoadVisiblePreviewImages(sourceType)
  schedulePreviewLazyScan()
}

const autoLoadPreviewTimers = new Map()

function scheduleAutoLoadVisiblePreviewImages(sourceType = 'manual') {
  const normalizedSection = normalizeSectionKey(sourceType)
  const previousTimer = autoLoadPreviewTimers.get(normalizedSection)
  if (previousTimer) {
    clearTimeout(previousTimer)
  }
  const timer = setTimeout(() => {
    autoLoadPreviewTimers.delete(normalizedSection)
    autoLoadVisiblePreviewImages(normalizedSection)
  }, 0)
  autoLoadPreviewTimers.set(normalizedSection, timer)
}

async function autoLoadVisiblePreviewImages(sourceType = 'manual') {
  const currentState = stateForSource(sourceType)
  const rows = Array.isArray(currentState.items) ? currentState.items : []
  const candidates = rows.filter(row => {
    const sessionId = String(row?.diagnosisSessionId || '').trim()
    if (!sessionId || Number(row?.imageCount || 0) <= 0) {return false}
    if (resolveRowPreviewImage(row)) {return false}
    if (imageLoadingMap.value[sessionId]) {return false}
    return true
  })
  for (const row of candidates.slice(0, imagePrefetchBatchSize)) {
    await ensurePreviewImages(row, { silent: true })
  }
}

let previewLazyScanTimer = null
let previewLazyEventsBound = false

function bindPreviewLazyScanEvents() {
  if (previewLazyEventsBound || !isH5Runtime) {return}
  previewLazyEventsBound = true
  if (typeof document !== 'undefined') {
    document.addEventListener('scroll', schedulePreviewLazyScan, true)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', schedulePreviewLazyScan)
  }
}

function unbindPreviewLazyScanEvents() {
  if (!previewLazyEventsBound) {return}
  previewLazyEventsBound = false
  if (typeof document !== 'undefined') {
    document.removeEventListener('scroll', schedulePreviewLazyScan, true)
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', schedulePreviewLazyScan)
  }
  if (previewLazyScanTimer) {
    clearTimeout(previewLazyScanTimer)
    previewLazyScanTimer = null
  }
}

function schedulePreviewLazyScan() {
  if (!isH5Runtime) {return}
  if (previewLazyScanTimer) {
    clearTimeout(previewLazyScanTimer)
  }
  previewLazyScanTimer = setTimeout(() => {
    previewLazyScanTimer = null
    scanVisiblePreviewImageCells()
  }, 80)
}

async function scanVisiblePreviewImageCells() {
  if (!isH5Runtime || typeof window === 'undefined') {return}
  const rowsToPrefetch = []
  for (const [key, node] of imageCellNodes.entries()) {
    if (!isPreviewImageCellVisible(node)) {continue}
    const { sessionId, sectionKey } = resolveImageCellIdentity(key, node)
    if (!sessionId || imageIntersectionAttempted.has(sessionId)) {continue}
    const row = findPreviewImageRow(sessionId, sectionKey)
    if (!row || resolveRowPreviewImage(row) || imageLoadingMap.value[sessionId]) {continue}
    imageIntersectionAttempted.add(sessionId)
    rowsToPrefetch.push(row)
    if (rowsToPrefetch.length >= imagePrefetchBatchSize) {
      break
    }
  }
  for (const row of rowsToPrefetch) {
    await ensurePreviewImages(row, { silent: true })
  }
}

function isPreviewImageCellVisible(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') {return false}
  const rect = node.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0
  const preload = 240
  return (
    rect.bottom >= -preload &&
    rect.top <= viewportHeight + preload &&
    rect.right >= -preload &&
    rect.left <= viewportWidth + preload
  )
}

function resolveImageCellIdentity(key, node) {
  const rawKey = String(key || '')
  const parts = rawKey.split(':')
  return {
    sessionId: String(node?.dataset?.diagnosisSessionId || parts[parts.length - 1] || '').trim(),
    sectionKey: String(node?.dataset?.sectionKey || (parts.length > 1 ? parts[0] : '')).trim()
  }
}

function findPreviewImageRow(sessionId = '', sectionKey = '') {
  const safeSessionId = String(sessionId || '').trim()
  if (!safeSessionId) {return null}
  const normalizedSection = String(sectionKey || '').trim()
  const knownSection = ['manual', 'batch', 'legacy'].includes(normalizedSection)
  const states = knownSection
    ? [stateForSource(normalizedSection)]
    : [manualListState.value, batchListState.value, legacyListState.value]
  for (const state of states) {
    const row = (Array.isArray(state?.items) ? state.items : []).find(
      item => item?.diagnosisSessionId === safeSessionId
    )
    if (row) {return row}
  }
  return null
}

function resetListState(sourceType) {
  const initial = createListState()
  const currentState = stateForSource(sourceType)
  currentState.loading = initial.loading
  currentState.items = initial.items
  currentState.total = initial.total
  currentState.hasMore = initial.hasMore
  currentState.summary = initial.summary
  currentState.fallbackMode = initial.fallbackMode
}

async function loadSourceList(sourceType = 'manual') {
  const currentState = stateForSource(sourceType)
  currentState.loading = true
  try {
    const data = await requestDiagnosisReviewList({
      page: currentState.page,
      pageSize: currentState.pageSize,
      outcomeType: filters.value.outcomeType,
      sourceType,
      keyword: filters.value.keyword
    })
    updateListState(sourceType, data)
    syncCombinedItems()
    if (
      selectedSessionId.value &&
      !items.value.some(item => item.diagnosisSessionId === selectedSessionId.value)
    ) {
      detailDrawerVisible.value = false
      selectedSessionId.value = ''
    }
  } catch (error) {
    currentState.items = []
    currentState.total = 0
    currentState.hasMore = false
    currentState.summary = createListState().summary
    showMessage(
      `${
        sourceType === 'batch' ? '批跑' : sourceType === 'legacy' ? '未归一历史' : '手动'
      }记录读取失败：${error?.message || '未知错误'}`,
      'error'
    )
  } finally {
    currentState.loading = false
  }
}

async function loadList() {
  imageIntersectionAttempted.clear()
  const tasks = []
  if (filters.value.sourceType !== 'batch') {
    tasks.push(loadSourceList('manual'))
  } else {
    resetListState('manual')
  }
  if (filters.value.sourceType !== 'manual') {
    tasks.push(loadSourceList('batch'))
  } else {
    resetListState('batch')
  }
  if (filters.value.sourceType === 'legacy') {
    tasks.push(loadSourceList('legacy'))
  } else {
    resetListState('legacy')
  }
  await Promise.all(tasks)
  syncCombinedItems()
}

function applyFilters() {
  manualListState.value.page = 1
  batchListState.value.page = 1
  legacyListState.value.page = 1
  loadList()
}

function resetFilters() {
  filters.value = {
    outcomeType: 'all',
    sourceType: 'all',
    keyword: ''
  }
  manualListState.value.page = 1
  batchListState.value.page = 1
  legacyListState.value.page = 1
  loadList()
}

function handlePageChange(sourceType, nextPage) {
  const currentState = stateForSource(sourceType)
  currentState.page = Number(nextPage || 1)
  loadSourceList(sourceType)
}

function updateItemPreviewImage(diagnosisSessionId, previewImageRef = '') {
  if (!previewImageRef) {return}
  const patch = current =>
    current.diagnosisSessionId === diagnosisSessionId
      ? {
          ...current,
          previewImageRef
        }
      : current
  manualListState.value.items = manualListState.value.items.map(patch)
  batchListState.value.items = batchListState.value.items.map(patch)
  legacyListState.value.items = legacyListState.value.items.map(patch)
  syncCombinedItems()
}

function clearItemPreviewImage(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return}
  const patch = current =>
    current.diagnosisSessionId === safeSessionId
      ? {
          ...current,
          previewImageRef: ''
        }
      : current
  manualListState.value.items = manualListState.value.items.map(patch)
  batchListState.value.items = batchListState.value.items.map(patch)
  legacyListState.value.items = legacyListState.value.items.map(patch)
  const nextPreviewMap = { ...imagePreviewMap.value }
  delete nextPreviewMap[safeSessionId]
  imagePreviewMap.value = nextPreviewMap
  syncCombinedItems()
}

async function ensurePreviewImages(item, { silent = false, forceRefresh = false } = {}) {
  const sessionId = item?.diagnosisSessionId
  if (!sessionId) {return []}

  if (
    !forceRefresh &&
    Array.isArray(imagePreviewMap.value[sessionId]) &&
    imagePreviewMap.value[sessionId].length
  ) {
    return imagePreviewMap.value[sessionId]
  }

  if (imageLoadingMap.value[sessionId]) {
    return []
  }

  imageLoadingMap.value = {
    ...imageLoadingMap.value,
    [sessionId]: true
  }

  try {
    const data = await requestDiagnosisReviewImages({
      diagnosisSessionId: sessionId,
      sourceType: item?.reviewSourceType || 'all',
      sampleAbsolutePath: item?.batchReviewMeta?.sampleAbsolutePath || ''
    })
    const previewImageRefs = Array.isArray(data?.previewImageRefs) ? data.previewImageRefs : []
    const coverImageRef = String(data?.coverImageRef || previewImageRefs[0] || '').trim()
    if (coverImageRef) {
      updateItemPreviewImage(sessionId, coverImageRef)
    }
    imagePreviewMap.value = {
      ...imagePreviewMap.value,
      [sessionId]: previewImageRefs
    }
    return previewImageRefs
  } catch (error) {
    if (!silent) {
      showMessage(error?.message || '读取诊断图片失败', 'error')
    }
    return []
  } finally {
    const nextLoadingMap = { ...imageLoadingMap.value }
    delete nextLoadingMap[sessionId]
    imageLoadingMap.value = nextLoadingMap
  }
}

function handleImageError(item) {
  const sessionId = String(item?.diagnosisSessionId || '').trim()
  if (!sessionId || imageErrorRetryAttempted.has(sessionId)) {
    return
  }
  imageErrorRetryAttempted.add(sessionId)
  clearItemPreviewImage(sessionId)
  ensurePreviewImages(item, { silent: true, forceRefresh: true })
}

async function handleImageAction(item) {
  const previewImageRefs = await ensurePreviewImages(item, { forceRefresh: true })
  if (!previewImageRefs.length) {
    showMessage('当前记录没有可回放图片', 'warning')
  }
}

async function ensureDetail(sessionId) {
  if (!sessionId) {return null}
  if (detailMap.value[sessionId]) {
    return detailMap.value[sessionId]
  }
  if (detailLoadingMap.value[sessionId]) {
    return null
  }

  detailLoadingMap.value = {
    ...detailLoadingMap.value,
    [sessionId]: true
  }

  try {
    const currentRow = items.value.find(current => current.diagnosisSessionId === sessionId) || null
    const detail = await requestDiagnosisReviewDetail({
      diagnosisSessionId: sessionId,
      sourceType: currentRow?.reviewSourceType || 'all'
    })
    const normalizedDetail = {
      ...detail,
      reviewSourceType: currentRow?.reviewSourceType || detail?.reviewSourceType || 'legacy',
      reviewSourceEvidence:
        currentRow?.reviewSourceEvidence ||
        detail?.reviewSourceEvidence ||
        'openid_inferred_legacy',
      clientPlatform: currentRow?.clientPlatform || detail?.clientPlatform || '',
      symptomClass: detail?.symptomClass || currentRow?.symptomClass || null,
      questionCountSummary:
        detail?.questionCountSummary || currentRow?.questionCountSummary || null,
      previewImageRef: String(detail?.previewImageRef || currentRow?.previewImageRef || '').trim(),
      previewVisualRawImageRecordId: String(
        detail?.previewVisualRawImageRecordId ||
          detail?.preview_visual_raw_image_record_id ||
          currentRow?.previewVisualRawImageRecordId ||
          ''
      ).trim(),
      imageCount: Number(detail?.imageCount || currentRow?.imageCount || 0)
    }
    detailMap.value = {
      ...detailMap.value,
      [sessionId]: normalizedDetail
    }
    const patch = current =>
      current.diagnosisSessionId === sessionId
        ? {
            ...current,
            ...(normalizedDetail?.displayName ? { displayName: normalizedDetail.displayName } : {}),
            ...(normalizedDetail?.summary ? { summary: normalizedDetail.summary } : {}),
            ...(normalizedDetail?.routePrimaryAction
              ? {
                  routePrimaryAction:
                    normalizedDetail.routePrimaryAction || current.routePrimaryAction
                }
              : {}),
            ...(normalizedDetail?.stopReason
              ? { stopReason: normalizedDetail.stopReason || current.stopReason }
              : {}),
            ...(normalizedDetail?.observedEvidenceCount !== undefined
              ? { observedEvidenceCount: Number(normalizedDetail.observedEvidenceCount || 0) }
              : {}),
            ...(normalizedDetail?.derivedEvidenceCount !== undefined
              ? { derivedEvidenceCount: Number(normalizedDetail.derivedEvidenceCount || 0) }
              : {}),
            ...(normalizedDetail?.diagnosisDirectionCount !== undefined
              ? { diagnosisDirectionCount: Number(normalizedDetail.diagnosisDirectionCount || 0) }
              : {}),
            ...(Array.isArray(normalizedDetail?.diagnosisDirectionLabels)
              ? { diagnosisDirectionLabels: normalizedDetail.diagnosisDirectionLabels }
              : {}),
            ...(normalizedDetail?.symptomClass
              ? { symptomClass: normalizedDetail.symptomClass }
              : {}),
            ...(normalizedDetail?.questionCountSummary
              ? { questionCountSummary: normalizedDetail.questionCountSummary }
              : {}),
            ...(normalizedDetail?.previewImageRef !== undefined
              ? { previewImageRef: normalizedDetail.previewImageRef }
              : {}),
            ...(normalizedDetail?.imageCount !== undefined
              ? { imageCount: Number(normalizedDetail.imageCount || 0) }
              : {}),
            ...(normalizedDetail?.previewVisualRawImageRecordId
              ? { previewVisualRawImageRecordId: normalizedDetail.previewVisualRawImageRecordId }
              : {}),
            ...(normalizedDetail?.coreSummary ? { coreSummary: normalizedDetail.coreSummary } : {}),
            ...(normalizedDetail?.feedbackSummary
              ? { feedbackSummary: normalizedDetail.feedbackSummary }
              : {})
          }
        : current
    manualListState.value.items = manualListState.value.items.map(patch)
    batchListState.value.items = batchListState.value.items.map(patch)
    legacyListState.value.items = legacyListState.value.items.map(patch)
    syncCombinedItems()
    return normalizedDetail
  } catch (error) {
    showMessage(error?.message || '读取核心过程失败', 'error')
    return null
  } finally {
    const nextLoadingMap = { ...detailLoadingMap.value }
    delete nextLoadingMap[sessionId]
    detailLoadingMap.value = nextLoadingMap
  }
}

function normalizeCompareSessionIds(values = []) {
  const currentSessionId = String(selectedSessionId.value || '').trim()
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .flatMap(item => String(item || '').split(/[\s,，;；]+/))
        .map(item => item.trim())
        .filter(item => item && item !== currentSessionId)
    )
  ).slice(0, 2)
}

function handleCompareSessionSelect(values = []) {
  compareSessionIds.value = normalizeCompareSessionIds(values)
}

function addCompareSessionId() {
  const nextIds = normalizeCompareSessionIds([
    ...compareSessionIds.value,
    ...String(compareSessionInput.value || '').split(/[\s,，;；]+/)
  ])
  if (!nextIds.length) {
    showMessage('请输入不同于当前详情的 sessionId', 'warning')
    return
  }
  compareSessionIds.value = nextIds
  compareSessionInput.value = ''
}

function clearCompareSessions() {
  compareSessionIds.value = []
  compareSessionInput.value = ''
}

async function loadCompareSessions(sessionIds = []) {
  const targets = normalizeCompareSessionIds(sessionIds)
  if (!targets.length) {return}

  await Promise.allSettled(
    targets.map(async sessionId => {
      const row = items.value.find(item => item.diagnosisSessionId === sessionId) || {
        diagnosisSessionId: sessionId,
        reviewSourceType: 'all',
        batchReviewMeta: null
      }
      await Promise.all([
        ensureDetail(sessionId),
        ensurePreviewImages(row, { silent: true })
      ])
    })
  )
}

async function openDetail(row) {
  const sessionId = String(row?.diagnosisSessionId || '').trim()
  if (!sessionId) {return}
  selectedSessionId.value = sessionId
  detailDrawerVisible.value = true
  await Promise.all([ensureDetail(sessionId), ensurePreviewImages(row, { silent: true })])
}

function copySessionId(item) {
  const value = String(item?.diagnosisSessionId || '').trim()
  if (!value) {return}
  uni.setClipboardData({
    data: value,
    success: () => {
      showMessage('已复制 Session ID', 'success')
    }
  })
}

function formatOutcomeLabel(outcomeType = '') {
  if (outcomeType === 'problematic') {return '有问题'}
  if (outcomeType === 'non_problematic') {return '未见明确问题'}
  if (outcomeType === 'uncertain') {return '不确定'}
  return '未知'
}

function formatRouteText(routePrimaryAction = '') {
  const key = String(routePrimaryAction || '').trim()
  if (!key || key === 'standard_flow') {
    return '标准流程'
  }
  const routeLabelMap = {
    overwatering_root_pressure_route: '根部状态评估',
    overwatering_root_pressure: '根部状态评估',
    watering_root_pressure_route: '浇水评估',
    watering_route: '浇水评估',
    yellowing_route: '黄叶评估',
    yellowing_airflow_leaf_spot_route: '黄叶与叶斑联合排查',
    leaf_spot_problem_route: '叶斑排查',
    fertilization_route: '施肥评估',
    fertilizer_route: '施肥评估'
  }
  return routeLabelMap[key] || key
}

function formatSourceLabel(sourceType = '') {
  if (sourceType === 'batch') {return '脚本批跑'}
  if (sourceType === 'manual') {return '真人手动'}
  if (sourceType === 'legacy') {return '未归一历史'}
  return '未知来源'
}

function formatSourceEvidenceLabel(sourceEvidence = '') {
  if (sourceEvidence === 'platform_tagged') {return '真人小程序诊断（平台标记）'}
  if (sourceEvidence === 'openid_inferred_manual') {return '真人小程序诊断（openid 推断）'}
  if (sourceEvidence === 'web_tagged') {return 'Web / H5 调试诊断'}
  if (sourceEvidence === 'openid_inferred_legacy') {return '真人小程序诊断（历史推断）'}
  return '未归一来源'
}

function formatFeedbackBinary(value, positiveLabel, negativeLabel) {
  if (value === null || value === undefined) {
    return '未填写'
  }
  return Number(value) ? positiveLabel : negativeLabel
}

function formatFeedbackVerdict(feedbackSummary = null) {
  const latestFeedback = feedbackSummary?.latestFeedback || null
  if (!latestFeedback) {
    return '暂无回访数据'
  }
  const helpfulText = formatFeedbackBinary(latestFeedback.isHelpful, '有帮助', '无帮助')
  const accurateText = formatFeedbackBinary(latestFeedback.isAccurate, '较准确', '不准确')
  return `${helpfulText} / ${accurateText}`
}

function formatFeedbackNote(feedbackSummary = null, fallback = '无备注') {
  const note = String(feedbackSummary?.latestFeedback?.note || '').trim()
  return note || fallback
}

function formatDecisionGovernance(detail = null) {
  const stopState = detail?.coreProcess?.decision?.stopState || null
  const outputEligibility = detail?.coreProcess?.decision?.outputEligibility || null
  const stopReasonType = String(stopState?.stopReasonType || '').trim()
  const conclusionStatus = String(outputEligibility?.conclusionStatus || '').trim()
  const judgment = String(outputEligibility?.judgment || '').trim()
  return [stopReasonType, conclusionStatus, judgment].filter(Boolean).join(' / ') || 'n/a'
}

function getActionAdviceGovernance(detail = null) {
  const governance = detail?.actionAdviceGovernance || null
  return governance && typeof governance === 'object' ? governance : null
}

function getGovernedAdvice(detail = null) {
  const advice = getActionAdviceGovernance(detail)?.governedAdvice || null
  return advice && typeof advice === 'object' ? advice : null
}

function getRawStoredAdvice(detail = null) {
  const advice = getActionAdviceGovernance(detail)?.rawStoredAdvice || null
  return advice && typeof advice === 'object' ? advice : null
}

function formatAdviceItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item =>
      typeof item === 'string'
        ? String(item || '').trim()
        : String(item?.text || item?.title || item?.label || '').trim()
    )
    .filter(Boolean)
}

function formatGovernedAdviceSource(source = '') {
  if (source === 'audited_explanation') {return '已审核解释表'}
  if (source === 'problem_fallback') {return '问题主表 fallback'}
  if (source === 'governance_fallback') {return '治理兜底'}
  return source || '无正式建议'
}

function formatAdviceDisplayRecommendation(value = '') {
  if (value === 'show_governed_advice_only') {return '只展示 governed advice；raw 仅作审计'}
  if (value === 'not_applicable') {return '当前结果类型不适用'}
  return value || '未声明'
}

function formatRawAdvicePolicy(value = '') {
  if (value === 'do_not_show_as_governed_advice') {return '仅审计原文，不作为正式建议展示'}
  return value || '仅审计原文'
}

function resolveCompareTitle(column = {}) {
  const detail = column?.detail || null
  const row = column?.row || null
  return String(
    detail?.displayName ||
      detail?.finalResult?.displayName ||
      row?.displayName ||
      '诊断记录'
  ).trim()
}

function resolveFirstVisualRawRecord(detail = null) {
  return getVisualRawRecords(detail)[0] || null
}

function resolveFirstParsedVisualResult(detail = null) {
  const record = resolveFirstVisualRawRecord(detail)
  return (
    record?.modelParsedResult ||
    record?.rawStructuredOutput?.parsed_result ||
    record?.rawStructuredOutput?.parsedResult ||
    {}
  )
}

function formatDetailPromptStats(detail = null) {
  const record = resolveFirstVisualRawRecord(detail)
  const audit = record?.llmPromptAudit || detail?.hunyuanPromptAudit || null
  const tokens = resolvePromptTokens(audit)
  const promptLength = Number(
    audit?.promptLength ||
      record?.llmPromptLength ||
      resolveFullPromptText(record).length ||
      0
  )
  const candidatePoolTextLength = Number(
    audit?.promptDebugMeta?.candidatePoolTextLength ||
      audit?.promptDebugMeta?.candidate_pool_text_length ||
      0
  )
  return [
    `promptLength ${Number.isFinite(promptLength) ? promptLength : 0}`,
    candidatePoolTextLength ? `pool ${candidatePoolTextLength}` : '',
    `tokens ${tokens.prompt}/${tokens.completion}/${tokens.total}`,
    `cache ${formatPromptCacheSummary(audit)}`,
    `cost ${formatPromptTokenCost(record || audit)}`
  ].filter(Boolean).join(' / ')
}

function formatOutOfPoolCandidates(detail = null) {
  const candidates = Array.isArray(resolveFirstParsedVisualResult(detail)?.out_of_pool_symptom_candidates)
    ? resolveFirstParsedVisualResult(detail).out_of_pool_symptom_candidates
    : []
  const labels = candidates.map(item => {
    const name = String(
      item?.raw_visual_name_cn ||
        item?.rawVisualNameCn ||
        item?.raw_visual_name_en ||
        item?.rawVisualNameEn ||
        ''
    ).trim()
    const hint = String(item?.closest_symptom_key_hint || item?.closestSymptomKeyHint || '').trim()
    return [name || hint, hint ? `(${hint})` : ''].filter(Boolean).join(' ')
  })
  return formatDetailLines(labels, '无')
}

function formatVisualRouteHints(detail = null) {
  const visualSummary = detail?.coreProcess?.visual?.visualAggregateSummary || null
  const aggregateHints = Array.isArray(visualSummary?.aggregateRouteHints)
    ? visualSummary.aggregateRouteHints
    : Array.isArray(visualSummary?.aggregate_route_hints)
      ? visualSummary.aggregate_route_hints
      : []
  const rawHints = Array.isArray(resolveFirstParsedVisualResult(detail)?.route_hints)
    ? resolveFirstParsedVisualResult(detail).route_hints
    : []
  const labels = [...aggregateHints, ...rawHints].map(item =>
    [item?.type, item?.reason].map(value => String(value || '').trim()).filter(Boolean).join(':')
  )
  return formatDetailLines(labels, '无')
}

function formatQuestionCountSummary(detail = null) {
  const summary = detail?.questionCountSummary || detail?.coreProcess?.followUp?.questionCountSummary || {}
  return `总 ${Number(summary?.totalItems || 0)} / 已问 ${Number(summary?.askedItems || 0)} / 已答 ${Number(summary?.answeredItems || 0)} / active ${Number(summary?.activeItems || 0)}`
}

function getRouteDecision(detail = null) {
  const routeDecision = detail?.coreProcess?.route?.routeDecision || detail?.routeDecision || null
  return routeDecision && typeof routeDecision === 'object' ? routeDecision : null
}

function getRouteDecisionFieldRows(detail = null) {
  const routeDecision = getRouteDecision(detail)
  if (!routeDecision) {return []}
  return [
    {
      key: 'mode',
      label: '模式',
      value: routeDecision.mode || '未返回'
    },
    {
      key: 'activeRouteGroupKeys',
      label: '命中流程组',
      value: formatDetailLines(routeDecision.activeRouteGroupKeys, '无')
    },
    {
      key: 'visibleOutcomeKeys',
      label: '可展示结论',
      value: formatDetailLines(routeDecision.visibleOutcomeKeys, '无')
    },
    {
      key: 'nextQuestionKeys',
      label: '下一题',
      value: formatDetailLines(routeDecision.nextQuestionKeys, '无')
    },
    {
      key: 'decisionCause',
      label: '决策原因',
      value: [
        routeDecision.decisionCause?.decisionCauseKey,
        routeDecision.decisionCause?.decisionCauseText
      ].filter(Boolean).join(' / ') || '无'
    }
  ]
}

function getRoutePathRows(detail = null) {
  const routeDecision = getRouteDecision(detail)
  if (!routeDecision) {return []}
  const candidateRows = (Array.isArray(routeDecision.candidateOutcomeStates)
    ? routeDecision.candidateOutcomeStates
    : []
  ).map(item => ({
    key: item.outcomeKey ? `候选:${item.outcomeKey}` : '候选:未知',
    title: item.outcomeKey || '未知结果',
    meta: [
      item.state ? `状态=${item.state}` : '',
      item.missingGateKeys?.length ? `缺少门禁=${item.missingGateKeys.join(', ')}` : '',
      item.nextQuestionKeys?.length ? `下一题=${item.nextQuestionKeys.join(', ')}` : ''
    ].filter(Boolean).join(' / '),
      value: formatDetailLines(item.routeKeys, '无')
  }))
  const traceRows = (Array.isArray(routeDecision.routeTrace) ? routeDecision.routeTrace : []).map(item => ({
    key: item.outcomeKey ? `流程回看:${item.outcomeKey}` : '流程回看:未知结果',
    title: `流程回看 ${item.outcomeKey || '未知结果'}`,
    meta: formatDetailLines(item.routeKeys, '无'),
    value: formatDetailLines(
      (Array.isArray(item.gateResults) ? item.gateResults : []).map(result =>
        [
          result.gateKey || '未知门禁',
          result.gateRole || '',
          result.result || ''
        ].filter(Boolean).join(':')
      ),
      '无门禁'
    )
  }))
  const gateRows = (Array.isArray(routeDecision.gateResults) ? routeDecision.gateResults : []).map(item => ({
    key: item.routeKey && item.gateKey
      ? `${item.routeKey} / 门禁:${item.gateKey}`
      : '门禁:未知',
    title: item.gateKey || '未知门禁',
    meta: [
      item.routeKey,
      item.gateRole,
      item.result
    ].filter(Boolean).join(' / '),
    value: [
      `证据满足=${Boolean(item.requiredEvidenceMatched)}`,
      `答题满足=${Boolean(item.requiredAnswerEffectsMatched)}`,
      `阻断=${Boolean(item.blockerMatched)}`
    ].join(' / ')
  }))
  return [...candidateRows, ...traceRows, ...gateRows]
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {return ''}
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatSymptomClassSummary(symptomClass = null) {
  const safeSymptomClass = symptomClass && typeof symptomClass === 'object' ? symptomClass : null
  if (!safeSymptomClass) {
    return '未映射'
  }
  const label = String(
    safeSymptomClass.currentClassLabel ||
      safeSymptomClass.classLabel ||
      safeSymptomClass.primaryClass?.classNameCn ||
      safeSymptomClass.label ||
      ''
  ).trim()
  const key = String(
    safeSymptomClass.currentClassKey ||
      safeSymptomClass.classKey ||
      safeSymptomClass.primaryClass?.classKey ||
      ''
  ).trim()
  const scoreValue = Number(
    safeSymptomClass.currentClassConfidence ??
      safeSymptomClass.currentClassScore ??
      safeSymptomClass.classScores?.[0]?.score ??
      safeSymptomClass.score ??
      safeSymptomClass.confidence ??
      0
  )
  const score = Number.isFinite(scoreValue) ? `${scoreValue.toFixed(3)}` : ''
  const parts = [label || key]
  if (label && key) {
    parts.push(`(${key})`)
  }
  if (score) {
    parts.push(`score=${score}`)
  }
  return parts.filter(Boolean).join(' ')
}

function formatSymptomClassGuard(symptomClass = null) {
  const safeSymptomClass = symptomClass && typeof symptomClass === 'object' ? symptomClass : null
  if (!safeSymptomClass) {
    return '无门控'
  }
  const guardMode = String(
    safeSymptomClass.guardMode || safeSymptomClass.classGuardMode || ''
  ).trim()
  if (guardMode) {
    return guardMode
  }
  const classSource = String(
    safeSymptomClass.currentClassSource || safeSymptomClass.source || ''
  ).trim()
  return classSource || '已自动'
}

function formatDetailLines(items = [], fallback = '无', options = {}) {
  const safeItems = (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
  if (!safeItems.length) {return fallback}
  const limit = Number.isFinite(Number(options?.limit))
    ? Math.max(1, Number(options.limit))
    : 8
  const visibleItems = safeItems.slice(0, limit)
  if (safeItems.length > limit) {
    visibleItems.push(`另 ${safeItems.length - limit} 条未展示（共 ${safeItems.length} 条）`)
  }
  return visibleItems.join(' / ')
}

function getCoreProcessFieldRows(detail = null) {
  return [
    {
      key: 'symptomClass',
      label: '症状模式',
      meaning: '症状分类是症状池与问题簇之间的门控层，决定可触发的问题族与默认优先级。',
      value: formatSymptomClassSummary(detail?.symptomClass)
    },
    {
      key: 'visual.visualCandidateSymptoms',
      label: '视觉候选症状',
      meaning: 'Hunyuan 和归一化层已经识别到、但尚未经过问诊确认进入正式证据层的视觉候选。',
      value: formatDetailLines(getVisualCandidateLabels(detail), '尚无视觉候选')
    },
    {
      key: 'visual.latestVisualCallBatchId',
      label: '视觉批次 ID',
      meaning: '本次诊断进入主链的视觉识别批次，用于回查原始 AI 返回和归一化结果。',
      value:
        detail?.coreProcess?.visual?.latestVisualCallBatchId ||
        detail?.latestVisualCallBatchId ||
        '无'
    },
    {
      key: 'evidence.observedSymptoms',
      label: '观察症状',
      meaning: '由正式证据集合投射出的症状，不等同于模型原始候选。',
      value: formatDetailLines(getObservedSymptomLabels(detail), '尚无观察症状')
    },
    {
      key: 'evidence.observedEvidenceSet',
      label: '正式证据集合',
      meaning: '已通过 admission 或问答回流进入诊断主链的事实层证据。',
      value: formatDetailLines(getObservedEvidenceLabels(detail), '尚无正式证据')
    },
    {
      key: 'evidence.derivedEvidenceSet',
      label: '模式证据',
      meaning: '从正式证据抽取出的模式/分布信息，只能辅助方向形成，不能单独裁决。',
      value: formatDetailLines(getDerivedEvidenceLabels(detail), '尚无模式证据')
    },
    {
      key: 'evidence.diagnosisDirections',
      label: '诊断方向',
      meaning: '系统根据证据形成的候选方向及可输出问题集合。',
      value: formatDetailLines(getDiagnosisDirectionLabels(detail), '尚无诊断方向')
    },
    {
      key: 'followUp.questionQueue',
      label: '追问队列',
      meaning: '本轮可追问的问题队列；完成后可能为空，应结合下方追问流水查看历史提问。',
      value: formatDetailLines(getQuestionQueueLabels(detail), '本轮无可追问题')
    },
    {
      key: 'decision.outputEligibility',
      label: '输出资格',
      meaning: '最终是否允许输出结论，以及若不允许时的原因。',
      value: formatDecisionGovernance(detail)
    }
  ]
}

function getVisualRawRecords(detail = null) {
  return Array.isArray(detail?.visualRawRecords) ? detail.visualRawRecords : []
}

function getFollowUpRecords(detail = null) {
  return Array.isArray(detail?.followUpRecords) ? detail.followUpRecords : []
}

function getAnswerRevisionEvents(detail = null) {
  if (Array.isArray(detail?.answerRevisionEvents)) {return detail.answerRevisionEvents}
  return Array.isArray(detail?.followUpAnswerEvents) ? detail.followUpAnswerEvents : []
}

function getFirstRoundQuestions(detail = null) {
  const firstRoundQuestions = Array.isArray(detail?.firstRoundQuestions)
    ? detail.firstRoundQuestions
    : []
  if (firstRoundQuestions.length) {return firstRoundQuestions}

  const followUpRecords = getFollowUpRecords(detail)
  if (!followUpRecords.length) {return []}
  const firstRoundIndex = Math.min(...followUpRecords.map(item => Number(item?.roundIndex || 1)))
  return followUpRecords.filter(item => Number(item?.roundIndex || 1) === firstRoundIndex)
}

function getVisualCandidateLabels(detail = null) {
  const visualAggregateSummary = detail?.coreProcess?.visual?.visualAggregateSummary || null
  const candidates = Array.isArray(visualAggregateSummary?.aggregatedSymptomCandidates)
    ? visualAggregateSummary.aggregatedSymptomCandidates
    : Array.isArray(visualAggregateSummary?.aggregated_symptom_candidates)
      ? visualAggregateSummary.aggregated_symptom_candidates
      : []
  return candidates.map(entry => {
    const label = String(
      entry?.displayNameCn ||
        entry?.display_name_cn ||
        entry?.symptomCn ||
        entry?.symptom_cn ||
        entry?.symptomKey ||
        entry?.symptom_key ||
        ''
    ).trim()
    const symptomKey = String(entry?.symptomKey || entry?.symptom_key || '').trim()
    const band = String(entry?.confidenceBand || entry?.confidence_band || '').trim()
    return [label, symptomKey ? `(${symptomKey})` : '', band ? `[${band}]` : '']
      .filter(Boolean)
      .join(' ')
  })
}

function formatRawSymptoms(symptoms = []) {
  const rows = (Array.isArray(symptoms) ? symptoms : [])
    .map(item => {
      const symptomKey = String(item?.symptom_key || item?.symptomKey || '').trim()
      const displayName = String(
        item?.display_name_cn || item?.displayNameCn || item?.symptomCn || ''
      ).trim()
      const confidence = String(item?.confidence_band || item?.confidenceBand || '').trim()
      return [
        displayName || symptomKey,
        symptomKey ? `(${symptomKey})` : '',
        confidence ? `[${confidence}]` : ''
      ]
        .filter(Boolean)
        .join(' ')
    })
    .filter(Boolean)
  return formatDetailLines(rows, '无')
}

function stringifyCompact(value = null) {
  if (value === null || value === undefined || value === '') {return '无'}
  try {
    return JSON.stringify(value, null, 2).slice(0, 5000)
  } catch {
    return String(value).slice(0, 5000)
  }
}

function formatVisualSlot(record = {}) {
  const order = Number(record?.inputSlotOrder || 0) + 1
  return `图${order} ${record?.inputSlotLabel || record?.inputSlotType || '未知槽位'}`
}

function formatTargetDimension(value = '') {
  const normalized = String(value || '').trim()
  const map = {
    visual_presence: '视觉是否存在',
    tissue_integrity: '组织完整性',
    surface_texture: '表面质感',
    underside_presence: '叶背/隐蔽面',
    surface_stickiness: '黏液/蜜露',
    distribution_scope: '分布范围',
    progression: '进展变化',
    host_confirmation: '宿主确认',
    light_exposure: '光照背景',
    watering_context: '浇水背景',
    fertilization_context: '施肥背景',
    substrate_moisture: '盆土湿度'
  }
  return map[normalized] || normalized || '未标注'
}

function formatRoutingScope(value = '') {
  const normalized = String(value || '').trim()
  const map = {
    symptom_confirmation: '症状确认',
    context_probe: '上下文补问',
    differential_probe: '鉴别追问',
    problem_confirmation: '问题确认'
  }
  return map[normalized] || normalized || '未标注'
}

function formatQuestionAnswer(question = {}) {
  const optionText = String(question?.optionText || '').trim()
  const optionKey = String(question?.optionKey || '').trim()
  const status = String(question?.status || '').trim()
  const effect = String(question?.answerEffect || '').trim()
  const answerText = optionText || optionKey || '未回答'
  return [answerText, status ? `状态：${status}` : '', effect].filter(Boolean).join('；')
}

function formatResolvedDirectProblemAdjustments(adjustments = []) {
  return (Array.isArray(adjustments) ? adjustments : [])
    .map(item => {
      const problemKey = String(item?.problemKey || item?.problem_key || '').trim()
      return problemKey
    })
    .filter(Boolean)
}

function formatResolvedAnswerEffect(question = {}) {
  const parts = []
  const resolvedEffectSource = String(question?.resolvedEffectSource || '').trim()
  const resolvedAnswerEffect = String(question?.resolvedAnswerEffect || '').trim()
  const mapsToSymptomKey = String(question?.resolvedMapsToSymptomKey || '').trim()
  const associationStrength = Number(question?.resolvedAssociationStrength)
  const directEffects = formatResolvedDirectProblemAdjustments(question?.resolvedDirectProblemAdjustments)

  if (resolvedAnswerEffect && resolvedAnswerEffect !== String(question?.answerEffect || '').trim()) {
    parts.push(resolvedAnswerEffect)
  }
  if (mapsToSymptomKey) {
    const strengthText = Number.isFinite(associationStrength) && associationStrength > 0
      ? `strength ${associationStrength.toFixed(2)}`
      : ''
    parts.push(`症状映射 ${mapsToSymptomKey}${strengthText ? `（${strengthText}）` : ''}`)
  }
  if (directEffects.length) {
    parts.push(`影响 outcome ${directEffects.join('，')}`)
  }
  if (resolvedEffectSource && parts.length) {
    parts.push(`来源 ${resolvedEffectSource}`)
  }
  return parts.join('；')
}

function formatAnswerRevisionEventType(value = '') {
  const normalized = String(value || '').trim()
  const labels = {
    answer_changed: '修改答案',
    historical_answer_added: '补记历史答案',
    downstream_invalidated: '废弃后续问题'
  }
  return labels[normalized] || normalized || '答案改写'
}

function formatAnswerRevisionEvent(event = {}) {
  const previousOption = String(event?.previousOptionKey || '').trim() || '未回答'
  const nextOption = String(event?.newOptionKey || '').trim() || '无'
  const revisionText = `revision ${Number(event?.answerRevisionBefore || 0)} -> ${Number(event?.answerRevisionAfter || 0)}`
  const changeText =
    String(event?.eventType || '').trim() === 'downstream_invalidated'
      ? `原答案 ${previousOption} 已废弃`
      : `${previousOption} -> ${nextOption}`
  const dirtyText = event?.dirtyQuestionKey ? `触发题：${event.dirtyQuestionKey}` : ''
  return [revisionText, changeText, dirtyText, event?.createdAt ? formatTime(event.createdAt) : '']
    .filter(Boolean)
    .join('；')
}

function resolveHunyuanModel(row = null) {
  const modelProvider = String(
    row?.llmSourceModelProvider || row?.hunyuanPromptAudit?.modelProvider || ''
  ).trim()
  const modelName = String(
    row?.llmSourceModelName || row?.hunyuanPromptAudit?.modelName || ''
  ).trim()
  if (modelProvider && modelName) {
    return `${modelProvider}/${modelName}`
  }
  return modelName || modelProvider || '未记录模型'
}

function resolvePromptVersion(row = null) {
  const version = String(
    row?.llmPromptVersion || row?.llmPrompt?.version || row?.hunyuanPromptAudit?.promptVersion || ''
  ).trim()
  return version || '无版本'
}

function resolveFullPromptText(row = null) {
  return String(
    row?.llmPromptText ||
      row?.llmPrompt?.promptText ||
      row?.hunyuanPromptAudit?.promptText ||
      row?.llmPromptAudit?.promptText ||
      ''
  ).trim()
}

function resolvePromptTokens(row = null) {
  const usage = row?.usage || row?.hunyuanPromptAudit?.usage || row?.llmPromptAudit?.usage || {}
  const promptTokens = Number(
    row?.promptTokens ??
      row?.llmPromptTokens?.prompt ??
      usage?.promptTokens ??
      0
  )
  const completionTokens = Number(
    row?.completionTokens ??
      row?.llmPromptTokens?.completion ??
      usage?.completionTokens ??
      0
  )
  const totalTokens = Number(
    row?.totalTokens ??
      row?.llmPromptTokens?.total ??
      usage?.totalTokens ??
      promptTokens + completionTokens
  )
  return {
    prompt: Number.isFinite(promptTokens) ? promptTokens : 0,
    completion: Number.isFinite(completionTokens) ? completionTokens : 0,
    total: Number.isFinite(totalTokens) ? totalTokens : 0
  }
}

function hasPromptTokenMetrics(row = null) {
  const tokens = resolvePromptTokens(row)
  return Number(tokens.prompt || 0) > 0 ||
    Number(tokens.completion || 0) > 0 ||
    Number(tokens.total || 0) > 0
}

function normalizePromptCacheStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'hit' || normalized === 'cache_hit') {return 'hit'}
  if (normalized === 'miss' || normalized === 'cache_miss') {return 'miss'}
  return 'unknown'
}

function resolvePromptCacheStatus(row = null) {
  const usage = row?.usage || row?.hunyuanPromptAudit?.usage || row?.llmPromptAudit?.usage || {}
  const statusSource =
    row?.promptCacheStatus ||
    row?.qwenCacheStatus ||
    row?.hunyuanPromptAudit?.promptCacheStatus ||
    row?.hunyuanPromptAudit?.qwenCacheStatus ||
    row?.llmPromptAudit?.promptCacheStatus ||
    row?.llmPromptAudit?.qwenCacheStatus ||
    usage?.promptCacheStatus ||
    usage?.qwenCacheStatus ||
    null
  const rawStatus =
    statusSource && typeof statusSource === 'object'
      ? statusSource
      : { status: statusSource }
  const promptTokens = Number(
    rawStatus?.promptTokens ??
      row?.promptTokens ??
      usage?.promptTokens ??
      resolvePromptTokens(row).prompt ??
      0
  )
  const outputTokens = Number(
    rawStatus?.outputTokens ??
      row?.outputTokens ??
      row?.completionTokens ??
      usage?.outputTokens ??
      usage?.completionTokens ??
      resolvePromptTokens(row).completion ??
      0
  )
  const hitTokens = Number(
    rawStatus?.promptCacheHitTokens ??
      row?.promptCacheHitTokens ??
      usage?.promptCacheHitTokens ??
      0
  )
  const creationTokens = Number(
    rawStatus?.promptCacheCreationInputTokens ??
      row?.promptCacheCreationInputTokens ??
      usage?.promptCacheCreationInputTokens ??
      0
  )
  const explicitMissTokens = Number(
    rawStatus?.promptCacheMissTokens ??
      row?.promptCacheMissTokens ??
      usage?.promptCacheMissTokens ??
      NaN
  )
  const rawStatusText = normalizePromptCacheStatus(rawStatus?.status || '')
  const metricAvailable = Boolean(
    Number(rawStatus?.metricAvailable ?? row?.promptCacheMetricAvailable ?? usage?.promptCacheMetricAvailable ?? 0) ||
      rawStatusText !== 'unknown'
  )
  const missTokens = Number.isFinite(explicitMissTokens)
    ? Math.max(0, explicitMissTokens)
    : metricAvailable
      ? Math.max(0, promptTokens - Math.max(0, hitTokens) - Math.max(0, creationTokens))
      : 0
  const fallbackStatus = metricAvailable
    ? (Number(hitTokens || 0) > 0 ? 'hit' : 'miss')
    : 'unknown'
  const status = normalizePromptCacheStatus(rawStatus?.status || fallbackStatus)
  const hitRatio = promptTokens > 0 ? Number((Math.max(0, hitTokens) / promptTokens).toFixed(4)) : 0

  return {
    status,
    statusLabelCn:
      rawStatus?.statusLabelCn ||
      (status === 'hit' ? '命中缓存' : status === 'miss' ? '未命中缓存' : '未知'),
    promptCacheHitTokens: Math.max(0, Number(hitTokens || 0)),
    promptCacheMissTokens: missTokens,
    promptCacheCreationInputTokens: Math.max(0, Number(creationTokens || 0)),
    outputTokens: Math.max(0, Number(outputTokens || 0)),
    promptTokens: Math.max(0, Number(promptTokens || 0)),
    hitRatio,
    metricAvailable: metricAvailable ? 1 : 0
  }
}

function hasPromptCacheMetrics(row = null) {
  const status = resolvePromptCacheStatus(row)
  return Number(status.metricAvailable || 0) > 0 ||
    Number(status.promptCacheHitTokens || 0) > 0 ||
    Number(status.promptCacheMissTokens || 0) > 0 ||
    Number(status.promptCacheCreationInputTokens || 0) > 0
}

function resolvePromptCacheBadgeClass(row = null) {
  const status = resolvePromptCacheStatus(row).status
  return ['prompt-cache-badge', `prompt-cache-badge-${status}`]
}

function formatPromptCacheHitRatio(row = null) {
  const ratio = resolvePromptCacheStatus(row).hitRatio
  return `${Math.round(Number(ratio || 0) * 1000) / 10}%`
}

function formatPromptCacheSummary(row = null) {
  const status = resolvePromptCacheStatus(row)
  return [
    status.statusLabelCn,
    `hit ${status.promptCacheHitTokens}`,
    `miss ${status.promptCacheMissTokens}`,
    `create ${status.promptCacheCreationInputTokens}`,
    `ratio ${formatPromptCacheHitRatio(row)}`
  ].join(' ')
}

function resolvePromptTokenCost(row = null) {
  const cacheStatus = resolvePromptCacheStatus(row)
  return calculateLlmTokenCost({
    ...resolvePromptTokens(row),
    promptCacheHitTokens: cacheStatus.promptCacheHitTokens,
    promptCacheCreationInputTokens: cacheStatus.promptCacheCreationInputTokens
  }, row)
}

function formatPromptTokenCost(row = null) {
  const cost = resolvePromptTokenCost(row)
  const parts = [
    formatCnyTokenCost(cost.totalCost),
    `in ${formatCnyTokenCost(cost.inputCost)}`,
    `out ${formatCnyTokenCost(cost.outputCost)}`
  ]
  if (cost.pricing?.cacheSupported) {
    parts.push(
      `base ${formatCnyTokenCost(cost.uncachedInputCost)}`,
      `hit ${formatCnyTokenCost(cost.cacheHitInputCost)}`,
      `create ${formatCnyTokenCost(cost.cacheCreationInputCost)}`
    )
  }
  return parts.join(' · ')
}

function formatPromptSnippet(value = '') {
  const text = String(value || '').trim()
  if (!text) {return '无 prompt'}
  if (text.length <= 120) {return text}
  return `${text.slice(0, 117)}...`
}

function getObservedSymptomLabels(detail = null) {
  const observedSymptoms = Array.isArray(detail?.coreProcess?.evidence?.observedSymptoms)
    ? detail.coreProcess.evidence.observedSymptoms
    : []
  return observedSymptoms.map(entry =>
    String(entry?.symptomCn || entry?.displayTextCn || entry?.symptomKey || '').trim()
  )
}

function getObservedEvidenceLabels(detail = null) {
  const observedEvidenceSet = Array.isArray(detail?.coreProcess?.evidence?.observedEvidenceSet)
    ? detail.coreProcess.evidence.observedEvidenceSet
    : []
  return observedEvidenceSet.map(entry =>
    String(entry?.symptomCn || entry?.displayTextCn || entry?.evidenceKey || '').trim()
  )
}

function getDerivedEvidenceLabels(detail = null) {
  const derivedEvidenceSet = Array.isArray(detail?.coreProcess?.evidence?.derivedEvidenceSet)
    ? detail.coreProcess.evidence.derivedEvidenceSet
    : []
  return derivedEvidenceSet.map(entry =>
    String(entry?.label || entry?.derivedEvidenceKey || entry?.patternKey || '').trim()
  )
}

function getDiagnosisDirectionLabels(detail = null) {
  const diagnosisDirections = Array.isArray(detail?.coreProcess?.evidence?.diagnosisDirections)
    ? detail.coreProcess.evidence.diagnosisDirections
    : []
  return diagnosisDirections.map(entry => String(entry?.label || entry?.directionKey || '').trim())
}

function getQuestionQueueLabels(detail = null) {
  const questionItems = Array.isArray(detail?.coreProcess?.followUp?.questionQueue?.questionItems)
    ? detail.coreProcess.followUp.questionQueue.questionItems
    : []
  return questionItems.map(entry => {
    const questionText = String(
      entry?.text || entry?.questionText || entry?.questionId || ''
    ).trim()
    const targetDimension = String(entry?.targetDimension || '').trim()
    const status = String(entry?.status || '').trim()
    return [
      questionText,
      targetDimension ? `(${targetDimension})` : '',
      status ? `[${status}]` : ''
    ]
      .filter(Boolean)
      .join(' ')
  })
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
  user-select: text;
  -webkit-user-select: text;
}

.desktop-admin-page * {
  user-select: text;
  -webkit-user-select: text;
}

.desktop-admin-page button,
.desktop-admin-page .el-button,
.desktop-admin-page .el-segmented,
.desktop-admin-page .el-pagination {
  user-select: none;
  -webkit-user-select: none;
}

.desktop-hero,
.desktop-toolbar,
.desktop-table-shell,
.desktop-alert {
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
.section-title,
.drawer-title {
  margin: 10px 0 0;
  font-family: var(--desktop-serif-font);
  font-weight: 400;
}

.hero-title {
  font-size: 42px;
  line-height: 1.04;
}

.hero-copy,
.section-copy,
.drawer-copy {
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

.summary-panel,
.drawer-summary-card {
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

.summary-value,
.summary-value-small {
  display: block;
  margin-top: 8px;
  font-family: var(--desktop-serif-font);
  font-weight: 400;
  color: #1f3a33;
}

.summary-value {
  font-size: 40px;
}

.summary-value-small {
  font-size: 26px;
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
.hero-actions,
.drawer-head-actions {
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

.row-image-meta,
.cell-meta {
  color: #61756d;
  font-size: 12px;
  line-height: 1.6;
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

.cell-copy,
.drawer-detail-copy {
  color: #40554d;
  font-size: 13px;
  line-height: 1.72;
}

.prompt-cache-line {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.prompt-cache-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid #d8c9b4;
  background: #fffaf2;
  color: #6d6256;
  font-size: 11px;
  line-height: 18px;
}

.prompt-cache-badge-hit {
  border-color: #739a73;
  background: #edf5e9;
  color: #315a35;
}

.prompt-cache-badge-miss {
  border-color: #c98f72;
  background: #fff0e8;
  color: #8a4325;
}

.prompt-cache-badge-unknown {
  border-color: #c8b99f;
  background: #f4efe6;
  color: #6d6256;
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

.drawer-shell {
  padding: 24px;
  background: #f4efe6;
  min-height: 100%;
}

.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.drawer-title {
  font-size: 34px;
}

.drawer-summary-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.drawer-panel {
  margin-top: 18px;
  border: 1px solid #d8c9b4;
  background: rgba(255, 251, 244, 0.92);
  padding: 18px 20px;
}

.drawer-panel-title,
.drawer-detail-title {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8d745e;
}

.drawer-image-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.drawer-image,
.drawer-empty-box {
  width: 100%;
  min-height: 140px;
  border: 1px solid #d8c9b4;
  background: #ebe1d3;
}

.drawer-empty-box {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6d6256;
  font-size: 13px;
}

.drawer-detail-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.compare-panel {
  overflow: hidden;
}

.compare-head,
.compare-controls {
  display: flex;
  gap: 12px;
}

.compare-head {
  justify-content: space-between;
  align-items: flex-start;
}

.compare-controls {
  margin-top: 14px;
  align-items: center;
}

.compare-select {
  flex: 1 1 420px;
}

.compare-input {
  flex: 0 1 320px;
}

.compare-table-shell {
  margin-top: 14px;
  overflow-x: auto;
  border: 1px solid #d8c9b4;
  background: #f8f3eb;
}

.compare-row {
  display: grid;
  grid-template-columns: 190px repeat(3, minmax(260px, 1fr));
  min-width: 980px;
  border-top: 1px solid #e2d5c3;
}

.compare-row:first-child {
  border-top: 0;
}

.compare-row-head {
  background: #efe5d6;
}

.compare-label,
.compare-cell {
  padding: 12px 14px;
  border-left: 1px solid #e2d5c3;
  color: #1f3a33;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.compare-label {
  border-left: 0;
  background: rgba(239, 229, 214, 0.72);
}

.compare-label span,
.compare-session-head span {
  display: block;
  margin-top: 4px;
}

.compare-session-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drawer-detail-card {
  border: 1px solid #e2d5c3;
  background: #f8f3eb;
  padding: 14px 16px;
}

.process-field-list,
.route-path-list,
.raw-ai-card,
.question-history-row {
  margin-top: 14px;
}

.process-field-row,
.raw-ai-card,
.question-history-row {
  border: 1px solid #e2d5c3;
  background: #f8f3eb;
  padding: 14px 16px;
}

.process-field-row + .process-field-row,
.route-path-list .process-field-row + .process-field-row,
.question-history-row + .question-history-row {
  margin-top: 10px;
}

.process-field-title,
.question-history-title {
  color: #1f3a33;
  font-size: 14px;
  line-height: 1.6;
}

.process-field-key {
  margin-left: 10px;
  color: #8d745e;
  font-family: var(--desktop-mono-font);
  font-size: 11px;
}

.process-field-meaning,
.process-field-value {
  margin: 8px 0 0;
  color: #40554d;
  font-size: 13px;
  line-height: 1.72;
}

.process-field-value {
  color: #1f3a33;
  font-weight: 600;
}

.raw-ai-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.raw-json-preview {
  max-height: 280px;
  margin: 12px 0 0;
  overflow: auto;
  border: 1px solid #d8c9b4;
  background: #1f3a33;
  color: #f7f4ed;
  padding: 12px;
  font-family: var(--desktop-mono-font);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.drawer-loading {
  margin-top: 18px;
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
  .desktop-summary-grid,
  .drawer-summary-grid,
  .drawer-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .desktop-toolbar {
    grid-template-columns: 1fr;
  }
}
/* #endif */
</style>
