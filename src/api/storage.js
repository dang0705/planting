/**
 * 云存储 API
 * 处理植物图片的上传、下载、删除等操作
 */

/**
 * 清理文件名，移除特殊字符
 * @param {string} str 原始字符串
 * @returns {string} 清理后的字符串
 */
function sanitizeFileName(str) {
  // 只保留字母、数字、下划线、中划线
  return str.replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * 压缩图片 - 智能压缩，确保文件大小减小
 * @param {string} imagePath 图片路径
 * @returns {Promise} 返回压缩后的图片路径和大小信息
 */
function compressImage(imagePath) {
  return new Promise(resolve => {
    wx.getFileSystemManager().stat({
      path: imagePath,
      success: statRes => {
        const originalSize = statRes.stats.size
        console.log('原始图片大小:', (originalSize / 1024 / 1024).toFixed(2), 'MB')

        // 小图直接上传，避免额外压缩耗时
        if (originalSize <= 1.2 * 1024 * 1024) {
          resolve({
            path: imagePath,
            originalSize,
            compressedSize: originalSize,
            compressed: false
          })
          return
        }

        let quality = 55
        if (originalSize > 6 * 1024 * 1024) {
          quality = 35
        } else if (originalSize > 3 * 1024 * 1024) {
          quality = 45
        }

        console.log('使用压缩质量:', quality)

        wx.compressImage({
          src: imagePath,
          quality,
          type: 'jpg',
          success: res => {
            resolve({
              path: res.tempFilePath,
              originalSize,
              compressedSize: 0,
              compressed: true
            })
          },
          fail: err => {
            console.warn('图片压缩失败，使用原图:', err)
            resolve({
              path: imagePath,
              originalSize,
              compressedSize: originalSize,
              compressed: false
            })
          }
        })
      },
      fail: err => {
        console.warn('无法获取文件大小，直接上传原图:', err)
        resolve({
          path: imagePath,
          compressed: false
        })
      }
    })
  })
}

/**
 * 上传图片到云存储
 * @param {string} imagePath 本地图片路径
 * @param {string} userId 用户 ID
 * @param {string} plantId 植物 ID（可选）
 * @returns {Promise} 返回上传结果
 */
export async function uploadPlantImage(imagePath, userId, plantId = '') {
  try {
    const startedAt = Date.now()
    const compressResult = await compressImage(imagePath)

    // 清理 userId 和 plantId，移除特殊字符
    const cleanUserId = sanitizeFileName(userId || 'user')
    const cleanPlantId = sanitizeFileName(plantId || 'temp')

    // 生成云存储路径
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
    // 路径格式：plants/userId/plantId_timestamp_random.jpg
    const fileName = `plants/${cleanUserId}/${cleanPlantId}_${timestamp}_${random}.jpg`

    console.log('上传文件路径:', fileName)
    console.log('上传文件信息:', {
      originalSize: compressResult.originalSize
        ? (compressResult.originalSize / 1024 / 1024).toFixed(2) + ' MB'
        : '未知',
      compressedSize: compressResult.compressedSize
        ? (compressResult.compressedSize / 1024 / 1024).toFixed(2) + ' MB'
        : '未知',
      compressed: compressResult.compressed !== false
    })

    // 直接使用 CloudBase SDK 上传到云存储（避免云函数 5MB 限制）
    const uploadResult = await wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: compressResult.path
    })

    console.log('图片上传耗时(ms):', Date.now() - startedAt)

    if (uploadResult.fileID) {
      return {
        fileName: fileName,
        fileId: uploadResult.fileID,
        url: uploadResult.fileID
      }
    } else {
      throw new Error('上传失败')
    }
  } catch (error) {
    console.error('上传图片失败:', error)
    throw error
  }
}

/**
 * 获取图片临时下载链接
 * @param {string} fileId 文件 ID
 * @param {number} maxAge 链接有效期（秒）
 * @returns {Promise} 返回下载链接
 */
export async function getImageUrl(fileId, maxAge = 3600) {
  try {
    const url = await wx.cloud.getTempFileURL({
      fileList: [fileId],
      maxAge: maxAge
    })
    if (url.fileList && url.fileList.length > 0) {
      return url.fileList[0].tempFileURL
    } else {
      throw new Error('获取链接失败')
    }
  } catch (error) {
    console.error('获取图片链接失败:', error)
    throw error
  }
}

/**
 * 删除图片
 * @param {string} fileId 文件 ID
 * @returns {Promise}
 */
export async function deleteImage(fileId) {
  try {
    await wx.cloud.deleteFile({
      fileList: [fileId]
    })
    return true
  } catch (error) {
    console.error('删除图片失败:', error)
    throw error
  }
}

/**
 * 获取植物的所有图片
 * @param {string} plantId 植物 ID
 * @param {number} limit 返回数量
 * @param {number} offset 偏移量
 * @returns {Promise} 返回图片列表
 */
export async function getPlantImages(plantId, limit = 10, offset = 0) {
  try {
    const result = await wx.cloud.callFunction({
      name: 'storage',
      data: {
        action: 'getPlantImages',
        data: {
          plantId: plantId,
          limit: limit,
          offset: offset
        }
      }
    })

    if (result.result.code === 200) {
      return result.result.data.images
    } else {
      throw new Error(result.result.message || '获取失败')
    }
  } catch (error) {
    console.error('获取植物图片失败:', error)
    throw error
  }
}

/**
 * 选择图片并上传
 * @param {string} userId 用户 ID
 * @param {string} plantId 植物 ID（可选）
 * @returns {Promise} 返回上传结果
 */
export async function chooseAndUploadImage(userId, plantId = '') {
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: async res => {
        try {
          const imagePath = res.tempFilePaths[0]
          const uploadResult = await uploadPlantImage(imagePath, userId, plantId)
          resolve(uploadResult)
        } catch (error) {
          reject(error)
        }
      },
      fail: err => {
        reject(err)
      }
    })
  })
}

/**
 * 批量上传图片
 * @param {string[]} imagePaths 图片路径数组
 * @param {string} userId 用户 ID
 * @param {string} plantId 植物 ID（可选）
 * @returns {Promise} 返回上传结果数组
 */
export async function uploadMultipleImages(imagePaths, userId, plantId = '') {
  try {
    const results = []

    for (const imagePath of imagePaths) {
      try {
        const result = await uploadPlantImage(imagePath, userId, plantId)
        results.push({
          success: true,
          data: result
        })
      } catch (error) {
        results.push({
          success: false,
          error: error.message
        })
      }
    }

    return results
  } catch (error) {
    console.error('批量上传失败:', error)
    throw error
  }
}
