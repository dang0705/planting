export function buildDirectionChoicePayload({ result = null, choice = {} } = {}) {
  const selectedModeKey = String(
    choice?.modeKey || choice?.directionKey || choice?.problemKey || ''
  ).trim()
  const diagnosisSessionId = String(result?.diagnosisSessionId || '').trim()
  if (!diagnosisSessionId || !selectedModeKey) {
    return null
  }
  return {
    diagnosisSessionId,
    roundId: result?.roundId,
    requestMode: 'direction_choice',
    selectedModeKey,
    directionChoice: {
      ...choice,
      modeKey: selectedModeKey,
      pestModeKeys: Array.isArray(choice?.pestModeKeys) ? choice.pestModeKeys : [],
      directModeKeys: Array.isArray(choice?.directModeKeys) ? choice.directModeKeys : []
    }
  }
}

export function shouldAutoSelectDirectionChoice() {
  return false
}
