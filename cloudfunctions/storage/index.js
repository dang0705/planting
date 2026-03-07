const { models, storage, getUserInfo } = require('/opt/utils/cloudbase');

/**
 * 清理文件名，移除特殊字符
 */
function sanitizeFileName(str) {
  // 只保留字母、数字、下划线、中划线
  return str.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * 上传植物图片到云存储
 */
async function uploadPlantImage(imageData, userId) {
  try {
    const uid = sanitizeFileName(userId || "u");
    const fileName = `p/${uid}/${Date.now().toString(36)}${Math.random().toString(36).substr(2, 4)}.jpg`;

    // 使用 CloudBase Node SDK 的 storage 对象上传文件
    const uploadResult = await storage.uploadFile({
      cloudPath: fileName,
      fileContent: Buffer.from(imageData, "base64"),
    });

    console.log("图片上传成功:", { fileName, fileId: uploadResult.fileID });

    return {
      fileName: fileName,
      fileId: uploadResult.fileID,
      url: uploadResult.fileID, // CloudBase 文件 ID 可直接用作 URL
    };
  } catch (error) {
    console.error("图片上传失败:", error);
    throw error;
  }
}

/**
 * 获取图片临时下载链接
 */
async function getImageUrl(fileId, maxAge = 3600) {
  try {
        const result = await storage.getTempFileURL({
          fileList: [fileId],
        });

    if (result.fileList && result.fileList[0]) {
      return result.fileList[0].tempFileURL;
    }
    throw new Error("获取临时链接失败");
  } catch (error) {
    console.error("获取图片 URL 失败:", error);
    throw error;
  }
}

/**
 * 删除图片
 */
async function deleteImage(fileId) {
  try {
        await storage.deleteFile({
          fileList: [fileId],
        });

    console.log("图片删除成功:", fileId);
    return true;
  } catch (error) {
    console.error("图片删除失败:", error);
    throw error;
  }
}

/**
 * 保存植物图片记录到数据库 (MySQL)
 */
async function savePlantImageRecord(userId, plantId, imageInfo) {
  try {
    const recordId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const insertSQL = `INSERT INTO plant_images (
      _id, _openid, plant_id, file_name, file_id, url, uploaded_at, created_at
    ) VALUES (
      {{recordId}}, {{userId}}, {{plantId}}, {{fileName}}, {{fileId}}, {{url}}, {{uploadedAt}}, {{createdAt}}
    )`;

    await models.$runSQL(insertSQL, {
      recordId,
      userId,
      plantId,
      fileName: imageInfo.fileName,
      fileId: imageInfo.fileId,
      url: imageInfo.url,
      uploadedAt: Date.now(),
      createdAt: Date.now()
    });

    console.log("图片记录已保存:", recordId);
    return recordId;
  } catch (error) {
    console.error("保存图片记录失败:", error);
    throw error;
  }
}

/**
 * 获取植物的所有图片 (MySQL)
 */
async function getPlantImages(plantId, limit = 10, offset = 0) {
  try {
    const sql = `SELECT * FROM plant_images
      WHERE plant_id = {{plantId}}
      ORDER BY uploaded_at DESC
      LIMIT {{limit}} OFFSET {{offset}}`;

    const result = await models.$runSQL(sql, { plantId, limit, offset });
    return result?.data?.executeResultList || [];
  } catch (error) {
    console.error("获取植物图片失败:", error);
    throw error;
  }
}

exports.main = async (event, context) => {
  try {
    const { action, data } = event;
    // 使用 CloudBase Node SDK 获取用户身份
    const userInfo = getUserInfo(context);
    const openid = userInfo.OPENID;

    switch (action) {
      case "uploadImage": {
        // 上传图片
        if (!data || !data.imageData) {
          throw new Error("缺少必要参数: imageData");
        }
        const userId = data.userId || openid;
        const uploadResult = await uploadPlantImage(data.imageData, userId);

        // 保存图片记录
        if (data.plantId) {
          const recordId = await savePlantImageRecord(
            userId,
            data.plantId,
            uploadResult
          );
          uploadResult.recordId = recordId;
        }

        return { code: 200, message: "图片上传成功", data: uploadResult };
      }

      case "getImageUrl": {
        // 获取图片 URL
        if (!data || !data.fileId) {
          throw new Error("缺少必要参数: fileId");
        }
        const url = await getImageUrl(data.fileId, data.maxAge || 3600);
        return { code: 200, message: "获取成功", data: { url } };
      }

      case "deleteImage":
        // 删除图片
        if (!data || !data.fileId) {
          throw new Error("缺少必要参数: fileId");
        }
        await deleteImage(data.fileId);
        return { code: 200, message: "图片删除成功", data: null };

      case "getPlantImages": {
        // 获取植物的所有图片
        if (!data || !data.plantId) {
          throw new Error("缺少必要参数: plantId");
        }
        const images = await getPlantImages(
          data.plantId,
          data.limit || 10,
          data.offset || 0
        );
        return { code: 200, message: "获取成功", data: { images } };
      }

      case "updateImagePlantId":
        // 更新图片关联的植物 ID (MySQL)
        if (!data || !data.fileId || !data.plantId) {
          throw new Error("缺少必要参数: fileId, plantId");
        }
        const updateSQL = `UPDATE plant_images SET plant_id = {{plantId}} WHERE file_id = {{fileId}}`;
        await models.$runSQL(updateSQL, { plantId: data.plantId, fileId: data.fileId });
        return { code: 200, message: "更新成功", data: null };

      default:
        return { code: 400, message: "无效操作", data: null };
    }
  } catch (error) {
    console.error("错误:", error);
    return { code: 500, message: error.message, data: null };
  }
};
