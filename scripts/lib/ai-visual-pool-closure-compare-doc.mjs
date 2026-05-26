import path from 'path'

export function buildAiVisualPoolClosureCompareDoc({
  title,
  metadata,
  sourceSets,
  closures,
  questionRows = [],
  strategyRows = [],
  sqlFiles = [],
  repoRoot,
  preClosureLines = [],
  reviewFocusLines = []
}) {
  const closureLines = closures.map(closure => {
    const confirm = questionRows.find(item => item.questionKey === closure.confirm.questionKey)
    const context = closure.context
      ? questionRows.find(item => item.questionKey === closure.context.questionKey)
      : null
    const mappedProblems = Array.from(
      new Set([...(confirm?.problemKeys || []), ...(context?.problemKeys || [])])
    )

    return [
      `### ${closure.symptomKey}`,
      '',
      `- 中文名：\`${closure.displayTextCn}\``,
      `- 收口模式：\`${closure.closureMode}\``,
      `- 正式 confirm 题：\`${confirm?.questionKey || ''}\` -> \`${confirm?.targetSymptomKey || ''}\``,
      context
        ? `- 正式 context 题：\`${context.questionKey}\` -> \`${context.targetSymptomKey}\``
        : '- 正式 context 题：无（按规则允许单题确认）',
      `- 覆盖 problem：${mappedProblems.map(item => `\`${item}\``).join('、')}`,
      `- 权威来源：${confirm?.sourceUrls.map(item => `<${item}>`).join('、') || ''}`,
      ''
    ].join('\n')
  })

  const counts = {
    questions: questionRows.length,
    strategies: strategyRows.length
  }

  return [
    title,
    '',
    `生成时间：${metadata.auditDate}`,
    '',
    '## 1. 审计边界',
    '',
    `- 环境：\`${metadata.envId}\``,
    `- 批次：\`${metadata.batchId}\``,
    `- question 三表 audited 语义：${metadata.auditSemantics.questionTables}`,
    `- engine audited 语义：${metadata.auditSemantics.engineTable}`,
    '',
    '## 2. 关闭前状态',
    '',
    ...preClosureLines,
    '',
    '## 3. 关闭后计划资产',
    '',
    `- question_library_v5_real：新增/对齐 ${counts.questions} 条 audited 正式题`,
    `- question_option_mapping_v5_real：新增/对齐 ${counts.questions * 3} 条 audited 正式选项映射`,
    `- question_strategy_v5_real：新增/对齐 ${counts.strategies} 条 audited 正式策略`,
    `- question_generation_engine：新增/对齐 ${counts.questions} 条 source-backed audited 生成规则`,
    '',
    '## 4. 权威来源分组',
    '',
    Object.entries(sourceSets)
      .map(([key, urls]) => `- \`${key}\`：${urls.map(item => `<${item}>`).join('、')}`)
      .join('\n'),
    '',
    '## 5. 逐条收口矩阵',
    '',
    ...closureLines,
    '## 6. 生成文件',
    '',
    ...sqlFiles.map(filePath => `- \`${path.relative(repoRoot, filePath)}\``),
    '',
    '## 7. 审核重点',
    '',
    ...reviewFocusLines,
    ''
  ].join('\n')
}

