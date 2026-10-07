import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { runIdealOutdoorComparison } from '../models/care/experiments/ideal-outdoor-comparison.js'

/** 固定IDEAL制品回放；只向标准输出写研究结果，不更新策略、数据库或业务记录。 */
const path = 'cloudfunctions-v2/models/care/fixtures/ideal-home100-hourly.csv'
const csv = readFileSync(path, 'utf8')
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const sourceSha256 = sha256(csv)
if (sourceSha256 !== 'a8fa47ffd565f80938c391c96b05c13887b2a33fdf3342040522230e1046c6c2') {
  throw new Error('固定研究制品摘要变化，不能沿用本轮切分与证据')
}
const { predictions, ...result } = runIdealOutdoorComparison(csv)
process.stdout.write(
  JSON.stringify(
    {
      protocol: 'indoor-outdoor-comparison.md',
      source: { path, sha256: sourceSha256, doi: '10.7488/ds/2836', license: 'CC-BY-4.0' },
      training: { start: '2017-12-01T00:00:00Z', end: '2017-12-29T00:00:00Z' },
      validation: { start: '2017-12-29T00:00:00Z', end: '2018-01-12T00:00:00Z' },
      semantics: '同小时样本均值的代表点；非小时积分、非提前预报、非跨住宅验证',
      ...result,
      predictionSha256: sha256(JSON.stringify(predictions))
    },
    null,
    2
  ) + '\n'
)
