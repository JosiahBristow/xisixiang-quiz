/**
 * 头像压缩：居中裁成正方形并缩放到 256×256，输出 JPEG。
 * 大图在浏览器端处理，上传体积通常在 20KB 左右。
 */
export async function compressAvatar(file: File, side = 256): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('图片不能超过 15MB')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = objectUrl
    await img.decode()

    const sw = img.naturalWidth
    const sh = img.naturalHeight
    if (!sw || !sh) throw new Error('图片读取失败')

    const crop = Math.min(sw, sh)
    const sx = (sw - crop) / 2
    const sy = (sh - crop) / 2

    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持图片处理')

    // 透明 PNG 转 JPEG 时补白底
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, side, side)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, crop, crop, 0, 0, side, side)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.86)
    })
    if (!blob) throw new Error('图片处理失败')
    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
