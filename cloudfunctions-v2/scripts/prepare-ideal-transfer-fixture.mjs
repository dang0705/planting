import fs from 'node:fs'
import zlib from 'node:zlib'
import readline from 'node:readline'
import crypto from 'node:crypto'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
// 仅转换已核验的公开研究文件；不读取业务库、凭证或 backend-v2 文档。
const [root, outputFile, explicitStart, explicitEnd] = process.argv.slice(2)
if (!root || !outputFile) {
  throw new Error('需要原始文件目录和输出 CSV 路径')
}
// 仅允许已在查看模型误差前冻结的两个窗口；默认保留原窗口，不自动寻找日期。
const startUtc = explicitStart ?? '2017-12-29T00:00:00Z'
const endUtc = explicitEnd ?? '2018-01-12T00:00:00Z'
if (
  (explicitStart === undefined) !== (explicitEnd === undefined) ||
  ![
    ['2017-12-29T00:00:00Z', '2018-01-12T00:00:00Z'],
    ['2018-01-12T00:00:00Z', '2018-01-26T00:00:00Z']
  ].some(([first, last]) => first === startUtc && last === endUtc)
) {
  throw new Error('必须成对指定已冻结的UTC研究窗口')
}
// 固定资格：窗口有交集后按home ID选择；home47在窗口前退役，首个为home59。
// 天气文件须由已核验公开制品提供；仅精确Range下载两个室内成员，使用Python标准库。
const extracted = spawnSync(
  'python3',
  [
    '-c',
    String.raw`import sys,json,urllib.request,struct,zlib,gzip,hashlib,pathlib
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
url='https://datashare.ed.ac.uk/server/api/core/bitstreams/b6e8483c-e5a8-4867-ba5a-1bcf0b4e96e2/content'
size=10005114253
def read(start,n):
 end=start+n-1
 with urllib.request.urlopen(urllib.request.Request(url,headers={'Range':f'bytes={start}-{end}'}),timeout=30) as r:
  if r.status!=206 or r.headers.get('Content-Range')!=f'bytes {start}-{end}/{size}':raise ValueError('公开ZIP范围响应不符')
  b=r.read(n+1)
  if len(b)!=n:raise ValueError('公开ZIP范围长度不符')
  return b
entries=[{'name': 'sensordata/home59_livingroom689_sensor1524_room_temperature.csv.gz', 'size': 4554380, 'compressed': 2957835, 'offset': 2578180503, 'crc': 2314493083, 'sha256': '20af8cdad5b88e395d2de118ec0cc6eed5fa2d2f456decc6794018a715e88ce1', 'first': '2016-10-06 10:05:04,215', 'last': '2018-01-28 07:56:27,145', 'windowRows': 16417}, {'name': 'sensordata/home59_livingroom689_sensor1523_room_humidity.csv.gz', 'size': 4778944, 'compressed': 3421677, 'offset': 7308867687, 'crc': 960753132, 'sha256': '70c3d38e48c51eceaff2cc267e84bd11670d3466613e25d646650a599e599861', 'first': '2016-10-06 10:05:04,489', 'last': '2018-01-28 07:56:27,477', 'windowRows': 16418}]
for e in entries:
 p=root/pathlib.Path(e['name']).name
 if p.exists():continue
 h=read(e['offset'],30);sig,ver,flags,method,t,d,crc,cs,us,nl,el=struct.unpack('<I5H3I2H',h)
 if sig!=0x04034b50 or method!=8:raise ValueError('ZIP成员头不符')
 if read(e['offset']+30,nl).decode()!=e['name']:raise ValueError('ZIP成员名不符')
 start=e['offset']+30+nl+el;left=e['compressed'];blocks=[]
 while left:
  n=min(left,500000);blocks.append(read(start,n));start+=n;left-=n
 raw=zlib.decompress(b''.join(blocks),-15)
 if len(raw)!=e['size'] or zlib.crc32(raw)!=e['crc'] or hashlib.sha256(raw).hexdigest()!=e['sha256']:raise ValueError('成员大小/CRC/SHA不符')
 gzip.decompress(raw)
 p.write_bytes(raw)
`,
    root
  ],
  { stdio: 'inherit' }
)
if (extracted.status !== 0) {
  throw new Error('公开ZIP成员精确抽取失败')
}
const expectedHashes = {
  'home59_livingroom689_sensor1524_room_temperature.csv.gz':
    '20af8cdad5b88e395d2de118ec0cc6eed5fa2d2f456decc6794018a715e88ce1',
  'home59_livingroom689_sensor1523_room_humidity.csv.gz':
    '70c3d38e48c51eceaff2cc267e84bd11670d3466613e25d646650a599e599861',
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
const start = startUtc.replace('T', ' ').replace('Z', ''),
  end = endUtc.replace('T', ' ').replace('Z', '')
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
    ['indoor_temperature', 'home59_livingroom689_sensor1524_room_temperature.csv.gz'],
    ['indoor_rh', 'home59_livingroom689_sensor1523_room_humidity.csv.gz'],
    ['outdoor_temperature', 'weatherreading.csv.gz', '1'],
    ['outdoor_rh', 'weatherreading.csv.gz', '3']
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
  for (let ms = Date.parse(startUtc); ms < Date.parse(endUtc); ms += 3600000) {
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
