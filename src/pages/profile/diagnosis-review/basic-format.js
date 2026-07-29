export function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function formatDetailLines(items = [], fallback = '无', options = {}) {
  const safeItems = (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
  if (!safeItems.length) {
    return fallback
  }
  const limit = Number.isFinite(Number(options?.limit)) ? Math.max(1, Number(options.limit)) : 8
  const visibleItems = safeItems.slice(0, limit)
  if (safeItems.length > limit) {
    visibleItems.push(`另 ${safeItems.length - limit} 条未展示（共 ${safeItems.length} 条）`)
  }
  return visibleItems.join(' / ')
}
