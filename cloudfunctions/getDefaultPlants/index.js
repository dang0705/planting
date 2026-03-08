'use strict';

const cloudbase = require('/opt/utils/cloudbase');

exports.main = async (event, context) => {
  try {
    const { name } = event;

    let sql = 'SELECT _id, name, alias, latin_name, image_file_id, sunning, watering_freq FROM plants';
    const params = {};
    const conditions = [];

    // 如果提供了搜索关键词
    if (name && name.trim()) {
      // 清理用户输入：去除空格、数字、特殊字符
      const cleanName = name.trim().replace(/[\s\d]+/g, '');

      if (cleanName) {
        // 搜索时不限制 show 字段，搜索所有植物
        conditions.push(`(
          name LIKE {{searchPattern}} OR
          alias LIKE {{searchPattern}} OR
          latin_name LIKE {{searchPattern}}
        )`);
        params.searchPattern = `%${cleanName}%`;
      }
    } else {
      // 无搜索时，只显示 show = 1 的植物
      conditions.push('`show` = 1');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY _id ASC';

    const result = await cloudbase.models.$runSQL(sql, params);
    const rows = result?.data?.executeResultList || [];

    const plants = rows.map(r => {
      const sunning = typeof r.sunning === 'string' ? JSON.parse(r.sunning) : r.sunning;
      const watering = typeof r.watering_freq === 'string' ? JSON.parse(r.watering_freq) : r.watering_freq;
      return {
        id: r._id,
        name: r.name,
        alias: r.alias,
        latinName: r.latin_name,
        fileId: r.image_file_id || '',
        sunningType: sunning?.type || '',
        wateringType: watering?.type || '',
      };
    });

    return { code: 200, data: plants };
  } catch (error) {
    console.error('getDefaultPlants error:', error);
    return { code: 500, message: error.message };
  }
};
