function resolveFallbackValue(fallbacks, key) {
  if (!fallbacks || !(key in fallbacks)) {
    return undefined
  }
  const value = fallbacks[key]
  if (Array.isArray(value)) {
    return []
  }
  if (value && typeof value === 'object') {
    return { ...value }
  }
  return value
}

export function exposeViewProp(props, fallbacks = {}) {
  const exposed = {}
  const keys = new Set(['view', ...Object.keys(fallbacks), ...Object.keys(props.view || {})])

  keys.forEach(key => {
    Object.defineProperty(exposed, key, {
      enumerable: true,
      configurable: true,
      get() {
        if (key === 'view') {
          return props.view
        }
        const value = props.view?.[key]
        return value === undefined ? resolveFallbackValue(fallbacks, key) : value
      },
      set(value) {
        if (props.view && key !== 'view') {
          props.view[key] = value
        }
      }
    })
  })

  return exposed
}
