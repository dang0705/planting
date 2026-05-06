/**
 * 缓存定时器管理工具
 * 支持冷启动恢复、提前量设置、内存泄漏防护
 */

let timerId = null

/**
 * 启动缓存定时器
 * @param {Function} callback - 定时器到期时的回调函数
 * @param {number} remainingTime - 剩余时间（毫秒）
 * @returns {number} 定时器 ID
 */
export function startCacheTimer(callback, remainingTime) {
  // 清除旧定时器，防止内存泄漏
  clearCacheTimer()

  if (remainingTime <= 0) {
    // 时间已到，立即执行回调
    callback()
    return null
  }

  timerId = setTimeout(() => {
    callback()
    timerId = null // 执行后清空引用
  }, remainingTime)

  return timerId
}

/**
 * 清除缓存定时器
 */
export function clearCacheTimer() {
  if (timerId !== null) {
    clearTimeout(timerId)
    timerId = null
  }
}
