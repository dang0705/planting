'use strict'

/**
 * miniprogram-automator 连接客户端 -- 空气环境评估端上验收。
 *
 * 复用浇水算法 v3 的通用连接封装（connect / safeDisconnect / reLaunchTo / AutomatorConnectError），
 * 不在本目录重复连接逻辑。连接约定：连接已验证的测试专属会话，不自动启动/关闭 DevTools。
 */
export {
  connectAutomator,
  AutomatorConnectError,
  safeDisconnect,
  reLaunchTo
} from '../../../watering/transpiration-v3/_shared/lib/automator-client.mjs'
