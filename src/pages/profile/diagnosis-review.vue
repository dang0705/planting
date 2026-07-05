<template>
  <Layout
    title="诊断记录管理"
    left-action="back"
    background-class="bg-[#f4efe6]"
    content-padding-top
  >
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
        <article v-if="filters.sourceType === 'session'" class="summary-panel">
          <span class="summary-label">未归一历史</span>
          <strong class="summary-value">{{ summary.sessionCount }}</strong>
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
      <DiagnosisReviewTableSections :view="viewContext" />
      <DiagnosisReviewDrawer :view="viewContext" />
    </div>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <view class="mobile-admin-fallback">
      <view class="mobile-admin-card">
        <text class="mobile-admin-title">诊断记录管理</text>
        <text class="mobile-admin-copy">
          该管理页已切到桌面端 H5 审计台，请在 Web
          端打开以使用固定表头、固定操作列和过程详情面板。</text
        ></view
      ></view
    >
    <!-- #endif --></Layout
  >
</template>

<script src="./diagnosis-review/setup.js"></script>

<style scoped src="./diagnosis-review/style.css"></style>
