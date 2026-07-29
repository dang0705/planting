import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildLegacyUserCareLocation,
  CARE_LOCATION_SOURCE,
  normalizePlantCareLocation
} from '../../../../../../src/utils/plant-care-location.js'

const repoRoot = process.cwd()
const sourcePath = path.join(
  repoRoot,
  'src/pages/diagnose/question-package/question-care-location.js'
)
const source = fs.readFileSync(sourcePath, 'utf8')

function loadCareLocationModule({ patchUserPlant, resolveHotCityByGps }) {
  const transformed = source
    .replace(
      "import { patchUserPlant } from '@/api/plants-http.js'\n",
      'const patchUserPlant = __patchUserPlant\n'
    )
    .replace(
      "import { resolveHotCityByGps } from '@/api/weather-hot-cities.js'\n",
      'const resolveHotCityByGps = __resolveHotCityByGps\n'
    )
    .replace(
      /import \{\n\s*buildLegacyUserCareLocation,\n\s*CARE_LOCATION_SOURCE,\n\s*normalizePlantCareLocation\n\} from '@\/utils\/plant-care-location\.js'\n/,
      'const { buildLegacyUserCareLocation, CARE_LOCATION_SOURCE, normalizePlantCareLocation } = __plantCareLocation\n'
    )
    .replaceAll('export ', '')

  return new Function(
    '__patchUserPlant',
    '__resolveHotCityByGps',
    '__plantCareLocation',
    `${transformed}
return { findDiagnosisPlant, resolveDiagnosisCareLocation }`
  )(patchUserPlant, resolveHotCityByGps, {
    buildLegacyUserCareLocation,
    CARE_LOCATION_SOURCE,
    normalizePlantCareLocation
  })
}

function createHotCity() {
  return {
    locationKey: 'shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737
  }
}

{
  const patchCalls = []
  const { resolveDiagnosisCareLocation } = loadCareLocationModule({
    patchUserPlant: payload => {
      patchCalls.push(payload)
      return Promise.resolve({})
    },
    resolveHotCityByGps: () => Promise.resolve({ matched: true, city: createHotCity() })
  })

  const location = await resolveDiagnosisCareLocation({
    result: { plantId: 'diagnose_tab_anonymous' },
    plantStore: { userPlants: [] },
    userLocation: { latitude: 31.2, longitude: 121.4 }
  })

  assert.equal(patchCalls.length, 0)
  assert.equal(location.locationKey, 'shanghai')
  assert.equal(location.source, CARE_LOCATION_SOURCE.LEGACY_USER_LOCATION)
  assert.equal(location.plantId, '')
}

{
  const patchCalls = []
  const { resolveDiagnosisCareLocation } = loadCareLocationModule({
    patchUserPlant: payload => {
      patchCalls.push(payload)
      return Promise.resolve({})
    },
    resolveHotCityByGps: () => Promise.resolve({ matched: true, city: createHotCity() })
  })

  const location = await resolveDiagnosisCareLocation({
    result: { plantId: 'plant-42' },
    plantStore: { userPlants: [{ id: 'plant-42', plantId: 'catalog-1' }] },
    userLocation: { latitude: 31.2, longitude: 121.4 }
  })

  assert.equal(location.plantId, 'plant-42')
  assert.equal(patchCalls.length, 1)
  assert.equal(patchCalls[0].id, 'plant-42')
  assert.equal(patchCalls[0].careLocation.locationKey, 'shanghai')
  assert.equal(patchCalls[0].careLocation.source, CARE_LOCATION_SOURCE.LEGACY_USER_LOCATION)
}

console.log('diagnose question care location tests passed')
