'use strict';

const cloudbase = require('/opt/utils/cloudbase');

exports.main = async (event, context) => {
  try {
    const sql = 'SELECT _id, name, image_file_id, sunning, watering_freq FROM plants ORDER BY _id ASC';
    const result = await cloudbase.models.$runSQL(sql, {});
    const rows = result?.data?.executeResultList || [];

    const plants = rows.map(r => {
      const sunning = typeof r.sunning === 'string' ? JSON.parse(r.sunning) : r.sunning;
      const watering = typeof r.watering_freq === 'string' ? JSON.parse(r.watering_freq) : r.watering_freq;
      return {
        id: r._id,
        name: r.name,
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
