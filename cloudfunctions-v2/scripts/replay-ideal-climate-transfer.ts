import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { evaluateIdealClimateTransfer } from '../models/care/experiments/ideal-outdoor-comparison.js'
import type { OutdoorOnlyClimateFit } from '../models/care/experiments/outdoor-only-climate.js'
import type { ResearchClimatePoint } from '../models/care/experiments/indoor-climate.js'

/** 离线迁移回放：输入必须附已核验摘要，来源住宅参数固定，不写业务数据。 */
const [fixturePath, expectedSha256, startUtc, endExclusiveUtc] = process.argv.slice(2)
if (!fixturePath || !expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
  throw new Error('必须提供目标小时制品路径和已核验的SHA-256')
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const sourcePath = 'cloudfunctions-v2/models/care/indoor-outdoor-comparison-results.json'
const sourceText = readFileSync(sourcePath, 'utf8')
const sourceSha256 = hash(sourceText)
if (sourceSha256 !== '281e7c1dc99bf5239d766566b2a92ef3bd4c23be3ddc7c337a80950207ece122') {
  throw new Error('来源住宅模型摘要变化，不能沿用固定参数迁移协议')
}
const source = JSON.parse(sourceText) as {
  fit: OutdoorOnlyClimateFit
  trainingMean: ResearchClimatePoint
}
const csv = readFileSync(fixturePath, 'utf8')
const fixtureSha256 = hash(csv)
if (fixtureSha256 !== expectedSha256) {
  throw new Error('目标住宅小时制品摘要不匹配')
}
if (Boolean(startUtc) !== Boolean(endExclusiveUtc)) {
  throw new Error('显式研究窗口必须同时提供起止UTC时间')
}
const window = startUtc && endExclusiveUtc ? { startUtc, endExclusiveUtc } : undefined
const { predictions, ...result } = evaluateIdealClimateTransfer(csv, source, window)
process.stdout.write(
  JSON.stringify(
    {
      protocol: 'indoor-climate-transfer.md',
      source: { path: sourcePath, sha256: sourceSha256 },
      target: { path: fixturePath, sha256: fixtureSha256 },
      validation: {
        start: startUtc ?? '2017-12-29T00:00:00Z',
        end: endExclusiveUtc ?? '2018-01-12T00:00:00Z'
      },
      semantics: '固定参数跨住宅同小时观测回放；不在目标住宅拟合、非未来天气预报',
      ...result,
      predictionSha256: hash(JSON.stringify(predictions))
    },
    null,
    2
  ) + '\n'
)
