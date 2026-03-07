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

    const { page = 1, pageSize = 20 } = event;
    const offset = (page - 1) * pageSize;

    // 查询用户植物，关联 plants 表获取植物详情
    const sql = `
      SELECT
        up.id,
        up.plant_id,
        up.ai_recognized_name,
        up.nick_name,
        up.location,
        up.photos,
        up.last_watered,
        up.next_water,
        up.created_at,
        p.name as plant_name,
        p.image_file_id,
        p.sunning,
        p.watering_freq
      FROM user_plants up
      LEFT JOIN plants p ON up.plant_id = p._id
      WHERE up._openid = {{openid}}
      ORDER BY up.created_at DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `;

    const result = await models.$runSQL(sql, {
      openid,
      limit: pageSize,
      offset
    });
    const rows = result?.data?.executeResultList || [];

    // 查询总数
    const countResult = await models.$runSQL(
      'SELECT COUNT(*) as total FROM user_plants WHERE _openid = {{openid}}',
      { openid }
    );
    const total = countResult?.data?.executeResultList?.[0]?.total || 0;

    // 格式化返回数据
    const plants = rows.map(r => ({
      id: r.id,
      plantId: r.plant_id,
      name: r.nick_name || r.plant_name || r.ai_recognized_name || '未命名植物',
      aiRecognizedName: r.ai_recognized_name,
      location: r.location,
      photos: r.photos ? JSON.parse(r.photos) : [],
      fileId: r.image_file_id || '',
      lastWatered: r.last_watered,
      nextWater: r.next_water,
      createdAt: r.created_at,
      sunning: r.sunning ? JSON.parse(r.sunning) : null,
      wateringFreq: r.watering_freq ? JSON.parse(r.watering_freq) : null
    }));

    return {
      code: 200,
      message: '成功',
      data: {
        list: plants,
        total,
        page,
        pageSize,
        hasMore: offset + plants.length < total
      }
    };
  } catch (error) {
    console.error('获取用户植物列表失败:', error);
    return { code: 500, message: `获取失败: ${error.message}`, data: null };
  }
};
