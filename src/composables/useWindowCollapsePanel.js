// 有窗折叠面板展开/收起控制 composable
// 从 LightEnvironmentPicker.vue 抽出的 uni-collapse 面板状态管理：
// 选中「有窗」展开详情、选中无窗/补光灯收起，并通过 renderKey 强制重渲染。
// 依赖 idPrefix（props）、getEnvironment（返回当前 environment ref 的 value）。

import { computed, nextTick, ref } from 'vue'

const WINDOW_OPTION_KEY = 'window'
const STANDARD_WINDOW_TYPE = 'standard'

export function useWindowCollapsePanel({ idPrefix, getEnvironment }) {
  const windowCollapseItemName = computed(() => `${idPrefix()}-window-${WINDOW_OPTION_KEY}`)
  // 初始默认选中「有窗」时展开折叠面板，使方位/离窗距离等详情默认可见
  const windowCollapseName = ref(
    getEnvironment().windowType === STANDARD_WINDOW_TYPE ? windowCollapseItemName.value : ''
  )
  const windowCollapseRenderKey = ref(windowCollapseName.value)
  let windowCollapseVersion = 0

  function refreshWindowCollapseKey(windowType = getEnvironment().windowType) {
    windowCollapseVersion++
    windowCollapseRenderKey.value = `${windowCollapseItemName.value}:${windowType}:${windowCollapseName.value || 'closed'}:${windowCollapseVersion}`
  }

  function openWindowCollapse() {
    windowCollapseName.value = windowCollapseItemName.value
    refreshWindowCollapseKey(STANDARD_WINDOW_TYPE)
  }

  function closeWindowCollapse(windowType = getEnvironment().windowType) {
    windowCollapseName.value = ''
    refreshWindowCollapseKey(windowType)
    nextTick(() => {
      if (getEnvironment().windowType === STANDARD_WINDOW_TYPE) {
        return
      }
      windowCollapseName.value = ''
      refreshWindowCollapseKey(getEnvironment().windowType)
    })
  }

  // 折叠面板展开/收起只控制有窗详情的显隐，不改 windowType、不联动其它 radio。
  function handleCollapseChange(value) {
    if (Array.isArray(value)) {
      const [firstOpenName = ''] = value
      windowCollapseName.value = firstOpenName
      return
    }
    windowCollapseName.value = value || ''
  }

  return {
    windowCollapseItemName,
    windowCollapseName,
    windowCollapseRenderKey,
    openWindowCollapse,
    closeWindowCollapse,
    handleCollapseChange
  }
}
