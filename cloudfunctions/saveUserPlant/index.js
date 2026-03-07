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

    let { plantId, aiRecognizedName, nickName, location, photos } = event;

    // 必须有 plantId 或 aiRecognizedName 其中之一
    if (!plantId && !aiRecognizedName) {
      return { code: 400, message: '缺少植物信息', data: null };
    }

    // 如果提供了 plantId，验证是否存在于 plants 表
    if (plantId) {
      const checkSQL = 'SELECT _id FROM plants WHERE _id = {{plantId}} LIMIT 1';
      const checkResult = await models.$runSQL(checkSQL, { plantId });
      const rows = checkResult?.data?.executeResultList || [];
      if (rows.length === 0) {
        // plantId 无效，降级为 aiRecognizedName
        aiRecognizedName = nickName || plantId;
        plantId = null;
      }
    }

    // plantId 和 aiRecognizedName 互斥
    const insertSQL = `INSERT INTO user_plants (
      _openid, plant_id, ai_recognized_name, nick_name, location, photos
    ) VALUES (
      {{openid}}, ${plantId ? '{{plantId}}' : 'NULL'}, ${plantId ? 'NULL' : '{{aiRecognizedName}}'},
      {{nickName}}, {{location}}, {{photos}}
    )`;

    const params = {
      openid,
      nickName: nickName || null,
      location: location || '阳台',
      photos: photos ? JSON.stringify(photos) : null
    };
    if (plantId) params.plantId = plantId;
    if (!plantId && aiRecognizedName) params.aiRecognizedName = aiRecognizedName;

    const insertResult = await models.$runSQL(insertSQL, params);

    // 获取插入的记录ID
    // CloudBase MySQL 的 LAST_INSERT_ID() 返回格式可能是 { 'LAST_INSERT_ID()': xxx }
    const lastIdResult = await models.$runSQL('SELECT LAST_INSERT_ID() as insertId', {});
    console.log('LAST_INSERT_ID 返回:', JSON.stringify(lastIdResult));

    const row = lastIdResult?.data?.executeResultList?.[0] || {};
    // 尝试多种可能的字段名
    const insertedId = Number(row.insertId || row['LAST_INSERT_ID()'] || row.id) || 0;

    console.log('用户植物保存成功:', { id: insertedId, plantId, aiRecognizedName });

    return {
      code: 200,
      message: '保存成功',
      data: {
        id: insertedId,
        plantId: plantId || null,
        aiRecognizedName: plantId ? null : aiRecognizedName,
        nickName,
        location
      }
    };
  } catch (error) {
    console.error('保存用户植物失败:', error);
    return { code: 500, message: `保存失败: ${error.message}`, data: null };
  }
};
