function guessMimeType(path = '') {
  const lower = String(path || '')
    .trim()
    .toLowerCase()
  if (lower.endsWith('.png')) {return 'image/png'}
  if (lower.endsWith('.webp')) {return 'image/webp'}
  if (lower.endsWith('.gif')) {return 'image/gif'}
  if (lower.endsWith('.heic')) {return 'image/heic'}
  return 'image/jpeg'
}

function isTempRuntimeImagePath(path = '') {
  const value = String(path || '')
    .trim()
    .toLowerCase()
  return (
    value.startsWith('http://tmp/') ||
    value.startsWith('https://tmp/') ||
    value.startsWith('wxfile://') ||
    value.startsWith('wdfile://') ||
    value.startsWith('file://') ||
    value.startsWith('/tmp/') ||
    value.startsWith('tmp/')
  )
}

function arrayBufferToBase64(arrayBuffer) {
  if (typeof wx !== 'undefined' && typeof wx.arrayBufferToBase64 === 'function') {
    return wx.arrayBufferToBase64(arrayBuffer)
  }

  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }

  if (typeof btoa === 'function') {
    return btoa(binary)
  }

  throw new Error('当前环境不支持 arrayBufferToBase64')
}

function getFileSize(path) {
  return new Promise(resolve => {
    try {
      wx.getFileSystemManager().stat({
        path,
        success: res => resolve(Number(res?.stats?.size || 0)),
        fail: () => resolve(0)
      })
    } catch {
      resolve(0)
    }
  })
}

function compressDiagnoseImage(filePath) {
  return new Promise(resolve => {
    try {
      wx.getImageInfo({
        src: filePath,
        success: async imageInfo => {
          const originalSize = await getFileSize(filePath)
          const maxSide = Math.max(Number(imageInfo.width || 0), Number(imageInfo.height || 0))

          let quality = 70
          if (originalSize > 3 * 1024 * 1024) {quality = 50}
          else if (originalSize > 1 * 1024 * 1024) {quality = 60}

          if (maxSide <= 1280 && originalSize > 0 && originalSize <= 180 * 1024) {
            resolve({
              path: filePath,
              compressed: false,
              originalSize,
              compressedSize: originalSize
            })
            return
          }

          wx.compressImage({
            src: filePath,
            quality,
            success: async res => {
              const compressedSize = await getFileSize(res.tempFilePath)
              if (compressedSize > 0 && originalSize > 0 && compressedSize >= originalSize) {
                resolve({
                  path: filePath,
                  compressed: false,
                  originalSize,
                  compressedSize: originalSize
                })
                return
              }

              resolve({
                path: res.tempFilePath || filePath,
                compressed: res.tempFilePath && res.tempFilePath !== filePath,
                originalSize,
                compressedSize: compressedSize || originalSize
              })
            },
            fail: () =>
              resolve({
                path: filePath,
                compressed: false,
                originalSize,
                compressedSize: originalSize
              })
          })
        },
        fail: async () => {
          const originalSize = await getFileSize(filePath)
          resolve({
            path: filePath,
            compressed: false,
            originalSize,
            compressedSize: originalSize
          })
        }
      })
    } catch {
      resolve({
        path: filePath,
        compressed: false,
        originalSize: 0,
        compressedSize: 0
      })
    }
  })
}

function fetchImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      success: res => {
        if (res.statusCode < 200 || res.statusCode >= 300 || !res.data) {
          reject(new Error(`图片下载失败 (${res.statusCode})`))
          return
        }

        const contentType = String(
          res.header?.['content-type'] || res.header?.['Content-Type'] || guessMimeType(url)
        )
        const base64 = arrayBufferToBase64(res.data)
        if (!base64) {
          reject(new Error('图片转 base64 失败'))
          return
        }
        resolve(`data:${contentType};base64,${base64}`)
      },
      fail: reject
    })
  })
}

export function assertDiagnoseImageDataUrl(image) {
  const value = String(image || '').trim()
  if (!value.startsWith('data:image/')) {
    throw new Error(`诊断图片未成功转换为 base64，当前前缀: ${value.slice(0, 32) || '<empty>'}`)
  }
}

export async function convertImageToDataUrl(filePath) {
  const rawPath = String(filePath || '').trim()
  if (!rawPath) {
    throw new Error('缺少图片路径')
  }
  if (rawPath.startsWith('data:image/')) {
    return rawPath
  }

  let path = rawPath
  if (!/^https?:\/\//i.test(rawPath)) {
    const compressResult = await compressDiagnoseImage(rawPath)
    path = compressResult.path || rawPath
    console.log('诊断图片压缩结果:', {
      originalSize: compressResult.originalSize,
      compressedSize: compressResult.compressedSize,
      compressed: compressResult.compressed,
      pathChanged: path !== rawPath
    })
  }

  return await new Promise((resolve, reject) => {
    try {
      const fs = wx.getFileSystemManager()
      fs.readFile({
        filePath: path,
        encoding: 'base64',
        success: res => {
          const base64 = String(res.data || '').trim()
          if (!base64) {
            reject(new Error('图片转 base64 失败'))
            return
          }
          resolve(`data:${guessMimeType(path)};base64,${base64}`)
        },
        fail: async error => {
          try {
            if (/^https?:\/\//i.test(path) || isTempRuntimeImagePath(path)) {
              const dataUrl = await fetchImageAsDataUrl(path)
              resolve(dataUrl)
              return
            }
            reject(error)
          } catch (fetchError) {
            reject(fetchError)
          }
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}
