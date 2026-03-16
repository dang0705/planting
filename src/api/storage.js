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

export async function imageToBase64DataUri(imagePath) {
  const startedAt = Date.now()
  const compressResult = await compressImage(imagePath)
  const fileSystemManager = wx.getFileSystemManager()

  const base64 = await new Promise((resolve, reject) => {
    fileSystemManager.readFile({
      filePath: compressResult.path,
      encoding: 'base64',
      success: res => resolve(res.data || ''),
      fail: reject
    })
  })

  console.log('图片转 base64 耗时(ms):', Date.now() - startedAt)
  return `data:image/jpeg;base64,${base64}`
}

export async function uploadPlantImage(imagePath, userId, plantId = '') {
  try {
    const startedAt = Date.now()
    const compressResult = await compressImage(imagePath)

    const cleanUserId = sanitizeFileName(userId || 'user')
    const cleanPlantId = sanitizeFileName(plantId || 'temp')

    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
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

    const uploadResult = await wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: compressResult.path
    })

    console.log('图片上传耗时(ms):', Date.now() - startedAt)

    if (uploadResult.fileID) {
      return {
        fileName,
        fileId: uploadResult.fileID,
        url: uploadResult.fileID
      }
    }
    throw new Error('上传失败')
  } catch (error) {
    console.error('上传图片失败:', error)
    throw error
  }
}

export async function getImageUrl(fileId, maxAge = 3600) {
  try {
    const url = await wx.cloud.getTempFileURL({
      fileList: [fileId],
      maxAge
    })
    if (url.fileList && url.fileList.length > 0) {
      return url.fileList[0].tempFileURL
    }
    throw new Error('获取链接失败')
  } catch (error) {
    console.error('获取图片链接失败:', error)
    throw error
  }
}

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

export async function getPlantImages(plantId, limit = 10, offset = 0) {
  try {
    const result = await wx.cloud.callFunction({
      name: 'storage',
      data: {
        action: 'getPlantImages',
        data: {
          plantId,
          limit,
          offset
        }
      }
    })

    if (result.result.code === 200) {
      return result.result.data.images
    }
    throw new Error(result.result.message || '获取失败')
  } catch (error) {
    console.error('获取植物图片失败:', error)
    throw error
  }
}

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

export async function uploadMultipleImages(imagePaths, userId, plantId = '') {
  try {
    const results = []

    for (const imagePath of imagePaths) {
      try {
        const result = await uploadPlantImage(imagePath, userId, plantId)
        results.push({ success: true, data: result })
      } catch (error) {
        results.push({ success: false, error: error.message })
      }
    }

    return results
  } catch (error) {
    console.error('批量上传失败:', error)
    throw error
  }
}
