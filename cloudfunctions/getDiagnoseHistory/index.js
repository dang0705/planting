'use strict';

const { models, getUserInfo } = require('/opt/utils/cloudbase');

exports.main = async (event, context) => {
  const { action, data } = event;

  // 使用 CloudBase Node SDK 获取用户身份
  const userInfo = getUserInfo(context);
  const OPENID = userInfo.OPENID;

  if (!OPENID) {
    return {
      code: 401,
      message: '未登录',
      data: null
    };
  }

  try {
    switch (action) {
      case 'getList':
        return await getList(OPENID, data);
      case 'getDetail':
        return await getDetail(OPENID, data);
      default:
        return {
          code: 400,
          message: '无效的操作',
          data: null
        };
    }
  } catch (error) {
    console.error('getDiagnoseHistory error:', error);
    return {
      code: 500,
      message: error.message || '服务器错误',
      data: null
    };
  }
};

/**
 * 获取诊断历史列表
 */
async function getList(openid, data = {}) {
  const { page = 1, pageSize = 10 } = data;
  const offset = (page - 1) * pageSize;

  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM diagnose_records
    WHERE _openid = {{openid}}
  `;
  const countResult = await models.$runSQL(countSql, { openid });
  const total = countResult?.data?.executeResultList?.[0]?.total || 0;

  // 获取列表
  const listSql = `
    SELECT
      dr._id,
      dr.plantId,
      dr.healthScore,
      dr.healthStatus,
      dr.mainIssue,
      dr.symptoms,
      dr.imageUrl,
      dr.description,
      dr.createdAt,
      up.nick_name as plantName,
      up.photos as plantImage
    FROM diagnose_records dr
    LEFT JOIN user_plants up ON dr.plantId = up.id
    WHERE dr._openid = {{openid}}
    ORDER BY dr.createdAt DESC
    LIMIT {{limit}} OFFSET {{offset}}
  `;

  const listResult = await models.$runSQL(listSql, {
    openid,
    limit: pageSize,
    offset
  });

  const list = listResult?.data?.executeResultList || [];

  return {
    code: 200,
    message: '获取成功',
    data: {
      list,
      total,
      page,
      pageSize,
      hasMore: offset + list.length < total
    }
  };
}

/**
 * 获取诊断详情
 */
async function getDetail(openid, data = {}) {
  const { id } = data;

  if (!id) {
    return {
      code: 400,
      message: '缺少诊断记录ID',
      data: null
    };
  }

  const sql = `
    SELECT
      dr.*,
      up.nick_name as plantName,
      up.photos as plantImage,
      up.location as plantLocation
    FROM diagnose_records dr
    LEFT JOIN user_plants up ON dr.plantId = up.id
    WHERE dr._id = {{id}} AND dr._openid = {{openid}}
    LIMIT 1
  `;

  const result = await models.$runSQL(sql, { id, openid });
  const records = result?.data?.executeResultList || [];

  if (records.length === 0) {
    return {
      code: 404,
      message: '诊断记录不存在',
      data: null
    };
  }

  return {
    code: 200,
    message: '获取成功',
    data: records[0]
  };
}