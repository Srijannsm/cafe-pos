// Crops + compresses an image in the browser before upload.
//
// Why in the browser: a phone photo is 3-8 MB. Shrinking it to a ~100 KB
// WebP here means faster uploads on cafe Wi-Fi, a fast QR menu for
// customers on mobile data, and no native image library on the server.
/** A crop rectangle in the source image's own pixels (from ImageCropper). */
export type CropArea = { x: number; y: number; width: number; height: number };

export async function prepareImage(
  file: File,
  opts: { aspect: number; maxWidth: number; quality?: number; crop?: CropArea | null },
): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const { aspect, maxWidth } = opts;

  let sx: number, sy: number, sw: number, sh: number;
  if (opts.crop) {
    // The area the person framed in the crop dialog (clamped to the image).
    sx = Math.max(0, Math.round(opts.crop.x));
    sy = Math.max(0, Math.round(opts.crop.y));
    sw = Math.min(bitmap.width - sx, Math.round(opts.crop.width));
    sh = Math.min(bitmap.height - sy, Math.round(opts.crop.height));
  } else {
    // No crop chosen: centre-crop to the target aspect ratio.
    sw = bitmap.width;
    sh = bitmap.height;
    if (sw / sh > aspect) sw = Math.round(sh * aspect);
    else sh = Math.round(sw / aspect);
    sx = Math.round((bitmap.width - sw) / 2);
    sy = Math.round((bitmap.height - sh) / 2);
  }

  const w = Math.min(maxWidth, sw);
  const h = Math.round(w / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", opts.quality ?? 0.8));
  if (blob && blob.type === "image/webp") return blob;
  // Older Safari can't encode WebP -- fall back to JPEG.
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", opts.quality ?? 0.82));
  if (!jpeg) throw new Error("Could not process image");
  return jpeg;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
