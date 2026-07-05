function getRefValue(target) {
  return target && typeof target === 'object' && 'value' in target ? target.value : null
}

function appendCandidate(candidates, candidate) {
  if (!candidate || candidates.includes(candidate)) {
    return
  }
  candidates.push(candidate)
}

function getComponentMethodCandidates(target) {
  const candidates = []
  const value = getRefValue(target)
  appendCandidate(candidates, target)
  appendCandidate(candidates, value)
  appendCandidate(candidates, target?.$vm)
  appendCandidate(candidates, value?.$vm)
  appendCandidate(candidates, target?.$?.exposed)
  appendCandidate(candidates, value?.$?.exposed)
  return candidates
}

export function resolveComponentMethod(target, methodName) {
  const candidates = getComponentMethodCandidates(target)
  for (const candidate of candidates) {
    const method = candidate?.[methodName]
    if (typeof method === 'function') {
      return (...args) => method.apply(candidate, args)
    }
  }
  return null
}

export function callComponentMethod(target, methodName, ...args) {
  const method = resolveComponentMethod(target, methodName)
  if (!method) {
    return undefined
  }
  return method(...args)
}
