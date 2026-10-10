import type { UserPrincipalDto } from '../../../contracts/types.js'
import { PublicRequestError } from '../../../foundation/http/request-chain.js'
import {
  CapabilitySnapshotExpiredError,
  CapabilitySnapshotUnavailableError
} from '../../../subscription/repository/mysql-capability-snapshot-reader.js'
import type { ReadCapabilitySnapshot } from './visual-ports.js'

/**
 * 视觉诊断能力校验（diagnosis-visual-api.md §1）：只有拥有 USER_DIAGNOSIS_VISUAL 的登录用户可以取上传路径、登记图片和发起诊断。
 * 快照失效 409（客户端重新解析），快照不可用 503，无能力 403。游客在路由层已拒绝。
 */
export async function assertVisualCapability(
  readCapabilitySnapshot: ReadCapabilitySnapshot,
  principal: UserPrincipalDto
): Promise<void> {
  let snapshot
  try {
    snapshot = await readCapabilitySnapshot(principal)
  } catch (error) {
    if (error instanceof CapabilitySnapshotExpiredError) {
      throw new PublicRequestError(409, 'CAPABILITY_SNAPSHOT_EXPIRED', '能力快照已失效，请重新请求')
    }
    if (error instanceof CapabilitySnapshotUnavailableError) {
      throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
    }
    throw error
  }
  if (snapshot.subjectType !== 'user' || snapshot.user_id !== principal.user_id) {
    throw new Error('服务端能力快照不合法')
  }
  if (!snapshot.allowedCapabilities.includes('USER_DIAGNOSIS_VISUAL')) {
    throw new PublicRequestError(403, 'CAPABILITY_DENIED', '当前权益不包含视觉诊断')
  }
}
