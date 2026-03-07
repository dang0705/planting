'use strict'

const { models, getUserInfo } = require('/opt/utils/cloudbase')

exports.main = async (event, context) => {
  try {
    // 使用 CloudBase Node SDK 获取用户身份
    const userInfo = getUserInfo(context)
    const openid = userInfo.OPENID

    if (!openid) {
      return { code: 401, message: '请先登录', data: null }
    }

    const { id, nickName, location, photos, lastWatered, nextWater } = event

    if (!id) {
      return { code: 400, message: '缺少植物ID', data: null }
    }

    // 验证该植物属于当前用户
    const checkSQL = 'SELECT id FROM user_plants WHERE id = {{id}} AND _openid = {{openid}} LIMIT 1'
    const checkResult = await models.$runSQL(checkSQL, { id, openid })
    const rows = checkResult?.data?.executeResultList || []

    if (rows.length === 0) {
      return { code: 404, message: '植物不存在或无权限修改', data: null }
    }

    // 构建动态更新语句
    const updates = []
    const params = { id, openid }

    if (nickName !== undefined) {
      updates.push('nick_name = {{nickName}}')
      params.nickName = nickName
    }

    if (location !== undefined) {
      updates.push('location = {{location}}')
      params.location = location
    }

    if (photos !== undefined) {
      updates.push('photos = {{photos}}')
      params.photos = photos ? JSON.stringify(photos) : null
    }

    if (lastWatered !== undefined) {
      updates.push('last_watered = {{lastWatered}}')
      params.lastWatered = lastWatered
    }

    if (nextWater !== undefined) {
      updates.push('next_water = {{nextWater}}')
      params.nextWater = nextWater
    }

    if (updates.length === 0) {
      return { code: 400, message: '没有需要更新的字段', data: null }
    }

    // 添加更新时间
    updates.push('updated_at = NOW()')

    const updateSQL = `UPDATE user_plants SET ${updates.join(', ')} WHERE id = {{id}} AND _openid = {{openid}}`
    await models.$runSQL(updateSQL, params)

    console.log('用户植物更新成功:', { id, updates: Object.keys(params) })

    return {
      code: 200,
      message: '更新成功',
      data: { id, ...params }
    }
  } catch (error) {
    console.error('更新用户植物失败:', error)
    return { code: 500, message: `更新失败: ${error.message}`, data: null }
  }
}
