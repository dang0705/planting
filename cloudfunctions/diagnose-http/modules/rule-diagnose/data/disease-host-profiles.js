'use strict'

const diseaseHostProfiles = {
  spider_mites: ['monstera', 'pothos', 'ficus', 'calathea', 'houseplants'],
  aphids: ['rose', 'hibiscus', 'houseplants'],
  whiteflies: ['houseplants'],
  scale_insects: ['ficus', 'dracaena', 'citrus', 'houseplants'],
  fungus_gnat: ['potted_plants', 'houseplants'],
  powdery_mildew: ['rose', 'houseplants'],
  fungal_leaf_spot: ['many_plants', 'houseplants'],
  overwatering: ['houseplants', 'potted_plants'],
  underwatering: ['houseplants', 'potted_plants'],
  low_light: ['houseplants', 'tropical_plants'],
  sunburn: ['many_plants', 'houseplants'],
  nutrient_deficiency: ['many_plants', 'houseplants', 'potted_plants'],
  temperature_stress: ['many_plants', 'houseplants'],
  root_rot: ['houseplants', 'potted_plants'],
  succulent_black_rot: ['succulents', 'echeveria', 'haworthia', 'sedum', 'crassula'],
  succulent_root_rot: ['succulents', 'echeveria', 'haworthia', 'sedum', 'crassula'],
  succulent_etiolation: ['succulents', 'echeveria', 'haworthia', 'sedum', 'crassula'],
  succulent_sunburn: ['succulents', 'echeveria', 'haworthia', 'sedum', 'crassula'],
  orchid_crown_rot: ['orchids', 'phalaenopsis', 'dendrobium', 'cattleya'],
  orchid_root_rot: ['orchids', 'phalaenopsis', 'dendrobium', 'cattleya']
}

const hostPlantGroups = {
  succulents: ['多肉', '景天', '玉露', '生石花', '仙人掌', '拟石莲', '观音莲', '胧月'],
  orchids: ['兰花', '蝴蝶兰', '石斛兰', '兜兰', '卡特兰'],
  monstera: ['龟背竹'],
  pothos: ['绿萝'],
  ficus: ['琴叶榕', '榕树', '橡皮树'],
  calathea: ['竹芋'],
  dracaena: ['龙血树', '香龙血树', '巴西木'],
  rose: ['月季', '玫瑰'],
  hibiscus: ['扶桑'],
  citrus: ['柠檬', '橘子', '柑橘'],
  phalaenopsis: ['蝴蝶兰'],
  dendrobium: ['石斛'],
  cattleya: ['卡特兰'],
  tropical_plants: ['观叶', '热带', '蔓绿绒', '花烛', '白掌', '合果芋'],
  houseplants: ['植物', '盆栽', '绿植'],
  potted_plants: ['盆栽', '花盆']
}

const plantGroupDiseaseSets = {
  succulents: [
    'overwatering',
    'underwatering',
    'root_rot',
    'nutrient_deficiency',
    'sunburn',
    'low_light',
    'spider_mites',
    'aphids',
    'whiteflies',
    'scale_insects',
    'fungus_gnat',
    'temperature_stress',
    'succulent_black_rot',
    'succulent_root_rot',
    'succulent_etiolation',
    'succulent_sunburn'
  ],
  orchids: [
    'overwatering',
    'underwatering',
    'root_rot',
    'nutrient_deficiency',
    'low_light',
    'powdery_mildew',
    'fungal_leaf_spot',
    'spider_mites',
    'aphids',
    'whiteflies',
    'scale_insects',
    'fungus_gnat',
    'temperature_stress',
    'orchid_crown_rot',
    'orchid_root_rot'
  ],
  houseplants: null
}

function normalizeHostText(input) {
  return String(input || '').trim().toLowerCase()
}

function inferPlantHosts(plantName) {
  const raw = String(plantName || '').trim()
  const normalized = normalizeHostText(raw)
  if (!normalized) return []

  const hosts = new Set()

  for (const [hostKey, aliases] of Object.entries(hostPlantGroups)) {
    if (
      normalizeHostText(hostKey) === normalized ||
      aliases.some(alias => normalized.includes(normalizeHostText(alias)))
    ) {
      hosts.add(hostKey)
    }
  }

  if (hosts.size === 0) {
    hosts.add('houseplants')
  }

  return [...hosts]
}

function inferPlantGroup(plantName) {
  const hosts = inferPlantHosts(plantName)
  if (hosts.includes('succulents')) return 'succulents'
  if (hosts.includes('orchids')) return 'orchids'
  return 'houseplants'
}

function getDiseaseSetForPlantGroup(plantGroup) {
  const selectedSet = plantGroupDiseaseSets[plantGroup]
  return Array.isArray(selectedSet) ? selectedSet : null
}

module.exports = {
  diseaseHostProfiles,
  inferPlantHosts,
  inferPlantGroup,
  getDiseaseSetForPlantGroup
}
