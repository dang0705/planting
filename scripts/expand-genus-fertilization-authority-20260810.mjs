import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const auditPath = path.join(repoRoot, 'SQL-cvs/genus_fertilizing_monthly_audit_v1.json')
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

const sourceRefs = {
  umdIndoorSlowRelease: {
    id: 'umd-houseplant-slow-release',
    name: 'University of Maryland Extension',
    url: 'https://extension.umd.edu/resource/fertilizer-indoor-plants',
    evidenceRef: '室内植物缓释颗粒通常释放3–4个月；冬季低光时不施肥'
  },
  osuIndoorSlowRelease: {
    id: 'osu-houseplant-slow-release',
    name: 'Oregon State University Extension',
    url: 'https://extension.oregonstate.edu/news/set-houseplants-success-right-plant-right-place',
    evidenceRef: '室内植物有生长时，缓释肥通常可维持约2–3个月；11月至3月生长减慢时不施肥'
  },
  illinoisContainerSlowRelease: {
    id: 'illinois-container-slow-release',
    name: 'Illinois Extension',
    url: 'https://extension.illinois.edu/container-gardens/fertilizing',
    evidenceRef: '容器年生花卉使用的许多缓释肥通常可供肥3–4个月，受温度和水分影响'
  },
  ugaContainerSlowRelease: {
    id: 'uga-container-slow-release',
    name: 'UGA Cooperative Extension',
    url: 'https://extension.uga.edu/publications/detail.html?number=C787&title=gardening-in-containers',
    evidenceRef: '容器植物常用约3个月型缓释肥；木本容器植物在早春进入生长期时开始施肥'
  },
  umdContainerVegetablesSlowRelease: {
    id: 'umd-container-vegetables-slow-release',
    name: 'University of Maryland Extension',
    url: 'https://extension.umd.edu/resource/growing-vegetables-containers-and-salad-tables',
    evidenceRef: '容器蔬菜缓释肥通常可供肥2–3个月；长季连续采收作物的液肥频率另行提高'
  },
  sdsuSucculentSlowRelease: {
    id: 'sdsu-succulent-slow-release',
    name: 'South Dakota State University Extension',
    url: 'https://extension.sdstate.edu/how-care-succulents-indoors',
    evidenceRef: '多肉植物可在春季生长初使用一次缓释颗粒；冬季不施肥'
  },
  iowaSucculentSlowRelease: {
    id: 'iowa-succulent-slow-release',
    name: 'Iowa State University Extension',
    url: 'https://yardandgarden.extension.iastate.edu/how-to/growing-succulents-indoors',
    evidenceRef: '室内多肉在春夏生长期使用缓释肥时于生长期初施用；冬季停止'
  },
  umnSucculentLowFrequency: {
    id: 'umn-succulent-low-frequency',
    name: 'University of Minnesota Extension',
    url: 'https://extension.umn.edu/gardening-minnesota/cacti-and-succulents',
    evidenceRef: '仙人掌和多肉营养需求低；仙人掌每年晚春或夏季施1–2次，其他多肉在明亮生长期低频施用'
  },
  ufIfasPalmThreeMonth: {
    id: 'uf-ifas-palm-three-month',
    name: 'UF/IFAS Extension',
    url: 'https://ask.ifas.ufl.edu/publication/EP261',
    evidenceRef: '棕榈缓释肥以约3个月为一个施肥间隔；冬季可省略'
  },
  ucanrHoyaSixMonth: {
    id: 'ucanr-hoya-six-month',
    name: 'UC Agriculture and Natural Resources',
    url: 'https://ucanr.edu/sites/default/files/2024-11/404261.pdf',
    evidenceRef: 'Hoya / 蜡花列为每6个月施肥一次的室内植物低频参考'
  },
  uconnZzSixMonth: {
    id: 'uconn-zz-six-month',
    name: 'UConn Extension',
    url: 'https://homegarden.cahnr.uconn.edu/factsheets/zz-plant/',
    evidenceRef: 'Zamioculcas 可在生长期施1–2次，或使用半浓度肥；全浓度时可按每6个月一次'
  },
  ufIfasZzSlowRelease: {
    id: 'uf-ifas-zz-slow-release',
    name: 'UF/IFAS Extension',
    url: 'https://ask.ifas.ufl.edu/publication/EP480',
    evidenceRef: 'Zamioculcas 为慢生植物；温暖生长期使用低剂量缓释颗粒或每年低频施肥'
  },
  ncsuZzLowFrequency: {
    id: 'ncsu-zz-low-frequency',
    name: 'NC State Extension',
    url: 'https://plants.ces.ncsu.edu/plants/zamioculcas-zamiifolia/common-name/zz-plant/',
    evidenceRef: 'ZZ 植物为慢生植物，平衡液肥每年施1–2次'
  },
  ufIfasWaterGarden: {
    id: 'uf-ifas-water-garden-conservative',
    name: 'UF/IFAS Extension',
    url: 'https://gardeningsolutions.ifas.ufl.edu/design/landscaping-for-specific-sites/water-gardens/',
    evidenceRef: '水生植物应保守施肥，只用可推入根部基质的缓释营养片，不能把肥料直接倒入水体'
  },
  okstateWaterGarden: {
    id: 'okstate-water-garden-slow-release',
    name: 'Oklahoma State University Extension',
    url: 'https://extension.okstate.edu/fact-sheets/water-gardens',
    evidenceRef: '水生植物使用专用缓释颗粒并置于根球深处；沉水植物通常只需很少施肥'
  },
  missouriWaterLilyMonthly: {
    id: 'missouri-water-lily-monthly',
    name: 'Missouri Botanical Garden',
    url: 'https://www.missouribotanicalgarden.org/Portals/0/Kemper%20Gardens/Fact%20Sheets/Water%20Lilies%20for%20Home%20Gardeners%202020.pdf',
    evidenceRef: '家庭水生睡莲5–9月施肥；耐寒睡莲每月一次，热带睡莲每两周一次，均施在根部'
  },
  chicagoAquaticGarden: {
    id: 'chicago-aquatic-garden-tabs',
    name: 'Chicago Botanic Garden',
    url: 'https://www.chicagobotanic.org/plant-information/fertilizer-aquatic-garden',
    evidenceRef: '水生缸庭可使用缓释肥片；荷花、睡莲和水边草本应使用水生植物专用肥'
  }
}

const succulentGenera = new Set([
  'Aloe',
  'Echinocactus',
  'Echinopsis',
  'Euphorbia',
  'Graptopetalum',
  'Gymnocalycium',
  'Haworthiopsis',
  'Kalanchoe',
  'Lithops',
  'Mammillaria',
  'Orostachys',
  'Oscularia',
  'Pachyphytum',
  'Portulacaria',
  'Selenicereus',
  'Sedum',
  'Sempervivum',
  'Echeveria',
  'Crassula'
])
const palmGenera = new Set(['Chamaedorea', 'Dypsis', 'Rhapis'])
const aquaticGenera = new Set(['Acorus', 'Hydrocotyle', 'Pontederia', 'Schoenoplectus', 'Thalia', 'Cyperus'])
const edibleGenera = new Set([
  'Cucumis',
  'Cucurbita',
  'Capsicum',
  'Ocimum',
  'Asparagus',
  'Mentha',
  'Petroselinum',
  'Coriandrum',
  'Origanum',
  'Thymus',
  'Lactuca',
  'Spinacia',
  'Fragaria'
])
const woodyContainerGenera = new Set([
  'Campsis',
  'Camellia',
  'Clematis',
  'Gardenia',
  'Hydrangea',
  'Jasminum',
  'Pachira',
  'Polyscias',
  'Radermachera',
  'Rosa',
  'Rhododendron',
  'Trachelospermum'
])

const sourceSet = (...items) => items.map(item => sourceRefs[item])
const unique = values => Array.from(new Set(values))

function mergeSources(entry, additions) {
  const existingIds = new Set((entry.sourceRefs || []).map(source => source.id))
  for (const source of additions) {
    if (!source || existingIds.has(source.id)) {
      continue
    }
    entry.sourceRefs.push(source)
    existingIds.add(source.id)
  }
}

function getCategory(genus, scopeLabel) {
  if (genus === 'Nelumbo') {
    return 'waterLily'
  }
  if (aquaticGenera.has(genus)) {
    return 'aquatic'
  }
  if (genus === 'Hoya') {
    return 'hoya'
  }
  if (genus === 'Zamioculcas') {
    return 'zz'
  }
  if (succulentGenera.has(genus)) {
    return 'succulent'
  }
  if (palmGenera.has(genus)) {
    return 'palm'
  }
  if (edibleGenera.has(genus)) {
    return 'edible'
  }
  if (woodyContainerGenera.has(genus) || /容器|庭院/u.test(scopeLabel)) {
    return 'container'
  }
  return 'indoor'
}

function getPolicy(category) {
  switch (category) {
    case 'succulent':
      return {
        displayText: '每年1次（春季生长期初）',
        sources: sourceSet('sdsuSucculentSlowRelease', 'iowaSucculentSlowRelease', 'umnSucculentLowFrequency'),
        note: '缓释肥只在春季生长期初使用一次；休眠、低光或没有明显新叶、新芽时暂停。'
      }
    case 'palm':
      return {
        displayText: '每3个月1次（生长期）',
        sources: sourceSet('ufIfasPalmThreeMonth', 'umdIndoorSlowRelease'),
        note: '缓释肥按棕榈类约3个月一轮的容器参考；低光、低温或没有新叶、新芽时暂停。'
      }
    case 'hoya':
      return {
        displayText: '每6个月1次（生长期）',
        sources: sourceSet('ucanrHoyaSixMonth', 'umdIndoorSlowRelease'),
        note: '缓释肥采用 Hoya 低频参考，长新叶或新芽时最多每6个月一次；冬季或不再长新叶、新芽时暂停。'
      }
    case 'zz':
      return {
        displayText: '每6个月1次（生长期）',
        sources: sourceSet('uconnZzSixMonth', 'ufIfasZzSlowRelease', 'ncsuZzLowFrequency'),
        note: 'ZZ属生长慢，缓释肥按长新叶或新芽时每6个月一次的低频参考；不再长新叶、新芽时暂停。'
      }
    case 'edible':
      return {
        displayText: '约2–3个月1次（容器生长期）',
        sources: sourceSet('umdContainerVegetablesSlowRelease', 'illinoisContainerSlowRelease'),
        note: '缓释肥按容器作物约2–3个月一轮的参考；连续采收、频繁浇水或新叶明显变少时再调整。'
      }
    case 'container':
      return {
        displayText: '约3个月1次（容器生长期）',
        sources: sourceSet('ugaContainerSlowRelease', 'illinoisContainerSlowRelease'),
        note: '缓释肥按容器生长期约3个月一轮的参考；刚换盆、基质已有肥效或没有新叶、新芽时暂停。'
      }
    case 'aquatic':
      return {
        displayText: '不建议常规追加（肥沃基质时）',
        sources: sourceSet('ufIfasWaterGarden', 'okstateWaterGarden'),
        note: '普通水边和沉水植物通常不建议常规追加；如确需施肥，只能把水生缓释肥放入根部基质，不能倒入水体。'
      }
    case 'waterLily':
      return {
        displayText: '每月1次（生长期，根部水生肥）',
        sources: sourceSet('missouriWaterLilyMonthly', 'chicagoAquaticGarden', 'ufIfasWaterGarden'),
        note: '荷花和睡莲类只使用水生植物专用肥并埋入根部；不能把肥料直接倒入水体。'
      }
    default:
      return {
        displayText: '约3个月1次（长新叶或新芽时）',
        sources: sourceSet('umdIndoorSlowRelease', 'osuIndoorSlowRelease'),
        note: '缓释肥按室内盆栽约3个月一轮的参考；新叶、新芽明显变少、低温或光照不足时应减少或暂停。'
      }
  }
}

function normalizePublicGrowthCopy(entry) {
  const replace = text =>
    String(text || '')
      .replaceAll('（有生长）', '（长新叶或新芽时）')
      .replaceAll('有生长和开花时', '长新叶或新芽、并且开花时')
      .replaceAll('有生长或开花时', '长新叶或新芽或正在开花时')
      .replaceAll('有新生长的容器', '长新叶或新芽的容器')
      .replaceAll('是否有新生长为准', '是否长新叶或新芽为准')
      .replaceAll('仍有明显新生长时', '仍在长新叶或新芽时')
      .replaceAll('无明显新生长时', '没有明显新叶或新芽时')
      .replaceAll('有明显新生长时', '长新叶或新芽时')
      .replaceAll('无新生长时', '没有新叶或新芽时')
      .replaceAll('有新生长时', '长新叶或新芽时')
      .replaceAll('仍有新生长', '仍在长新叶或新芽')
      .replaceAll('仍有生长的条件', '仍在长新叶或新芽的条件')
      .replaceAll('有明显生长时', '长新叶或新芽时')
      .replaceAll('有生长时', '长新叶或新芽时')
      .replaceAll('仍有生长', '仍在长新叶或新芽')
      .replaceAll('有生长的条件', '长新叶或新芽的条件')
      .replaceAll('植株无明显生长', '植株没有明显长新叶或新芽')
      .replaceAll('植株无新生长', '植株没有新叶或新芽')
      .replaceAll('生长弱', '新叶、新芽明显变少')
      .replaceAll('生长减慢', '新叶、新芽变少')
      .replaceAll('持续生长时', '持续长新叶或新芽时')

  if (entry.notes) {
    entry.notes = replace(entry.notes)
  }
  for (const row of entry.rows || []) {
    for (const fertilizerType of ['liquid', 'slowRelease']) {
      const cell = row[fertilizerType]
      if (cell?.displayText) {
        cell.displayText = replace(cell.displayText)
      }
    }
  }
}

const result = {
  updatedCells: 0,
  updatedGenera: 0,
  byCategory: {},
  remaining: []
}

for (const [genus, entry] of Object.entries(audit.overrides || {})) {
  const unresolvedRows = (entry.rows || []).filter(row => row.slowRelease?.displayText === '暂无统一属级固定间隔')
  if (!unresolvedRows.length) {
    continue
  }

  const category = getCategory(genus, entry.scopeLabel || '')
  const policy = getPolicy(category)
  mergeSources(entry, policy.sources)
  const sourceIds = unique(policy.sources.map(source => source.id))

  for (const row of unresolvedRows) {
    row.slowRelease = {
      displayText: policy.displayText,
      sourceRefIds: unique([...(row.slowRelease?.sourceRefIds || []), ...sourceIds])
    }
    result.updatedCells += 1
  }

  entry.notes = `${String(entry.notes || '').trim()} ${policy.note}`.trim()
  result.updatedGenera += 1
  result.byCategory[category] = (result.byCategory[category] || 0) + unresolvedRows.length
}

for (const entry of Object.values(audit.overrides || {})) {
  normalizePublicGrowthCopy(entry)
}

for (const [genus, entry] of Object.entries(audit.overrides || {})) {
  for (const row of entry.rows || []) {
    for (const fertilizerType of ['liquid', 'slowRelease']) {
      if (row[fertilizerType]?.displayText === '暂无统一属级固定间隔') {
        result.remaining.push(`${genus}/${row.month}/${fertilizerType}`)
      }
    }
  }
}

if (result.remaining.length) {
  throw new Error(`unresolved cells remain: ${result.remaining.join(', ')}`)
}

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`)
console.log(JSON.stringify({ status: 'updated', ...result }, null, 2))
