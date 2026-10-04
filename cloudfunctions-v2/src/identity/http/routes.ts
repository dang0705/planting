import type { FrozenRoute } from '../../foundation/http/route-dispatcher.js'

/**
 * route-registry.json 中微信小程序首次登录的冻结登记。
 * 此入口没有青花植登录主体，必须先验证一次性平台凭证，再在 identity 域签发用户会话。
 */
export const createIdentitySessionRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/identity/sessions',
  operationId: 'createIdentitySession',
  security: 'credential_exchange'
}

/** 仅向 subscription 服务主体开放统一用户试用锚点事实，不返回权益结论。 */
export const getUserTrialAnchorInternalRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/internal/identity/users/{userRef}/trial-anchor',
  operationId: 'getUserTrialAnchorInternal',
  security: 'service'
}
