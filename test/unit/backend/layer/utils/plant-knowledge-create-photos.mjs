import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('cloudfunctions/layer/utils/plant-knowledge.js', 'utf8')

assert.match(
  source,
  /const catalogImageFileId = normalizeNullableString\(plant\?\.imageFileId\)[\s\S]*?fileId !== catalogImageFileId/u,
  '新增用户植物必须排除目录封面，避免把公共图片当成用户临时图片校验'
)
assert.match(
  source,
  /fileIds: normalizedPhotoFileIds/u,
  '图片归属校验必须只接收过滤后的用户图片'
)
assert.match(
  source,
  /photos: normalizedPhotoFileIds\.length \? JSON\.stringify\(normalizedPhotoFileIds\) : null/u,
  '持久化 photos 不得再次写入目录封面'
)

console.log('plant knowledge create photo boundary passed data_mode=unit_fake test_kind=source_contract')
