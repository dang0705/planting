'use strict'

/**
 * 项目目录预检 -- 空气环境评估端上验收。
 *
 * 复用浇水算法 v3 的通用预检逻辑（checkProjectDir / checkProjectConfig / preflightProject），
 * 不在本目录重复预检代码。在连接 9420 前验证 MP_PROJECT_PATH 下 project.config.json 存在。
 */
export {
  checkProjectConfig,
  checkProjectDir,
  preflightProject
} from '../../../watering/transpiration-v3/_shared/lib/project-check.mjs'
