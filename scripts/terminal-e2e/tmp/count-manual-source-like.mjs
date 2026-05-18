import cloudbase from '/Users/jay/WebstormProjects/planting/cloudfunctions/layer/utils/cloudbase.js'

const moduleValue = cloudbase
const { models } = moduleValue

;(async () => {
  const row = await models.$runSQL(`SELECT COUNT(1) AS cnt FROM diagnosis_sessions WHERE runtime_snapshot_json LIKE '%"reviewSourceType":"manual"%'`)
  console.log(JSON.stringify(row?.data?.executeResultList?.[0] || {}, null, 2))
})().catch(err => {
  console.error(err)
  process.exit(1)
})
