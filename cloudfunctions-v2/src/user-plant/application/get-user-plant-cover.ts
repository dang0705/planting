import type { PrivateObjectStorage } from '../../foundation/storage/cloudbase-storage-http-adapter.js'
import type { ActiveCover } from '../repository/mysql-user-plant-asset-repository.js'
import type { GetUserPlantApplicationInput, GetUserPlantApplicationResponse } from './get-user-plant.js'

/**
 * 单株读取叠加封面（user-plant-cover-asset/v1 §3）：植物可见且有有效封面时增加 `cover`，现场换临时链接。
 * 云存储不可用或未配置时不让读取失败，返回 `cover.url = null`；有效期以平台为准，当前无到期时间（null）。
 */
export function withCoverLink(dependencies: {
  /** 原单株读取用例（归属与脱敏投影）。 */ readonly getUserPlant: (input: GetUserPlantApplicationInput) => Promise<GetUserPlantApplicationResponse>
  /** 当前有效封面只读读取。 */ readonly readActiveCover: (userRef: string, userPlantRef: string) => Promise<ActiveCover | null>
  /** 云存储 Provider；未配置为 undefined。 */ readonly storage: PrivateObjectStorage | undefined
}): (input: GetUserPlantApplicationInput) => Promise<GetUserPlantApplicationResponse> {
  return async input => {
    const response = await dependencies.getUserPlant(input)
    if (response.status !== 200 || !('data' in response.body)) { return response }
    const cover = await dependencies.readActiveCover(input.principal.user_id, input.userPlantRef)
    if (cover === null) { return response }
    let url: string | null = null
    if (dependencies.storage !== undefined) {
      try { url = await dependencies.storage.getDownloadUrl(cover.fileId) } catch { url = null }
    }
    return { status: response.status, body: { data: { ...response.body.data, cover: { assetRef: cover.assetRef, url, urlExpiresAt: null } } } }
  }
}
