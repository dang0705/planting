function showModal(options) {
  return new Promise(resolve => {
    uni.showModal({
      ...options,
      success: result => resolve(result?.confirm === true),
      fail: () => resolve(false)
    })
  })
}

export function confirmSaveIndependentPlant() {
  return showModal({
    title: '保存这盆植物',
    content: '保存后可继续补充养护城市等信息。',
    confirmText: '去保存',
    cancelText: '暂不保存',
    confirmColor: '#2d7a4f'
  })
}

export function buildAdvisorPlantCreateUrl({ catalogPlantId, potProfile } = {}) {
  const normalizedCatalogPlantId = String(catalogPlantId || '').trim()
  if (!normalizedCatalogPlantId || !potProfile || typeof potProfile !== 'object') {
    return ''
  }
  return `/subpackages/plant/user-plant-detail/user-plant-detail?mode=create&catalogPlantId=${encodeURIComponent(normalizedCatalogPlantId)}&initialPotProfile=${encodeURIComponent(JSON.stringify(potProfile))}`
}
