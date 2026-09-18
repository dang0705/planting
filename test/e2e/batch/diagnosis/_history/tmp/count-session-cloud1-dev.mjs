#!/usr/bin/env node
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { models } = require('/Users/jay/WebstormProjects/planting/cloudfunctions/layer/utils/cloudbase')

(async () => {
  const rows = await models.$runSQL('SELECT COUNT(1) AS total_rows FROM diagnosis_sessions')
  console.log(JSON.stringify(rows?.data?.executeResultList || [], null, 2))
})().catch(error => {
  console.error(error)
  process.exit(1)
})
