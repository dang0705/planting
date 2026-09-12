<template>
  <!-- #ifdef H5 -->
  <section class="drawer-panel">
    <h4 class="drawer-panel-title">来源与回放</h4>
    <div class="drawer-detail-grid">
      <article class="drawer-detail-card">
        <h5 class="drawer-detail-title">来源信息</h5>
        <p class="drawer-detail-copy">来源: {{ formatSourceLabel(currentRow.reviewSourceType) }}</p>
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
        清空对比</el-button
      >
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
      /></el-select>
      <el-input
        v-model="compareSessionInput"
        clearable
        placeholder="粘贴 sessionId，回车添加"
        class="compare-input"
        @keyup.enter="addCompareSessionId"
      />
      <el-button class="desktop-primary-button" @click="addCompareSessionId"> 添加</el-button>
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
          <span v-if="detailLoadingMap[column.sessionId]" class="cell-meta"> 加载中...</span>
        </div>
      </div>
      <div v-for="row in compareRows" :key="row.key" class="compare-row">
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
      <div v-if="!currentPreviewImages.length" class="drawer-empty-box">当前无可回放图片</div>
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
    <h4 class="drawer-panel-title">环境与养护计算</h4>
    <div v-if="getEnvironmentCareCalculation(currentDetail)" class="environment-care-shell">
      <div class="drawer-detail-grid">
        <article
          v-for="field in getEnvironmentCareCalculationSummaryRows(currentDetail)"
          :key="field.key"
          class="drawer-detail-card"
        >
          <h5 class="drawer-detail-title">{{ field.label }}</h5>
          <p class="drawer-detail-copy cell-mono">{{ field.value }}</p>
        </article>
      </div>
      <div class="route-path-list">
        <article
          v-for="row in getEnvironmentCareCalculationRows(currentDetail)"
          :key="row.key"
          class="process-field-row"
        >
          <div>
            <strong class="process-field-title">{{ row.title }}</strong>
            <span class="process-field-key">{{ row.key }}</span>
          </div>
          <p class="process-field-meaning">{{ row.meta }}</p>
          <p class="process-field-value">{{ row.value }}</p>
          <div v-if="row.formulaLines?.length" class="formula-line-list">
            <p v-for="line in row.formulaLines" :key="line.key" class="formula-line">
              <span class="formula-line-title">{{ line.title }}</span>
              <span class="formula-line-expression">{{ line.expression }}</span>
              <span class="formula-line-substitution">{{ line.substitution }}</span>
              <span
                v-for="(processLine, processIndex) in line.processLines"
                :key="`${line.key}_process_${processIndex}`"
                class="formula-line-process"
              >
                {{ processLine }}</span
              >
            </p>
          </div>
          <pre v-if="row.formula" class="raw-json-preview">{{ stringifyCompact(row.formula) }}</pre>
        </article>
      </div>
      <pre class="raw-json-preview">{{
        stringifyCompact(getEnvironmentCareCalculation(currentDetail))
      }}</pre>
    </div>
    <div v-else class="drawer-empty-box">当前详情未返回环境与养护计算数据</div>
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
    <div v-else class="drawer-empty-box">当前详情未返回诊断决策信息</div>
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
          原始 treatment: {{ getRawStoredAdvice(currentDetail)?.treatment || '无' }}
        </p>
        <p class="drawer-detail-copy">
          原始 prevention: {{ getRawStoredAdvice(currentDetail)?.prevention || '无' }}
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
        <strong class="drawer-detail-title"> {{ formatVisualSlot(record) }}</strong>
        <span class="cell-meta">
          {{ record.sourceModelName || 'unknown_model' }} /
          {{ record.promptVersion || 'unknown_prompt' }}</span
        >
      </div>
      <p class="drawer-detail-copy">
        模型原始 symptom_candidates:
        {{ formatRawSymptoms(record?.modelParsedResult?.symptom_candidates) }}
      </p>
      <p class="drawer-detail-copy">
        标准化入池 topk: {{ formatRawSymptoms(record?.normalizedTopkSymptoms) }}
      </p>
      <p class="drawer-detail-copy">
        Prompt / Token: {{ formatPromptSnippet(resolveFullPromptText(record)) }} | prompt
        {{ resolvePromptTokens(record).prompt }} / completion
        {{ resolvePromptTokens(record).completion }} / total
        {{ resolvePromptTokens(record).total }} | 估算
        {{ formatPromptTokenCost(record) }}
      </p>
      <p class="drawer-detail-copy">
        Prompt 缓存状态:
        <span :class="resolvePromptCacheBadgeClass(record?.llmPromptAudit)">
          {{ resolvePromptCacheStatus(record?.llmPromptAudit).statusLabelCn }}</span
        >
        hit
        {{ resolvePromptCacheStatus(record?.llmPromptAudit).promptCacheHitTokens }} / miss
        {{ resolvePromptCacheStatus(record?.llmPromptAudit).promptCacheMissTokens }} / create
        {{ resolvePromptCacheStatus(record?.llmPromptAudit).promptCacheCreationInputTokens }}
        / output {{ resolvePromptCacheStatus(record?.llmPromptAudit).outputTokens }} / ratio
        {{ formatPromptCacheHitRatio(record?.llmPromptAudit) }}
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
        {{ question.questionOrder }}. {{ question.questionText || question.questionKey }}</strong
      >
      <p class="drawer-detail-copy">
        目标症状: {{ question.targetSymptomKey || '无' }}； 维度:
        {{ formatPackageTopic(question.packageTopic) }}； 作用域:
        {{ formatPackageSection(question.packageSection) }}
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
    <h4 class="drawer-panel-title">全部答题记录</h4>
    <div
      v-for="question in getQuestionRecords(currentDetail)"
      :key="`all_${question.id || question.questionKey}`"
      class="question-history-row"
    >
      <strong class="question-history-title">
        第 {{ question.roundIndex }} 轮 / {{ question.questionOrder }}.
        {{ question.questionText || question.questionKey }}</strong
      >
      <p class="drawer-detail-copy">
        {{ question.questionKey }} -> {{ formatQuestionAnswer(question) }}
      </p>
      <p v-if="formatResolvedAnswerEffect(question)" class="drawer-detail-copy">
        运行时生效影响: {{ formatResolvedAnswerEffect(question) }}
      </p>
    </div>
    <div v-if="!getQuestionRecords(currentDetail).length" class="drawer-empty-box">
      当前详情未记录答题记录
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
        {{ formatAnswerRevisionEventType(event.eventType) }}</strong
      >
      <p class="drawer-detail-copy">{{ event.questionText || event.questionKey }}</p>
      <p class="drawer-detail-copy">{{ formatAnswerRevisionEvent(event) }}</p>
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
          条数: {{ currentDetail?.feedbackSummary?.feedbackCount || 0 }}
        </p>
        <p class="drawer-detail-copy">
          评价: {{ formatFeedbackVerdict(currentDetail?.feedbackSummary) }}
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
          备注: {{ formatFeedbackNote(currentDetail?.feedbackSummary, '无备注') }}
        </p>
      </article>
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
