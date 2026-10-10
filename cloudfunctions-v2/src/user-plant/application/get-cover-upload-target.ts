import type { UserPlantRef, UserPrincipalDto } from '../../contracts/types.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { UserPlantAssetRules } from '../../configuration/business-policies/index.js'
import { buildCoverUploadPath } from '../domain/cover-asset.js'
import type { GetUserPlantApplicationInput, GetUserPlantApplicationResponse } from './get-user-plant.js'

/** 获取封面上传路径的输入。 */
export interface GetCoverUploadTargetInput {
  /** 已验真登录主体。 */ readonly principal: UserPrincipalDto
  /** 路径中的用户植物公开引用。 */ readonly userPlantRef: string
  /** 请求内锁定的封面资产规则（允许类型与字节上限）。 */ readonly rules: Readonly<Pick<UserPlantAssetRules, 'allowedMimeTypes' | 'maxImageBytes'>>
}

/** 用例依赖：复用单株归属读取（本人 active/archived 可见，其余 404）与 16 字节随机数。 */
export interface GetCoverUploadTargetDependencies {
  /** owner-scoped 单株读取用例。 */ readonly getUserPlant: (input: GetUserPlantApplicationInput) => Promise<GetUserPlantApplicationResponse>
  /** 生成 32 位小写十六进制随机段。 */ readonly randomHex: () => string
}

/**
 * 封面上传路径（user-plant-cover-asset/v1 §2.1）：只读、不落库、不预占；每次生成新的随机文件名。
 * 用户公开编号只出现在路径里（唯一例外披露），不作为单独字段返回。
 */
export function createGetCoverUploadTargetApplicationService(dependencies: GetCoverUploadTargetDependencies) {
  return async (input: GetCoverUploadTargetInput): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const plant = await dependencies.getUserPlant({ principal: input.principal, userPlantRef: input.userPlantRef as UserPlantRef })
    if (plant.status !== 200 || !('data' in plant.body)) { return { status: 404, body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } } } }
    return { status: 200, body: { data: {
      purpose: 'profile',
      cloudPath: buildCoverUploadPath(input.principal.user_id, plant.body.data.user_plant_id, dependencies.randomHex()),
      allowedMimeTypes: [...input.rules.allowedMimeTypes],
      maxBytes: input.rules.maxImageBytes
    } } }
  }
}
