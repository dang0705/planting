const RESTRICTED_PLATFORM_FEATURES = Object.freeze([
  'identify',
  'diagnosis',
  'watering',
  'fertilization',
  'calendar',
  'subscription',
  'payment',
  'storage'
])

export function getCurrentMiniProgramPlatform() {
  // #ifdef MP-WEIXIN
  return 'wechat_mp'
  // #endif
  // #ifdef MP-TOUTIAO
  return 'douyin_mp'
  // #endif
  // #ifdef MP-XHS
  return 'xiaohongshu_mp'
  // #endif
  return 'unknown'
}

/**
 * 抖音自定义页面结构下，左上角品牌区、返回区和右侧胶囊由宿主统一绘制。
 * Layout 仍然是三端共用的页面组件，但不能再次绘制一套顶部导航。
 */
export function usesPlatformNavigationChrome() {
  return getCurrentMiniProgramPlatform() === 'douyin_mp'
}

export function isRestrictedMiniProgram() {
  const platform = getCurrentMiniProgramPlatform()
  return platform === 'douyin_mp' || platform === 'xiaohongshu_mp'
}

export function isFeatureAvailable(featureKey) {
  if (!isRestrictedMiniProgram()) {
    return true
  }
  return !RESTRICTED_PLATFORM_FEATURES.includes(String(featureKey || '').trim())
}

export function isPlatformPhoneLoginAvailable() {
  return ['wechat_mp', 'douyin_mp', 'xiaohongshu_mp'].includes(getCurrentMiniProgramPlatform())
}

export { RESTRICTED_PLATFORM_FEATURES }
