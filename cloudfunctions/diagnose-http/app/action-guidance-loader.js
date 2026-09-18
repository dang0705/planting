'use strict'

const outcomeRouteRepository = require('../repositories/outcome-route-repository')

async function loadActionProfilesByMode(modeKeys = []) {
  const safeModeKeys = Array.from(
    new Set(
      (Array.isArray(modeKeys) ? modeKeys : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
  if (!safeModeKeys.length) {
    return new Map()
  }

  const outcomes = await outcomeRouteRepository.getDiagnosisOutcomesByKeys(safeModeKeys)
  const profileKeys = Array.from(
    new Set(outcomes.map(item => String(item?.actionProfileKey || '').trim()).filter(Boolean))
  )
  const profiles = await outcomeRouteRepository.getOutcomeActionProfiles(profileKeys)
  const profileMap = new Map(
    profiles.map(profile => [String(profile?.actionProfileKey || '').trim(), profile])
  )
  return new Map(
    outcomes
      .map(outcome => [
        String(outcome?.outcomeKey || '').trim(),
        profileMap.get(String(outcome?.actionProfileKey || '').trim()) || null
      ])
      .filter(([modeKey]) => modeKey)
  )
}

module.exports = { loadActionProfilesByMode }
