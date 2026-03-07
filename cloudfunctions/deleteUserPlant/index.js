'use strict';

const { models, getUserInfo } = require('/opt/utils/cloudbase');

exports.main = async (event, context) => {
  try {
    // 使用 CloudBase Node SDK 获取用户身份
    const userInfo = getUserInfo(context);
    const openid = userInfo.OPENID;

    if (!openid) {
      return { code: 401, message: '请先登录', data: null };
    }

    const { id } = event;

    if (!id) {
      return { code: 400, message: '缺少植物ID', data: null };
    }

    // 验证该植物属于当前用户
    // 确保ID类型正确（MySQL的id是数字类型）
    const idNumber = parseInt(id);
    if (isNaN(idNumber) || idNumber <= 0) {
      return { code: 400, message: '植物ID格式错误', data: null };
    }
    
    const checkSQL = 'SELECT id FROM user_plants WHERE id = {{id}} AND _openid = {{openid}} LIMIT 1';
    const checkResult = await models.$runSQL(checkSQL, { id: idNumber, openid });
    const rows = checkResult?.data?.executeResultList || [];

    if (rows.length === 0) {
      return { code: 404, message: '植物不存在或无权限删除', data: null };
    }

    // 删除植物
    const deleteSQL = 'DELETE FROM user_plants WHERE id = {{id}} AND _openid = {{openid}}';
    await models.$runSQL(deleteSQL, { id: idNumber, openid });

    console.log('用户植物删除成功:', { id, openid });

    return {
      code: 200,
      message: '删除成功',
      data: { id }
    };
  } catch (error) {
    console.error('删除用户植物失败:', error);
    return { code: 500, message: `删除失败: ${error.message}`, data: null };
  }
};
