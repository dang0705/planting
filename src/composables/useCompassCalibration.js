// 罗盘校准方位 composable
// 从 LightEnvironmentPicker.vue 抽出的微信小程序罗盘监听逻辑：
// 打开校准弹框 → 读取罗盘 → 自动选中方位 → 关闭弹框时停止监听。
// 依赖组件传入 disabled（是否禁用）、getEnvironment（返回当前 environment ref 的 value）、
// commit（提交新 environment 值并 emit change）。

import { onBeforeUnmount, ref } from 'vue'
import { compassDirectionToFacing, getLightFacingLabel } from '@/utils/light-environment.js'

const COMPASS_READ_TIMEOUT_MS = 4000

export function useCompassCalibration({ disabled, getEnvironment, commit }) {
  const showDirectionDialog = ref(false)
  const compassStatusText = ref('打开弹框后会尝试读取罗盘，也可以手动选择方向。')
  let compassListener = null
  let compassTimeout = null

  function clearCompassTimeout() {
    if (!compassTimeout) {
      return
    }
    clearTimeout(compassTimeout)
    compassTimeout = null
  }

  function getWxCompassApi() {
    const wxApi = globalThis?.wx
    if (!wxApi || typeof wxApi !== 'object') {
      return null
    }
    if (typeof wxApi.onCompassChange !== 'function') {
      return null
    }
    return wxApi
  }

  function stopCompassWatch() {
    clearCompassTimeout()
    const wxApi = getWxCompassApi()
    if (wxApi && compassListener && typeof wxApi.offCompassChange === 'function') {
      wxApi.offCompassChange(compassListener)
    }
    if (wxApi && typeof wxApi.stopCompass === 'function') {
      wxApi.stopCompass()
    }
    compassListener = null
  }

  function applyCompassDirection(direction) {
    const facing = compassDirectionToFacing(direction)
    if (facing === 'unknown') {
      return
    }
    clearCompassTimeout()
    commit({ ...getEnvironment(), facing })
    compassStatusText.value = `已自动选中${getLightFacingLabel(facing)}窗，可继续手动调整。`
  }

  function startCompassWatch() {
    stopCompassWatch()
    const wxApi = getWxCompassApi()
    if (!wxApi) {
      compassStatusText.value = '当前环境无法读取罗盘，请手动选择方向。'
      return
    }
    compassStatusText.value = '正在读取罗盘方向，也可以手动选择。'
    compassListener = result => {
      if (!showDirectionDialog.value) {
        return
      }
      applyCompassDirection(result?.direction)
    }
    try {
      wxApi.onCompassChange(compassListener)
      if (typeof wxApi.startCompass === 'function') {
        wxApi.startCompass({
          fail: () => {
            compassStatusText.value = '罗盘暂不可用，请手动选择方向。'
          }
        })
      }
      compassTimeout = setTimeout(() => {
        compassStatusText.value = '暂未读取到罗盘方向，请手动选择方向。'
      }, COMPASS_READ_TIMEOUT_MS)
    } catch (error) {
      stopCompassWatch()
      compassStatusText.value = '罗盘暂不可用，请手动选择方向。'
    }
  }

  function openDirectionDialog(nextFacing = '') {
    if (disabled()) {
      return
    }
    if (nextFacing) {
      commit({ ...getEnvironment(), facing: nextFacing })
    }
    showDirectionDialog.value = true
    startCompassWatch()
  }

  function closeDirectionDialog() {
    showDirectionDialog.value = false
    stopCompassWatch()
  }

  function confirmDirection() {
    closeDirectionDialog()
  }

  onBeforeUnmount(() => {
    stopCompassWatch()
  })

  return {
    showDirectionDialog,
    compassStatusText,
    openDirectionDialog,
    closeDirectionDialog,
    confirmDirection,
    stopCompassWatch
  }
}
