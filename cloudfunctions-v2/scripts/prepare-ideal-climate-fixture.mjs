import fs from 'node:fs'
import zlib from 'node:zlib'
import readline from 'node:readline'
import crypto from 'node:crypto'
import path from 'node:path'
// 仅转换已核验的公开研究文件；不读取业务库、凭证或 backend-v2 文档。
const [root, outputFile, startUtc, endExclusiveUtc] = process.argv.slice(2)
if (!root || !outputFile) {
  throw new Error('需要原始文件目录和输出 CSV 路径')
}
const expectedHashes = {
  'home100_livingroom1038_sensor4474_room_temperature.csv.gz':
    '246119b0d4a2659634ad9ee46e432c9e2c540efd1bf4180dfa3562c2643cadae',
  'home100_livingroom1038_sensor4473_room_humidity.csv.gz':
    '232e69d41a2397d7e82191c4b236db11240e64ce37eacf65d0fd7c663854eb09',
  'weatherreading.csv.gz': 'ea06d07fd15dae767233a2cbd980ea8c1122dd28f568f69cc3fc6b8ca67429d3'
}
for (const [name, sha] of Object.entries(expectedHashes)) {
  if (
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, name)))
      .digest('hex') !== sha
  ) {
    throw new Error('源文件摘要不符：' + name)
  }
}
// 固定联合覆盖窗口；仅生成样本算术均值，不声称连续时间平均或模型预测。
if (Boolean(startUtc) !== Boolean(endExclusiveUtc)) {
  throw new Error('研究窗口起止必须成对提供')
}
const startIso = startUtc ?? '2017-12-01T00:00:00Z'
const endIso = endExclusiveUtc ?? '2018-01-12T00:00:00Z'
for (const at of [startIso, endIso]) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/.test(at) ||
    !Number.isFinite(Date.parse(at)) ||
    new Date(at).toISOString() !== at.replace('Z', '.000Z')
  ) {
    throw new Error('研究窗口必须为有效UTC整点')
  }
}
if (startIso >= endIso) {
  throw new Error('研究窗口结束必须晚于开始')
}
const start = startIso.replace('T', ' ').replace('Z', ''),
  end = endIso.replace('T', ' ').replace('Z', '')
async function collect(name, feed) {
  const buckets = new Map()
  let selected = 0,
    invalid = 0,
    duplicates = 0,
    previous = null
  const lines = readline.createInterface({
    input: fs.createReadStream(root + '/' + name).pipe(zlib.createGunzip()),
    crlfDelay: Infinity
  })
  for await (const line of lines) {
    const f = line.split(',')
    if (feed && f[0] !== feed) {
      continue
    }
    const [at, raw] = feed ? [f[1], f[2]] : f
    if (at < start || at >= end) {
      continue
    }
    if (
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(at) ||
      raw.trim() === '' ||
      !Number.isFinite(Number(raw))
    ) {
      invalid++
      continue
    }
    if (previous !== null && at < previous) {
      throw Error('source time reversed')
    }
    if (at === previous) {
      duplicates++
      continue
    }
    previous = at
    const value = Number(raw) / 10,
      hour = at.slice(0, 13)
    const b = buckets.get(hour) || {
      sum: 0,
      count: 0,
      min: Infinity,
      max: -Infinity,
      first: at,
      last: at
    }
    b.sum += value
    b.count++
    b.min = Math.min(b.min, value)
    b.max = Math.max(b.max, value)
    b.last = at
    buckets.set(hour, b)
    selected++
  }
  return { buckets, selected, invalid, duplicates }
}
;(async () => {
  const specs = [
    ['indoor_temperature', 'home100_livingroom1038_sensor4474_room_temperature.csv.gz'],
    ['indoor_rh', 'home100_livingroom1038_sensor4473_room_humidity.csv.gz'],
    ['outdoor_temperature', 'weatherreading.csv.gz', '21'],
    ['outdoor_rh', 'weatherreading.csv.gz', '23']
  ]
  const out = []
  for (const s of specs) {
    out.push(await collect(s[1], s[2]))
  }
  const header = [
    'interval_start_utc',
    'interval_end_utc',
    ...specs.flatMap(s => [
      s[0] + '_mean',
      s[0] + '_min',
      s[0] + '_max',
      s[0] + '_samples',
      s[0] + '_first_utc',
      s[0] + '_last_utc'
    ])
  ]
  const rows = [header]
  let complete = 0,
    longest = 0,
    run = 0,
    lowRh = 0
  for (let ms = Date.parse(startIso); ms < Date.parse(endIso); ms += 3600000) {
    const iso = new Date(ms).toISOString(),
      key = iso.slice(0, 13).replace('T', ' ')
    const b = out.map(x => x.buckets.get(key))
    if (b.every(Boolean)) {
      complete++
      run++
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
    for (const j of [1, 3]) {
      if (b[j] && (b[j].min < 0 || b[j].max > 100)) {
        lowRh++
      }
    }
    rows.push([
      iso,
      new Date(ms + 3600000).toISOString(),
      ...b.flatMap(x =>
        x
          ? [
              x.sum / x.count,
              x.min,
              x.max,
              x.count,
              x.first.replace(' ', 'T') + 'Z',
              x.last.replace(' ', 'T') + 'Z'
            ]
          : ['', '', '', 0, '', '']
      )
    ])
  }
  const csv = rows.map(r => r.join(',')).join('\n') + '\n'
  fs.writeFileSync(outputFile, csv)
  const result = {
    windowStart: start,
    windowEndExclusive: end,
    hours: rows.length - 1,
    completeFourFieldHours: complete,
    longestCompleteHourlyRun: longest,
    rhOutOfRangeHours: lowRh,
    columns: specs.map((s, i) => ({
      name: s[0],
      source: s[1],
      feed: s[2] || null,
      selected: out[i].selected,
      invalid: out[i].invalid,
      duplicateTimestamps: out[i].duplicates,
      availableHours: out[i].buckets.size,
      minSamples: Math.min(...[...out[i].buckets.values()].map(x => x.count)),
      maxSamples: Math.max(...[...out[i].buckets.values()].map(x => x.count))
    })),
    sha256: crypto.createHash('sha256').update(csv).digest('hex')
  }
  fs.writeFileSync(outputFile + '.summary.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
})().catch(e => {
  console.error(e)
  process.exitCode = 1
})
