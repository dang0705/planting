'use strict'

const cloudbase = require('/opt/utils/cloudbase')

/**
 * 标准化搜索关键词
 * 移除特殊字符，只保留中英文、数字和空格
 * @param {string} text - 原始文本
 * @returns {string} 标准化后的文本
 */
function normalizeSearchText(text) {
  if (!text) return ''
  // 移除所有非中英文、数字、空格的字符
  return text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '').trim()
}

exports.main = async (event, context) => {
  try {
    const { name } = event

    let sql =
      'SELECT _id, name, alias, latin_name, image_file_id, sunning, watering_freq, `show` FROM plants'
    const params = {}
    const conditions = []

    // 如果提供了搜索关键词
    if (name && name.trim()) {
      // 使用统一的标准化函数清理用户输入
      const cleanName = normalizeSearchText(name)

      if (cleanName) {
        // 搜索时不限制 show 字段，搜索所有植物
        conditions.push(`(
          name LIKE {{searchPattern}} OR
          alias LIKE {{searchPattern}} OR
          latin_name LIKE {{searchPattern}}
        )`)
        params.searchPattern = `%${cleanName}%`
      }
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    sql += ' ORDER BY _id ASC'

    const result = await cloudbase.models.$runSQL(sql, params)
    const rows = result?.data?.executeResultList || []

    const plants = rows.map(r => {
      const sunning = typeof r.sunning === 'string' ? JSON.parse(r.sunning) : r.sunning
      const watering =
        typeof r.watering_freq === 'string' ? JSON.parse(r.watering_freq) : r.watering_freq
      return {
        id: r._id,
        name: r.name,
        alias: r.alias,
        latinName: r.latin_name,
        fileId: r.image_file_id || '',
        sunningType: sunning?.type || '',
        wateringType: watering?.type || '',
        show: r.show || 0
      }
    })

    return { code: 200, data: plants }
  } catch (error) {
    console.error('getDefaultPlants error:', error)
    return { code: 500, message: error.message }
  }
}
