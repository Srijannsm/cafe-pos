// Shared by every image upload. The browser-declared type and file name can
// be anything, so: only PNG/JPEG/WebP, the bytes must actually look like that
// format ("magic bytes"), and the extension is chosen here -- never taken
// from the uploaded file name (a ".html" or ".svg" served from our origin
// could run script).
export const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

export function isAllowedImage(mime: string, b: Buffer) {
  if (mime === 'image/png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/webp') return b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
