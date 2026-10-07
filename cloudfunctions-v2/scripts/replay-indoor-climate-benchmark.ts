import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadClimateBenchmarkCsv, runClimateBenchmark } from '../models/care/experiments/indoor-climate-benchmark.js'

/** 离线研究入口；调用方显式给输入/输出路径，既不取网络数据，也不写正式配置。 */
const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath || resolve(inputPath) === resolve(outputPath)) {throw new Error('请给出不同的输入CSV和输出JSON路径')}
const csv = readFileSync(inputPath, 'utf8')
const subsetSha256 = createHash('sha256').update(csv).digest('hex')
if (subsetSha256 !== '268be2fc6e8367cd0c8c9530db148a7735991ef16543968da47df116960ed965') {throw new Error('固定研究数据摘要不符')}
const result = runClimateBenchmark(loadClimateBenchmarkCsv(csv), '2016-02-09 00:00:00')
const artifact = {
  dataset: { name: 'Appliances Energy Prediction', author: 'Luis Candanedo', year: 2017, doi: '10.24432/C5VC8G', license: 'CC-BY-4.0', source: 'https://archive.ics.uci.edu/dataset/374/appliances%2Benergy%2Bprediction', originalCsvSha256: '2820bf712ad0275cb18b85a05250926100d8e65ebb9f4d2d016ca91ea152a25d', subsetSha256 },
  assumptions: ['室内10分钟均值暂作记录时刻状态；不是瞬时测量', '机场小时天气插值为历史外边界；不是房屋外墙测量或真实预报', '冬季固定子集仅计算名义日历差值；原始采集时区未验真', '机场气压直接用于研究换算，其订正方式与房屋代表性未证实', '固定净热湿源不能识别太阳、住户和空调的分别贡献', '仅一个室内起始锚点，余下连续递推；单栋低能耗房屋不可外推为MVP通用参数'],
  ...result,
}
writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n')
process.stdout.write(JSON.stringify({ outputPath, scores: result.scores }, null, 2) + '\n')
