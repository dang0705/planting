const PRIMARY_IMAGE_LIMIT = 3
const FOLLOW_UP_IMAGE_LIMIT = 1
const SLOT_IMAGE_LIMIT = 2

const PRIMARY_SLOT_SEQUENCE = ['whole_plant', 'leaf', 'stem', 'root_crown', 'other']
const FOLLOW_UP_SLOT_SEQUENCE = ['whole_plant', 'leaf', 'stem', 'root_crown', 'other']

const ORGAN_SLOT_OPTIONS = [
  { value: 'leaf', label: '叶片图' },
  { value: 'stem', label: '茎部图' },
  { value: 'root', label: '根部图' },
  { value: 'root_crown', label: '根 / 根颈图' },
  { value: 'whole_plant', label: '全株图' },
  { value: 'flower', label: '花部图' },
  { value: 'fruit', label: '果部图' },
  { value: 'other', label: '其他局部图' },
  { value: 'unknown', label: '未指定' }
]

const ORGAN_SLOT_LABEL_MAP = ORGAN_SLOT_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

const SLOT_HINT_TEXT_MAP = {
  whole_plant: '优先拍整株轮廓和整体受损范围。',
  leaf: '优先拍叶片正反面、斑点、黄化和卷曲。',
  stem: '优先拍茎节、裂口、病斑或腐烂位置。',
  root: '优先拍根系颜色、腐烂与异常附着物。',
  root_crown: '优先拍根颈与盆土交界处的状态。',
  flower: '优先拍花部褪色、霉斑和畸形细节。',
  fruit: '优先拍果部斑点、皱缩和腐烂细节。',
  other: '难归类的局部异常可放在这里。'
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function getOrganOptionLabel(value = '', fallback = '未指定') {
  return ORGAN_SLOT_LABEL_MAP[String(value || '').trim()] || fallback
}

function normalizeSlotType(slotType = '', fallback = 'unknown') {
  const normalized = String(slotType || '').trim()
  return ORGAN_SLOT_LABEL_MAP[normalized] ? normalized : fallback
}

function getSlotHintText(slotType = 'other') {
  const normalizedSlotType = normalizeSlotType(slotType, 'other')
  return SLOT_HINT_TEXT_MAP[normalizedSlotType] || SLOT_HINT_TEXT_MAP.other
}

function getSlotCapacity(totalLimit = PRIMARY_IMAGE_LIMIT) {
  return Math.min(SLOT_IMAGE_LIMIT, Math.max(1, Number(totalLimit || 1)))
}

function getSlotFileCount(files = [], slotType = 'unknown') {
  const normalizedSlotType = normalizeSlotType(slotType, 'unknown')
  return (Array.isArray(files) ? files : []).filter(item => {
    const currentSlotType = normalizeSlotType(
      item?.inputSlotType || item?.userDeclaredOrganType || '',
      'unknown'
    )
    return currentSlotType === normalizedSlotType
  }).length
}

function buildSlotGroups(files = [], slotTypes = [], totalLimit = PRIMARY_IMAGE_LIMIT) {
  const normalizedFiles = Array.isArray(files) ? files : []
  const totalCount = normalizedFiles.length
  const capacity = getSlotCapacity(totalLimit)
  const normalizedSlotTypes = uniqueStrings([
    ...(Array.isArray(slotTypes) ? slotTypes : []),
    ...normalizedFiles.map(item =>
      normalizeSlotType(item?.inputSlotType || item?.userDeclaredOrganType || '', 'unknown')
    )
  ])

  return normalizedSlotTypes.map(slotType => {
    const normalizedSlotType = normalizeSlotType(slotType, 'unknown')
    const items = normalizedFiles
      .map((item, index) => ({ item, index }))
      .filter(entry => {
        const currentSlotType = normalizeSlotType(
          entry?.item?.inputSlotType || entry?.item?.userDeclaredOrganType || '',
          'unknown'
        )
        return currentSlotType === normalizedSlotType
      })

    return {
      slotType: normalizedSlotType,
      label: getOrganOptionLabel(normalizedSlotType, '其他槽位'),
      hintText: getSlotHintText(normalizedSlotType),
      items,
      capacity,
      canAdd: totalCount < totalLimit && items.length < capacity
    }
  })
}

function buildSlotMetadata(slotType = 'unknown', index = 0) {
  const normalizedSlotType = normalizeSlotType(slotType, 'unknown')
  const label = getOrganOptionLabel(normalizedSlotType, '图片')

  return {
    inputSlotType: normalizedSlotType,
    inputSlotLabel: `图${index + 1} ${label}`,
    userDeclaredOrganType: normalizedSlotType === 'unknown' ? '' : normalizedSlotType,
    userDeclaredOrganConfidence: normalizedSlotType === 'unknown' ? null : 0.95
  }
}

function inferFollowUpSlotTypeFromSuggestion(suggestion = '', fallback = 'whole_plant') {
  const normalized = String(suggestion || '').trim()
  if (!normalized) {return fallback}
  if (normalized.includes('根颈')) {return 'root_crown'}
  if (normalized.includes('根')) {return 'root'}
  if (normalized.includes('茎')) {return 'stem'}
  if (normalized.includes('全株') || normalized.includes('整株')) {return 'whole_plant'}
  if (normalized.includes('花')) {return 'flower'}
  if (normalized.includes('果')) {return 'fruit'}
  if (normalized.includes('叶')) {return 'leaf'}
  return fallback
}

export {
  PRIMARY_IMAGE_LIMIT,
  FOLLOW_UP_IMAGE_LIMIT,
  SLOT_IMAGE_LIMIT,
  PRIMARY_SLOT_SEQUENCE,
  FOLLOW_UP_SLOT_SEQUENCE,
  getOrganOptionLabel,
  normalizeSlotType,
  getSlotCapacity,
  getSlotFileCount,
  getSlotHintText,
  buildSlotGroups,
  buildSlotMetadata,
  inferFollowUpSlotTypeFromSuggestion
}
