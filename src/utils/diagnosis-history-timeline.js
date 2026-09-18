import { parsePlantDateTime } from './plant-datetime.js'

const OUTCOME_TYPE_LABELS = Object.freeze({
  problematic: '有问题',
  problem: '可能存在问题',
  non_problematic: '未见明确问题',
  uncertain: '仍需谨慎观察',
  out_of_pool_no_mapping: '诊断范围外的可见异常'
})

const OUTCOME_FALLBACK_LABELS = Object.freeze({
  problematic: '需要关注',
  problem: '需要关注',
  non_problematic: '暂未见明显问题',
  uncertain: '暂不能稳定判断',
  out_of_pool_no_mapping: '诊断范围外的可见异常'
})

const PENDING_OUTCOME_LABELS = new Set(['待确认', '待确认症状', '等待确认'])
const DEFAULT_OUTCOME_LABEL = '诊断已完成'
const DEFAULT_OUTCOME_TYPE_LABEL = '已生成结论'
const DATE_MONTH_OFFSET = 1
const DATE_LABEL_PAD_LENGTH = 2
const SORT_AFTER = 1
const SORT_BEFORE = -1

function normalizeText(value) {
  return String(value || '').trim()
}

function isSafeDisplayLabel(value) {
  const label = normalizeText(value)
  if (!label) {
    return false
  }
  return !(
    /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i.test(label) ||
    /^[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*$/.test(label) ||
    /^(?:id|key|code|status|token|secret|openid|unionid)(?:[:：_-]|$)/i.test(label)
  )
}

function normalizeOutcomeType(value) {
  return normalizeText(value).toLowerCase()
}

function resolveDiagnosisHistoryOutcomeTypeLabel(item = {}) {
  const outcomeType = normalizeOutcomeType(item.outcomeType)
  return OUTCOME_TYPE_LABELS[outcomeType] || DEFAULT_OUTCOME_TYPE_LABEL
}

function resolveDiagnosisHistoryOutcomeLabel(item = {}) {
  const outcomeType = normalizeOutcomeType(item.outcomeType)
  const candidates = [
    item?.summary?.displayName,
    item?.summary?.title,
    item?.mainIssue,
    item?.nonProblematicLabel,
    item?.outcome?.displayNameCn,
    item?.outcome?.displayName,
    item?.outcome?.title
  ]
  const displayLabel = candidates.map(normalizeText).find(isSafeDisplayLabel)
  return displayLabel || OUTCOME_FALLBACK_LABELS[outcomeType] || DEFAULT_OUTCOME_LABEL
}

function isDiagnosisHistoryRecordReady(item = {}) {
  const outcomeType = normalizeOutcomeType(item.outcomeType)
  const hasKnownOutcome = Object.prototype.hasOwnProperty.call(OUTCOME_TYPE_LABELS, outcomeType)
  if (!hasKnownOutcome) {
    return false
  }
  const candidates = [
    item?.summary?.displayName,
    item?.summary?.title,
    item?.mainIssue,
    item?.nonProblematicLabel,
    item?.outcome?.displayNameCn,
    item?.outcome?.displayName,
    item?.outcome?.title
  ]
  return !candidates.map(normalizeText).some(label => PENDING_OUTCOME_LABELS.has(label))
}

function formatDiagnosisHistoryDate(value) {
  const date = parsePlantDateTime(value)
  if (!date) {
    return { dateLabel: '日期未知', timeLabel: '时间未知', timestamp: null }
  }
  return {
    dateLabel: `${String(date.getMonth() + DATE_MONTH_OFFSET).padStart(DATE_LABEL_PAD_LENGTH, '0')}月${String(date.getDate()).padStart(DATE_LABEL_PAD_LENGTH, '0')}日`,
    timeLabel: `${String(date.getHours()).padStart(DATE_LABEL_PAD_LENGTH, '0')}:${String(date.getMinutes()).padStart(DATE_LABEL_PAD_LENGTH, '0')}`,
    timestamp: date.getTime()
  }
}

function resolveDiagnosisHistoryRecordId(item = {}) {
  return normalizeText(item.resultId || item.historyId || item._id)
}

function buildDiagnosisHistoryTimelineItems(records = []) {
  return (Array.isArray(records) ? records : [])
    .filter(isDiagnosisHistoryRecordReady)
    .map((record, index) => {
      const date = formatDiagnosisHistoryDate(record?.createdAt)
      return {
        key: resolveDiagnosisHistoryRecordId(record) || `history-item-${index}`,
        recordId: resolveDiagnosisHistoryRecordId(record),
        dateLabel: date.dateLabel,
        timeLabel: date.timeLabel,
        timestamp: date.timestamp,
        outcomeLabel: resolveDiagnosisHistoryOutcomeLabel(record),
        outcomeType: normalizeOutcomeType(record?.outcomeType),
        outcomeTypeLabel: resolveDiagnosisHistoryOutcomeTypeLabel(record),
        sourceIndex: index
      }
    })
    .sort((left, right) => {
      if (left.timestamp === null && right.timestamp === null) {
        return left.sourceIndex - right.sourceIndex
      }
      if (left.timestamp === null) {
        return SORT_AFTER
      }
      if (right.timestamp === null) {
        return SORT_BEFORE
      }
      return right.timestamp - left.timestamp || left.sourceIndex - right.sourceIndex
    })
}

export {
  buildDiagnosisHistoryTimelineItems,
  formatDiagnosisHistoryDate,
  isDiagnosisHistoryRecordReady,
  resolveDiagnosisHistoryOutcomeLabel,
  resolveDiagnosisHistoryOutcomeTypeLabel
}
