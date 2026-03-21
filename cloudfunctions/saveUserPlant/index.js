'use strict';

const { models, getUserInfo } = require('/opt/utils/cloudbase');
const { inferPlantGroup } = require('./plant-group');

exports.main = async (event, context) => {
  try {
    // 使用 CloudBase Node SDK 获取用户身份
    const userInfo = getUserInfo(context);
    const openid = userInfo.OPENID;

    if (!openid) {
      return { code: 401, message: '请先登录', data: null };
    }

    let { plantId, aiRecognizedName, nickName, location, photos, plantGroup } = event;

    // 必须有 plantId 或 aiRecognizedName 其中之一
    if (!plantId && !aiRecognizedName) {
      return { code: 400, message: '缺少植物信息', data: null };
    }

    // 如果提供了 plantId，验证是否存在于 plants 表并获取植物名称
    let plantName = null;
    if (plantId) {
      const checkSQL = 'SELECT _id, name FROM plants WHERE _id = {{plantId}} LIMIT 1';
      const checkResult = await models.$runSQL(checkSQL, { plantId });
      const rows = checkResult?.data?.executeResultList || [];
      if (rows.length === 0) {
        // plantId 无效，降级为 aiRecognizedName
        aiRecognizedName = nickName || plantId;
        plantId = null;
        plantName = aiRecognizedName;
      } else {
        // 从 plants 表获取植物名称
        plantName = rows[0].name;
      }
    } else if (aiRecognizedName) {
      // AI 识别的情况，使用 AI 识别的名称
      plantName = aiRecognizedName;
    }

    // plantId 和 aiRecognizedName 互斥
    const resolvedPlantGroup = String(plantGroup || '').trim() || inferPlantGroup(plantName)

    const insertSQL = `INSERT INTO user_plants (
      _openid, plant_id, plant_name, ai_recognized_name, plant_group, nick_name, location, photos
    ) VALUES (
      {{openid}}, ${plantId ? '{{plantId}}' : 'NULL'}, {{plantName}}, ${plantId ? 'NULL' : '{{aiRecognizedName}}'}, {{plantGroup}},
      {{nickName}}, {{location}}, {{photos}}
    )`;

    const params = {
      openid,
      plantName: plantName || '未知植物',
      plantGroup: resolvedPlantGroup,
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

    console.log('用户植物保存成功:', { id: insertedId, plantId, aiRecognizedName, plantGroup: resolvedPlantGroup });

    return {
      code: 200,
      message: '保存成功',
      data: {
        id: insertedId,
        plantId: plantId || null,
        aiRecognizedName: plantId ? null : aiRecognizedName,
        plantGroup: resolvedPlantGroup,
        nickName,
        location
      }
    };
  } catch (error) {
    console.error('保存用户植物失败:', error);
    return { code: 500, message: `保存失败: ${error.message}`, data: null };
  }
};
