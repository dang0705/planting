import fs from 'node:fs'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function isValidPngEvidence(filePath) {
  try {
    const content = fs.readFileSync(filePath)
    if (content.length < PNG_SIGNATURE.length || !content.subarray(0, 8).equals(PNG_SIGNATURE)) {
      return false
    }
    let offset = PNG_SIGNATURE.length
    let hasIhdr = false
    let hasIdat = false
    let hasIend = false
    while (offset + 12 <= content.length) {
      const chunkLength = content.readUInt32BE(offset)
      const chunkType = content.subarray(offset + 4, offset + 8)
      const chunkEnd = offset + 12 + chunkLength
      if (chunkEnd > content.length) {
        return false
      }
      const chunkDataEnd = offset + 8 + chunkLength
      const expectedCrc = content.readUInt32BE(chunkDataEnd)
      const actualCrc = crc32(content.subarray(offset + 4, chunkDataEnd))
      if (expectedCrc !== actualCrc) {
        return false
      }
      const chunkName = chunkType.toString('ascii')
      if (chunkName === 'IHDR') {
        if (offset !== PNG_SIGNATURE.length || chunkLength !== 13) {
          return false
        }
        const width = content.readUInt32BE(offset + 8)
        const height = content.readUInt32BE(offset + 12)
        hasIhdr = width > 0 && height > 0
      }
      if (chunkName === 'IDAT' && chunkLength > 0) {
        hasIdat = true
      }
      if (chunkName === 'IEND') {
        hasIend = chunkLength === 0 && chunkEnd === content.length
        break
      }
      offset = chunkEnd
    }
    return hasIhdr && hasIdat && hasIend
  } catch {
    return false
  }
}
