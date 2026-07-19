import fs from 'node:fs/promises'
const file = process.argv[2]
const raw = JSON.parse(await fs.readFile(file, 'utf8'))
const results = Array.isArray(raw.results) ? raw.results : []
const summary = {
  total: results.length,
  outcome: {},
  stopReason: {},
  stopReasonDetail: {},
  classEnabled: 0,
  classDisabled: 0,
  blockedReason: {},
  problematicWithClassDisabled: 0,
  uncertainWithClassEnabled: 0,
  rootRotShiftSuspicious: 0,
  leafSpotClassPoolEmpty: 0,
  yellowingTopProblems: {},
  topProblems: {}
}
for (const row of results) {
  const outcomeType = row?.replay?.outcomeType || row?.result?.outcomeType || ''
  const stopReason = row?.replay?.stopReason || ''
  const stopReasonDetail = row?.replay?.stopReasonDetail || ''
  const runtime = row?.replay?.symptomClassRuntime || {}
  const enabled = Boolean(runtime?.enabled)
  const blockedReason = runtime?.classGateDecision?.blockedReason || ''
  const currentClassKey = runtime?.currentClassKey || ''
  const topProblemKey = row?.replay?.topProblem?.problemKey || row?.replay?.finalResult?.problemKey || ''
  summary.outcome[outcomeType] = (summary.outcome[outcomeType] || 0) + 1
  summary.stopReason[stopReason] = (summary.stopReason[stopReason] || 0) + 1
  summary.stopReasonDetail[stopReasonDetail] = (summary.stopReasonDetail[stopReasonDetail] || 0) + 1
  summary.topProblems[topProblemKey] = (summary.topProblems[topProblemKey] || 0) + 1
  if (enabled) {summary.classEnabled += 1}
  else {summary.classDisabled += 1}
  if (blockedReason) {summary.blockedReason[blockedReason] = (summary.blockedReason[blockedReason] || 0) + 1}
  if (outcomeType === 'problematic' && !enabled) {summary.problematicWithClassDisabled += 1}
  if (outcomeType === 'uncertain' && enabled) {summary.uncertainWithClassEnabled += 1}
  if (currentClassKey === 'root_rot_wet_wilt_mode' && ['iron_deficiency','nitrogen_deficiency'].includes(topProblemKey)) {
    summary.rootRotShiftSuspicious += 1
  }
  if (blockedReason === 'class_group_pool_empty' && (currentClassKey === 'leaf_spot_complex_mode' || (Array.isArray(runtime?.classScores) && runtime.classScores.some(item => item?.classKey === 'leaf_spot_complex_mode')))) {
    summary.leafSpotClassPoolEmpty += 1
  }
  if (currentClassKey === 'yellowing_mode') {
    summary.yellowingTopProblems[topProblemKey] = (summary.yellowingTopProblems[topProblemKey] || 0) + 1
  }
}
console.log(JSON.stringify(summary, null, 2))
