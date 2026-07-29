import { identifyPlantByImage } from '@/api/plants-http.js'
import { getImageUrl, uploadPlantImage } from '@/api/storage.js'
import { showBottomSheetAction } from '@/utils/bottom-sheet-action.js'

function isRetryableRequestError(error) {
  return /timeout|timed out|network error|request:fail|fail timeout/i.test(
    String(error?.message || error || '')
  )
}

function normalizeIdentifyResult(data = {}) {
  return {
    name: data?.name || '未知植物',
    recognizedName: data?.name || '未知植物',
    confidence: data?.confidence || 0,
    type: data?.type || 'plant',
    visualCallBatchId: data?.visualCallBatchId || '',
    identityResolutionStatus: data?.identityResolutionStatus || '',
    matchedPlant: data?.matchedPlant || null,
    candidates: data?.candidates || []
  }
}

async function identifyPlantByImageWithRetry(imageUrl, attempts = 2) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await identifyPlantByImage(imageUrl)
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isRetryableRequestError(error)) {
        break
      }
    }
  }
  if (/timeout|timed out|fail timeout/i.test(String(lastError?.message || lastError || ''))) {
    throw new Error('识别超时，请重试')
  }
  throw lastError instanceof Error ? lastError : new Error('识别失败，请重试')
}

export function useAddPlantIdentify({
  userStore,
  defaultPlants,
  formData,
  selectedPlant,
  recognizedName,
  identifyContext,
  showLogin,
  loginMsg,
  showAIDialog,
  aiDialogRef,
  activeStep
}) {
  const pendingImage = { path: '', url: '' }

  function normalizeIdentifyPlantCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return null
    }
    const id = String(candidate.id || '').trim()
    const plantIdentityId = String(candidate.plantIdentityId || '').trim()
    const sessionPlantId = String(candidate.sessionPlantId || '').trim()
    const canonicalName = String(candidate.canonicalName || candidate.name || '').trim()
    const matched = defaultPlants.value.find(item =>
      [plantIdentityId, sessionPlantId, id, canonicalName]
        .filter(Boolean)
        .some(key =>
          [item.plantIdentityId, item.sessionPlantId, item.id, item.canonicalName].includes(key)
        )
    )
    if (matched) {
      return matched
    }
    return canonicalName
      ? {
          id: id || sessionPlantId || plantIdentityId || canonicalName,
          plantIdentityId,
          sessionPlantId,
          canonicalName
        }
      : null
  }

  function buildIdentifyContext(result, overrides = {}) {
    return {
      visualCallBatchId: String(result?.visualCallBatchId || '').trim(),
      recognizedName: String(result?.recognizedName || result?.name || '').trim(),
      recognitionConfidence: Number(result?.confidence || 0),
      recognitionType: String(result?.type || 'plant').trim() || 'plant',
      identityResolutionStatus: String(result?.identityResolutionStatus || '').trim(),
      selectionMode: overrides.selectionMode || 'recognized_name',
      selectedPlant: overrides.selectedPlant || null
    }
  }

  function applyIdentifySelection(plant, fallbackName, result, selectionMode) {
    formData.value.image = pendingImage.path
    selectedPlant.value = plant
    recognizedName.value = plant ? '' : fallbackName
    identifyContext.value = buildIdentifyContext(result, { selectionMode, selectedPlant: plant })
    showAIDialog.value = false
    activeStep.value = 1
  }

  async function doIdentify(path) {
    try {
      uni.showLoading({ title: '上传图片中...', mask: true })
      const { fileId } = await uploadPlantImage(path, userStore.userId || 'anon', 'identify')
      pendingImage.path = path
      pendingImage.url = await getImageUrl(fileId, 7200)
      uni.showLoading({ title: 'AI 识别中...', mask: true })
      const response = await identifyPlantByImageWithRetry(pendingImage.url)
      uni.hideLoading()
      if (response?.code !== 200) {
        throw new Error(response?.message || '识别失败')
      }
      userStore.useAIQuota()
      showAIDialog.value = true
      const result = normalizeIdentifyResult(response.data)
      setTimeout(() => {
        aiDialogRef.value?.setText(
          `识别结果：${result.name}\n置信度：${((result.confidence || 0) * 100).toFixed(1)}%`
        )
        aiDialogRef.value?.finishStream(result)
      }, 100)
    } catch (error) {
      uni.hideLoading()
      uni.showToast({ title: error?.message || '识别失败，请重试', icon: 'none' })
    }
  }

  async function useAIIdentify() {
    if (!(await userStore.ensureLogin())) {
      loginMsg.value = '使用 AI 识别功能需要先登录'
      showLogin.value = true
      return
    }
    if (!userStore.canDiagnose) {
      uni.showModal({
        title: '提示',
        content: '免费识别次数已用完，升级会员享受无限次识别',
        confirmText: '升级会员',
        success: result => result.confirm && uni.switchTab({ url: '/pages/profile/profile' })
      })
      return
    }
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: result => {
        const path = result.tempFilePaths[0]
        formData.value.image = path
        doIdentify(path)
      }
    })
  }

  function handleAIConfirm(result) {
    if (!result?.name || result.name === '未知植物') {
      uni.showToast({ title: '未能识别植物，请重试', icon: 'none' })
      return
    }
    const matched = normalizeIdentifyPlantCandidate(result.matchedPlant)
    if (matched) {
      applyIdentifySelection(matched, '', result, 'matched')
      return
    }
    const candidates = (result.candidates || [])
      .map(normalizeIdentifyPlantCandidate)
      .filter(Boolean)
    if (!candidates.length) {
      applyIdentifySelection(null, result.name.trim(), result, 'recognized_name')
      return
    }
    showBottomSheetAction({
      title: '选择识别结果',
      itemList: [
        ...candidates.slice(0, 5).map(item => item.canonicalName),
        `使用识别名称：${result.name.trim()}`
      ]
    })
      .then(action => {
        const chosen = candidates[action.tapIndex]
        if (chosen) {
          applyIdentifySelection(chosen, '', result, 'candidate')
        } else {
          applyIdentifySelection(null, result.name.trim(), result, 'recognized_name')
        }
      })
      .catch(() => (showAIDialog.value = false))
  }

  function handleAIRetry() {
    if (pendingImage.path) {
      doIdentify(pendingImage.path)
    }
  }

  return { useAIIdentify, handleAIConfirm, handleAIRetry }
}
