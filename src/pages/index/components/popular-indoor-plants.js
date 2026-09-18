const MAX_HOME_PLANT_RESULTS = 5

// 公开检索中北京、上海、武汉、重庆等城市的室内绿植内容反复出现的交集。
// 目录接口目前没有城市热度字段，实际植物对象仍必须来自目录接口。
export const POPULAR_INDOOR_PLANT_NAMES = ['绿萝', '吊兰', '虎皮兰', '龟背竹', '发财树']

const PLANT_NAME_ALIASES = {
  虎皮兰: ['虎尾兰'],
  发财树: ['招财树']
}

const PLANT_ALIAS_FALLBACKS = {
  绿萝: '魔鬼藤、黄金葛、石柑子',
  吊兰: '挂兰、垂盆草、兰草',
  虎皮兰: '虎尾兰、千岁兰、岳母舌',
  龟背竹: '蓬莱蕉、龟背蕉、电线兰',
  发财树: '瓜栗、马拉巴栗、招财树'
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase()
}

function getPlantNames(plant) {
  return [plant?.canonicalName, plant?.displayName, plant?.scientificName, plant?.latinName]
    .map(normalizeText)
    .filter(Boolean)
}

function getPreferredPlant(plant, preferredName) {
  const preferredNames = [preferredName, ...(PLANT_NAME_ALIASES[preferredName] || [])].map(
    normalizeText
  )
  return getPlantNames(plant).some(name => preferredNames.includes(name))
}

export function getPlantDisplayName(plant) {
  return String(plant?.canonicalName || plant?.displayName || '').trim()
}

export function getPlantAliasText(plant) {
  const rawAliases = plant?.aliasNames ?? plant?.aliases ?? plant?.alias
  const aliases = Array.isArray(rawAliases)
    ? rawAliases
    : String(rawAliases || '')
        .split(/[、,，|]/)
        .map(alias => alias.trim())
        .filter(Boolean)

  if (aliases.length) {
    return Array.from(new Set(aliases)).join('、')
  }

  const displayName = getPlantDisplayName(plant)
  return PLANT_ALIAS_FALLBACKS[displayName] || ''
}

export function selectPopularIndoorPlants(plants = [], keyword = '') {
  const availablePlants = Array.isArray(plants) ? plants.filter(Boolean) : []
  if (String(keyword || '').trim()) {
    return availablePlants.slice(0, MAX_HOME_PLANT_RESULTS)
  }

  const selected = []
  for (const preferredName of POPULAR_INDOOR_PLANT_NAMES) {
    const match = availablePlants.find(
      plant => !selected.includes(plant) && getPreferredPlant(plant, preferredName)
    )
    if (match) {
      selected.push(match)
    }
  }

  for (const plant of availablePlants) {
    if (selected.length >= MAX_HOME_PLANT_RESULTS) {
      break
    }
    if (!selected.includes(plant)) {
      selected.push(plant)
    }
  }

  return selected.slice(0, MAX_HOME_PLANT_RESULTS)
}
