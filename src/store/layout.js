import { defineStore } from 'pinia'

const FALLBACK_NAVBAR_HEIGHT = 44

function getSystemInfo() {
  try {
    return uni.getSystemInfoSync?.() || {}
  } catch (error) {
    console.warn('读取系统信息失败:', error)
    return {}
  }
}

function getMenuButtonRect() {
  try {
    // #ifdef MP-WEIXIN
    return wx.getMenuButtonBoundingClientRect?.() || null
    // #endif
  } catch (error) {
    console.warn('读取胶囊按钮失败:', error)
  }
  return null
}

function getPlatformCustomButtonRect() {
  try {
    // #ifdef MP-TOUTIAO
    return typeof globalThis === 'undefined'
      ? null
      : globalThis.tt?.getCustomButtonBoundingClientRect?.() || null
    // #endif
  } catch (error) {
    console.warn('读取平台导航按钮失败:', error)
  }
  return null
}

function measureHeader() {
  const systemInfo = getSystemInfo()
  const statusBarHeight = Number(systemInfo.statusBarHeight || 0)
  const menuButton = getMenuButtonRect()
  if (menuButton && Number(menuButton.top) >= 0 && Number(menuButton.height) > 0) {
    const navBarHeight =
      Number(menuButton.height) + Math.max(0, (Number(menuButton.top) - statusBarHeight) * 2)
    return {
      statusBarHeight,
      navBarHeight,
      headerHeight: statusBarHeight + navBarHeight,
      menuButton
    }
  }
  const platformButton = getPlatformCustomButtonRect()
  if (
    platformButton &&
    Number(platformButton.top) >= 0 &&
    Number(platformButton.bottom) > Number(platformButton.top)
  ) {
    const navBarHeight =
      Number(platformButton.bottom) -
      Number(platformButton.top) +
      Math.max(0, (Number(platformButton.top) - statusBarHeight) * 2)
    return {
      statusBarHeight,
      navBarHeight,
      headerHeight: statusBarHeight + navBarHeight,
      menuButton: platformButton
    }
  }
  return {
    statusBarHeight,
    navBarHeight: FALLBACK_NAVBAR_HEIGHT,
    headerHeight: statusBarHeight + FALLBACK_NAVBAR_HEIGHT,
    menuButton: null
  }
}

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    statusBarHeight: 0,
    navBarHeight: FALLBACK_NAVBAR_HEIGHT,
    headerHeight: 88,
    menuButton: null,
    measured: false
  }),

  actions: {
    refreshHeaderMetrics() {
      const metrics = measureHeader()
      this.statusBarHeight = metrics.statusBarHeight
      this.navBarHeight = metrics.navBarHeight
      this.headerHeight = metrics.headerHeight
      this.menuButton = metrics.menuButton
      this.measured = true
      return metrics
    },

    ensureHeaderMetrics() {
      return this.measured
        ? {
            statusBarHeight: this.statusBarHeight,
            navBarHeight: this.navBarHeight,
            headerHeight: this.headerHeight,
            menuButton: this.menuButton
          }
        : this.refreshHeaderMetrics()
    }
  }
})
