import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。真实 403 由各平台会话和端上网络记录验收。
const source = readFileSync('cloudfunctions/plant-user-http/app.js', 'utf8')
const plantKnowledge = readFileSync('cloudfunctions/layer/utils/plant-knowledge.js', 'utf8')

assert.match(source, /assertPlatformFeature\(userInfo, path\)/)
assert.match(source, /restrictedPlatform = isRestrictedPlatform\(userInfo\.platform\)/)
assert.match(source, /allowedManualPlantFields\(request\.body\)/)
assert.match(source, /ownerUserId,\n\s*plantId:/)
assert.match(source, /compactRestrictedPlatformPlant/)
assert.match(source, /resolveCatalogImageUrls/)
assert.match(source, /imageSource = 'catalog'/)
assert.match(source, /buildRestrictedPlatformPlantList/)
assert.match(source, /recordVersion/)
assert.match(source, /Number\(error\?\.statusCode\) === 409/)
assert.match(source, /USER_PLANT_VERSION_CONFLICT/)
assert.match(source, /currentPlant = await getUserPlantInstanceById/)
assert.match(plantKnowledge, /recognized_name = \{\{recognizedName\}\}/)

console.log('platform capability gate source-contract tests passed')
