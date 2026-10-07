import { readFileSync } from 'node:fs'
import { replayIdealClimateEnvelope } from '../models/care/experiments/ideal-climate-envelope.js'

/** 只读取四个已固定研究制品；不读取业务数据库、凭证或架构目录。 */
const root = 'cloudfunctions-v2/models/care/'
const input = {
  model: readFileSync(root + 'indoor-outdoor-comparison-results.json', 'utf8'),
  calibration: readFileSync(root + 'fixtures/ideal-home100-hourly.csv', 'utf8'),
  sameHome: readFileSync(root + 'fixtures/ideal-home100-envelope-validation-hourly.csv', 'utf8'),
  transferHome: readFileSync(root + 'fixtures/ideal-transfer-home59-followup-hourly.csv', 'utf8')
}
process.stdout.write(JSON.stringify(replayIdealClimateEnvelope(input), null, 2) + '\n')
